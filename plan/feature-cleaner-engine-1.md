---
goal: Движок правил Cleaner и модель безопасности в Main (issue #54)
version: 1.0
date_created: 2026-09-23
last_updated: 2026-10-09
owner: systemdeck-agent
status: 'Completed'
tags: [feature, cleaner, epic-5, main, safety]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

План реализует issue #54 (дочерний EPIC 5 #22, ADR 0017): движок правил Cleaner и модель безопасности в Main. Типы кандидатов и отчёта фиксируются в Shared, реестр allow-правил, deny-список защищённых путей, построение кандидатов, guard удаления, per-item отчёт и сериализация ошибок без stack — в `src/main/cleaner/`. IPC-протокол `cleaner:*`, конкретные категории TEMP/корзины/браузеров и UI страницы — вне скоупа (отдельные issues #55–#59).

## 1. Requirements & Constraints

- **REQ-001**: Тип `CleanupCategory` из 6 литералов (`user-temp`, `windows-temp`, `recycle-bin`, `thumbnail-cache`, `browser-cache`, `log-files`) зафиксирован в Shared.
- **REQ-002**: Типы `CleanupCandidate` (путь, размер, категория, флаг защищённости), `CleanupItemResult` (путь, байты, успех или ошибка с кодом), `CleanupReport` (per-item записи + сводка) зафиксированы в Shared.
- **REQ-003**: Реестр правил в Main: каждое правило задаёт узкий allow-корень и паттерн; всё вне правил мусором не считается.
- **REQ-004**: Список защищённых путей в Main: всё вне allow-правил защищено по умолчанию; явный deny-список системных корней; защищённый путь никогда не попадает в кандидаты и блокирует удаление.
- **REQ-005**: Политика Reparse Point и Inaccessible Directory из ADR 0013: ссылки не обходятся, недоступное помечается и не абортит операцию.
- **REQ-006**: Ошибки сериализуются как IPC Error без stack; полный текст только в Application Log Main (Log Redaction).
- **REQ-007**: Colocated vitest-тесты движка зелёные и покрывают каждый критерий приёмки issue.
- **CON-001**: Границы Main/Preload/Renderer/Shared (ADR 0002): Privileged API только Main; Renderer не трогается; новые типы Shared без runtime `electron`/`node:*`.
- **CON-002**: EPIC 4 read-only (ADR 0013): Scan Result не используется как источник кандидатов; обход идёт только по allow-корням правил движка.
- **CON-003**: Один файл — одна ответственность, не более 80 строк кода без пустых строк и комментариев (AGENTS.md); тесты рядом с фичей (colocated); импорты напрямую по путям файлов без barrel-реэкспортов.
- **CON-004**: Без новых IPC-каналов `cleaner:*`, без конкретных категорий TEMP/корзины/браузеров, без UI — вне скоупа issue #54.
- **GUD-001**: Пути Windows сравниваются case-insensitive с нормализацией слэшей; allow-корень матчится по границе сегмента, а не префиксом строки.
- **PAT-001**: Прецедент хардкод-таблиц в Main: Protected Process (ADR 0011), File Type Category (ADR 0013).

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Зафиксировать контракты Cleaner в Shared

| Task     | Description                                                                                                                                                                                                     | Completed | Date       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-001 | Добавить в `src/shared/ipc/contracts.ts` типы `CleanupCategory`, `CleanupCandidate`, `CleanupItemResult`, `CleanupReport`; реэкспорт в `src/shared/ipc/index.ts`; покрывает REQ-001, REQ-002                    | ✅        | 2026-09-23 |
| TASK-002 | Добавить в `src/shared/ipc/errors.ts` коды `CLEAN_PROTECTED_PATH`, `CLEAN_OUTSIDE_RULES`, `CLEAN_DELETE_FAILED`; поднять `SHARED_CONTRACT_VERSION` `sd-020` → `sd-021` в `src/shared/api.ts`; покрывает REQ-006 | ✅        | 2026-09-23 |

### Implementation Phase 2

- GOAL-002: Построить движок правил и безопасности в Main

| Task     | Description                                                                                                                                                                                                                                                 | Completed | Date       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-003 | Создать `src/main/cleaner/categories.ts` (константа 6 категорий) и `src/main/cleaner/rules.ts` (тип `CleanupRule`, реестр `CLEANER_RULES`, матчеры `matchesCleanupRule`, `findCleanupRule`); покрывает REQ-003                                              | ✅        | 2026-09-23 |
| TASK-004 | Создать `src/main/cleaner/protectedPaths.ts` (deny-список системных корней из `SystemRoot`, `isProtectedPath`) и `src/main/cleaner/paths.ts` (`normalizeCleanerPath`, `isPathUnderRoot`); покрывает REQ-004                                                 | ✅        | 2026-09-23 |
| TASK-005 | Создать `src/main/cleaner/candidates.ts` (`buildCleanupCandidates`, `isDeletionAllowed`) и `src/main/cleaner/walker.ts` (`collectCleanupCandidates` по allow-корням: пропуск symlink, пометка inaccessible без аборта); покрывает REQ-003, REQ-004, REQ-005 | ✅        | 2026-09-23 |
| TASK-006 | Создать `src/main/cleaner/report.ts` (`buildCleanupReport`: сводка сходится с суммой per-item, частичные неуспехи не скрываются) и `src/main/cleaner/errors.ts` (`toCleanupIpcError` без stack + лог полного текста); покрывает REQ-006                     | ✅        | 2026-09-23 |

### Implementation Phase 3

- GOAL-003: Покрыть движок тестами и проверить качество

| Task     | Description                                                                                                                                                                                                                                                                                                                       | Completed | Date       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-007 | Создать colocated тесты: `rules.test.ts` (allow-корень+паттерн, вне правил не кандидаты), `candidates.test.ts` (защищённый блокирует удаление), `report.test.ts` (сводка сходится, неуспехи видны), `walker.test.ts` (reparse не обходится, inaccessible не абортит), `errors.test.ts` (нет stack в IPC Error); покрывает REQ-007 | ✅        | 2026-09-23 |
| TASK-008 | Прогнать `npm run check:boundaries`, `npm run typecheck`, `npm run test`; разбить файлы свыше 80 строк; покрывает CON-001, CON-003                                                                                                                                                                                                | ✅        | 2026-09-23 |
| TASK-010 | Правки после code review PR #61: паттерн thumbnail-cache без якоря `^` на полный путь, строгий матчинг allow-корня (сам корень — не кандидат и не проходит guard), walker помечает файлы с неудачным `stat` как `inaccessible` вместо тихого пропуска; регресс-тесты; покрывает REQ-007                                           | ✅        | 2026-10-09 |

### Implementation Phase 4

- GOAL-004: Упаковать работу в коммит и PR

| Task     | Description                                                                                                                                                                            | Completed | Date       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-009 | Закоммитить сообщением на русском (conventional-commit/git-commit), открыть PR с первой строкой тела `Closes #54`, лейблом `ready-for-human`, строкой `Skills:` и комментарием в issue | ✅        | 2026-10-09 |

## 3. Alternatives

- **ALT-001**: **Description**: Переиспользовать `ScanResult` EPIC 4 как источник кандидатов на удаление.
- **ALT-002**: **Rejection Reason**: Scan Result lean без per-file дерева (ADR 0013) и быстро протухает; движок строит кандидатов свежим обходом только разрешённых корней (CON-002).
- **ALT-003**: **Description**: Deny-модель вместо allow: удаляемо всё, кроме deny-списка.
- **ALT-004**: **Rejection Reason**: Deny-модель пропускает неизвестные пути; ADR 0017 требует узкий allow-корень на правило, всё остальное защищено по умолчанию.
- **ALT-005**: **Description**: Один файл `cleaner.ts` на весь движок.
- **ALT-006**: **Rejection Reason**: Нарушает лимит 80 строк и одну ответственность на файл (CON-003).

## 4. Dependencies

- **DEP-001**: Issue #54 — исполняемый scope данной работы.
- **DEP-002**: Issue #22 (EPIC 5) — родитель; ADR 0017 — модель безопасности.
- **DEP-003**: ADR 0013 — политика Reparse Point и Inaccessible Directory, прецедент lean-обхода.
- **DEP-004**: ADR 0002 — границы слоёв; `scripts/check-boundaries.mjs` — автоматическая проверка.

## 5. Files

- **FILE-001**: plan/feature-cleaner-engine-1.md — план данной работы.
- **FILE-002**: src/shared/ipc/contracts.ts — типы Cleaner (REQ-001, REQ-002).
- **FILE-003**: src/shared/ipc/errors.ts — коды `CLEAN_*` (REQ-006).
- **FILE-004**: src/shared/api.ts — бамп `SHARED_CONTRACT_VERSION` (REQ-006).
- **FILE-005**: src/main/cleaner/categories.ts — константа категорий.
- **FILE-006**: src/main/cleaner/rules.ts — реестр allow-правил и матчеры (REQ-003).
- **FILE-007**: src/main/cleaner/paths.ts — нормализация путей и матчинг корня (GUD-001).
- **FILE-008**: src/main/cleaner/protectedPaths.ts — deny-список и проверка (REQ-004).
- **FILE-009**: src/main/cleaner/candidates.ts — построение кандидатов и guard удаления (REQ-003, REQ-004).
- **FILE-010**: src/main/cleaner/walker.ts — обход allow-корней (REQ-005).
- **FILE-011**: src/main/cleaner/report.ts — per-item отчёт (REQ-006).
- **FILE-012**: src/main/cleaner/errors.ts — сериализация ошибок без stack (REQ-006).
- **FILE-013**: src/main/cleaner/*.test.ts — colocated тесты (REQ-007).

## 6. Testing

- **TEST-001**: Пути вне allow-правил кандидатами не становятся (правило без allow-корня/паттерна невозможно).
- **TEST-002**: Защищённый путь никогда не попадает в кандидаты и `isDeletionAllowed` возвращает `false` с `CLEAN_PROTECTED_PATH`.
- **TEST-003**: Сводка отчёта сходится с суммой per-item записей; частичные неуспехи присутствуют в `items`.
- **TEST-004**: Reparse Point не обходится, недоступный каталог помечается и не абортит сбор кандидатов.
- **TEST-005**: `toCleanupIpcError` не содержит `stack`/`cause`; `npm run check:boundaries`, `npm run typecheck`, `npm run test` зелёные.

## 7. Risks & Assumptions

- **RISK-001**: Удаление необратимо — mitigated REQ-004 (default-защита + deny-список + guard) и per-item отчётом без скрытия неуспехов.
- **RISK-002**: Матчинг префиксом строки пропустит `C:\Windows2` под корень `C:\Windows` — mitigated GUD-001 (граница сегмента + нормализация).
- **ASSUMPTION-001**: Конкретные allow-корни TEMP/корзины/браузеров детализируются в issues #56–#58; здесь реестр задаёт каркас с representative-правилами и механику матчинга.
- **ASSUMPTION-002**: IPC-протокол `cleaner:*` — issue #55; здесь каналы не добавляются, контракты типов готовы к переиспользованию.

## 8. Related Specifications / Further Reading

- Issue #54 — scope и критерии приёмки данной работы.
- Issue #22 (EPIC 5) — родитель; ADR 0017 — модель безопасности Cleaner.
- ADR 0013 — storage-scan-protocol (Reparse Point, Inaccessible Directory, lean-обход).
- ADR 0002 — границы слоёв; CONTEXT.md — Scan, Protected Process, Log Redaction, IPC Error.
- src/main/storage/scan.ts — образец walker с fake-fs для тестов; src/main/system/processProtection.ts — прецедент хардкод-списка.
