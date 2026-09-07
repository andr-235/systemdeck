# Границы Main / Preload / Renderer и Shared-контракты

Контекст — bootstrap (ADR 0001) оставил три entry, но без явных правил: `sandbox: false`, `src/shared` отсутствовал, `preload` торчал `electronAPI`, `tsconfig.web` тянул `preload/*.d.ts` без алиасов. SD-002 требовал зафиксировать безопасные дефолты окна, куда класть кросс-слойные типы и как запретить Renderer импорт Privileged API.

Решение — `src/shared/` как единственная shared-папка без runtime `electron` (`AppAPI` минимальный `interface` + `SHARED_CONTRACT_VERSION`, типы+const литералы), алиас `@shared/*` в обоих tsconfig и `electron.vite.config.ts`, `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, preload экспонит только `window.api: AppAPI` (убрали `window.electron`), разрешённые направления документированы в `docs/architecture.md` и кратко в `README.md`, автоматическая проверка `scripts/check-boundaries.mjs` встроена в `npm run build`.

## Considered Options

- `packages/shared` с workspaces — изоляция сильнее, но оверхед для bootstrap без публикаций.
- Оставить `sandbox: false` для совместимости с preload без доработок — слабее песочница.
- Оставить `window.electron` ре-экспорт — шире поверхность атаки, противоречит AC «only explicit application APIs».
- Вводить полный `eslint`/`dependency-cruiser` уже в SD-002 — дублирует SD-004; вместо него лёгкий `scripts/check-boundaries.mjs` без зависимостей.

## Consequences

- `src/shared` без `electron` проверяется `npm run check:boundaries` + `grep`, алиас `@shared` доступен везде, shared попадает в оба `tsconfig` include.
- `sandbox: true` требует что preload работает только через `contextBridge` — все будущие Privileged вызовы идут через `AppAPI`.
- Renderer не может `import 'electron'` / `node:*` / `src/main` / `src/preload` — ловит `check:boundaries` в `npm run build`; полный lint появится в SD-004.
