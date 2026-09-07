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
