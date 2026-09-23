---
goal: Убрать белый экран в npm run dev — CSP давится только в проде
version: 1.0
date_created: 2026-09-23
owner: systemdeck agent
status: 'Completed'
tags: [bug, csp, dev, electron, vite]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-bright_green)

Белый экран при `npm run dev`: инлайн-преамбула `@vitejs/plugin-react` блокируется CSP
`script-src 'self'`, React Refresh runtime не стартует, маунта нет. CSP приходит из двух мест:
meta-тег `src/renderer/index.html` и заголовок `session...onHeadersReceived` в Main без
исключения для dev. В прод-сборке инлайн-скриптов нет — там всё работает. План: давить CSP
только вне dev, dev-loopback считать доверенным.

## 1. Requirements & Constraints

- **REQ-001**: `npm run dev` рендерит Shell/Dashboard без CSP-ошибок в консоли.
- **REQ-002**: Прод-CSP не ослабляется: meta в собранном `out/renderer/index.html` и заголовок Main сохраняют `script-src 'self'`.
- **SEC-001**: Исключение только для dev (`is.dev`); preview/packaged идут по прод-пути заголовка.
- **CON-001**: Границы слоёв (Main/Preload/Renderer/Shared, ADR 0002) и `check:boundaries` — зелёные.
- **CON-002**: Один файл — одна ответственность, ≤80 строк кода на компонент.
- **GUD-001**: Сообщения коммитов на русском, `type: кратко`.
- **PAT-001**: Чистые хелперы в Main покрываются colocated-тестами (`*.test.ts` рядом).

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: CSP-заголовок Main применяется только вне dev и покрыт тестом

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Создать `src/main/security/csp.ts`: константы `CSP_HEADER_NAME`, `CSP_POLICY` (текущая строка политики без изменений) и чистую `resolveCspHeaders(isDev: boolean): Record<string, string[]> \| null` (`true` → `null`) | ✅ | 2026-09-23 |
| TASK-002 | Создать `src/main/security/csp.test.ts`: `resolveCspHeaders(false)` возвращает заголовок с `script-src 'self'`; `resolveCspHeaders(true)` возвращает `null` | ✅ | 2026-09-23 |
| TASK-003 | В `src/main/index.ts` заменить безусловный `onHeadersReceived` на условный через `resolveCspHeaders(is.dev)`; импорт из `./security/csp` | ✅ | 2026-09-23 |

### Implementation Phase 2

- GOAL-002: Meta-CSP не мешает dev, но остаётся в прод-сборке

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | В `electron.vite.config.ts` добавить инлайн-плагин renderer `transformIndexHtml`: при `ctx.server` (dev serve) вырезать meta `Content-Security-Policy`, при build оставлять как есть | ✅ | 2026-09-23 |
| TASK-005 | Проверки: `npm run check:boundaries`, `npm run typecheck`, `npx vitest run src/main/security/csp.test.ts`, `npm run build` + grep meta в `out/renderer/index.html` (должна остаться) | ✅ | 2026-09-23 |
| TASK-006 | Ручная верификация пользователем: `npm run dev` — окно с Shell, консоль без `violates ... Content Security Policy` и без `can't detect preamble` | ✅ | 2026-09-23 |

## 3. Alternatives

- **ALT-001**: Добавить `'unsafe-inline'` в `script-src` глобально — отклонено: ослабляет прод (SEC-001, REQ-002).
- **ALT-002**: Удалить meta-CSP из `index.html` полностью — отклонено: meta остаётся первичной защитой для `file://` в проде, заголовок — defence-in-depth.
- **ALT-003**: Вынести vite-плагин в отдельный тестируемый модуль — отклонено: корректного юнита-сима нет (конфиг вне `src/**` скоупа vitest-проектов), инлайн в конфиге + проверка через build-артефакт достаточны.

## 4. Dependencies

- **DEP-001**: `is.dev` из `@electron-toolkit/utils` (уже импортирован в `src/main/index.ts`).
- **DEP-002**: `transformIndexHtml` API Vite 7 / electron-vite 5 (уже в зависимостях).

## 5. Files

- **FILE-001**: `src/main/security/csp.ts` (new) — константы политики + `resolveCspHeaders`.
- **FILE-002**: `src/main/security/csp.test.ts` (new) — регрессия на dev-исключение.
- **FILE-003**: `src/main/index.ts` (edit) — условная установка CSP-заголовка.
- **FILE-004**: `electron.vite.config.ts` (edit) — dev-only strip meta-CSP.

## 6. Testing

- **TEST-001**: `src/main/security/csp.test.ts` — prod возвращает политику, dev возвращает `null` (авто, vitest node-проект).
- **TEST-002**: После `npm run build` meta `Content-Security-Policy` присутствует в `out/renderer/index.html` (авто-проверка grep).
- **TEST-003**: `npm run dev` показывает Shell, в DevTools нет CSP-violation и `can't detect preamble` (ручная, HITL).

## 7. Risks & Assumptions

- **RISK-001**: В `electron-vite preview` `is.dev === true` (не упаковано) — заголовок тоже пропустится; принято: preview — локальный доверенный loopback, meta-CSP в бандле продолжает защищать.
- **ASSUMPTION-001**: Инлайн-преамбула dev — единственный заблокированный CSP инлайн-скрипт; других инлайн-скриптов renderer не содержит (прод-бандл собирается без инлайнов — подтверждено `out/renderer/index.html`).

## 8. Related Specifications / Further Reading

- `src/main/index.ts` lines 142-152 (текущий `onHeadersReceived`)
- `src/renderer/index.html` lines 6-9 (meta CSP)
- `electron.vite.config.ts` (renderer plugins)
- Skills: electron-development, electron-best-practices, security-review, typescript, vitest, feature-arch, diagnosing-bugs
