---
goal: Сайдбар Storage — крупнейшие файлы и сводка по типам (issue #40)
version: 1.0
date_created: 2026-09-23
last_updated: 2026-09-23
owner: systemdeck-agent
status: 'Completed'
tags: [feature, storage, renderer, epic-4]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

План реализует сайдбар страницы Storage (issue #40, EPIC 4 #21): таблица Largest Files (top-100) и сводка по File Type Category из готового Scan Result. Только слой Renderer; категории приходят из Main готовыми строками, Renderer не классифицирует (ADR 0013). Пустые состояния различают «пусто» и «недоступно» (Inaccessible Directory, CONTEXT.md).

## 1. Requirements & Constraints

- **REQ-001**: Таблица Largest Files показывает top-100 из `ScanResult.largestFiles`: путь (полный путь + имя), размер (`formatBytes`), категория (готовая строка из Main); контейнер со скроллом, доступен клавиатуре и скринридеру.
- **REQ-002**: Сводка по File Type Category показывает `ScanResult.typeTotals`: категория, байты (`formatBytes`), проценты от `totalBytes`, сортировка desc по `sizeBytes`; проценты считаются в Renderer от `totalBytes` результата.
- **REQ-003**: Пустые состояния: пустой `largestFiles`/`typeTotals` при завершённом скане не называется «пусто», если `fileCount > 0` или `inaccessibleDirectories > 0` — показывается пояснение про недоступность/несобранные данные; при `fileCount === 0` — честное «пусто».
- **REQ-004**: Каждый новый файл компонента — не более 80 строк кода без пустых строк и комментариев; один файл — одна ответственность.
- **REQ-005**: Компонентные тесты рядом с фичей (colocated): top-100 таблица, сводка с сортировкой и процентами, пустые состояния.
- **CON-001**: Только слой Renderer + готовый контракт Shared (`ScanResult`, `LargestFileEntry`, `FileTypeTotal`); без изменений Main/Preload/Shared, без новых IPC-каналов.
- **CON-002**: Renderer не классифицирует файлы (ADR 0013); порядок `largestFiles` — как пришёл из Main, `typeTotals` сортируется desc копией без мутации props.
- **CON-003**: Стили — только существующие CSS-токены (`sd-*`, `var(--sd-*)`); без новых runtime-зависимостей.
- **GUD-001**: Импорты напрямую по путям файлов (`../format`), без barrel-`index.ts` реэкспортов.
- **GUD-002**: A11y: таблица с `caption`/`scope`, скролл-регион с `aria-label` и `tabIndex={0}`, проценты и байты в `sd-num`, статусы через `role="status"`.
- **PAT-001**: Презентационные чистые компоненты + тонкий композитор `StorageSidebar` (прецедент — `StorageTreemap` + `TreemapBreadcrumb`/`TreemapSvg`).

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Зафиксировать план и каркас сайдбара без смены поведения страницы

| Task     | Description                                                                                                                                                                                                             | Completed | Date       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| TASK-001 | Создать plan/feature-storage-sidebar-1.md по шаблону create-implementation-plan со статусом In progress, покрывающий REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, CON-001 и CON-002                                     | ✅        | 2026-09-23 |
| TASK-002 | Создать src/renderer/src/components/storage/LargestFilesTable.tsx (таблица top-100: путь, размер, категория; скролл-регион; пустые состояния по REQ-003), покрывает REQ-001, REQ-003, REQ-004, GUD-002                  | ✅        | 2026-09-23 |
| TASK-003 | Создать src/renderer/src/components/storage/TypeTotalsSummary.tsx (сводка категорий: байты + проценты от totalBytes, сортировка desc копией; пустые состояния по REQ-003), покрывает REQ-002, REQ-003, REQ-004, GUD-002 | ✅        | 2026-09-23 |

### Implementation Phase 2

- GOAL-002: Скомпоновать сайдбар, встроить в страницу и покрыть тестами

| Task     | Description                                                                                                                                                                                                        | Completed | Date       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| TASK-004 | Создать src/renderer/src/components/storage/StorageSidebar.tsx (композитор: принимает ScanResult, рендерит LargestFilesTable + TypeTotalsSummary, заголовок «Крупнейшие файлы и типы»), покрывает REQ-004, PAT-001 | ✅        | 2026-09-23 |
| TASK-005 | Заменить плейсхолдер aside в src/renderer/src/components/StoragePage.tsx на StorageSidebar (импорт напрямую по пути файла, поведение остальных состояний без изменений), покрывает REQ-001, REQ-002                | ✅        | 2026-09-23 |
| TASK-006 | Создать colocated тесты LargestFilesTable.test.tsx, TypeTotalsSummary.test.tsx, StorageSidebar.test.tsx (top-100 строки, проценты и сортировка desc, пустые vs недоступные состояния), покрывает REQ-005           | ✅        | 2026-09-23 |
| TASK-007 | Прогнать npm run check:boundaries, npm run typecheck, npm run test до зелёного; проверить длину новых файлов ≤80 строк кода, покрывает REQ-004                                                                     | ✅        | 2026-09-23 |

## 3. Alternatives

- **ALT-001**: **Description**: Один монолитный StorageSidebar.tsx со всей разметкой таблицы и сводки.
- **ALT-002**: **Rejection Reason**: Нарушает REQ-004 и feature-arch (fcomp-single-responsibility, bound-feature-size); прецедент разбиения — treemap-модули.
- **ALT-003**: **Description**: Пересортировать largestFiles в Renderer по sizeBytes desc.
- **ALT-004**: **Rejection Reason**: Порядок top-100 — ответственность Main (top-100 heap, ADR 0013); Renderer сохраняет порядок источника, сортирует только typeTotals для отображения.
- **ALT-005**: **Description**: Виртуализировать таблицу top-100 (windowing).
- **ALT-006**: **Rejection Reason**: 100 строк — дешёвый DOM без виртуализации; лишняя сложность и зависимость вне CON-003.

## 4. Dependencies

- **DEP-001**: Контракт Shared src/shared/ipc/contracts.ts (`ScanResult`, `LargestFileEntry`, `FileTypeTotal`, `FileTypeCategory`) — единственный источник типов.
- **DEP-002**: Модуль src/renderer/src/format.ts (`formatBytes`) для размеров.
- **DEP-003**: Хук src/renderer/src/useStorageScan.ts (`StorageScanState complete`) как источник `ScanResult` в `StoragePage.tsx`.

## 5. Files

- **FILE-001**: plan/feature-storage-sidebar-1.md — план данной работы.
- **FILE-002**: src/renderer/src/components/storage/LargestFilesTable.tsx — таблица top-100.
- **FILE-003**: src/renderer/src/components/storage/TypeTotalsSummary.tsx — сводка по типам.
- **FILE-004**: src/renderer/src/components/storage/StorageSidebar.tsx — композитор сайдбара.
- **FILE-005**: src/renderer/src/components/storage/LargestFilesTable.test.tsx — тесты таблицы.
- **FILE-006**: src/renderer/src/components/storage/TypeTotalsSummary.test.tsx — тесты сводки.
- **FILE-007**: src/renderer/src/components/storage/StorageSidebar.test.tsx — тесты композиции и пустых состояний.
- **FILE-008**: src/renderer/src/components/StoragePage.tsx — встройка сайдбара вместо плейсхолдера.

## 6. Testing

- **TEST-001**: Таблица рендерит до 100 строк с путём, размером (`formatBytes`) и готовой категорией; скролл-регион доступен (`aria-label`, `tabIndex`).
- **TEST-002**: Сводка считает проценты от `totalBytes`, сортирует категории desc по `sizeBytes`, показывает байты и проценты.
- **TEST-003**: Пустой `largestFiles` при `fileCount === 0` — «Файлы не найдены»; при `fileCount > 0` или `inaccessibleDirectories > 0` — пояснение про недоступность, а не «пусто».
- **TEST-004**: Пустой `typeTotals` при `fileCount === 0` — «Категорий нет»; при недоступных каталогах — пояснение про несобранные данные.
- **TEST-005**: Полный прогон `npm run check:boundaries`, `npm run typecheck`, `npm run test` зелёный.

## 7. Risks & Assumptions

- **RISK-001**: StoragePage.tsx уже превышает лимит 80 строк — встройка сайдбара не должна его раздувать; mitigated TASK-005 (замена плейсхолдера на один компонент без новой логики).
- **RISK-002**: Проценты от totalBytes могут дать 0.0% на малых категориях — отображается как есть через округление, без скрытия категорий.
- **ASSUMPTION-001**: `largestFiles` из Main уже отсортирован desc и ограничен 100 (ADR 0013, top-100 heap); Renderer порядок не меняет.
- **ASSUMPTION-002**: Термин «максимального-unreachable» в issue трактуется как Unavailable/Inaccessible Directory (CONTEXT.md): сайдбар никогда не показывает «пусто» там, где данные недоступны.

## 8. Related Specifications / Further Reading

- Issue #40 — сайдбар: самые большие файлы и сводка по типам (scope данной работы).
- Issue #21 (EPIC 4) — Storage Analyzer, родитель.
- ADR 0013 — storage-scan-protocol (Scan Result, Largest Files, File Type Category, кэш, классификация в Main).
- CONTEXT.md — Scan Result, Largest Files, File Type Category, Directory Node, Inaccessible Directory, Unavailable.
- src/renderer/src/components/StoragePage.tsx — текущие резервные контейнеры `storage-treemap`/`storage-sidebar`.
