---
goal: Безопасные категории TEMP пользователя и Windows в движке Cleaner (issue #56)
version: 1.0
date_created: 2026-10-09
last_updated: 2026-10-09
owner: systemdeck-agent
status: 'Completed'
tags: [feature, cleaner, epic-5, main, shared, safety]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

План реализует issue #56 (дочерний EPIC 5 #22, ADR 0017): две категории Cleaner — `user-temp` и `windows-temp` — получают подтверждённые allow-корни из переменных окружения, консервативный порог возраста 24 часа, различение источника `empty`/`unavailable` с причиной и повторную валидацию параметров файла при удалении. Движок (#54) и IPC-протокол (#55) закрыты; UI (#59), остальные категории (#57, #58) и ограничение обхода (#64) — вне скоупа.

## 1. Requirements & Constraints

- **REQ-001**: Подтверждённые корни `user-temp`: `%LOCALAPPDATA%\Temp` — базовый корень; `%TEMP%` и `%TMP%` принимаются только когда значение — абсолютный путь без `.`/`..`-сегментов и лежит в разрешённой области (строго внутри базового корня). Значение вне области игнорируется, базовый корень остаётся.
- **REQ-002**: Корни канонизируются (слэши, регистр, хвостовой разделитель) и дедуплицируются: точные дубли и корни, вложенные в другой корень, убираются — один файл не попадает в кандидаты дважды и не удаляется повторно.
- **REQ-003**: Корень `windows-temp` строится из `%WINDIR%` (фолбэк `%SystemRoot%`) как `<системный каталог>\Temp`, а не захардкоженный `C:\Windows\Temp`; при пустой/повреждённой переменной правило не создаётся. Deny-список Protected Paths при этом никогда не пуст (консервативный дефолт `C:\Windows`).
- **REQ-004**: Allow-правила TEMP сохраняют узкий корень и паттерн; обычные файлы и подкаталоги обходятся без перехода по symlink/junction, Protected Paths блокируют и кандидаты, и удаление (существующая механика #54 сохраняется и перепроверяется тестами).
- **REQ-005**: Порог возраста **24 часа** зафиксирован в конфигурации правила (`minAgeHours: 24`) и возвращается в preview-ответе; файл моложе порога и файл с неизвестным `mtimeMs` кандидатом не становятся.
- **REQ-006**: Источник в preview различает `unavailable` (корней нет из-за сломанной переменной окружения или корень не читается: EACCES/EPERM → «требуются права администратора», ENOENT → «каталог не найден») и `empty` (корни прочитаны, подходящих файлов нет); причина передаётся в ответе. Elevation не выполняется.
- **REQ-007**: При удалении каждый элемент повторно валидируется: размер и `mtimeMs` не совпали с preview → per-item `skipped` с `CLEAN_ENTRY_INVALID`; занятый/недоступный файл → per-item `failed` без абортa остальных; сводка отчёта по-прежнему сходится с per-item записями.
- **REQ-008**: Контракты Shared: `CleanupPreviewSource.status` дополняется литералом `unavailable`, добавляются `reason?` и `minAgeHours?`; `CleanupPreviewCandidate.mtimeMs?` и `CleanupCandidate.mtimeMs?`; `SHARED_CONTRACT_VERSION` `sd-022` → `sd-023`.
- **REQ-009**: Colocated vitest-тесты покрывают каждый критерий приёмки issue, включая сценарии окружения (`%WINDIR%` на нестандартном диске, пустая/повреждённая переменная, TEMP вне области), и есть ограниченный безопасный Windows-интеграционный тест на реальной ФС.
- **CON-001**: Границы ADR 0002 — изменения только в `src/main` и `src/shared`; Preload и Renderer не трогаются, Shared остаётся без runtime `electron`/`node:*`.
- **CON-002**: ADR 0017 — узкие allow-правила, явный выбор из preview, per-item отчёт; без повышения привилегий, без blind-очистки, без обхода Log Redaction.
- **CON-003**: Без новых IPC-каналов `cleaner:*`, без UI (#59), без категорий `recycle-bin`/`thumbnail-cache`/`browser-cache`/`log-files` (#57, #58) — они лишь переводятся на общий реестр `cleanerRules(env)` без смены поведения.
- **CON-004**: Allow-область TEMP не расширяется: паттерны имен файлов из #54 не пересматриваются, порог возраста добавляется как дополнительный консервативный слой.
- **CON-005**: Один файл — одна ответственность, до 80 строк кода без пустых строк и комментариев; тесты colocated; импорты по путям файлов без barrel-реэкспортов.
- **GUD-001**: Windows-пути сравниваются case-insensitive с нормализацией слэшей и по границе сегмента; переменная окружения с `.`/`..`-сегментами или без буквы диска считается повреждённой.
- **PAT-001**: Прецедент fake-fs границ (CleanerFs/CleanerDeleteFs, ADR 0013) и чистых функций с параметром окружения вместо мутации `process.env` в тестах.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Обновить контракты Cleaner в Shared

| Task     | Description                                                                                                                                                                                                         | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-001 | `src/shared/ipc/contracts.ts`: у `CleanupPreviewSource` — статус `unavailable`, поля `reason?` и `minAgeHours?`; у `CleanupPreviewCandidate` и `CleanupCandidate` — `mtimeMs?`; покрывает REQ-005, REQ-006, REQ-008 | ✅        | 2026-10-09 |
| TASK-002 | `src/shared/api.ts`: `SHARED_CONTRACT_VERSION` `sd-022` → `sd-023`; покрывает REQ-008                                                                                                                               | ✅        | 2026-10-09 |

### Implementation Phase 2

- GOAL-002: Построить подтверждённые корни TEMP и общий реестр правил

| Task     | Description                                                                                                                                                                                                                                                                                         | Completed | Date       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-003 | `src/main/cleaner/systemRoots.ts`: `envDir(env, name)` (абсолютный путь без `.`/`..`, иначе `null`), `systemRootDir` (`%WINDIR%` → `%SystemRoot%`), `windowsDir` (для deny-списка, консервативный дефолт), `localAppDataDir` (`string \| null`, вместо `localAppData`); покрывает REQ-001, REQ-003  | ✅        | 2026-10-09 |
| TASK-004 | Создать `src/main/cleaner/tempRoots.ts`: `userTempRoots(env)` (базовый корень + допустимые `%TEMP%`/`%TMP%` + дедупликация) и `windowsTempRoot(env)` (`<WINDIR>\Temp` или `null`); покрывает REQ-001, REQ-002, REQ-003                                                                              | ✅        | 2026-10-09 |
| TASK-005 | `src/main/cleaner/paths.ts`: `dedupeRoots` (точные дубли и вложенные корни убираются, порядок сохраняется); покрывает REQ-002                                                                                                                                                                       | ✅        | 2026-10-09 |
| TASK-006 | `src/main/cleaner/rules.ts`: `TEMP_MIN_AGE_HOURS = 24`, тип `CleanupRule.minAgeHours`, реестр `cleanerRules(env)` (функция вместо статической константы, TEMP-правила по одному на подтверждённый корень), `rootsForCategory`, `findCleanupRule(path, rules?)`; покрывает REQ-001, REQ-003, REQ-005 | ✅        | 2026-10-09 |

### Implementation Phase 3

- GOAL-003: Применить порог возраста, статусы источников и повторную валидацию в движке

| Task     | Description                                                                                                                                                                                                                                                                                                                | Completed | Date       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-007 | `src/main/cleaner/walker.ts`: `CleanerFs.stat` возвращает `mtimeMs`, записи получают `mtimeMs`, отказ чтения корня фиксируется в `unavailableRoots` (с кодом ошибки) отдельно от вложенных `inaccessibleDirs`; покрывает REQ-006                                                                                           | ✅        | 2026-10-09 |
| TASK-008 | `src/main/cleaner/candidates.ts`: `buildCleanupCandidates(entries, { now, rules })` — возрастная проверка по `minAgeHours` (моложе порога или без известного `mtimeMs` → не кандидат, счётчик `skippedTooYoung`); покрывает REQ-005                                                                                        | ✅        | 2026-10-09 |
| TASK-009 | Создать `src/main/cleaner/sourceStatus.ts`: `resolveSourceStatus`/`buildPreviewSource` — `unavailable` с причиной (нет корней / отказ чтения), `partial`, `empty`, `ok`, плюс `minAgeHours` из правил; `src/main/cleaner/preview.ts` собирает источники через него и прокидывает `now`/`rules`; покрывает REQ-005, REQ-006 | ✅        | 2026-10-09 |
| TASK-010 | `src/main/cleaner/deleter.ts`: после guard и `lstat` сверяются размер и `mtimeMs` с preview-кандидатом — расхождение даёт per-item `skipped` + `CLEAN_ENTRY_INVALID`, отказ `unlink` остаётся per-item `failed`; покрывает REQ-007                                                                                         | ✅        | 2026-10-09 |

### Implementation Phase 4

- GOAL-004: Покрыть поведение тестами и прогнать проверки

| Task     | Description                                                                                                                                                                                                                                                                                                                                                | Completed | Date       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-011 | Новые тесты: `systemRoots.test.ts` (env-валидация, `%WINDIR%` на нестандартном диске, пустая/повреждённая переменная), `tempRoots.test.ts` (TEMP вне области отклонён, дубли/вложенность, deny-список не пуст), `sourceStatus.test.ts` (`unavailable` ≠ `empty`, причины); покрывает REQ-001, REQ-002, REQ-003, REQ-006, REQ-009                           | ✅        | 2026-10-09 |
| TASK-012 | Обновить существующие тесты (`rules`, `candidates`, `walker`, `preview`, `deleter`, `CleanerManager`, `ipc/cleaner`) под `cleanerRules(env)`, `mtimeMs` и возрастной порог; добавить кейсы «молодой файл не кандидат», «изменившиеся после preview параметры не удаляются», «совпадающие корни дают одного кандидата»; покрывает REQ-005, REQ-007, REQ-009 | ✅        | 2026-10-09 |
| TASK-013 | Интеграционный тест `src/main/cleaner/tempIntegration.test.ts` (только `win32`): создаёт собственный каталог внутри подтверждённого TEMP-корня, старый файл удаляется, молодой — нет, каталог убирается в `finally`; покрывает REQ-009                                                                                                                     | ✅        | 2026-10-09 |
| TASK-014 | `npm run check` и `npm run smoke` фактически выполнены; нарушения лимита строк/границ исправлены; покрывает CON-001, CON-005                                                                                                                                                                                                                               | ✅        | 2026-10-09 |

### Implementation Phase 5

- GOAL-005: Упаковать работу в коммит и PR

| Task     | Description                                                                                                  | Completed | Date |
| -------- | ------------------------------------------------------------------------------------------------------------ | --------- | ---- |
| TASK-015 | Коммит сообщением на русском (conventional-commit/git-commit); покрывает REQ-009                             |           |      |
| TASK-016 | PR с первой строкой тела `Closes #56`, лейблом `ready-for-human`, строкой `Skills:`; комментарий в issue #56 |           |      |

## 3. Alternatives

- **ALT-001**: **Description**: Разрешать `%TEMP%`/`%TMP%` в пределах всего `%USERPROFILE%`.
- **ALT-002**: **Rejection Reason**: В область попали бы «Загрузки»/«Документы», которые эпик прямо исключает; разрешённая область — только подтверждённый базовый TEMP-корень.
- **ALT-003**: **Description**: Брать `%TEMP%` как есть, без проверки области, как единственный источник корней.
- **ALT-004**: **Rejection Reason**: Issue требует не доверять переменной, указывающей вне допустимой области, — иначе `TEMP=C:\` или `C:\Windows\Temp` станет allow-корнем.
- **ALT-005**: **Description**: Оставить захардкоженный `C:\Windows\Temp`.
- **ALT-006**: **Rejection Reason**: Неверен при нестандартном системном диске и при сломанной переменной; корень обязан выводиться из `%WINDIR%`.
- **ALT-007**: **Description**: Показывать `windows-temp` как доступный и диагностировать нехватку прав только ошибками удаления.
- **ALT-008**: **Rejection Reason**: Критерий приёмки требует `Unavailable`/ограниченный доступ с причиной в preview и без автоматического elevation.
- **ALT-009**: **Description**: Расширить паттерн TEMP до любых имён файлов, чтобы чистить больше.
- **ALT-010**: **Rejection Reason**: Расширяет allow-область удаления без требования issue (CON-004); консервативный слой — порог возраста, а не более широкие паттерны.
- **ALT-011**: **Description**: Мутить `process.env` в тестах для проверки окружения.
- **ALT-012**: **Rejection Reason**: Глобальное состояние ломает изоляцию тестов; реестр и корни принимают `env` параметром (PAT-001).

## 4. Dependencies

- **DEP-001**: Issue #56 — исполняемый scope данной работы.
- **DEP-002**: Issue #22 (EPIC 5) и ADR 0017 — родитель и модель безопасности.
- **DEP-003**: Issues #54 и #55 (закрыты) — движок кандидатов и IPC-протокол как основа.
- **DEP-004**: ADR 0002 и ADR 0003 — границы слоёв и контракты IPC (`SHARED_CONTRACT_VERSION`).

## 5. Files

- **FILE-001**: plan/feature-cleaner-temp-1.md — план данной работы.
- **FILE-002**: src/shared/ipc/contracts.ts — поля источника и кандидата (REQ-005, REQ-006, REQ-008).
- **FILE-003**: src/shared/api.ts — бамп версии контракта (REQ-008).
- **FILE-004**: src/main/cleaner/systemRoots.ts — валидация переменных окружения (REQ-001, REQ-003).
- **FILE-005**: src/main/cleaner/tempRoots.ts — подтверждённые корни TEMP (REQ-001, REQ-002, REQ-003).
- **FILE-006**: src/main/cleaner/paths.ts — нормализация и дедупликация корней (REQ-002).
- **FILE-007**: src/main/cleaner/rules.ts — реестр `cleanerRules(env)` и порог возраста (REQ-005).
- **FILE-008**: src/main/cleaner/walker.ts — `mtimeMs` и `unavailableRoots` (REQ-006).
- **FILE-009**: src/main/cleaner/candidates.ts — возрастная фильтрация (REQ-005).
- **FILE-010**: src/main/cleaner/sourceStatus.ts — статусы и причины источников (REQ-006).
- **FILE-011**: src/main/cleaner/preview.ts — сборка preview с `now`/`rules` (REQ-005, REQ-006).
- **FILE-012**: src/main/cleaner/deleter.ts — повторная валидация параметров (REQ-007).
- **FILE-013**: src/main/cleaner/*.test.ts и src/main/ipc/cleaner.test.ts — unit-тесты (REQ-009).
- **FILE-014**: src/main/cleaner/tempIntegration.test.ts — Windows-интеграционный тест (REQ-009).

## 6. Testing

- **TEST-001**: `%WINDIR%` с нестандартным диском даёт `<диск>\Windows\Temp`; пустая/повреждённая переменная не создаёт правило и не пустит deny-список в fallback-пустоту.
- **TEST-002**: `%TEMP%` вне разрешённой области, путь с `..`, ссылка и защищённый путь кандидатами не становятся; совпадающие/вложенные корни дают одного кандидата.
- **TEST-003**: файл моложе 24 часов и файл без известного `mtimeMs` не попадают в preview; порог виден в `CleanupPreviewSource.minAgeHours`.
- **TEST-004**: изменение размера или `mtimeMs` после preview даёт per-item `skipped` + `CLEAN_ENTRY_INVALID`, отказ прав — per-item `failed`, остальные элементы обрабатываются.
- **TEST-005**: `unavailable` и `empty` различимы, причина присутствует; `npm run check` и `npm run smoke` зелёные.

## 7. Risks & Assumptions

- **RISK-001**: Удаление необратимо — mitigated REQ-001/REQ-004/REQ-007 (подтверждённые корни, allow-правила, повторная валидация, per-item отчёт) и явным preview-выбором пользователя.
- **RISK-002**: Возраст определяется по `mtime`, его можно «отодвинуть» касанием файла — mitigated: касание меняет `mtimeMs`, после чего файл моложе порога и перестаёт быть кандидатом (это безопасная сторона сценария).
- **RISK-003**: Интеграционный тест пишет в реальный TEMP — mitigated: только собственный каталог `systemdeck-it-*`, удаление только своих файлов, очистка в `finally`, тест исполняется только на `win32`.
- **ASSUMPTION-001**: Категории #57/#58 переходят на `cleanerRules(env)` без смены собственных allow-корней; детали их enumerator'ов (включая `mtimeMs` корзины) задаются в их issues.
- **ASSUMPTION-002**: UI (#59) отобразит `status`/`reason`/`minAgeHours` из preview-ответа; в данной работе контракт только расширяется обратно совместимо (`?`-поля).

## 8. Related Specifications / Further Reading

- Issue #56 — scope и критерии приёмки данной работы.
- Issue #22 — EPIC 5 (родитель); ADR 0017 — модель безопасности Cleaner.
- Issue #54 и issue #55 — движок и IPC-протокол (закрыты).
- ADR 0013 — политика Reparse Point и Inaccessible Directory.
- ADR 0002 — границы Main/Preload/Renderer/Shared; ADR 0003 — типизированные IPC-контракты.
- plan/feature-cleaner-engine-1.md и plan/feature-cleaner-ipc-1.md — предыдущие шаги эпика.
- AGENTS.md — коммиты, PR, проверки и обязательные Skill-вызовы.
