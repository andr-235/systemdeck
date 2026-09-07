# SystemDeck

Настольное приложение Electron для системного мониторинга. Текущий этап — **Bootstrap** (SD-001): пустая оболочка, доказывает toolchain без продуктовых фич.

## Стек

- Electron + React + TypeScript
- Сборка: [electron-vite](https://electron-vite.org)
- Упаковка: electron-builder (конфиг `electron-builder.yml`, реализовано в SD-006)

## Архитектура (Main / Preload / Renderer)

- **Main** (`src/main/index.ts`) — главный процесс Node, жизненный цикл окна. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (явно), окно 900×670, заголовок `SystemDeck`.
- **Preload** (`src/preload/index.ts` + `index.d.ts`) — изолированный мост, единственное место с `contextBridge`. В bootstrap экспортирует пустой `api` + `electronAPI`, без IPC-каналов (SD-003).
- **Renderer** (`src/renderer/src/`) — React UI, без доступа к Node API, отдельный `tsconfig.web.json`, HMR через `electron-vite`.

Компиляция независимая: `tsconfig.json` ссылается на `tsconfig.node.json` (main/preload + `electron.vite.config.ts`) и `tsconfig.web.json` (renderer).

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
src/main/           # Main entry
src/preload/        # Preload bridge
src/renderer/       # Renderer (index.html + src/)
electron.vite.config.ts
tsconfig.json / tsconfig.node.json / tsconfig.web.json
electron-builder.yml
```

Дальше: SD-002 (архитектура слоёв), SD-003 (типизированные IPC), SD-004 (линт/тесты), SD-005 (логи), SD-006 (упаковка Windows).

## Документация домена

- `CONTEXT.md` — глоссарий (SystemDeck, Main, Preload, Renderer, Bootstrap)
- `docs/adr/0001-bootstrap-electron-vite-stack.md` — решение по стеку
