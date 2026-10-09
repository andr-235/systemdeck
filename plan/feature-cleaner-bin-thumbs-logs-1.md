---
goal: Категории Cleaner «корзина», «кэш эскизов» и «логи» по модели безопасности ADR 0017 (issue #57)
version: 1.0
date_created: 2026-10-09
last_updated: 2026-10-09
owner: systemdeck-agent
status: 'Completed'
tags: [feature, cleaner, epic-5, main, shared, safety]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

План реализует issue #57 (дочерний EPIC 5 #22, ADR 0017): три категории Cleaner переводятся на безопасные механизмы. `recycle-bin` очищается только через Windows Shell (`SHQueryRecycleBin`/`Clear-RecycleBin`) агрегированно по одному явно выбранному тому, `thumbnail-cache` — только известная подпапка Explorer текущего пользователя с пропуском занятых файлов и без автоперезапуска Explorer, `log-files` — узкий allow-список ротированных логов SystemDeck с защитой активного Application Log. Движок (#54), IPC (#55) и TEMP (#56) закрыты; UI (#59) и браузерные кэши (#58) — вне скоупа.

## 1. Requirements & Constraints

- **REQ-001**: Корзина — только Shell-механизм. Перечень томов (`Win32_LogicalDisk DriveType=3`) и размер/число элементов (`SHQueryRecycleBin` через P/Invoke в PowerShell) даёт preview; кандидат — ровно один агрегат на том вида `<диск>:\$Recycle.Bin` с измеренным размером. Файлы внутри `$Recycle.Bin` не обходятся и не удаляются поштучно.
- **REQ-002**: Очистка корзины — `Clear-RecycleBin -DriveLetter <буква> -Force` только для тома выбранного кандидата; вставка строки в PowerShell ограничена валидацией `<буква>:\\$` (нет произвольных путей/команд). Остальные тома не затрагиваются.
- **REQ-003**: Правдивый отчёт корзины: `bytesFreed` = свежий замер до очистки минус свежий замер после (`SHQueryRecycleBin`), оценка preview в отчёт не переносится. Запрос до не удался → per-item `failed` + `CLEAN_SHELL_UNAVAILABLE` (ничего не очищено); очистка прошла, замер после не удался → per-item `failed` + `CLEAN_SIZE_UNVERIFIED` (очищено, размер не подтверждён — без выдуманных байтов); корзина пуста на момент удаления → per-item `skipped` + `CLEAN_ENTRY_INVALID`; отказ `Clear-RecycleBin` → per-item `failed` + `CLEAN_DELETE_FAILED`.
- **REQ-004**: Источник корзины в preview различает: `unavailable` (Shell недоступен: нет PowerShell/прав/сбой запуска/тома не найдены/все запросы упали) с причиной, `partial` (часть томов не опрошена) с причиной, `empty` (тома опрошены, корзины пусты), `ok`. Том с неизвестным размером кандидатом не становится.
- **REQ-005**: `thumbnail-cache` — allow-правило только `<%LOCALAPPDATA%>\Microsoft\Windows\Explorer` + паттерн `\\thumbcache_[^\\]*\.db$` (узкая подпапка текущего пользователя, конкретные файлы). Занятый файл (`EBUSY` при удалении) → per-item `skipped` + `CLEAN_FILE_IN_USE`, без автоперезапуска/остановки Explorer; другие ошибки остаются per-item `failed`.
- **REQ-006**: `log-files` — allow-список вместо `%WINDIR%\Logs`: только ротированные файлы `systemdeck.log.<N>` в каталоге Application Log (каталог из `logger`), порог возраста **24 часа**; активный `systemdeck.log` включён в deny-список Protected Paths и кандидатом не становится. Правило `%WINDIR%\Logs` + `*.log|*.etl` удаляется: Windows Event Logs, `*.evtx`, системные `*.etl` и чужие диагностические данные не попадают ни в один allow-спискок.
- **REQ-007**: Реестр правил: `CleanupRule` становится дискриминированной union (`kind: 'file'` у файловых правил, `kind: 'recycle-volume'` у корзины); `rootsForCategory('recycle-bin')` пуст — preview корзины не идёт через walker; guard удаления (`isDeletionAllowed`) допускает только точный путь `<диск>:\$Recycle.Bin` и по-прежнему блокирует всё вне allow-правил.
- **REQ-008**: Контракты Shared: новые коды `CLEAN_SHELL_UNAVAILABLE`, `CLEAN_FILE_IN_USE`, `CLEAN_SIZE_UNVERIFIED` в `IPC_ERROR_CODES`; `SHARED_CONTRACT_VERSION` `sd-023` → `sd-024`. Типы запросов/ответов Cleaner не меняются.
- **REQ-009**: Colocated vitest-тесты покрывают границы доступа (том вне списка, путь вне allow-списка), неверный том, in-use (`EBUSY`), частичные ошибки (часть томов, замер после, отказ очистки), отсутствие Shell/прав, различение `unavailable`/`empty`; `npm run check` и `npm run smoke` выполняются фактически.
- **CON-001**: Границы ADR 0002 — изменения только в `src/main` и `src/shared`; Preload и Renderer не трогаются, Shared остаётся без runtime `electron`/`node:*`.
- **CON-002**: ADR 0017 — узкие allow-правила, явный выбор из preview, per-item отчёт, без elevation, без blind-очистки, без обхода Log Redaction.
- **CON-003**: Out of scope issue: Windows Event Logs, реестр, WinSxS, пользовательские файлы, TEMP (#56), браузерные кэши (#58), UI (#59).
- **CON-004**: Без автоперезапуска/остановки Explorer и любых действий с чужими процессами; перезапуск не требуется ни в preview, ни в удалении.
- **CON-005**: Новые IPC-каналы не добавляются; Privileged API не расширяется; один файл — одна ответственность, тесты colocated, импорты по путям файлов.
- **GUD-001**: Windows-пути сравниваются case-insensitive с нормализацией слэшей; пути/буквы диска, подставляемые в PowerShell, валидируются строгим паттерном до интерполяции.
- **PAT-001**: Прецедент инжекции границ (`CleanerFs`/`CleanerDeleteFake`, ADR 0013): Shell-граница корзины тоже инжектируется (`RecycleShell`) — тесты не трогают реальный Shell.
- **PAT-002**: Прецедент `runPowershell`/`runPowershellJson` (`src/main/system/ps.ts`) как механизма вызова системных API из Main.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Обновить контракты ошибок в Shared

| Task     | Description                                                                                                                                                                                                       | Completed | Date |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-001 | `src/shared/ipc/errors.ts`: коды `CLEAN_SHELL_UNAVAILABLE`, `CLEAN_FILE_IN_USE`, `CLEAN_SIZE_UNVERIFIED`; `src/shared/api.ts`: `SHARED_CONTRACT_VERSION` `sd-023` → `sd-024`; покрывает REQ-003, REQ-005, REQ-008 | ✅        |      |

### Implementation Phase 2

- GOAL-002: Перевести реестр правил на union и узкий allow-список логов

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Completed | Date |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-002 | `src/main/logger.ts`: `getLogDirPath(): string \| null` (каталог активного Application Log, фолбэк на `resolveFileFromApp`); покрывает REQ-006                                                                                                                                                                                                                                                                                                                  | ✅        |      |
| TASK-003 | `src/main/cleaner/rules.ts`: union `CleanupRule` (`CleanupFileRule`/`CleanupRecycleRule`, `kind`), `isRecycleVolumePath` (точно `<буква>:\$Recycle.Bin`), `cleanerRules(env, logDir?)` — `recycle-volume`-правило, `log-files` ротированные `systemdeck.log.<N>` c `LOG_MIN_AGE_HOURS = 24`, правило `%WINDIR%\Logs` удалено, `rootsForCategory` только по файловым правилам, `findFileRule`/`fileRuleFor` для narrow-нужд; покрывает REQ-001, REQ-006, REQ-007 | ✅        |      |
| TASK-004 | `src/main/cleaner/protectedPaths.ts`: активный `systemdeck.log` входит в deny-список; `src/main/cleaner/candidates.ts`: сборка кандидатов использует только файловые правила; покрывает REQ-006, REQ-007                                                                                                                                                                                                                                                        | ✅        |      |

### Implementation Phase 3

- GOAL-003: Shell-энумератор и очистка корзины, интеграция в preview/deleter

| Task     | Description                                                                                                                                                                                                                                                                                                                            | Completed | Date |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-005 | Создать `src/main/cleaner/recycleBin.ts`: интерфейс `RecycleShell` (`listVolumes`/`query`/`clear`) + `nodeRecycleShell` на `runPowershell(Json)` (DriveType=3, P/Invoke `SHQueryRecycleBin`, `Clear-RecycleBin` с таймаутом очистки), валидация буквы диска; покрывает REQ-001, REQ-002                                                | ✅        |      |
| TASK-006 | `recycleBin.ts`: `buildRecyclePreview(shell)` — агрегированные кандидаты и статус источника (`unavailable`/`partial`/`empty`/`ok`) с причинами, `clearRecycleVolume(root, shell)` — замер до/очистка/замер после и per-item результаты по REQ-003; покрывает REQ-003, REQ-004                                                          | ✅        |      |
| TASK-007 | `src/main/cleaner/preview.ts`: ветка `recycle-bin` без walker (инжектируемый `shell` в `PreviewOptions`); `src/main/cleaner/deleter.ts`: ветка `recycle-volume` до `lstat`/`unlink`, `EBUSY` → per-item `skipped` + `CLEAN_FILE_IN_USE`, инжектируемый `recycleShell` в `RunCleanupDeps`; покрывает REQ-002, REQ-003, REQ-005, REQ-007 | ✅        |      |
| TASK-008 | `src/main/cleaner/CleanerManager.ts`: деп `recycleShell?` пробрасывается в preview и удаление (по умолчанию `nodeRecycleShell`); покрывает REQ-001, PAT-001                                                                                                                                                                            | ✅        |      |

### Implementation Phase 4

- GOAL-004: Покрыть поведение тестами и прогнать проверки

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                                       | Completed | Date |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---- |
| TASK-009 | Новый тест `src/main/cleaner/recycleBin.test.ts`: `isRecycleVolumePath` (чужой том/вложенный файл/префикс), preview с фейковым Shell (Shell недоступен → `unavailable`, часть томов → `partial`, пустые корзины → `empty`, неизвестный размер → без кандидата), удаление (замер до/после, `CLEAN_SHELL_UNAVAILABLE`, `CLEAN_SIZE_UNVERIFIED`, `CLEAN_ENTRY_INVALID`, отказ очистки); покрывает REQ-001, REQ-003, REQ-004, REQ-009 | ✅        |      |
| TASK-010 | Обновить существующие тесты (`rules`, `candidates`, `preview`, `deleter`, `sourceStatus`, `CleanerManager`) под union-правила, `fileRuleFor`, log-allow-list и shell-ветку preview; новые кейсы: ротированные логи кандидат, активный лог и `*.etl`/`*.evtx`/`%WINDIR%\Logs` — нет, `EBUSY` → skipped; покрывает REQ-005, REQ-006, REQ-007, REQ-009                                                                               | ✅        |      |
| TASK-011 | `npm run check` и `npm run smoke` фактически выполнены (изменения Main/IPC); нарушения лимита строк/границ исправлены; покрывает CON-001, CON-005, REQ-009                                                                                                                                                                                                                                                                        | ✅        |      |

### Implementation Phase 5

- GOAL-005: Упаковать работу в коммит и PR

| Task     | Description                                                                                                  | Completed | Date |
| -------- | ------------------------------------------------------------------------------------------------------------ | --------- | ---- |
| TASK-012 | Коммит сообщением на русском (conventional-commit/git-commit); покрывает REQ-009                             | ✅        |      |
| TASK-013 | PR с первой строкой тела `Closes #57`, лейблом `ready-for-human`, строкой `Skills:`; комментарий в issue #57 | ✅        |      |

## 3. Alternatives

- **ALT-001**: **Description**: Обходить `C:\$Recycle.Bin` walker'ом как файлы (текущее поведение #54) и удалять поштучно.
- **ALT-002**: **Rejection Reason**: Нарушает REQ-001/критерий приёмки: очистка только Shell-механизмом и агрегированно по полу; поштучное удаление ломает жёсткие ссылки/$I-метаданные корзины.
- **ALT-003**: **Description**: Показывать в отчёте оценочный размер preview как освобождённый.
- **ALT-004**: **Rejection Reason**: Критерий приёмки прямо запрещает выдавать оценку за фактическое удаление; при неизвестном замере — `failed`/`CLEAN_SIZE_UNVERIFIED` без байтов.
- **ALT-005**: **Description**: Использовать `Shell.Application` (`Namespace(0xA)`) вместо `Clear-RecycleBin`.
- **ALT-006**: **Rejection Reason**: Ком-объект даёт только перечисление; очистка через него — медленный per-item цикл и тот же Shell под капотом, но с худшей управляемостью и таймаутами. `Clear-RecycleBin` — документированный cmdlet одной операцией на том.
- **ALT-007**: **Description**: Оставлять `%WINDIR%\Logs` с узким паттерном.
- **ALT-008**: **Rejection Reason**: Issue исключает системные логи/Event Logs/`*.etl` из скоупа; единственный источник категории — документированные логи SystemDeck.
- **ALT-009**: **Description**: Перезапускать Explorer после очистки thumbcache, чтобы освободить занятые файлы.
- **ALT-010**: **Rejection Issue**: Issue прямо запрещает автоперезапуск Explorer (CON-004); корректное отражение in-use — пропуск с `CLEAN_FILE_IN_USE`.
- **ALT-011**: **Description**: Очищать активный `systemdeck.log` вместе с ротациями.
- **ALT-012**: **Rejection Reason**: Активный Application Log защищён требованием issue: его удаление ломает учёт ротации и теряет текущие записи; кандидаты — только ротированные `systemdeck.log.<N>` старше порога.

## 4. Dependencies

- **DEP-001**: Issue #57 — исполняемый scope данной работы.
- **DEP-002**: Issue #22 (EPIC 5) и ADR 0017 — родитель и модель безопасности.
- **DEP-003**: Issues #54, #55, #56 (закрыты) — движок, IPC-протокол и TEMP как основа.
- **DEP-004**: ADR 0002 и ADR 0003 — границы слоёв и контракты IPC (`SHARED_CONTRACT_VERSION`).

## 5. Files

- **FILE-001**: plan/feature-cleaner-bin-thumbs-logs-1.md — план данной работы.
- **FILE-002**: src/shared/ipc/errors.ts — новые `CLEAN_*`-коды (REQ-003, REQ-005, REQ-008).
- **FILE-003**: src/shared/api.ts — бамп версии контракта (REQ-008).
- **FILE-004**: src/main/logger.ts — `getLogDirPath` для allow-списка логов (REQ-006).
- **FILE-005**: src/main/cleaner/rules.ts — union-правила, `isRecycleVolumePath`, log allow-list (REQ-006, REQ-007).
- **FILE-006**: src/main/cleaner/protectedPaths.ts — защита активного Application Log (REQ-006).
- **FILE-007**: src/main/cleaner/candidates.ts — только файловые правила при сборке (REQ-007).
- **FILE-008**: src/main/cleaner/recycleBin.ts — Shell-граница, preview и очистка корзины (REQ-001…REQ-004).
- **FILE-009**: src/main/cleaner/preview.ts — ветка корзины без walker (REQ-004, REQ-007).
- **FILE-010**: src/main/cleaner/deleter.ts — Shell-очистка и `EBUSY`-пропуск (REQ-002, REQ-003, REQ-005).
- **FILE-011**: src/main/cleaner/CleanerManager.ts — деп `recycleShell` (PAT-001).
- **FILE-012**: src/main/cleaner/*.test.ts — unit-тесты (REQ-009).

## 6. Testing

- **TEST-001**: Путь `<диск>:\$Recycle.Bin` проходит guard, файл внутри корзины, префикс `...\$Recycle.Bin2` и чужой диск без правила — нет; очистка затрагивает только выбранный том.
- **TEST-002**: Shell недоступен/тома не найдены → `unavailable` с причиной; часть томов не опрошена → `partial`; пустые корзины → `empty`; неизвестный размер → кандидат не создаётся.
- **TEST-003**: Отчёт корзины: `bytesFreed` = замер до − замер после; отказ замера до/после, отказ очистки, пустая корзина — per-item результаты из REQ-003; оценка preview в `freedBytes` не попадает.
- **TEST-004**: `EBUSY` → `skipped` + `CLEAN_FILE_IN_USE` без абортa остальных; другие ошибки — `failed`.
- **TEST-005**: Ротированные `systemdeck.log.<N>` старше 24 ч — кандидат; активный `systemdeck.log`, `*.etl`, `*.evtx`, `%WINDIR%\Logs` — нет.
- **TEST-006**: `npm run check` и `npm run smoke` зелёные.

## 7. Risks & Assumptions

- **RISK-001**: Очистка корзины необратима — mitigated: только явно выбранный том, агрегированный кандидат из preview, повторный замер и per-item отчёт; остальные тома не затрагиваются.
- **RISK-002**: `Clear-RecycleBin` может выполняться дольше таймаута на огромной корзине — mitigated: отдельный увеличенный таймаут очистки; отказ остаётся per-item `failed` без абортa операции.
- **RISK-003**: Файлы thumbcache постоянно заняты запущенным Explorer — mitigated: `EBUSY` трактуется как пропуск (`CLEAN_FILE_IN_USE`), а не ошибка; перезапуск Explorer не выполняется (CON-004).
- **RISK-004**: PowerShell недоступен/заблокирован политикой — mitigated: источник корзины получает `unavailable` с причиной, остальные категории не затрагиваются.
- **ASSUMPTION-001**: Каталог Application Log (`logger.getLogDirPath()`) — единственный документированный источник файловых логов SystemDeck; временные `.log` в TEMP покрыты allow-правилами категории `user-temp` (#56).
- **ASSUMPTION-002**: UI (#59) отобразит `status`/`reason`/`minAgeHours` и per-item коды из существующего контракта; новые типы в запросах/ответах не требуются.

## 8. Related Specifications / Further Reading

- Issue #57 — scope и критерии приёмки данной работы.
- Issue #22 (EPIC 5); ADR 0017 — модель безопасности Cleaner.
- Issues #54, #55, #56 (закрыты) — движок, IPC-протокол, TEMP.
- ADR 0002 — границы Main/Preload/Renderer/Shared; ADR 0003 — типизированные IPC-контракты.
- plan/feature-cleaner-temp-1.md — предыдущий шаг эпика (образец объёма и стиля).
- AGENTS.md — коммиты, PR, проверки и обязательные Skill-вызовы.
