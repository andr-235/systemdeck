---
goal: Страница Cleaner в Renderer — предпросмотр, явный выбор, подтверждение, прогресс и отчёт (issue #59)
version: 1.0
date_created: 2026-10-09
last_updated: 2026-10-09
owner: systemdeck-agent
status: 'Implemented'
tags: [feature, cleaner, epic-5, renderer, react, ui]
---

# Introduction

![Status: Implemented](https://img.shields.io/badge/status-Implemented-brightgreen)

План реализует issue #59 (дочерний EPIC 5 #22, ADR 0017): страница Cleaner в Renderer со сценарием «сканирование → просмотр кандидатов → явный выбор → подтверждение → удаление → отчёт» только через Application API (`window.api.cleaner`, IPC #55 слит в PR #62; движок #54 — PR #61; категории #56–#58 — PR #67/#68/#69). Renderer не классифицирует файлы, не передаёт пути и не выполняет Privileged API: наружу уходят только идентификаторы категорий и ID кандидатов действующей preview-сессии. Движок, IPC, правила категорий и страница Storage — вне скоупа.

## 1. Requirements & Constraints

- **REQ-001**: В Shell (`src/renderer/src/App.tsx`) добавлен пункт навигации «Очистка» (`Page = 'dashboard' | 'processes' | 'storage' | 'cleaner'`) и рендер страницы Cleaner; существующая навигация без router сохранена.
- **REQ-002**: Страница выбора категорий: шесть `CleanupCategory` с русскими названиями, кнопка «Предпросмотр» активна только при непустом наборе категорий; статусы источников (`ok|partial|empty|unavailable`), причина недоступности, число кандидатов и оценочные байты видны per-category.
- **REQ-003**: После успешного preview выбор пуст по умолчанию: ни один кандидат не отмечен, кнопка «Удалить» недоступна до явного выбора.
- **REQ-004**: Кандидаты отображаются с категорией, источником (браузер/профиль/вид кэша для `browser-cache`, иначе прочерк), путём, размером, возрастом (`mtimeMs`, нет данных → прочерк) и статусом источника; недоступные значения не заменяются нулём.
- **REQ-005**: Подтверждение перед `cleaner.delete`: диалог содержит число выбранных элементов, список выбранных категорий, оценку размера выборки и отдельное предупреждение об агрегированной очистке корзины; `delete` не вызывается без выбора и без подтверждения.
- **REQ-006**: `cleaner.delete` получает только `{ sessionId: текущая preview-сессия, candidateIds: подмножество ID этой сессии }`; при смене preview/категорий/повторном сканировании выбор и подтверждение сбрасываются, ID прошлой сессии в запросе невозможны.
- **REQ-007**: Состояния страницы: `idle | scanning | ready | cleaning | completed | cancelled | failed`; локальные состояния UI: empty (кандидатов нет), Unavailable (категория/источник недоступен), Stale (preview истёк по `expiresAt`, категории изменены, прогресс прерван).
- **REQ-008**: Прогресс показывается по `operationId` с фазой `validating|deleting`, `processed/total`, `freedBytes`; кнопка «Отмена» вызывает `cleaner.cancel` и ждёт терминального события; отмена не обещает возврата уже удалённого.
- **REQ-009**: Отчёт рисуется из терминального `CleanupReport` Main без доработки: построчно `deleted/skipped/failed`, итоги `total/deleted/skipped/failed/freedBytes`, отдельно оценка (`selectedEstimatedBytes`) и фактически освобождённые байты; агрегированная Shell-операция корзины видна как отдельная строка.
- **REQ-010**: При отмене, частичном пропуске или ошибке UI не показывает «всё успешно удалено»: итоговая фраза выводится из статуса и счётчиков отчёта.
- **REQ-011**: Поздний push чужой/прошлой операции (по `operationId`/`sessionId`) не перезаписывает текущий preview, прогресс или отчёт; подписка `onProgress` отписывается при уходе со страницы (размонтирование).
- **REQ-012**: Пользовательские сообщения об ошибках на русском: маппинг кодов `IPC_ERROR_CODES` → русский текст, fallback — `error.message` от Main; raw `ipcRenderer`, Node API и собственная классификация кандидатов в Renderer отсутствуют.
- **REQ-013**: Доступность: чекбоксы — нативные и с `aria-label`, выбор доступен с клавиатуры; диалог `role="dialog" aria-modal="true"` с фокусом на кнопке; disabled-состояния визуально различимы (`:disabled` стили) и имеют `disabled`-атрибут; статусы/ошибки — `role="status"`/`role="alert"`.
- **SEC-001**: Renderer вызывает только объявленные методы `window.api.cleaner` (`preview/delete/cancel/onProgress`); пути, корни и правила не передаются (ADR 0017).
- **SEC-002**: Удаление недоступно без явного выбора и подтверждения; после смены preview выбор сбрасывается — прежние ID не отправляются.
- **CON-001**: Границы ADR 0002: правки только в `src/renderer` (+ `plan/`); Main/Preload/Shared и IPC-контракты не меняются.
- **CON-002**: Лимит `check:file-size`: каждый новый/существующий Renderer `.tsx` (кроме тестов) ≤ 80 строк кода; `App.tsx` заморожен baseline 118 и не растёт.
- **CON-003**: Импорты по путям файлов без barrel-реэкспортов; тесты colocated рядом с модулем; одна ответственность на файл.
- **CON-004**: Вне скоупа: движок (#54), IPC (#55), правила категорий (#56–#58), получение отчёта после переподписки (#63), лимит обхода preview (#64), страница Storage, фоновая автоочистка.
- **GUD-001**: Состояние страницы — дискриминированное объединение в хуке `useCleaner`; производные значения (устаревание, счётчики выборки) вычисляются при рендере, а не копятся отдельно.
- **GUD-002**: Сайд-эффекты React: подписка `onProgress` — один `useEffect` с функцией отписки; ответы invoke защищены счётчиком запросов и флагом размонтирования.
- **PAT-001**: Прецедент `useStorageScan`: push-события — источник истины, `setState` через функциональные апдейтеры, отписка в cleanup.
- **PAT-002**: Прецедент `ConfirmDialog` + `sd-danger-button` (страница Процессы) — модальное подтверждение деструктивной операции.
- **PAT-003**: Прецедент `components/storage/*`: контейнер страницы + мелкие presentational-компоненты, классы `sd-page/sd-card/sd-status-badge/sd-progress-*`.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Навигация Shell и каркас страницы Cleaner

| Task     | Description                                                                                                                                                                                                                                              | Completed  | Date |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| TASK-001 | Новый `src/renderer/src/components/AppNav.tsx`: вынести блок `<nav className="sd-nav">` из `App.tsx`, `export type AppPage = 'dashboard' \| 'processes' \| 'storage' \| 'cleaner'`, кнопка «Очистка» с `aria-current`; покрывает REQ-001, CON-002        | 2026-10-09 |
| TASK-002 | `src/renderer/src/App.tsx`: тип страницы из `AppNav`, ветка рендера `<main className="sd-cleaner-page"><CleanerPage /></main>`; размер файла остаётся ≤ baseline 118; покрывает REQ-001, CON-002                                                         | 2026-10-09 |
| TASK-003 | `src/renderer/src/assets/main.css`: классы страницы/таблицы/строк кандидатов и источников (`.sd-cleaner-page`, `.sd-cleaner-table`, `.sd-cleaner-path`, `.sd-cleaner-source`, `.sd-cleaner-toolbar`) на существующих токенах; покрывает REQ-013, PAT-003 | 2026-10-09 |
| TASK-004 | Минимальный `src/renderer/src/components/cleaner/CleanerPage.tsx` + `CleanerStatusBadge.tsx` + `CleanerWorkspace.tsx`: заголовок «Очистка», бейдж статуса, карточки; подключить к App и проверить `check:file-size`; покрывает REQ-007                   | 2026-10-09 |

### Implementation Phase 2

- GOAL-002: Состояние Cleaner и тексты на русском

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Completed  | Date |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| TASK-005 | Новый `src/renderer/src/components/cleaner/cleanerText.ts`: `CLEANER_CATEGORIES`, `categoryLabel`, `sourceStatusLabel`, `outcomeLabel`, `skipReason(code)`, `ipcErrorMessage(error)` (маппинг `CLEAN_*`/`VALIDATION_FAILED` → русский, fallback на `error.message`), `formatAge(mtimeMs, now)`, `candidateSource(candidate)`, `phaseLabel`, `pluralRu`; покрывает REQ-004, REQ-012                                                                                                                                                                                                                                                                                                                  | 2026-10-09 |
| TASK-006 | Новый `src/renderer/src/components/cleaner/useCleaner.ts`: состояния `idle/scanning/ready/cleaning/completed/cancelled/failed`; `selectedIds` внутри `ready` (сброс при новом preview и изменении категорий → `stale`); `runPreview` с счётчиком запросов; `startDelete` c guard'ами (только ready, не stale, выбор непуст, ID фильтруются по текущей сессии) и переходом в `cleaning` до получения `operationId`; подписка `onProgress` с фильтром `operationId`/`sessionId` и cleanup; `requestCancel` + `cancelRequested`; тик `now` для `expiresAt` (Stale preview) и `lastEventAt` (Stale прогресс); покрывает REQ-003, REQ-006, REQ-007, REQ-008, REQ-011, GUD-001, GUD-002, PAT-001, SEC-002 | 2026-10-09 |
| TASK-007 | `CleanerWorkspace.tsx`: switch по статусу — карточка кандидатов (`ready`), прогресс (`cleaning`), отчёт (`completed/cancelled/failed` с отчётом), подсказки для остальных; покрывает REQ-007                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 2026-10-09 |

### Implementation Phase 3

- GOAL-003: Выбор категорий, кандидаты и подтверждение

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                     | Completed  | Date |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| TASK-008 | `CleanerCategoryPicker.tsx` + `CleanerSourceRow.tsx`: fieldset с чекбоксами категорий, кнопка «Предпросмотр» (disabled без категорий/во время scanning), список источников со статусом, причиной, счётчиками и прочерком для `unavailable`; покрывает REQ-002, REQ-004                                                                                                                                          | 2026-10-09 |
| TASK-009 | `CleanerCandidateList.tsx` + `CleanerCandidateRow.tsx`: выбор всех (indeterminate не требуется — явный чекбокс), счётчик выбранного, оценка выборки, кнопка «Удалить» (`disabled` при пустом выборе/stale), таблица строк с checkbox `aria-label="Выбрать <path>"`, колонки категория/источник/путь/размер/возраст/статус; empty-состояние «Кандидаты не найдены»; покрывает REQ-003, REQ-004, REQ-005, REQ-013 | 2026-10-09 |
| TASK-010 | `CleanerConfirmDialog.tsx` поверх `ConfirmDialog`: число элементов, категории выборки, оценочный размер, отдельное предупреждение про агрегированную корзину, «удаление необратимо», label кнопки с количеством; покрывает REQ-005, PAT-002                                                                                                                                                                     | 2026-10-09 |

### Implementation Phase 4

- GOAL-004: Прогресс и отчёт

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                            | Completed  | Date |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---- |
| TASK-011 | `CleanerProgressView.tsx`: фаза, `processed/total`, полоса `sd-progress-*`, `freedBytes` (нет события → прочерк), «Отмена» (`disabled` без `operationId`/после запроса), Stale-подсказка при отсутствии событий > порога, `role="status"`; покрывает REQ-007, REQ-008                                                                                                                                  | 2026-10-09 |
| TASK-012 | `CleanerReportView.tsx` + `CleanerReportSummary.tsx` + `CleanerReportRow.tsx`: итоговая фраза по статусу/счётчикам (никогда «всё успешно удалено» при cancelled/failed/skipped>0), блоки «Оценка»/«Фактически освобождено» (нет данных → прочерк), строки `deleted/skipped/failed` с русской причиной; `report === null` → «Отчёт недоступен» без «0 освобождено»; покрывает REQ-009, REQ-010, REQ-004 | 2026-10-09 |

### Implementation Phase 5

- GOAL-005: Тесты (colocated, jsdom-проект vitest)

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Completed  | Date |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---- |
| TASK-013 | `src/renderer/src/components/cleaner/useCleaner.test.ts`: старт idle; preview → ready с пустым выбором; ошибка preview → `failed` с русским текстом; guard `startDelete` без выбора/stale; фильтрация ID по текущей сессии; running/terminal событий своей операции применяются, чужие/поздние — игнорируются; отмена → `cancelRequested` → терминальный `cancelled`; истечение `expiresAt` сбрасывает выбор и помечает stale; отписка при unmount; покрывает TEST-001, TEST-002                                   | 2026-10-09 |
| TASK-014 | `src/renderer/src/components/cleaner/CleanerPage.test.tsx`: без выбора и подтверждения `delete` не вызывается; после нового preview старые ID не уходят в запрос; unavailable/empty источники и Stale понятны; «0 освобождено» не показывается вместо отсутствующих байтов; отмена/частичный отчёт без «всё успешно удалено»; поздний push прошлой операции не перезаписывает preview/отчёт; отписка при уходе со страницы; фокус в диалоге, клавиатурный выбор, различимые disabled; покрывает TEST-003, TEST-004 | 2026-10-09 |
| TASK-015 | `src/renderer/src/components/cleaner/cleanerText.test.ts`: маппинг кодов ошибок, возраст без данных → прочерк, источники `browser-cache`; покрывает TEST-001                                                                                                                                                                                                                                                                                                                                                       | 2026-10-09 |

### Implementation Phase 6

- GOAL-006: Проверки и упаковка

| Task     | Description                                                                                                                                                                                                | Completed  | Date |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- |
| TASK-016 | `npm run check` (lint, format, boundaries, file-size, typecheck, test) и `npm run smoke`; исправить найденное; покрывает TEST-005                                                                          | 2026-10-09 |
| TASK-017 | Коммит на русском (conventional-commit/git-commit), PR с первой строкой тела `Closes #59`, лейблом `ready-for-human`, строкой `Skills: ...`, комментарием в issue #59; покрывает process-правила AGENTS.md | 2026-10-09 |

## 3. Alternatives

- **ALT-001**: **Description**: Хранить выбор кандидатов отдельным `useState` рядом с состоянием страницы.
- **ALT-002**: **Rejection Reason**: Выбор, вложенный в вариант `ready`, сбрасывается структурно при любой смене preview — проще выполнить REQ-006/SEC-002 и исключить рассинхрон «выбор из прошлой сессии».
- **ALT-003**: **Description**: React Router вместо state-навигации в Shell.
- **ALT-004**: **Rejection Reason**: Требование issue — добавить пункт в существующую навигацию App.tsx без router; введение роутера меняет все страницы и расширяет scope сверх issue.
- **ALT-005**: **Description**: Показывать отчёт по данным из `delete`-invoke (без push-событий) или восстанавливать отчёт после переподписки.
- **ALT-006**: **Rejection Reason**: Отчёт приходит только терминальным push-событием (контракт #55); канал получения отчёта после переподписки — отдельный follow-up #63.
- **ALT-007**: **Description**: Считать в Renderer «успех», если ошибок нет, и показывать «0 освобождено» при отсутствии данных.
- **ALT-008**: **Rejection Reason**: Нарушает REQ-009/REQ-010 и ADR 0017 (per-item отчёт без скрытия частичных неуспехов; оценка ≠ фактура).

## 4. Dependencies

- **DEP-001**: Issue #59 — исполняемый scope; взят по прямому указанию пользователя (лейбл `needs-triage` остаётся на усмотрение мейнтейнера).
- **DEP-002**: Issue #55 (IPC, PR #62) — Application API `window.api.cleaner`; закрыт.
- **DEP-003**: Issues #54, #56–#58 (PR #61, #67, #68, #69) — движок и категории; закрыты.
- **DEP-004**: ADR 0017 (PR #60) — модель безопасности; ADR 0002 — границы слоёв; ADR 0013 — протокол прогресса.
- **DEP-005**: `ConfirmDialog`, дизайн-токены `main.css`, `test-utils.setMockApi` — существующие инструменты Renderer.

## 5. Files

- **FILE-001**: plan/feature-cleaner-page-1.md — план данной работы.
- **FILE-002**: src/renderer/src/components/AppNav.tsx — навигация Shell с пунктом «Очистка» (новый).
- **FILE-003**: src/renderer/src/App.tsx — подключение страницы Cleaner (правка, baseline 118).
- **FILE-004**: src/renderer/src/assets/main.css — стили страницы Cleaner (правка).
- **FILE-005**: src/renderer/src/components/cleaner/cleanerText.ts — русские тексты и форматирование (новый).
- **FILE-006**: src/renderer/src/components/cleaner/useCleaner.ts — машина состояний и IPC-действия (новый).
- **FILE-007**: src/renderer/src/components/cleaner/CleanerPage.tsx — контейнер страницы (новый).
- **FILE-008**: src/renderer/src/components/cleaner/CleanerWorkspace.tsx — разметка по статусам (новый).
- **FILE-009**: src/renderer/src/components/cleaner/CleanerStatusBadge.tsx — бейдж статуса (новый).
- **FILE-010**: src/renderer/src/components/cleaner/CleanerCategoryPicker.tsx — выбор категорий (новый).
- **FILE-011**: src/renderer/src/components/cleaner/CleanerSourceRow.tsx — строка источника (новый).
- **FILE-012**: src/renderer/src/components/cleaner/CleanerCandidateList.tsx — список и выбор кандидатов (новый).
- **FILE-012a**: src/renderer/src/components/cleaner/CleanerCandidateTable.tsx — таблица строк кандидатов (новый).
- **FILE-012b**: src/renderer/src/components/cleaner/CleanerSelectionToolbar.tsx — toolbar выбора и кнопка удаления (новый).
- **FILE-013**: src/renderer/src/components/cleaner/CleanerCandidateRow.tsx — строка кандидата (новый).
- **FILE-014**: src/renderer/src/components/cleaner/CleanerConfirmDialog.tsx — диалог подтверждения (новый).
- **FILE-015**: src/renderer/src/components/cleaner/CleanerProgressView.tsx — прогресс и отмена (новый).
- **FILE-016**: src/renderer/src/components/cleaner/CleanerReportView.tsx — отчёт (новый).
- **FILE-017**: src/renderer/src/components/cleaner/CleanerReportSummary.tsx — итоги отчёта (новый).
- **FILE-018**: src/renderer/src/components/cleaner/CleanerReportRow.tsx — строка отчёта (новый).
- **FILE-019**: colocated тесты `useCleaner.test.ts`, `CleanerPage.test.tsx`, `cleanerText.test.ts`.

## 6. Testing

- **TEST-001**: `cleanerText`: коды ошибок → русский текст, fallback на сообщение Main; `formatAge(undefined)` → прочерк; источник браузера формируется из полей кандидата.
- **TEST-002**: `useCleaner`: выбор пуст после preview; delete без выбора/stale не вызывает API; запрос содержит только ID текущей сессии; чужие/поздние push-события игнорируются; отписка при unmount; истечение preview сбрасывает выбор.
- **TEST-003**: `CleanerPage`: `delete` не вызывается без выбора и подтверждения; после нового preview старые ID не отправляются; unavailable/empty/Stale понятны; отсутствующие байты не отображаются как «0 освобождено».
- **TEST-004**: `CleanerPage`: отмена/частичный отчёт без «всё успешно удалено»; поздний push прошлой операции не перезаписывает новый preview/отчёт; подписка освобождается при уходе со страницы; фокус в диалоге и различимые disabled.
- **TEST-005**: `npm run check` и `npm run smoke` выполнены фактически на Windows; ручной сценарий на Windows отмечается в PR только если реально выполнялся.

## 9. Execution Results

- `npm run check` — **PASS** (lint 0 errors, format, boundaries, file-size, typecheck node+web, 67 test files / 451 tests).
- `npm run smoke` — **FAIL**: `systemOk:false`, `systemdeck:system:info` падает с `Command failed: powershell.exe … Get-CimInstance Win32_OperatingSystem` (таймаут 5000 мс в `src/main/system/ps.ts` при ~1,4–2,1 с на прямом запуске команды).
- Причина проверена: тот же FAIL воспроизводится на чистом `main` без правок этой задачи (`git stash -u` → `npm run smoke` → FAIL → `git stash pop`) — отказ воспроизводим и до изменений issue #59 (Main/PowerShell-окружение), правки скоупа #59 его не затрагивают.

## 7. Risks & Assumptions

- **RISK-001**: Гонка «invoke ещё не вернул `operationId`, а push уже пришёл» — mitigated: в `cleaning` допускается `operationId: null`, первое событие своей сессии запирает ID (REQ-011).
- **RISK-002**: Поздний ответ `preview` после размонтирования/нового запроса — mitigated: счётчик запросов + флаг размонтирования (GUD-002).
- **RISK-003**: Лимит 80 строк на `.tsx` при плотном UI — mitigated: разбиение на presentational-компоненты (CON-002), контроль `npm run check` в TASK-016.
- **RISK-004**: Пропущенный терминальный event при уходе со страницы — отчёт теряется до #63; UI явно стартует с `idle` при возврате и не имитирует успех (REQ-010, CON-004).
- **ASSUMPTION-001**: Порог Stale для прогресса — 10 с без событий при живой подписке (константа в Renderer, настраивается в #59-ревью).
- **ASSUMPTION-002**: Категории по умолчанию все отмечены — предпросмотр ничего не удаляет; «ничего не выбрано по умолчанию» относится к кандидатам (REQ-003).

## 8. Related Specifications / Further Reading

- Issue #59 — scope и критерии приёмки; #22 — EPIC 5; #63, #64 — follow-up IPC.
- ADR 0017 — модель безопасности Cleaner; ADR 0002 — границы слоёв; ADR 0013 — push-протокол.
- plan/feature-cleaner-ipc-1.md — план IPC-слоя (предыдущая работа).
- src/renderer/src/useStorageScan.ts — образец хука с push-подпиской; src/renderer/src/components/ConfirmDialog.tsx — образец диалога.
