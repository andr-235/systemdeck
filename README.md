# SystemDeck

Настольное приложение Electron для системного мониторинга. Текущий этап — **Bootstrap** (SD-001): пустая оболочка, доказывает toolchain без продуктовых фич.

## Стек

- Electron + React + TypeScript
- Сборка: [electron-vite](https://electron-vite.org)
- Упаковка: electron-builder (конфиг `electron-builder.yml`, реализовано в SD-006)

## Архитектура (Main / Preload / Renderer)

- **Main** (`src/main/index.ts`) — главный процесс Node, жизненный цикл окна. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, окно 900×670, заголовок `SystemDeck`.
- **Preload** (`src/preload/index.ts` + `index.d.ts`) — изолированный мост, единственное место с `contextBridge`. Экспортирует только `window.api: AppAPI` (тип из `src/shared/api.ts`), без `electronAPI`, без IPC-каналов до SD-003.
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
npm run build:win    # сборка Windows-артефакта (SD-006)
```

Проверка критериев SD-001: `npm install` успешно, `npm run dev` запускает окно `SystemDeck` без ошибок консоли, `npm run typecheck` без ошибок, три точки входа разделены.

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

Дальше: SD-002 (архитектура слоёв), SD-003 (типизированные IPC), SD-004 (линт/тесты), SD-005 (логи), SD-006 (упаковка Windows).

## Документация домена

- `CONTEXT.md` — глоссарий (SystemDeck, Main, Preload, Renderer, Bootstrap, Shared, Application API, Privileged API)
- `docs/architecture.md` — границы слоёв и разрешённые зависимости
- `docs/adr/0001-bootstrap-electron-vite-stack.md` — решение по стеку
- `docs/adr/0002-main-preload-renderer-boundaries.md` — границы слоёв SD-002
