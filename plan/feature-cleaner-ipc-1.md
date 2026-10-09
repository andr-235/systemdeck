---
goal: Типизированный IPC Cleaner — preview/delete/cancel и push-прогресс (issue #55)
version: 1.0
date_created: 2026-10-09
last_updated: 2026-10-09
owner: systemdeck-agent
status: 'Implemented'
tags: [feature, cleaner, epic-5, ipc, main, preload, shared]
---

# Introduction

![Status: Implemented](https://img.shields.io/badge/status-Implemented-brightgreen)

План реализует issue #55 (дочерний EPIC 5 #22, ADR 0017): связать движок Cleaner (#54, слит в PR #61) с Renderer через строго типизированный Application API. В Shared появляются invoke-каналы `systemdeck:cleaner:preview|delete|cancel`, push-канал `systemdeck:push:cleaner:progress`, контракты и коды ошибок `CLEAN_*`; в Main — хранилище preview-сессий, сбор превью, executor удаления с повторной валидацией и оркестратор с одним активным циклом, throttle-прогрессом и терминальным событием; Preload публикует только `cleaner.preview/delete/cancel/onProgress`. UI страницы (#59), движок правил (#54) и категории (#56–#58) — вне скоупа.

## 1. Requirements & Constraints

- **REQ-001**: В `src/shared/ipc/channels.ts` добавлены invoke-каналы `cleanerPreview` (`systemdeck:cleaner:preview`), `cleanerDelete` (`systemdeck:cleaner:delete`), `cleanerCancel` (`systemdeck:cleaner:cancel`) и push-канал `cleanerProgress` (`systemdeck:push:cleaner:progress`).
- **REQ-002**: В `src/shared/ipc/contracts.ts` описаны `CleanerPreviewRequest`/`CleanerPreviewResponse`, `CleanerDeleteRequest`/`CleanerDeleteResponse`, `CleanerCancelRequest`/`CleanerCancelResponse`, `CleanupProgressEvent`, `CleanupPreviewCandidate`, `CleanupPreviewSource`; добавлены ветки в `IpcContracts`/`IpcPushContracts` — compile-time проверки существующего блока остаются зелёными.
- **REQ-003**: Preview принимает **идентификаторы категорий** (`categories: CleanupCategory[]`), возвращает `sessionId`, список кандидатов с ID, сумму **оценочных** байтов (`estimatedBytes`) и статусы источников (`sources`: `ok | partial | empty` + счётчики кандидатов/недоступных каталогов).
- **REQ-004**: Delete принимает только `sessionId` и непустой массив `candidateIds`; поле с путём в запросе не существует и не читается; каждый ID резолвится только внутри действующей сессии, перед удалением выполняется повторная валидация в Main (`isDeletionAllowed` + `lstat`: не symlink, обычный файл).
- **REQ-005**: Один активный цикл удаления: конкурентный `delete` и `preview` во время удаления отклоняются контролируемой ошибкой `CLEAN_ALREADY_ACTIVE`; после завершения операции следующий запуск проходит.
- **REQ-006**: Push-прогресс содержит `operationId`, `sessionId`, фазу (`validating | deleting`), `processed`/`total`, `freedBytes`, `timestamp`; терминальное событие того же канала — `completed | cancelled | failed` с `CleanupReport`. Throttle (~100 мс) применяется только к running-событиям, терминальное событие отправляется всегда.
- **REQ-007**: Cancel идемпотентен по `operationId`: совпавший активной операции устанавливает флаг отмены; чужой/завершённый/неизвестный ID — безопасный no-op. Уже удалённое не откатывается; поздние события безопасны, т.к. несут `operationId` и подписчик отфильтровывает не свой.
- **REQ-008**: `CleanupItemResult` дифференцирует исходы `deleted | skipped | failed` (пропуск при повторной валидации — отдельный исход, не ошибка и не успех); `CleanupReport` содержит `total/deleted/skipped/failed/freedBytes`; частичный отказ никогда не сворачивается в «всё очищено».
- **REQ-009**: Preload публикует в `window.api` только объявленные методы `cleaner.preview/delete/cancel/onProgress`; `onProgress` возвращает функцию отписки, утечки слушателей исключены.
- **REQ-010**: Ошибки уходят как `IPC Error` `{code, message}` без `stack`/`cause`; полный текст — только Application Log Main (Log Redaction).
- **SEC-001**: Raw path из Renderer не принимается: удаление возможно только по ID действующей preview-сессии, с истечением по TTL.
- **SEC-002**: Каждый элемент проходит повторную guard-проверку непосредственно перед `unlink` (защищённый путь / вне allow-правил / symlink / не файл → `skipped`, ничего не удаляется).
- **SEC-003**: Renderer получает только объявленные методы Application API; raw `ipcRenderer` и Privileged API в Preload не экспортируются.
- **CON-001**: Границы ADR 0002: Privileged API (`node:crypto`, `fs`, `ipcMain`) только в Main/Preload; Shared — только типы и строковые константы без runtime `electron`/`node:*`.
- **CON-002**: Один файл — одна ответственность; импорты по путям файлов без barrel-реэкспортов; тесты colocated рядом с модулем.
- **CON-003**: Вне скоупа: движок правил (#54), категории TEMP/корзины/браузеров (#56–#58), React-страница и модалка подтверждения (#59), термины CONTEXT.md.
- **CON-004**: Allow-корни и классификация остаются хардкод-таблицами в Main; Renderer не передаёт пути, корни и правила.
- **GUD-001**: Идентификаторы сессий и кандидатов — `randomUUID()` из `node:crypto` (Main); инкрементальные ID запрещены — чужой ID другой сессии не должен совпасть.
- **PAT-001**: Прецедент `ScanManager`: один активный операционный цикл, throttle прогресса через инжектируемый `send`, терминальное событие того же push-канала.
- **PAT-002**: Прецедент `withSafeHandler` + `IpcResult`: валидация входа в обработчике, контролируемые ошибки через `Object.assign(new Error(...), { code })`.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Зафиксировать контракты Cleaner IPC в Shared

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Completed | Date                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-001 | `src/shared/ipc/channels.ts`: добавить `cleanerPreview`, `cleanerDelete`, `cleanerCancel` в `IPC_CHANNELS` и `cleanerProgress` в `IPC_PUSH_CHANNELS`; покрывает REQ-001                                                                                                                                                                                                                                                                                          | [x]       | 2026-10-09                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| TASK-002 | `src/shared/ipc/contracts.ts`: типы `CleanupPreviewCandidate` (`id`, `path`, `sizeBytes`, `category`), `CleanupPreviewSource` (`category`, `status: 'ok'                                                                                                                                                                                                                                                                                                         | 'partial' | 'empty'`, `candidateCount`, `estimatedBytes`, `inaccessibleDirectories`), `CleanerPreviewRequest` (`categories`), `CleanerPreviewResponse` (`sessionId`, `candidates`, `estimatedBytes`, `sources`, `expiresAt`), `CleanerDeleteRequest` (`sessionId`, `candidateIds`), `CleanerDeleteResponse` (`operationId`), `CleanerCancelRequest` (`operationId`), `CleanupProgressEvent`(running-вариант с`phase/processed/total/freedBytes/timestamp`+ терминальный`completed | cancelled | failed`с`report`); переписать `CleanupItemResult`на дискриминатор`outcome: 'deleted' | 'skipped' | 'failed'`и`CleanupReport` (`items`, `total`, `deleted`, `skipped`, `failed`, `freedBytes`); добавить ветки в `IpcContracts`и`IpcPushContracts`; покрывает REQ-002, REQ-003, REQ-004, REQ-006, REQ-008 | [x] | 2026-10-09 |
| TASK-003 | `src/shared/ipc/errors.ts`: коды `CLEAN_ALREADY_ACTIVE`, `CLEAN_SESSION_NOT_FOUND`, `CLEAN_UNKNOWN_CANDIDATE`, `CLEAN_EMPTY_SELECTION`, `CLEAN_ENTRY_INVALID` (существующие `CLEAN_*` не трогать); `src/shared/ipc/index.ts`: реэкспорт новых типов; `src/shared/api.ts`: интерфейс `CleanerApi` (`preview`, `delete`, `cancel`, `onProgress`), поле `cleaner: CleanerApi` в `AppAPI`, `SHARED_CONTRACT_VERSION` `sd-021` → `sd-022`; покрывает REQ-002, REQ-009 | [x]       | 2026-10-09                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Implementation Phase 2

- GOAL-002: Реализовать сессии, превью и executor удаления в Main

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-004 | Создать `src/main/cleaner/previewSession.ts`: `PreviewSession` (`id`, `createdAt`, `expiresAt`, `Map<candidateId, CleanupPreviewCandidate>`), `PreviewSessionStore` — `create(candidates)` (ID через `randomUUID`, TTL `CLEANUP_SESSION_TTL_MS = 5 * 60_000`, прежняя сессия уничтожается), `get(sessionId)` возвращает `null` для чужого/просроченного ID с удалением устаревшей сессии; покрывает REQ-003, SEC-001, GUD-001                                                                                                                                 | [x]       | 2026-10-09 |
| TASK-005 | Создать `src/main/cleaner/preview.ts`: `buildCleanupPreview(categories, fs)` — валидация непустого списка категорий, группировка allow-корней правил по категории, обход `collectCleanupCandidates` (walker) по каждой категории, фильтрация через `buildCleanupCandidates`, агрегация кандидатов/оценочных байтов и статусов источников (`empty` — 0 кандидатов и 0 недоступных, `partial` — есть недоступные каталоги, иначе `ok`); покрывает REQ-003, CON-004                                                                                              | [x]       | 2026-10-09 |
| TASK-006 | Создать `src/main/cleaner/deleter.ts`: `CleanerDeleteFs` (`lstat`, `unlink`) с node-реализацией по умолчанию и fake для тестов; `runCleanup(selected, { fs, isCancelled })` — для каждого элемента: выход по `isCancelled`, guard `isDeletionAllowed` → `skipped` с кодом, `lstat` (ENOTFOUND → `skipped`; symlink/не файл → `skipped`), `unlink` → `deleted` с фактическими `bytesFreed` из `lstat.size`, ошибка unlink → `failed` с `CLEAN_DELETE_FAILED`; исходы возвращаются массивом `CleanupItemResult[]`; покрывает REQ-004, REQ-007, REQ-008, SEC-002 | [x]       | 2026-10-09 |
| TASK-007 | Создать `src/main/cleaner/report.ts` (правка): `buildCleanupReport` пересчитан на `outcome` (`deleted/skipped/failed`, `freedBytes` только по `deleted`); покрывает REQ-008                                                                                                                                                                                                                                                                                                                                                                                   | [x]       | 2026-10-09 |
| TASK-008 | Создать `src/main/cleaner/progress.ts`: `CleanupProgressEmitter` — инжектируемые `send`/`now`/`throttleMs` (по умолчанию 100 мс, PAT-001), `emitRunning` с троттлингом, `emitTerminal` без троттлинга, все события несут `operationId`/`sessionId`; покрывает REQ-006, GUD-001                                                                                                                                                                                                                                                                                | [x]       | 2026-10-09 |

### Implementation Phase 3

- GOAL-003: Оркестрация и IPC-регистрация

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Completed                                                                                                 | Date       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| TASK-009 | Создать `src/main/cleaner/CleanerManager.ts`: `preview(categories)` (отклоняется `CLEAN_ALREADY_ACTIVE` при активной операции; создаёт сессию через store и отвечает `CleanerPreviewResponse`), `startDelete({sessionId, candidateIds})` — валидация формы (непустой массив строк, иначе `CLEAN_EMPTY_SELECTION`), резолв сессии (`CLEAN_SESSION_NOT_FOUND`), резолв каждого ID (`CLEAN_UNKNOWN_CANDIDATE`), предварительный guard по всем выбранным (`CLEAN_PROTECTED_PATH`/`CLEAN_OUTSIDE_RULES` до старта), синхронная фиксация активной операции и запуск цикла `runCleanup` с событиями `validating` → `deleting` → терминальным (`completed`, по отмене `cancelled`, по неожиданной ошибке `failed`, отчёт строится из накопленных исходов), `cancel(operationId)` — идемпотентный no-op при несовпадении; покрывает REQ-005, REQ-006, REQ-007 | [x]                                                                                                       | 2026-10-09 |
| TASK-010 | Создать `src/main/ipc/cleaner.ts`: `createCleanerPreviewHandler/createCleanerDeleteHandler/createCleanerCancelHandler` через `withSafeHandler` с валидацией формы входа (`VALIDATION_FAILED`) и `registerCleanerIpc(manager)`; подключить `cleanerManager?: CleanerManager                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | null`в`IpcHandlersOptions`и вызов`registerCleanerIpc`в`src/main/ipc/index.ts`; покрывает REQ-002, PAT-002 | [x]        | 2026-10-09 |
| TASK-011 | `src/main/index.ts`: создать `CleanerManager` с `send` → `mainWindow.webContents.send(IPC_PUSH_CHANNELS.cleanerProgress, event)` (защита `isDestroyed`, прецедент ScanManager) и передать в `registerIpcHandlers`; покрывает REQ-006                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [x]                                                                                                       | 2026-10-09 |

### Implementation Phase 4

- GOAL-004: Опубликовать cleaner в Preload и покрыть тестами

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Completed | Date       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-012 | `src/preload/index.ts`: объект `cleaner: CleanerApi` — три `ipcRenderer.invoke` по каналам и `onProgress` через существующий `subscribePush` (возвращает unsubscribe); покрывает REQ-009, SEC-003                                                                                                                                                                                                                                                                                                                            | [x]       | 2026-10-09 |
| TASK-013 | Тесты Main: `src/main/cleaner/previewSession.test.ts` (TTL, чужой ID, уникальность), `src/main/cleaner/preview.test.ts` (только указанные категории, статусы источников, сумма оценочных байтов, запрет пустого набора), `src/main/cleaner/deleter.test.ts` (skip вне правил/защищённого/symlink/ENOENT, факт `bytesFreed`, ошибка unlink → `failed`, отмена между элементами); покрывает REQ-003, REQ-004, REQ-007, REQ-008, SEC-002                                                                                        | [x]       | 2026-10-09 |
| TASK-014 | Тесты оркестратора `src/main/cleaner/CleanerManager.test.ts`: конкурентный `startDelete` и `preview` во время удаления → `CLEAN_ALREADY_ACTIVE`; пустой набор, чужой sessionId/ID, просроченная сессия; cancel идемпотентен и чужой operationId не отменяет активный; терминальное событие всегда доставляется при троттлинге; поздние события несут чужой `operationId`; частичный отказ попадает в отчёт; `src/main/cleaner/progress.test.ts` (троттлинг не теряет terminal); покрывает REQ-005, REQ-006, REQ-007, REQ-008 | [x]       | 2026-10-09 |
| TASK-015 | Тесты IPC и Preload: `src/main/ipc/cleaner.test.ts` (регистрация каналов при наличии менеджера, `VALIDATION_FAILED` на неверной форме, отсутствие пути в запросе, IPC Error без stack), `src/preload/index.test.ts` (mock `electron`: `window.api.cleaner` содержит ровно 4 метода, `onProgress` подписывается и отписывается, raw `ipcRenderer` не экспортируется); покрывает REQ-002, REQ-009, REQ-010, SEC-003                                                                                                            | [x]       | 2026-10-09 |
| TASK-016 | `src/renderer/src/test-utils.ts`: добавить заглушку `cleaner` в фабрику `setMockApi` (иначе `typecheck:web` падает на полном литерале `AppAPI`); покрывает CON-001                                                                                                                                                                                                                                                                                                                                                           | [x]       | 2026-10-09 |

### Implementation Phase 5

- GOAL-005: Проверки и упаковка

| Task     | Description                                                                                                                                                                                                        | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| TASK-017 | Прогнать `npm run check` и `npm run smoke` (Main/Preload/IPC изменены — smoke обязателен); исправить найденное; покрывает TEST-006                                                                                 | [x]       | 2026-10-09 |
| TASK-018 | Коммит на русском (conventional-commit/git-commit), PR с первой строкой тела `Closes #55`, лейблом `ready-for-human`, строкой `Skills: ...`, комментарием в issue #55; покрывает план- и process-правила AGENTS.md |           |            |

## 3. Alternatives

- **ALT-001**: **Description**: Отдавать отчёт очистки в ответе `delete` (invoke), без push-канала прогресса.
- **ALT-002**: **Rejection Reason**: Нарушает устоявшийся push-протокол долгих операций (ADR 0008/0013) и требование issue иметь throttle-прогресс с терминальным событием; invoke-ответ приходилось бы держать открытым на всё удаление.
- **ALT-003**: **Description**: Принимать в `delete` массив путей (raw path) вместо ID сессии.
- **ALT-004**: **Rejection Reason**: Прямой путь из Renderer — произвольный API удаления; запрещён SEC-001 и ADR 0017 (Renderer получает только кандидаты и отчёт готовыми).
- **ALT-005**: **Description**: Разрешить новый preview во время активного удаления (сессии независимы).
- **ALT-006**: **Rejection Reason**: Две активные сессии усложняют повторную валидацию и ломают предсказуемость «одного цикла»; отклонение `CLEAN_ALREADY_ACTIVE` проще объяснимо пользователю (issue требует описать и зафиксировать поведение).
- **ALT-007**: **Description**: Оставить существующий `CleanupItemResult` с `success: boolean` и кодом ошибки для пропусков.
- **ALT-008**: **Rejection Reason**: Критерий приёмки требует различать успех, пропуск, частичный отказ и отмену; пропуск с кодом ошибки показался бы Renderer как неуспех, скрывая природу события.

## 4. Dependencies

- **DEP-001**: Issue #55 — исполняемый scope; issue #54 (движок, PR #61) — закрытая зависимость.
- **DEP-002**: ADR 0017 (PR #60, слит) — модель безопасности scan → preview → selection → delete → report.
- **DEP-003**: ADR 0013 и `ScanManager` — протокол throttle/терминальных событий (PAT-001).
- **DEP-004**: ADR 0002 — границы слоёв; `scripts/check-boundaries.mjs` — автоматическая проверка.
- **DEP-005**: Issue #22 (EPIC 5) — родитель; #56–#59 — потребители контракта (вне скоупа).

## 5. Files

- **FILE-001**: plan/feature-cleaner-ipc-1.md — план данной работы.
- **FILE-002**: src/shared/ipc/channels.ts — новые invoke/push каналы (REQ-001).
- **FILE-003**: src/shared/ipc/contracts.ts — контракты preview/delete/cancel/progress, CleanupItemResult/CleanupReport (REQ-002, REQ-008).
- **FILE-004**: src/shared/ipc/errors.ts — коды `CLEAN_*` (REQ-010).
- **FILE-005**: src/shared/ipc/index.ts — реэкспорт типов.
- **FILE-006**: src/shared/api.ts — `CleanerApi`, `AppAPI.cleaner`, бамп версии (REQ-009).
- **FILE-007**: src/main/cleaner/previewSession.ts — хранилище сессий с TTL (SEC-001).
- **FILE-008**: src/main/cleaner/preview.ts — сбор превью по категориям (REQ-003).
- **FILE-009**: src/main/cleaner/deleter.ts — executor с повторной валидацией (REQ-004, SEC-002).
- **FILE-010**: src/main/cleaner/report.ts — пересчёт отчёта по outcome (REQ-008).
- **FILE-011**: src/main/cleaner/progress.ts — throttle-эмиттер (REQ-006).
- **FILE-012**: src/main/cleaner/CleanerManager.ts — оркестратор (REQ-005, REQ-007).
- **FILE-013**: src/main/ipc/cleaner.ts — обработчики и регистрация (REQ-002).
- **FILE-014**: src/main/ipc/index.ts — подключение `cleanerManager`.
- **FILE-015**: src/main/index.ts — создание менеджера и push-отправка.
- **FILE-016**: src/preload/index.ts — публикация `cleaner` (REQ-009).
- **FILE-017**: src/renderer/src/test-utils.ts — заглушка `cleaner` для тестов рендерера.
- **FILE-018**: colocated `*.test.ts` рядом с FILE-007…FILE-013 и `src/preload/index.test.ts`.

## 6. Testing

- **TEST-001**: previewSession: чужой и просроченный sessionId → `null`/`CLEAN_SESSION_NOT_FOUND`; ID кандидатов уникальны между сессиями.
- **TEST-002**: preview: работает только по переданным категориям, сумма `estimatedBytes` сходится с кандидатами, статусы источников корректны, пустой список категорий → `VALIDATION_FAILED`.
- **TEST-003**: deleter: защищённый/вне правил/symlink/исчезнувший путь → `skipped` без удаления; `bytesFreed` равен фактическому размеру; ошибка unlink → `failed` с `CLEAN_DELETE_FAILED`; отмена останавливает цикл.
- **TEST-004**: CleanerManager: конкурентный запуск → `CLEAN_ALREADY_ACTIVE`; cancel идемпотентен; терминальное событие доставляется даже при агрессивном троттлинге; событие прошлой операции содержит прежний `operationId`.
- **TEST-005**: IPC/Preload: форма запроса валидируется, ошибка без `stack`; `window.api.cleaner` — ровно объявленные 4 метода с рабочей отпиской.
- **TEST-006**: `npm run check` (lint, format, boundaries, file-size, typecheck, test) и `npm run smoke` выполнены фактически на Windows.

## 7. Risks & Assumptions

- **RISK-001**: Удаление необратимо; TOCTOU между preview и delete — mitigated SEC-001/SEC-002 (TTL-сессия, повторный guard + `lstat` непосредственно перед `unlink`, отклонение `skipped` при изменении пути).
- **RISK-002**: `$Recycle.Bin` и системные каталоги часто требуют elevation — `unlink` вернёт EPERM → per-item `failed` в отчёте, операция не абортится (частичный отказ виден, REQ-008); пользовательское сообщение о правах — UI #59.
- **RISK-003**: Truncate отчёта при отмене: необработанные элементы не входят в `items` — `total` отчёта равен числу фактически обработанных, полный выбранный набор виден в прогрессе (`processed/total` события).
- **ASSUMPTION-001**: TTL preview-сессии 5 минут — константа в Main, детальная политика актуальности не настраивается из Renderer; при необходимости уточняется в #59.
- **ASSUMPTION-002**: Категории #56–#58 расширят реестр правил без изменения контрактов #55; каркасного реестра `CLEANER_RULES` (#54) достаточно для работы IPC-слоя.

## 8. Related Specifications / Further Reading

- Issue #55 — scope и критерии приёмки; issue #54 — движок-зависимость; #22 — EPIC 5.
- ADR 0017 — модель безопасности Cleaner; ADR 0013 — протокол push-прогресса и отмены.
- ADR 0002 — границы слоёв; ADR 0003 — typed IPC contracts; ADR 0008 — live push pipeline.
- plan/feature-cleaner-engine-1.md — план движка (предыдущая работа).
- src/main/storage/ScanManager.ts — образец активной операции, throttle и терминального события.
