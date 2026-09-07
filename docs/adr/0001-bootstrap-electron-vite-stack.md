# Bootstrap Electron + React + TypeScript на electron-vite

Контекст — пустой репозиторий, нужно доказать toolchain до фичей мониторинга. Решили использовать официальный шаблон `electron-vite` с React + TypeScript, тремя отдельными tsconfig (strict, `tsconfig.node.json` для main/preload, `tsconfig.web.json` для renderer), `npm` с `engines >=20.19 <23`, безопасными дефолтами окна (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) и пустым preload без IPC.

## Considered Options

- `electron-forge` / ручной `vite + electron-builder` — больше конфигурации, слабее HMR из коробки.
- Одна общая `tsconfig.json` без project references — проще, но нарушает критерий «компилируются независимо» и усложняет будущий SD-002.
- Отложить `contextIsolation/sandbox` до SD-002 — оставляет небезопасный bootstrap в истории git.

## Consequences

- `src/main`, `src/preload`, `src/renderer` компилируются независимо, `npm run dev` запускает Electron на Windows, `npm run build` + `typecheck` проверяют всё.
- Lint/format/tests намеренно отсутствуют — их вводит SD-004; IPC-типы — SD-003; упаковка Windows — SD-006.
- `package-lock.json` фиксирует версии шаблона на день генерации; смена сборщика потребует переписывания `electron.vite.config.ts`.
