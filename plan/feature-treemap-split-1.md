---
goal: Treemap-разбиение на модули и жёсткие гейты плана и размера компонентов
version: 1.0
date_created: 2026-09-23
last_updated: 2026-09-23
owner: systemdeck-agent
status: 'Completed'
tags: [feature, refactor, treemap, process]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

План устраняет два замечания к PR #47 (issue #39): отсутствует план-файл и компонент `StorageTreemap.tsx` собран в одном файле на 210 строк. План разбивает компонент на одноответственные модули в `src/renderer/src/components/treemap/` и жёстко фиксирует гейты в `AGENTS.md`: план-файл обязателен до правок `src/`, лимит размера файла компонента.

## 1. Requirements & Constraints

- **REQ-001**: Каждый модуль treemap занимает не более 80 строк исходного кода без учёта пустых строк и комментариев.
- **REQ-002**: План-файл по шаблону `create-implementation-plan` существует в `plan/` до любых правок `src/` и упомянут в PR.
- **REQ-003**: Поведение treemap сохраняется полностью: drill-down, breadcrumb, tooltip «имя + размер», цвета по каталогу, маркер Inaccessible Directory, лимиты `MAX_TREEMAP_LEAVES` и `MAX_TREEMAP_DEPTH`.
- **REQ-004**: Правило гейтов фиксируется в `AGENTS.md` разделом «План и размер компонентов».
- **CON-001**: Только слой Renderer, контракт Shared не меняется, IPC не затрагивается.
- **CON-002**: Без новых runtime-зависимостей, только React и существующие Renderer-модули.
- **GUD-001**: Один файл — одна ответственность: цвет, состояние trail, breadcrumb, тайл, SVG-каркас, композиция.
- **GUD-002**: Импорты напрямую по путям файлов, без barrel-файлов `index.ts`.
- **PAT-001**: Состояние drill-down инкапсулировано в хуке `useTreemapTrail`, презентационные части — чистые компоненты.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Зафиксировать план и жёсткие гейты до рефакторинга

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Создать файл plan/feature-treemap-split-1.md по шаблону create-implementation-plan со статусом In progress, покрывающий REQ-001, REQ-002, REQ-003, REQ-004, CON-001 и CON-002 | ✅ | 2026-09-23 |
| TASK-002 | Добавить в AGENTS.md раздел План и размер компонентов: план-файл обязателен до правок src, лимит 80 строк на файл компонента, один файл — одна ответственность, проверка длины перед коммитом | ✅ | 2026-09-23 |

### Implementation Phase 2

- GOAL-002: Разбить StorageTreemap на одноответственные модули без смены поведения

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-003 | Создать src/renderer/src/components/treemap/treemapColor.ts: перенести treemapHue, tileFill, tileStroke из StorageTreemap.tsx, покрывает REQ-001 и GUD-001 | ✅ | 2026-09-23 |
| TASK-004 | Создать src/renderer/src/components/treemap/useTreemapTrail.ts: перенести findChildByPath и состояние trail, current, canDrillDeeper, drillInto, jumpTo, сброс при смене tree, покрывает REQ-001 и PAT-001 | ✅ | 2026-09-23 |
| TASK-005 | Создать TreemapBreadcrumb.tsx, TreemapTile.tsx, TreemapSvg.tsx и тонкий StorageTreemap.tsx-композитор в src/renderer/src/components/treemap/, удалить старый StorageTreemap.tsx, обновить импорт в StoragePage.tsx, покрывает REQ-001, REQ-003, GUD-001 и GUD-002 | ✅ | 2026-09-23 |
| TASK-006 | Перенести и дополнить тесты: colocated StorageTreemap.test.tsx, unit-тесты treemapColor и useTreemapTrail, прогнать npm run check:boundaries, typecheck и test до зелёного, покрывает REQ-003 | ✅ | 2026-09-23 |

## 3. Alternatives

- **ALT-001**: **Description**: Оставить монолитный StorageTreemap.tsx и только добавить план-файл.
- **ALT-002**: **Rejection Reason**: Не устраняет замечание о размере файла и нарушает feature-arch (fcomp-single-responsibility, bound-feature-size).
- **ALT-003**: **Description**: Разбить через barrel-файл treemap/index.ts с реэкспортами.
- **ALT-004**: **Rejection Reason**: Нарушает GUD-002 и feature-arch import-avoid-barrel-files, прямые импорты дешевле для сборки.

## 4. Dependencies

- **DEP-001**: Существующий модуль src/renderer/src/treemap.ts (layoutTreemap, MAX_TREEMAP_DEPTH, TreemapLeaf) как источник раскладки.
- **DEP-002**: Существующий модуль src/renderer/src/format.ts (formatBytes) для подписей и tooltip.

## 5. Files

- **FILE-001**: plan/feature-treemap-split-1.md — план данной работы.
- **FILE-002**: AGENTS.md — жёсткие гейты плана и размера компонентов.
- **FILE-003**: src/renderer/src/components/treemap/treemapColor.ts — цветовые функции тайлов.
- **FILE-004**: src/renderer/src/components/treemap/useTreemapTrail.ts — хук drill-down trail.
- **FILE-005**: src/renderer/src/components/treemap/TreemapBreadcrumb.tsx — навигация breadcrumb.
- **FILE-006**: src/renderer/src/components/treemap/TreemapTile.tsx — один SVG-тайл.
- **FILE-007**: src/renderer/src/components/treemap/TreemapSvg.tsx — SVG-каркас карты.
- **FILE-008**: src/renderer/src/components/treemap/StorageTreemap.tsx — тонкий композитор.
- **FILE-009**: src/renderer/src/components/treemap/StorageTreemap.test.tsx — colocated тесты поведения.
- **FILE-010**: src/renderer/src/components/StoragePage.tsx — обновлённый импорт компонента.

## 6. Testing

- **TEST-001**: Unit-тест treemapHue детерминирован и tileFill/tileStroke различают files, inaccessible и обычные каталоги.
- **TEST-002**: Unit-тест useTreemapTrail: drillInto проваливается в дочерний узел, jumpTo обрезает trail, смена tree сбрасывает trail, глубина ограничена MAX_TREEMAP_DEPTH.
- **TEST-003**: Поведенческие тесты StorageTreemap: drill-down кликом, возврат через breadcrumb, Enter на тайле, маркер недоступного каталога, некликаемые Файлы.
- **TEST-004**: Полный прогон npm run check:boundaries, npm run typecheck и npm run test зелёный.

## 7. Risks & Assumptions

- **RISK-001**: Перемещение файлов ломает импорты StoragePage и тестов — mitigated TASK-005 и TASK-006 с полным прогоном тестов.
- **ASSUMPTION-001**: Контракт Shared (DirectoryNode) стабилен и не требует изменений для разбиения.

## 8. Related Specifications / Further Reading

- Issue #39 — treemap SVG с drill-down (scope поведения).
- ADR 0013 — storage-scan-protocol (Scan Result, Directory Node, Inaccessible Directory).
- CONTEXT.md — Shared, Renderer, Directory Node, Inaccessible Directory.
- PR #47 — исходная реализация монолитом.
