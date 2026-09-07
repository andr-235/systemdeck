# Источник CPU-метрик — нативный `os.cpus()` вместо `systeminformation`

Контекст — SD-010 требовал CPU-сервис (overall/per-core utilization, ядра, модель, тактовая) без угадывания недоступных полей и с низким overhead. Выбрали нативный `os.cpus()`: тики `user/nice/sys/idle/irq` по каждому логическому ядру, utilization считается как дельта между двумя последовательными CPU Snapshot в Main (`src/main/monitoring/cpu/CpuMonitor.ts`), статика (`model`/`speed`) из того же вызова + `os.cpus().length` для логических ядер, физические — однократный WMI `Win32_Processor.NumberOfCores` с кэшем и `null` при отказе (термин Unavailable, `CONTEXT.md`). Отдельный `systemdeck:cpu:usage` возвращает `{ overall: number|null, perCore: (number|null)[], timestamp }`, первый вызов — `null` (ленивый базлайн).

## Considered Options

- `systeminformation` — богат, но его `currentLoad()` под нами это та же дельта `os.cpus()` с обвязкой и местами выдуманными значениями под Windows; тяжёлая зависимость для одного сервиса.
- Нативная библиотека (Rust/native addon) — избыточно для v0.1 и ломает простоту сборки `electron-builder`.
- WMI `Win32_Processor.LoadPercentage` для live-метрик — медленный вызов на каждый тик, не даёт per-core; использован только один раз для статики (физические ядра).
- Один канал `cpu:*` со статикой и live вместе — отклонён: статика снимается редко и кэшируется, дельта-расчёт требует отдельного вызова; разъединение совпадает с acceptance "static separated from live metrics".

## Consequences

- `src/shared` остаётся без новых зависимостей; `@shared` типы расширяются двумя каналами `systemdeck:cpu:info`/`systemdeck:cpu:usage` в рамках `IpcContracts`.
- Overhead на тик — один `os.cpus()` (~мкс вместо мс), WMI вызывается максимум один раз за жизнь приложения (или никогда при отказе).
- Renderer дёргает с нужным ему интервалом; частота/пайплайн — территория SD-018, состояние дельты живёт строго в Main.
- `model` может быть пустой строкой на некоторых Windows-конфигурациях — норма, не `null`; частота из `os.cpus().speed` номинальная, а не текущая, — сознательно не выдаём её как live.
