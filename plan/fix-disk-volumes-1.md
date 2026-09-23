---
goal: Исправить «Нет фиксированных томов» при одном томе — нормализация single-object JSON от PowerShell
version: 1.0
date_created: 2026-09-23
last_updated: 2026-09-23
owner: SystemDeck Agent
status: 'Completed'
tags: [fix, storage, disk, wmi]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

PowerShell `ConvertTo-Json -Compress` без `-AsArray` возвращает одиночный объект вместо массива, когда фиксированный том один (типично: только `C:`). `defaultDiskSource` типизирует ответ как `LogicalDiskRow[]` и вызывает `rows.map` — падает с TypeError, `withFallback` глотает в `[]`, Renderer показывает «Нет фиксированных томов — сканирование недоступно». Подтверждено на машине пользователя: запрос вернул `{"DeviceID":"C:",...}` (объект, не массив).

## 1. Requirements & Constraints

- **REQ-001**: `defaultDiskSource` возвращает том `C:` когда WMI отдал одиночный JSON-объект.
- **REQ-002**: Поведение для массива, пустого вывода и ошибок не меняется (пустой вывод/throw → `[]` через `withFallback`).
- **REQ-003**: Маппинг строк в `DiskVolumeMetrics` (total/used/free/percent, `nonEmpty`, `finiteNonNeg`) не меняется.
- **CON-001**: Границы слоёв: правка только `src/main` (+ colocated тест), `Shared` контракт не трогается.
- **CON-002**: Один файл — одна ответственность, компонент ≤ 80 строк кода (AGENTS.md).
- **CON-003**: Windows PowerShell 5.1 не знает `ConvertTo-Json -AsArray` — нормализация только на стороне TS.
- **GUD-001**: Чистая функция маппинга отдельно от WMI-вызова — тестируется без мока `ps` модуля.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Выделить чистый маппинг и нормализовать single-object в массив с тестами

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | В `src/main/monitoring/disk/DiskMonitor.ts`: извлечь `toDiskVolumes(input: LogicalDiskRow \| LogicalDiskRow[] \| null): DiskVolumeMetrics[]`, в `defaultDiskSource` типизировать ответ как `LogicalDiskRow[] \| LogicalDiskRow` и прогнать через неё | ✅ | 2026-09-23 |
| TASK-002 | В `src/main/monitoring/disk/DiskMonitor.test.ts`: тесты — одиночный объект даёт 1 том; массив как раньше; `null` даёт `[]` | ✅ | 2026-09-23 |
| TASK-003 | Прогон `npm run check:boundaries`, `npm run typecheck`, `npm run test` (полный) | ✅ | 2026-09-23 |

## 3. Alternatives

- **ALT-001**: Добавить `-AsArray` к `ConvertTo-Json` — отклонено: флага нет в Windows PowerShell 5.1 (CON-003), сломало бы прод.
- **ALT-002**: Обобщить `runPowershellJson` до авто-обёртки в массив — отклонено: меняет семантику общей утилиты для всех мониторов; точечный фикс диска + отдельная задача на остальные источники.

## 4. Dependencies

- **DEP-001**: `src/main/util/math` (`finiteNonNeg`, `nonEmpty`, `percentFrom`) — без изменений.
- **DEP-002**: `src/main/util/promise` (`withFallback`) — без изменений.

## 5. Files

- **FILE-001**: `src/main/monitoring/disk/DiskMonitor.ts` — нормализация + чистая функция.
- **FILE-002**: `src/main/monitoring/disk/DiskMonitor.test.ts` — тесты нормализации.
- **FILE-003**: `plan/fix-disk-volumes-1.md` — этот план.

## 6. Testing

- **TEST-001**: Одиночный объект `{DeviceID: 'C:', ...}` → один `DiskVolumeMetrics` с корректными полями.
- **TEST-002**: Массив из двух строк → два тома (регрессия существующего поведения).
- **TEST-003**: `null` → `[]`.
- **TEST-004**: Существующие тесты `DiskMonitor.read` (source OK / source throws) остаются зелёными.

## 7. Risks & Assumptions

- **RISK-001**: Другие мониторы (`MemoryMonitor` с деструктуризацией `[row]`, `SystemInfoMonitor`, `GpuMonitor`) имеют тот же single-object риск — вне скоупа, завести отдельный issue после фикса диска.
- **ASSUMPTION-001**: На машине пользователя ровно один фиксированный том `C:` (подтверждено выводом PowerShell выше).

## 8. Related Specifications / Further Reading

- ADR 0009 — источники метрик, Windows WMI, Unavailable вместо guess
- CONTEXT.md — Disk Volume (DriveType=3), Unavailable
- EPIC 4 (#21, closed) — страница Storage зависит от `snapshot.disks`
