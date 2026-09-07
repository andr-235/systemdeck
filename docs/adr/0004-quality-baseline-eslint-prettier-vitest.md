# Quality baseline: ESLint flat + Prettier + Vitest workspaces + check

Контекст — bootstrap (ADR 0001–0003) оставил репозиторий без качества: нет линта/формата/тестов, `typecheck:node/web` и `check:boundaries` единственные проверки, `build` не ловит стиль и регрессии. SD-004 требовал консистентные локальные проверки до фичей мониторинга без CI.

Решение — ESLint 9 flat `eslint.config.mjs` (`typescript-eslint:recommended`, `eslint-plugin-react` + `eslint-plugin-react-hooks`, `non-type-aware` для скорости, `globalIgnores` для `out/dist/coverage`), Prettier 3 отдельно от ESLint (`format`/`format:check`, `prettier.config.mjs` `printWidth:100 singleQuote semi trailingComma:es5`), Vitest 3 с одним `vitest.config.ts` на `projects` (`node` для `src/main|shared|preload`, `jsdom` для `src/renderer`, `globals:true`, `v8` coverage, alias `@shared/@renderer` как в `electron.vite.config.ts`), smoke-тесты `src/main/ipc/ping.test.ts` (Main, `withSafeHandler` → `IpcResult` без `stack`) и `src/renderer/src/App.test.tsx` (Renderer, jsdom, мок `window.api.ping`), единый `npm run check` как `lint && format:check && check:boundaries && typecheck && test` (fail-fast, `build` остаётся `typecheck && check:boundaries && electron-vite build`).

## Considered Options

- `eslint` type-aware (`project:true`) — точнее, но в 3–5× медленнее на bootstrap, отложен до SD-005.
- `Jest` вместо `Vitest` — дублирует `vite` транспиляцию, слабее HMR-совместимость.
- Один `environment: jsdom` для всего — ломает `Main` (Node API) и тянет лишний `jsdom`.
- `eslint --fix` как форматтер — смешивает линтинг и формат, конфликт с Prettier.
- `check` параллельно (`concurrently`) — скрывает первую ошибку логами, `&&` даёт fail-fast.

## Consequences

- `npm run lint`/`lint:fix`, `format`/`format:check`, `test`/`test:watch`, `check` соответствуют AC SD-004, `out/dist/coverage/node_modules` исключены везде (`eslint globalIgnores`, `.prettierignore`, `vitest exclude`).
- `Shared` остаётся без `electron` runtime — smoke-тесты доказывают round-trip `ping` ↔ `IpcResult` на обеих сторонах границы `Main/Preload/Renderer`.
- Замена раннера/линтера требует переписывания `eslint.config.mjs`/`vitest.config.ts` и smoke-тестов — hard to reverse, зафиксировано здесь.
