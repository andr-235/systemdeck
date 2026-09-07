# SystemDeck

Настольное приложение Electron для системного мониторинга. Первый контекст — оболочка (bootstrap) без доменных фичей мониторинга; язык расширяется по мере появления панелей/виджетов.

## Language

**SystemDeck**:
Настольное приложение Electron как продукт.
_Avoid_: Deck, Board, Dashboard (для продукта)

**Main**:
Главный процесс Node, владеет жизненным циклом окна и приложения.
_Avoid_: Backend, Server

**Preload**:
Изолированный мост между Main и Renderer, единственное место с `contextBridge`.
_Avoid_: Bridge, IPC layer (как синоним)

**Renderer**:
Процесс UI на React, выполняется в браузере без доступа к Node API.
_Avoid_: Frontend, Client, UI layer (как синоним)

**Bootstrap**:
Пустая оболочка приложения, доказывает toolchain (сборка, окно, HMR), не содержит продуктовых фич.
_Avoid_: Prototype, Starter, Demo

**Shared**:
Кросс-слойные контракты без runtime-зависимостей от Electron/Node — типы и константы, импортируемые Main, Preload и Renderer.
_Avoid_: Common, Shared Types (как отдельный термин), Cross-layer Contracts (как синоним)

**Application API**:
Явная поверхность, которую Preload прокидывает в Renderer через `contextBridge` как `window.api`.
_Avoid_: Preload API, Bridge API, Electron API (для продукта)

**Privileged API**:
Любой импорт `electron` / `node:*` / `fs` / `path` и доступ к `BrowserWindow`, `ipcMain` — разрешён только в Main и Preload.
_Avoid_: Node API, Electron API (как обобщённый термин)

**IPC Channel**:
Каноническая строковая константа с префиксом `systemdeck:` из `Shared` (`IPC_CHANNELS`), единственный идентификатор вызова между Renderer и Main.
_Avoid_: Channel name, Event name, IPC string

**IPC Contract**:
Типизированная карта в `Shared` `channel -> { request, response }` (`IpcContracts`), единственный источник правды для Preload и Main.
_Avoid_: Channel type, IPC type, Request/Response type (как обобщённый термин)

**IPC Result**:
Дискриминированное объединение `{ ok: true; data } | { ok: false; error: IPC Error }` — единственная форма ответа IPC.
_Avoid_: IPC response, Result wrapper, Either

**IPC Error**:
Безопасная сериализуемая ошибка `{ code, message }` без `stack`/`cause`; полный текст логируется только в Main.
_Avoid_: Serialized error, IPC exception

**Application Log**:
Структурированный JSON-lines файл в `userData/logs/systemdeck.log`, принадлежит Main и является единственным источником диагностики.
_Avoid_: File log, Electron log

**Error Boundary**:
Верхнеуровневая React-граница в Renderer вокруг `<App />`, ловит ошибки рендера и репортит их в Main через Application API.
_Avoid_: Catch boundary, Fallback UI

**Log Redaction**:
Правило Application Log заменять значения ключей `password|token|secret|key|auth|credential` на `[REDACTED]` перед записью.
Сканируются только имена ключей: секрет внутри значения строки (например в `message` или URL) не детектится — осознанный компромисс против ложных срабатываний.
_Avoid_: Sanitization, Masking
