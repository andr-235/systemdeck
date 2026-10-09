---
goal: Обнаружение профилей Chrome/Edge/Firefox и узкая очистка их кэша в движке Cleaner (issue #58)
version: 1.0
date_created: 2026-10-09
last_updated: 2026-10-09
owner: systemdeck-agent
status: 'Completed'
tags: [feature, cleaner, epic-5, main, shared, safety]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

План реализует issue #58 (дочерний EPIC 5 #22, ADR 0017): категория `browser-cache`
переводится с широкого правила `%LOCALAPPDATA%` + паттерн `\(Cache|Code Cache|GPUCache)\`
на обнаружение реальных профилей Chrome, Edge и Firefox в Main и allow-правила только к
точным каталогам кэша (`Cache`, `Code Cache`, `GPUCache`, `cache2`) подтверждённых
профилей. Движок (#54), IPC (#55), TEMP (#56) и корзина/эскизы/логи (#57) закрыты;
UI (#59) и TEMP-ограничение обхода (#64) — вне скоупа.

## 1. Requirements & Constraints

- **REQ-001**: Обнаружение профилей выполняется только в Main: Chrome — `%LOCALAPPDATA%\Google\Chrome\User Data`,
  Edge — `%LOCALAPPDATA%\Microsoft\Edge\User Data` (профиль = непосредственная подпапка с файлом `Preferences`),
  Firefox — `%APPDATA%\Mozilla\Firefox\Profiles` (профиль = подпапка с `prefs.js`); профили находятся все
  реально обнаруженные (`Default`, `Profile N` и другие), а не только `Default`.
- **REQ-002**: Allow-корни — только точные каталоги кэша подтверждённого профиля: `Cache`, `Code Cache`,
  `GPUCache` (Chromium) и `cache2` (Firefox). Каталог профиля и каталог кэша, обнаруженные как symlink/junction,
  не следуются и корнем не становятся; отсутствие каталога браузера (ENOENT) — не ошибка, а «браузер не установлен».
- **REQ-003**: Правило `browser-cache` на `%LOCALAPPDATA%` с паттерном `\(Cache|Code Cache|GPUCache)\` удаляется.
  Новое правило — узкий корень без паттерна: любое содержимое строго под точным каталогом кэша, всё вне корней
  не матчится никогда.
- **REQ-004**: Запрещённые пути не предлагаются и не удаляются: Service Worker/CacheStorage, IndexedDB,
  Local Storage, Session Storage, Cookies, History, Bookmarks, Login Data, `places.sqlite`, `logins.json`,
  `key4.db`, `cert9.db` и файлы профиля не входят ни в один allow-корень; отдельные тесты запретных путей.
- **REQ-005**: Источник `browser-cache` в preview различает: `empty` — браузер/профиль отсутствует либо
  подходящих файлов нет при доступном источнике; `unavailable` — отказ доступа к каталогам браузеров/профилей
  с причиной или неопределённые переменные окружения (`%LOCALAPPDATA%` и `%APPDATA%`); `partial` — часть
  профилей/каталогов прочитана, часть нет.
- **REQ-006**: Preview-кандидат несёт метаданные браузера: `browser` (`chrome|edge|firefox`), `profile`,
  `cacheKind` (`Cache|Code Cache|GPUCache|cache2`) — Renderer классификацию не выполняет; в ответе также
  оценка размера и статус доступности источника (существующие поля).
- **REQ-007**: Main перепроверяет правило при удалении по свеже обнаруженному списку правил: обнаружение
  выполняется и в preview, и в `startDelete` (правила не берутся из сессии и не кэшируются); каталог кэша,
  исчезнувший или ставший ссылкой после preview, не даёт правила и блокируется guard'ом (`CLEAN_OUTSIDE_RULES`).
  Занятый файл браузера → per-item `skipped` + `CLEAN_FILE_IN_USE` без абортa остальных; изменившиеся после
  preview размер/`mtimeMs` → per-item `skipped` + `CLEAN_ENTRY_INVALID`.
- **REQ-008**: Контракты Shared: типы `CleanupBrowser` и `CleanupCacheKind`, опциональные поля
  `browser?`/`profile?`/`cacheKind?` у `CleanupCandidate` и `CleanupPreviewCandidate`;
  `SHARED_CONTRACT_VERSION` `sd-024` → `sd-025`; типы запросов/ответов IPC не меняются, новых каналов нет.
- **REQ-009**: Colocated vitest-тесты покрывают каждый критерий приёмки: несколько профилей трёх браузеров,
  запретные пути, `empty`/`unavailable`/`partial`, reparse points, смена правил между preview и delete;
  `npm run check` и `npm run smoke` выполняются фактически.
- **CON-001**: Границы ADR 0002 — изменения только в `src/main` и `src/shared`; Preload и Renderer не трогаются,
  Shared остаётся без runtime `electron`/`node:*`.
- **CON-002**: ADR 0017 — узкие allow-правила, явный выбор из preview, per-item отчёт; без elevation, без
  принудительного закрытия браузеров, без удаления профилей целиком, без обхода Log Redaction.
- **CON-003**: Out of scope issue: очистка cookies/истории/паролей, сброс профиля, расширения, чужие
  пользовательские профили, Service Worker/IndexedDB/Local Storage, TEMP (#56), UI (#59).
- **CON-004**: Новых IPC-каналов и расширения Privileged API нет; кодов ошибок не добавляется —
  используются существующие `CLEAN_FILE_IN_USE`, `CLEAN_ENTRY_INVALID`, `CLEAN_OUTSIDE_RULES`,
  `CLEAN_PROTECTED_PATH`, `CLEAN_DELETE_FAILED`.
- **CON-005**: Один файл — одна ответственность; тесты colocated; импорты по путям файлов без
  barrel-реэкспортов; соответствующие скиллы вызваны до правок `src/`.
- **GUD-001**: Windows-пути сравниваются case-insensitive с нормализацией слэшей и по границе сегмента
  (существующие `paths.ts`); отказ чтения без кода ошибки трактуется консервативно как недоступный каталог.
- **PAT-001**: Прецедент инжекции границ (`CleanerFs`, ADR 0013): обнаружение профилей принимает `CleanerFs`
  и снимок окружения (`Env`) параметром — тесты не трогают реальную ФС и `process.env`.
- **PAT-002**: Прецедент разделения статического реестра (`cleanerRules(env)`, чистая функция) и динамических
  данных: обнаружение живёт в отдельном модуле и подмешивается в правила через разрешитель.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Обновить контракты Cleaner в Shared

| Task     | Description                                                                                                                                                                                           | Completed | Date       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-001 | `src/shared/ipc/contracts.ts`: типы `CleanupBrowser`/`CleanupCacheKind`, опциональные `browser?`/`profile?`/`cacheKind?` у `CleanupCandidate` и `CleanupPreviewCandidate`; покрывает REQ-006, REQ-008 | ✅        | 2026-10-09 |
| TASK-002 | `src/shared/ipc/index.ts`: экспорт новых типов; `src/shared/api.ts`: `SHARED_CONTRACT_VERSION` `sd-024` → `sd-025`; покрывает REQ-008                                                                 | ✅        | 2026-10-09 |

### Implementation Phase 2

- GOAL-002: Обнаружение профилей браузеров и динамические allow-правила

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                                               | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-003 | Создать `src/main/cleaner/browserRoots.ts`: типы `BrowserCacheRoot`/`BrowserDiscovery`, `discoverBrowserCacheRoots(env, fs)` (Chromium-профили по `Preferences`, Firefox-профили по `prefs.js`, symlink-корни пропускаются, ENOENT = не установлен, EACCES/неизвестный код = `denied`), `browserCacheRules(discovery)` — правила `browser-cache` без паттерна с метаданными; покрывает REQ-001, REQ-002, REQ-003, REQ-006 | ✅        | 2026-10-09 |
| TASK-004 | Создать `src/main/cleaner/resolveRules.ts`: `resolveCleanupRules(fs, env?)` — статический `cleanerRules(env)` плюс правила обнаруженных кэшей, возвращает `{ rules, browser }`; покрывает REQ-007                                                                                                                                                                                                                         | ✅        | 2026-10-09 |
| TASK-005 | `src/main/cleaner/rules.ts`: у `CleanupFileRule` — `pattern?` (отсутствует = любое содержимое строго под корнем) и поля `browser?`/`profile?`/`cacheKind?`, `matchesCleanupRule` учитывает отсутствие паттерна, старое правило `browser-cache` на `%LOCALAPPDATA%` удаляется; покрывает REQ-003                                                                                                                           | ✅        | 2026-10-09 |

### Implementation Phase 3

- GOAL-003: Метаданные кандидатов, статус источника и интеграция в preview/delete

| Task     | Description                                                                                                                                                                                                                                                                                                                        | Completed | Date       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-006 | `src/main/cleaner/candidates.ts`: кандидат наследует `browser`/`profile`/`cacheKind` из найденного файлового правила; покрывает REQ-006                                                                                                                                                                                            | ✅        | 2026-10-09 |
| TASK-007 | `src/main/cleaner/sourceStatus.ts`: `browserSourceStatus` (`empty`/`unavailable`/`partial`/`ok` по REQ-005) и опциональный вход `status` в `buildPreviewSource`; покрывает REQ-005                                                                                                                                                 | ✅        | 2026-10-09 |
| TASK-008 | `src/main/cleaner/preview.ts`: разрешение правил через `resolveCleanupRules(fs, options.env)` (при заданных `options.rules` — статический список), `BrowserDiscovery` в контексте, сборка источника `browser-cache` через `browserSourceStatus`, прокидывание метаданных в черновик кандидата; покрывает REQ-005, REQ-006, REQ-007 | ✅        | 2026-10-09 |
| TASK-009 | `src/main/cleaner/CleanerManager.ts`: `startDelete` становится async — свежие правила через `resolveCleanupRules` перед guard'ом, повторная проверка активности после `await`, те же правила передаются в `runCleanup`; покрывает REQ-007                                                                                          | ✅        | 2026-10-09 |

### Implementation Phase 4

- GOAL-004: Покрыть поведение тестами и прогнать проверки

| Task     | Description                                                                                                                                                                                                                                                                                                                                                                                         | Completed | Date       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-010 | Новый тест `src/main/cleaner/browserRoots.test.ts`: несколько профилей Chrome/Edge/Firefox, подтверждение профиля (`Preferences`/`prefs.js`), пропуск symlink-профилей и symlink-каталогов кэша, ENOENT = браузер не установлен, EACCES = `denied`, окружение без переменных; покрывает REQ-001, REQ-002, REQ-009                                                                                   | ✅        | 2026-10-09 |
| TASK-011 | Отдельные тесты запретных путей (в `rules.test.ts`/`browserRoots.test.ts`): Service Worker/CacheStorage, IndexedDB, Local Storage, Session Storage, Cookies, History, Bookmarks, Login Data, `places.sqlite`, `logins.json`, `key4.db`, `cert9.db` не матчатся правилом и блокируются `isDeletionAllowed`; покрывает REQ-004                                                                        | ✅        | 2026-10-09 |
| TASK-012 | Обновить существующие тесты (`rules`, `preview`, `sourceStatus`, `candidates`, `deleter`, `CleanerManager`, `ipc/cleaner`) под новые правила и async `startDelete`; новые кейсы: метаданные браузера в кандидатах, `empty`/`unavailable`/`partial` источника, reparse point и смена правил между preview и delete, занятый файл → `CLEAN_FILE_IN_USE`; покрывает REQ-005, REQ-006, REQ-007, REQ-009 | ✅        | 2026-10-09 |
| TASK-013 | `npm run check` и `npm run smoke` фактически выполнены; нарушения исправлены; покрывает CON-001, CON-005, REQ-009                                                                                                                                                                                                                                                                                   | ✅        | 2026-10-09 |

### Implementation Phase 5

- GOAL-005: Упаковать работу в коммит и PR

| Task     | Description                                                                                                  | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| TASK-014 | Коммит сообщением на русском (conventional-commit/git-commit); покрывает REQ-009                             | ✅        | 2026-10-09 |
| TASK-015 | PR с первой строкой тела `Closes #58`, лейблом `ready-for-human`, строкой `Skills:`; комментарий в issue #58 | ✅        | 2026-10-09 |

## 3. Alternatives

- **ALT-001**: **Description**: Оставить действующее правило `browser-cache` на `%LOCALAPPDATA%` с паттерном `\(Cache|Code Cache|GPUCache)\`.
- **ALT-002**: **Rejection Reason**: Обходит весь `%LOCALAPPDATA%` рекурсивно и подхватывает кэши любых приложений, а не только профилей браузеров; issue требует allow-пути только к каталогам кэша реально обнаруженных профилей.
- **ALT-003**: **Description**: Синхронное обнаружение профилей (`readdirSync`) внутри `cleanerRules`.
- **ALT-004**: **Rejection Reason**: Ломает чистоту статического реестра (тесты и guard'ы начали бы зависеть от реальной ФС при каждом вызове); выбрано отдельное async-обнаружение с инжекцией `CleanerFs` (PAT-001).
- **ALT-005**: **Description**: Обнаружить профили один раз в preview и хранить правила в preview-сессии.
- **ALT-006**: **Rejection Reason**: Guard удаления перестал бы сверяться со свежим состоянием ФС: каталог кэша, заменённый junction после preview, прошёл бы проверку по устаревшим правилам (REQ-007 требует повторной проверки в Main).
- **ALT-007**: **Description**: Считать профилем любую подпапку `User Data` (подтверждение не проводить).
- **ALT-008**: **Rejection Reason**: Issue прямо требует подтверждения, что каталог — настоящий профиль с настоящим кэшём; подтверждение по `Preferences`/`prefs.js` отсекает `Crashpad`, `ShaderCache` и прочие служебные каталоги.
- **ALT-009**: **Description**: Отдельный источник в `sources[]` на каждый браузер/профиль.
- **ALT-010**: **Rejection Reason**: Контракт и UI (#59) оперируют одним источником на категорию; профиль и браузер — свойства кандидата (REQ-006), дублирование источников сломало бы ожидание «на каждую категорию один статус».
- **ALT-011**: **Description**: Завершать запущенный браузер или снимать блокировки, чтобы удалить всё.
- **ALT-012**: **Rejection Issue**: Issue и ADR 0017 запрещают принудительное закрытие процессов; занятые файлы идут в отчёт как `skipped`/`CLEAN_FILE_IN_USE`.

## 4. Dependencies

- **DEP-001**: Issue #58 — исполняемый scope данной работы.
- **DEP-002**: Issue #22 (EPIC 5) и ADR 0017 — родитель и модель безопасности.
- **DEP-003**: Issues #54, #55, #56, #57 (закрыты) — движок, IPC, TEMP и остальные категории как основа.
- **DEP-004**: ADR 0002 и ADR 0003 — границы слоёв и контракты IPC (`SHARED_CONTRACT_VERSION`).

## 5. Files

- **FILE-001**: plan/feature-cleaner-browser-cache-1.md — план данной работы.
- **FILE-002**: src/shared/ipc/contracts.ts — типы браузера и метаданные кандидатов (REQ-006, REQ-008).
- **FILE-003**: src/shared/ipc/index.ts и src/shared/api.ts — экспорт и бамп версии контракта (REQ-008).
- **FILE-004**: src/main/cleaner/browserRoots.ts — обнаружение профилей и правила кэшей (REQ-001…REQ-003).
- **FILE-005**: src/main/cleaner/resolveRules.ts — разрешение актуальных правил (REQ-007).
- **FILE-006**: src/main/cleaner/rules.ts — `pattern?`, метаданные, удаление широкого правила (REQ-003).
- **FILE-007**: src/main/cleaner/candidates.ts — метаданные кандидата (REQ-006).
- **FILE-008**: src/main/cleaner/sourceStatus.ts — статус источника browser-cache (REQ-005).
- **FILE-009**: src/main/cleaner/preview.ts — разрешение правил и сборка источника (REQ-005…REQ-007).
- **FILE-010**: src/main/cleaner/CleanerManager.ts — async `startDelete` со свежими правилами (REQ-007).
- **FILE-011**: src/main/cleaner/*.test.ts и src/main/ipc/cleaner.test.ts — unit-тесты (REQ-009).

## 6. Testing

- **TEST-001**: Обнаружение: два профиля Chrome (`Default`, `Profile 2`), профиль Edge и два профиля Firefox дают корни `Cache`/`Code Cache`/`GPUCache`/`cache2`; подпапка без `Preferences`/`prefs.js` профилем не считается.
- **TEST-002**: Запретные пути (Service Worker, IndexedDB, Local Storage, Session Storage, Cookies, History, Bookmarks, Login Data, `places.sqlite`, `logins.json`, `key4.db`, `cert9.db`) не матчатся ни одним правилом и блокируются `isDeletionAllowed`.
- **TEST-003**: Источник: браузер не установлен → `empty`; отказ доступа к каталогам профилей → `unavailable` с причиной; часть профилей недоступна → `partial`; доступный источник без файлов → `empty`.
- **TEST-004**: Symlink/ junction каталог кэша не даёт allow-корня; файл-ссылка под корнем не удаляется (`CLEAN_ENTRY_INVALID`); занятый файл → `CLEAN_FILE_IN_USE` без абортa остальных.
- **TEST-005**: Кандидаты несут `browser`/`profile`/`cacheKind`; удаление по свежим правилам: исчезнувший каталог кэша даёт `CLEAN_OUTSIDE_RULES`; `npm run check` и `npm run smoke` зелёные.

## 7. Risks & Assumptions

- **RISK-001**: Очистка кэша необратима (история сессий страниц) — mitigated: узкие allow-корни только каталогов кэша подтверждённых профилей, явный выбор из preview, повторная валидация параметров и per-item отчёт; cookies/пароли/история не входят в правила.
- **RISK-002**: Запущенный браузер держит файлы кэша открытыми — mitigated: `EBUSY` → per-item `skipped` + `CLEAN_FILE_IN_USE`, процесс не завершается (REQ-007).
- **RISK-003**: Смена структуры каталогов браузеров в будущих версиях — mitigated: обнаружение консервативно (нет подтверждения профиля/каталога кэша — нет правила), исход — `empty`, а не удаление по непроверенному пути.
- **RISK-004**: Async `startDelete` меняет сигнатуру, обработчик IPC уже возвращает Promise — mitigated: повторная проверка активности после `await`, обновление существующих тестов менеджера.
- **ASSUMPTION-001**: UI (#59) отобразит `browser`/`profile`/`cacheKind` из контракта preview; в данной работе поля добавляются обратно совместимо (`?`).
- **ASSUMPTION-002**: Каталоги браузеров стандартные для Windows-установок Chrome/Edge/Firefox; нестандартные или переносные установки (`--user-data-dir`, Portable Firefox) не поддерживаются — вне allow-списка.

## 8. Related Specifications / Further Reading

- Issue #58 — scope и критерии приёмки данной работы.
- Issue #22 (EPIC 5); ADR 0017 — модель безопасности Cleaner.
- Issues #54, #55, #56, #57 (закрыты) — движок, IPC, TEMP, корзина/эскизы/логи.
- ADR 0002 — границы Main/Preload/Renderer/Shared; ADR 0003 — типизированные IPC-контракты.
- plan/feature-cleaner-temp-1.md и plan/feature-cleaner-bin-thumbs-logs-1.md — предыдущие шаги эпика (образец объёма и стиля).
- AGENTS.md — коммиты, PR, проверки и обязательные Skill-Вызовы.
