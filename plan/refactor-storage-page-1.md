---
goal: Перекомпоновать страницу Storage — карточки вместо плоской стопки секций
version: 1.0
date_created: 2026-09-23
last_updated: 2026-09-23
owner: SystemDeck Agent
status: 'Completed'
tags: [refactor, ui, storage]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Страница Storage сейчас — плоская вертикальная стопка (тулбар → прогресс → сообщения → сводка → treemap + сайдбар) без визуального ритма. Цель: сгруппировать в карточки по смыслу (управление сканом / статус / итоговая статистика / результаты), переиспользуя существующие токены `--sd-color-*` и прецедент dashboard-сетки. ui-ux-pro-max: совпадений для react-стека в базе нет — применены встроенные правила (карточная группировка, резерв места под асинхронный контент, табличные цифры, 44px тапы, focus-visible, reduced-motion).

## 1. Requirements & Constraints

- **REQ-001**: Скан-панель: селект тома + кнопка действия + прогресс/сообщения живут в одной surface-карточке.
- **REQ-002**: Итоговая статистика (complete) — ряд из 4 stat-карточек: Всего / Файлов / Недоступно / Длительность + Обновлено.
- **REQ-003**: Результаты (treemap + сайдбар) остаются карточками в существующей сетке `sd-storage-layout`.
- **REQ-004**: Все существующие роли/тексты сохраняются: heading «Хранилище», combobox «Том для сканирования», кнопки «Сканировать»/«Отменить»/«Сканировать заново», progressbar «Прогресс сканирования», alert с текстом ошибки, `data-testid` treemap/sidebar/svg, breadcrumb nav.
- **CON-001**: Только Renderer + CSS; Main/Preload/Shared и IPC-контракт не трогаются.
- **CON-002**: Один файл — одна ответственность; компонент ≤ 80 строк кода без пустых строк/комментариев (AGENTS.md).
- **CON-003**: Только существующие дизайн-токены (`--sd-color-*`, `--sd-space-*`), новых палитр/шрифтов нет.
- **CON-004**: Импорты напрямую по путям файлов, без barrel-`index.ts`.
- **GUD-001**: С var-пробелами: асинхронные зоны (карта, сводка) держат скелет/плейсхолдер, а не схлопываются (CLS).

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Разбить StoragePage на модули-карточки с тестами и стилями

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | `src/renderer/src/components/storage/StorageToolbar.tsx`: селект тома + кнопка Сканировать/Отменить/Заново (управление через пропсы) | ✅ | 2026-09-23 |
| TASK-002 | `src/renderer/src/components/storage/StorageScanStatus.tsx`: scanning-прогресс / failed-alert / cancelled / idle-подсказка | ✅ | 2026-09-23 |
| TASK-003 | `src/renderer/src/components/storage/StorageResultSummary.tsx`: 4 stat-карточки из ScanResult | ✅ | 2026-09-23 |
| TASK-004 | `src/renderer/src/components/StorageScanView.tsx`: шапка (title + StatusBadge) + компоновка Toolbar/Status/Summary/Results-grid; `StoragePage.tsx` ужать до guards + выбор тома | ✅ | 2026-09-23 |
| TASK-005 | `src/renderer/src/assets/main.css`: `.sd-card`, `.sd-storage-head`, `.sd-stat-grid`, `.sd-stat-card`, reduced-motion уже покрыт | ✅ | 2026-09-23 |
| TASK-006 | Тесты: существующий `StoragePage.test.tsx` зелёный без правок текстов; +1 тест на 4 stat-карточки (colocated) | ✅ | 2026-09-23 |
| TASK-007 | `npm run check:boundaries`, `npm run typecheck`, `npm run test` | ✅ | 2026-09-23 |

## 3. Alternatives

- **ALT-001**: Тёмная тема / новая палитра из ui-ux-pro-max (slate + green) — отклонено: ломает консистентность светлого приложения, CON-003.
- **ALT-002**: Одна большая переписанная StoragePage — отклонено: нарушает лимит 80 строк и single-responsibility (AGENTS.md).

## 4. Dependencies

- **DEP-001**: `useStorageScan` — без изменений, состояние/действия через пропсы.
- **DEP-002**: `StorageTreemap`, `StorageSidebar`, `formatBytes`, `formatDateTime` — без изменений.

## 5. Files

- **FILE-001**: `src/renderer/src/components/StoragePage.tsx` — guards + выбор тома + компоновка.
- **FILE-002**: `src/renderer/src/components/StorageScanView.tsx` — шапка и сетка секций.
- **FILE-003**: `src/renderer/src/components/storage/StorageToolbar.tsx` — управление сканом.
- **FILE-004**: `src/renderer/src/components/storage/StorageScanStatus.tsx` — прогресс/сообщения.
- **FILE-005**: `src/renderer/src/components/storage/StorageResultSummary.tsx` — stat-карточки.
- **FILE-006**: `src/renderer/src/assets/main.css` — карточки и stat-сетка.
- **FILE-007**: `src/renderer/src/components/StoragePage.test.tsx` — доп. тест stat-карточек.

## 6. Testing

- **TEST-001**: Существующие 9 тестов StoragePage зелёные (роли/тексты не менялись).
- **TEST-002**: complete-результат рендерит 4 stat-карточки со значениями (Всего/Файлов/Недоступно/Длительность).
- **TEST-003**: Сканирование показывает прогресс внутри скан-карточки (progressbar по-прежнему в документе).

## 7. Risks & Assumptions

- **RISK-001**: Плотное окно 900×670 — stat-сетка 4→2 колонки через auto-fit/minmax, проверить на 1024px брейкпоинте результатов.
- **ASSUMPTION-001**: PR #51 (фикс дисков) мержится независимо; конфликтов нет (разные слои/файлы).

## 8. Related Specifications / Further Reading

- ui-ux-pro-max `references/quick-reference.md` (layout: reserve space; pro-rules: pre-delivery checklist)
- CONTEXT.md — Renderer без Node API; Shell/Dashboard термины
- EPIC 4 (#21, closed) — DoD страницы Storage
