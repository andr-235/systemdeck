---
goal: Починить `npm run dev` — dev-сервер Vite слушал только IPv6 ::1, а Electron обращался к 127.0.0.1
version: 1.0
date_created: 2026-10-09
last_updated: 2026-10-09
owner: SystemDeck
status: 'In progress'
tags: [`fix`, `bug`, `electron`, `tooling`]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

`npm run dev` падал с `ERR_CONNECTION_REFUSED`: Node (dns-порядок verbatim)
резолвит `localhost` в `::1`, Vite слушал только IPv6-loopback, а Chromium в
Electron стартует с `127.0.0.1`. Фикс — явный `server.host: '127.0.0.1'` в
`electron.vite.config.ts`. Побочные следствия, выявленные при проверке:
массовое non-prettier форматирование в HEAD (88 файлов не проходили
`format:check`) и конфликт двух гейтов: после форматирования 3 компонента
превысили лимит 80 строк.

## 1. Requirements & Constraints

- **REQ-001**: `npm run dev` поднимает dev-сервер на `127.0.0.1:5173` (IPv4), Electron загружает рендер без `ERR_CONNECTION_REFUSED`.
- **REQ-002**: Инвариант хоста закреплён регрессионным тестом.
- **REQ-003**: `npm run check` (lint, format:check, boundaries, file-size, typecheck, test) зелёный.
- **CON-001**: Изменения не пересекаются с файлами открытого PR #62 (`feat/55-cleaner-ipc`); работа идёт в отдельном worktree на ветке `fix/dev-ipv4-loopback`.
- **CON-002**: Работающий параллельно агент в исходном рабочем дереве не затрагивается.
- **GUD-001**: Коммиты на русском, формат `type: краткое описание` (AGENTS.md).
- **GUD-002**: Рендер-компоненты ≤80 строк кода (`check:file-size`), формат Prettier printWidth 100.

## 2. Implementation Steps

### Implementation Phase 1 — фикс конфигурации dev-сервера

- GOAL-001: Dev-сервер слушает только IPv4-loopback.

| Task     | Description                                                                                                | Completed | Date       |
| -------- | ---------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-001 | `electron.vite.config.ts`: `renderer.server.host: '127.0.0.1'` с комментарием о причине (::1 vs 127.0.0.1) | ✅        | 2026-10-09 |
| TASK-002 | Регрессионный тест `electron.vite.config.test.ts`: `config.renderer.server.host === '127.0.0.1'`           | ✅        | 2026-10-09 |
| TASK-003 | `vitest.config.ts`: добавить корневой паттерн `*.config.test.ts` в проект `node`                           | ✅        | 2026-10-09 |

### Implementation Phase 2 — приведение формата к Prettier

- GOAL-002: `format:check` зелёный (в HEAD 88 файлов не проходили prettier 3.9.6 — pre-existing дрейф, CI-workflows в репо нет).

| Task     | Description                                                                      | Completed | Date       |
| -------- | -------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-004 | `npm run format` по репозиторию; правка захвачена патчем и перенесена в worktree | ✅        | 2026-10-09 |

### Implementation Phase 3 — разбивка компонентов под лимит 80 строк

- GOAL-003: Устранить конфликт гейтов: ручная компрессия JSX против printWidth 100.

| Task     | Description                                                                              | Completed | Date       |
| -------- | ---------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-005 | `StorageSidebar.tsx` 85 → 48: таблист вынесен в `storage/StorageTablist.tsx` (48 строк)  | ✅        | 2026-10-09 |
| TASK-006 | `StorageScanView.tsx` 83 → 50: панели вынесены в `StorageLayout.tsx` (45 строк)          | ✅        | 2026-10-09 |
| TASK-007 | `TreemapTile.tsx` 94 → 68: подписи вынесены в `treemap/TreemapTileLabels.tsx` (47 строк) | ✅        | 2026-10-09 |

### Implementation Phase 4 — верификация

- GOAL-004: Подтвердить фикс и зелёные гейты.

| Task     | Description                                                          | Completed | Date       |
| -------- | -------------------------------------------------------------------- | --------- | ---------- |
| TASK-008 | `npm run check` + `npm run smoke` — все гейты зелёные (фактически)   | ✅        | 2026-10-09 |
| TASK-009 | `npm run dev` — рендер грузится, IPC работает (проверено фактически) | ✅        | 2026-10-09 |
| TASK-010 | Коммиты + PR с `Skills:` и описанием проверок                        |           |            |

## 3. Alternatives

- **ALT-001**: Системное отклон IPv6 в Windows (реестр `DisabledComponents=0xFF`, админ + перезагрузка) — отклонено пользователем: выбран фикс только в проекте.
- **ALT-002**: `NODE_OPTIONS=--dns-result-order=ipv4first` в скрипте dev — отклонён: менее очевиден, чем явный хост в конфиге, и не защищает `preview`.
- **ALT-003**: Baseline-исключение для 3 компонентов в `file-size-baseline.json` — отклонено пользователем: выбрана реальная разбивка.
- **ALT-004**: `// prettier-ignore` на сжатый JSX — отклонено: код навсегда выпадает из автоформата.

## 4. Dependencies

- **DEP-001**: electron-vite ≥5 (`resolveHostname` формирует `ELECTRON_RENDERER_URL` из `server.host`).
- **DEP-002**: Prettier 3.9.6 (lockfile), Vitest 3.2.7.

## 5. Files

- **FILE-001**: `electron.vite.config.ts` — `renderer.server.host: '127.0.0.1'`.
- **FILE-002**: `electron.vite.config.test.ts` (новый) — регрессионный тест инварианта.
- **FILE-003**: `vitest.config.ts` — include корневого теста конфига.
- **FILE-004**: `src/renderer/src/components/storage/StorageSidebar.tsx` (+ новый подкомпонент).
- **FILE-005**: `src/renderer/src/components/StorageScanView.tsx` (+ подкомпонент).
- **FILE-006**: `src/renderer/src/components/treemap/TreemapTile.tsx` (+ подкомпонент).
- **FILE-007**: 28 файлов, приведённых к формату Prettier (см. diff PR).

## 6. Testing

- **TEST-001**: `electron.vite.config.test.ts` — хост dev-сервера ровно `127.0.0.1`.
- **TEST-002**: Существующие тесты компонентов (`StorageSidebar.test.tsx`, `StoragePage.test.tsx`, `StorageTreemap.test.tsx`) проходят без изменений поведения.
- **TEST-003**: `npm run check` — фактически, все под-гейты.
- **TEST-004**: Ручной feedback loop `npm run dev` — отсутствие `ERR_CONNECTION_REFUSED`, рендер и IPC работают.

## 7. Risks & Assumptions

- **RISK-001**: Разбивка компонентов меняет DOM-структуру (новые узлы) — тесты и визуальный обзор должны подтвердить идентичность.
- **RISK-002**: Параллельная сессия в исходном дереве может изменить общий index/remote — изоляция через worktree снижает риск.
- **ASSUMPTION-001**: Локальный `main` (2 коммита без push) — корректная база; PR может включать их до публикации владельцем.

## 8. Related Specifications / Further Reading

- `docs/adr/0002-main-preload-renderer-boundaries.md` — границы слоёв.
- Electron best practice: dev-сервер всегда на `127.0.0.1` (скилл `electron-best-practices`).
