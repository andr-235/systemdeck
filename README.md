# SystemDeck

Настольное приложение Electron для системного мониторинга. Текущее состояние — Shell SystemDeck с Dashboard: карточка CPU с живой загрузкой и скелетонами, метрики через `window.api`.

## Стек

- Electron + React + TypeScript
- Сборка: [electron-vite](https://electron-vite.org)
- Упаковка: electron-builder (конфиг `electron-builder.yml`, реализовано в SD-006)

## Архитектура (Main / Preload / Renderer)

- **Main** (`src/main/index.ts`) — главный процесс Node, жизненный цикл окна. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, окно 900×670, заголовок `SystemDeck`.
- **Preload** (`src/preload/index.ts` + `index.d.ts`) — изолированный мост, единственное место с `contextBridge`. Экспортирует только `window.api: AppAPI` (тип из `src/shared/api.ts`), без `electronAPI`. Собирается как CommonJS (`out/preload/index.cjs`) — sandboxed preload не исполняет ESM (ADR 0007).
- **Renderer** (`src/renderer/src/`) — React UI, без доступа к Node/Electron Privileged API, отдельный `tsconfig.web.json`, HMR через `electron-vite`.
- **Shared** (`src/shared/`) — кросс-слойные контракты без runtime `electron` (типы + `const` литералы), алиас `@shared/*`, доступен всем слоям.

Разрешённые зависимости: `Main -> Shared`, `Preload -> Shared`, `Renderer -> Shared`; `Renderer -/-> Electron/Node/Main/Preload`; `Shared -/-> Electron`. Подробнее — `docs/architecture.md` (граф + таблица). Enforcement: project references + алиасы + `npm run check:boundaries` (встроен в `build`, см. `scripts/check-boundaries.mjs`); полный линт — SD-004.

Компиляция независимая: `tsconfig.json` ссылается на `tsconfig.node.json` (main/preload/shared + `electron.vite.config.ts`) и `tsconfig.web.json` (renderer/shared + `src/preload/*.d.ts`).

## Требования

- Node.js `>=20.19.0 <23.0.0`
- npm (см. `packageManager`)

## Команды

```bash
npm install          # установка
npm run dev          # запуск Electron в dev (Windows)
npm run typecheck    # tsc по всем проектам
npm run build        # typecheck + electron-vite build
npm run preview      # предпросмотр сборки
npm run smoke        # реальный Electron: preload bridge + Application API (после build)
npm run build:win    # сборка Windows-артефакта (SD-006)
```

Проверка: `npm run check` (lint + format + boundaries + typecheck + vitest); `npm run smoke` проверяет preload bridge на реальном Electron после сборки.

## Структура

```
src/main/           # Main
src/preload/        # Preload (contextBridge -> window.api)
src/shared/         # Shared контракты (@shared/*)
src/renderer/       # Renderer (index.html + src/)
electron.vite.config.ts
tsconfig.json / tsconfig.node.json / tsconfig.web.json
electron-builder.yml
docs/architecture.md      # граф зависимостей
docs/adr/0002-...         # границы слоёв
```

Дальше: грид Dashboard (карточки RAM/дисков/сети), streaming-графики CPU (см. `design-system/systemdeck/pages/dashboard.md`).

## Документация домена

- `CONTEXT.md` — глоссарий (SystemDeck, Main, Preload, Renderer, Shell, Dashboard, Shared, Application API, Privileged API)
- `docs/architecture.md` — границы слоёв и разрешённые зависимости
- `docs/adr/0001-bootstrap-electron-vite-stack.md` — решение по стеку
- `docs/adr/0002-main-preload-renderer-boundaries.md` — границы слоёв SD-002
