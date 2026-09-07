# Логирование и обработка ошибок через Application Log и Error Boundary

Контекст — SD-005 требовал структурированных логов и предсказуемых ошибок для Main/Preload/Renderer без утечки `stack` в Renderer: выбрали тонкий `src/main/logger.ts` без внешней зависимости (JSON-lines в `userData/logs/systemdeck.log`, `getLogger(scope)` после `initLogger({ file, level })` в `app.whenReady`), уровни `trace/debug/info/warn/error` с дефолтом `is.dev ? debug : info` и переопределением `LOG_LEVEL`/`SYSTEMDECK_LOG_LEVEL`/`--log-level` без пересборки, ротация `5MB × 3`, формат `{"ts","level","scope","msg","meta"}` + pretty в `console` dev, `withSafeHandler` логирует полный `stack` только в Main и возвращает `IpcResult` с `{code,message}` (расширен `IPC_ERROR_CODES: RATE_LIMITED/INTERNAL`), Renderer получил `ErrorBoundary` вокруг `<App/>` с fallback "Что-то пошло не так — Перезапустить" и репортом `systemdeck:renderer-error` → `logger.error`, Main логирует `app ready` (version/contractVersion/platform/logFile) + `window` lifecycle + `uncaughtException`/`unhandledRejection` (quit только для `uncaughtException`), `Log Redaction` по denylist `password|token|secret|key|auth|credential` → `[REDACTED]`.

## Considered Options

- `electron-log`/`winston`/`pino` vs свой — свой дешевле для bootstrap, `electron-log` отложен до потребности в IPC-транспорте из коробки.
- `app.getPath('userData')/logs` vs `app.getPath('logs')` vs корень `userData` — `userData/logs` предсказуем на Windows и совпадает с `electron-builder`.
- Plain text vs JSON-lines — JSON-lines даёт structured без парсера, plain отложен.
- Preload пишет в файл vs `console.error` + переиспользует `renderer-error` — второе не требует `node:fs` в Preload и сохраняет границу `Shared` без `electron`.
- `uncaughtException` quit vs keep-alive — quit после лога предотвращает зомби-состояние, `unhandledRejection` без quit.

## Consequences

- `src/shared` остаётся без `electron`/`node:*` — `IPC_ERROR_CODES.RATE_LIMITED` добавлен, `withSafeHandler` единственный маппер `throw` → `IpcResult`.
- `src/main/logger.ts` единственный владелец `node:fs`/`app.getPath`, `src/preload` и `src/renderer` логируют только через `Application API` (`reportRendererError`).
- `npm run test` мокает `fs`/`app.getPath` для `logger` и `jsdom` для `ErrorBoundary`; реальный файл не трогается в CI.
- Смена лимитов ротации/формата требует правки `logger.ts` и тестов — hard to reverse, зафиксировано здесь.
