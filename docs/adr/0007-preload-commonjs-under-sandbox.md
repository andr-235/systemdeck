# Preload собирается как CommonJS под sandbox (не ESM)

`package.json` имеет `"type": "module"`, поэтому electron-vite 5 по умолчанию собирал preload в ESM `out/preload/index.mjs`, а `webPreferences.preload` указывал на `../preload/index.js` — файла не существовало, preload не загружался и `window.api` не появлялся в Renderer (issue #26).

## Considered Options

- **Оставить ESM-preload (`.mjs`) и снять sandbox** — Electron: sandboxed preload не исполняет ESM (только plain JS + `require('electron')`). Снятие sandbox нарушает security-границу SD-002 (`sandbox: true`), которую issue требует сохранить.
- **Только поправить путь на `index.mjs`** — файл существует, но под sandbox ESM всё равно не загрузится; не исправляет первопричину.
- **Форсить CommonJS-preload** — `preload.build.rollupOptions.output.format: 'cjs'` в `electron.vite.config.ts` → `out/preload/index.cjs`; путь в Main обновлён на `index.cjs`. Security-граница не тронута.

## Consequences

- Preload остаётся CJS-файлом в ESM-проекте — осознанно. Переезд preload на ESM снова упирается в sandbox и требует отдельного решения по безопасности.
- `electron`, `@shared` и `toErrorParts` бандлятся в один CJS-файл — sandboxed preload не видит `node_modules`.
- Путь «index.cjs» фигурирует в `docs/architecture.md`; проверка реального рантайма — `npm run smoke` (`scripts/smoke-electron.mjs`).
