# Архитектура Main / Preload / Renderer

Границы слоёв SystemDeck, зафиксированные в SD-002.

## Слои

- **Main** (`src/main/`) — Node-процесс, владеет `BrowserWindow`, жизненным циклом `app`, `shell`, `ipcMain`. Имеет доступ к Privileged API.
- **Preload** (`src/preload/`) — единственный мост с `contextBridge`. Импортирует `electron` (contextBridge) и `Shared`, экспонит `window.api`.
- **Renderer** (`src/renderer/`) — React UI, `tsconfig.web.json`, без доступа к Node/Electron. Импортирует только `Shared` и свой код.
- **Shared** (`src/shared/`) — кросс-слойные контракты: `type`/`interface` и `const` литералы, без runtime `electron` / `node:*`. Импортируется всеми слоями, сам никого не импортирует из слоёв.

## Граф зависимостей

```mermaid
graph TD
  Renderer --> Shared
  Preload --> Shared
  Main --> Shared
  Preload --> ElectronAPI[contextBridge / electron]
  Main --> ElectronAPI
  Renderer -.->|запрещено| ElectronAPI
  Renderer -.->|запрещено| Main
  Renderer -.->|запрещено| Preload
  Shared -.->|запрещено| ElectronAPI
```

## Разрешённые направления (таблица)

| Импортёр          | Может импортировать                                                                                          | Запрещено                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `src/main/**`     | `src/shared/**`, `electron`, `node:*`, `@electron-toolkit/*`                                                 | `src/renderer/**`, `src/preload/**` (кроме preload пути в `webPreferences`) |
| `src/preload/**`  | `src/shared/**`, `electron` (`contextBridge`)                                                                | `src/main/**`, `src/renderer/**`, `node:fs` вне необходимости               |
| `src/renderer/**` | `src/shared/**`, `react`, `vite`                                                                             | `electron`, `node:*`, `src/main/**`, `src/preload/**`                       |
| `src/shared/**`   | типы/`const`/`as const` + чистые хелперы без runtime (`toIpcError`, `ipcSuccess`/`ipcFailure`, `isIpcError`) | `electron`, `node:*`, любой слой                                            |

Enforcement на SD-002: раздельные `tsconfig` (project references), алиасы `@shared/*` + `@renderer/*`, документация + автоматическая проверка `npm run check:boundaries` (`scripts/check-boundaries.mjs` — Renderer -/-> `electron`/`node:*`/`@electron-toolkit`, Shared -/-> `electron`/`node:*`, `contextBridge` только в `src/preload`). Проверка встроена в `npm run build`. Полный линт (`no-restricted-imports` в `eslint.config.mjs:43-84`) + формат + тесты введён в SD-004 (см. ADR 0004), `npm run check` — единый gate.

## Безопасность окна

`src/main/index.ts` создаёт `BrowserWindow` с (SD-002 + харденинг best practice):

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false
}
```

`app.enableSandbox()` — глобальный sandbox, `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` — дефолты SD-002 (см. ADR 0002). Renderer не получает `require`, весь доступ через `window.api`. Дополнительно: `setWindowOpenHandler` deny + `shell.openExternal` только `https:/http:`, `setPermissionRequestHandler` deny-all на `mainWindow` и `session.defaultSession`, `optimizer.watchWindowShortcuts`.

Сборка preload принудительно CommonJS (`preload.build.rollupOptions.output.format: 'cjs'` → `out/preload/index.cjs`), потому что sandboxed preload не исполняет ESM (см. ADR 0007); `webPreferences.preload` указывает на `index.cjs`.

CSP: `src/renderer/index.html:6-9` — `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'">`.

## Preload-контракт

- Единственное место с `contextBridge.exposeInMainWorld`.
- Экспонит только `window.api: AppAPI` (тип из `src/shared/api.ts`), пока пустой — расширяется в SD-003.
- `window.electron` (`electronAPI` из `@electron-toolkit/preload`) **не** экспонится начиная с SD-002.
- Типы окна — `src/preload/index.d.ts` (`interface Window { api: AppAPI }`), включается в `tsconfig.web.json`.

## Shared-контракт

- `src/shared/api.ts` — `export interface AppAPI {}` (минимальный контракт SD-002); методы выведены из `IpcContracts` через `IpcResultFor<typeof IPC_CHANNELS.*>` (SD-003; `ping` — внутренний health/contract-drift чек без UI, несёт `SHARED_CONTRACT_VERSION`, Main сверяет версию — SD-012, issue #26) + `SHARED_CONTRACT_VERSION`, `src/shared/index.ts` — barrel (`@shared` entry point).
- Разрешено: `type`, `interface`, `const` строк-литералов, `as const` объекты + чистые хелперы без `electron`/`node:*` (`IpcResult`/`IpcError`, `IPC_ERROR_CODES`, `isIpcError`/`toIpcError`/`ipcSuccess`/`ipcFailure`, `IpcContracts` + `IpcRequest`/`IpcResponse`/`IpcResultFor`).
- Запрещено: `import 'electron'`, `import 'node:*'`, runtime зависимости от Electron. Проверка: `npm run check:boundaries` и `grep -r "from 'electron'" src/shared` — пусто.
- Алиас `@shared/*` резолвится в `tsconfig.node.json`, `tsconfig.web.json` и `electron.vite.config.ts` (main/preload/renderer).

## Проверки (SD-004 baseline)

```bash
npm run lint             # eslint flat, no-restricted-imports
npm run format:check     # prettier --check
npm run typecheck        # tsc по обоим проектам
npm run check:boundaries # границы слоёв (Renderer/Shared/contextBridge)
npm run test             # vitest projects node/jsdom
npm run smoke            # реальный Electron: preload bridge + Application API (issue #26)
npm run check            # lint && format:check && check:boundaries && typecheck && test
npm run build            # typecheck + check:boundaries + electron-vite build
```

## Дальше

- SD-003 — типизированные IPC: имена каналов и `request/response` типы в `Shared`, `ipcMain.handle` в Main, `ipcRenderer.invoke` только через Preload — выполнено.
- SD-004 — `eslint` `no-restricted-imports` + формат + Vitest — выполнено (ADR 0004).
