# Типизированные IPC-контракты через Shared

Контекст — SD-003 требовал централизовать IPC-границу: дублирование строк каналов, нетипизированный `ipcRenderer`, отсутствие контракта ошибок. Решили хранить каналы как `as const` объект `IPC_CHANNELS` с префиксом `systemdeck:` и карту `IpcContracts` в `src/shared/ipc/*` (алиас `@shared`), типизировать Preload и Main одним дженериком `invoke<K>`, оставить `window.api: AppAPI` (каноника `CONTEXT.md:31`) с плоской поверхностью `ping` на SD-003, регистрировать хэндлеры одной функцией `registerIpcHandlers()` в Main через `ipcMain.handle` + обёртку `withSafeHandler` → `IpcResult<T>` (`{ ok: true; data } | { ok: false; error: { code, message } }`), sample-вызов `ping: void -> { pong: true, contractVersion, timestamp }` доказывает round-trip без расширения Privileged API.

## Considered Options

- Каналы по фичам vs единый `IPC_CHANNELS` — единый проще дедуплицировать и грепать, фичи разнесём позже.
- `IpcResult` vs `throw` сериализованной ошибки — `throw` ломает типизацию `invoke` и требует `try/catch` в Renderer; `IpcResult` делает неуспех частью типа и запрещает утечку `stack`.
- `window.systemDeck` vs `window.api` — переименовывать ломает `CONTEXT.md` и ADR 0002 без выгоды; issue допускал "or equivalent".
- Дженерик `invoke(channel, req)` в `AppAPI` vs методы `ping()` — дженерик утекает каналы в Renderer; методы скрывают строки.
- Zod/runtime-валидация в SD-003 — отложена, пока только TS-типы; добавим при первых реальных payload.

## Consequences

- `src/shared` остаётся без `electron`/`node:*` — каналы это `const` литералы, контракты только типы; проверка `check:boundaries` не триггерит.
- `src/preload` единственное место с `ipcRenderer.invoke`, `src/main` — единственное с `ipcMain.handle`; Renderer импортит только `@shared` и `window.api`.
- Ошибки Main никогда не сериализуют `stack`/`cause`, только `code/message` из `IPC_ERROR_CODES`; полный лог — в Main (будущий SD-005).
- `SHARED_CONTRACT_VERSION` инкрементируется при смене контрактов; `ping` возвращает его для проверки дрейфа.
- При >5 каналах `registerIpcHandlers` разносится по `src/main/ipc/*.ts` без смены `Shared` контрактов.
