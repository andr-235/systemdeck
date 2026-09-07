# Судьба pull-API CPU: `getUsage` удаляется, `getInfo` остаётся

EPIC 2 (SD-018). В EPIC 1 был реализован pull: `window.api.cpu.getUsage()` по таймеру Renderer (`cpu:usage` через `invoke`). С переходом на push-пайплайн (ADR 0008) живая загрузка CPU уходит в Live Snapshot, а дельта считается в Main на такте планировщика. Второй путь к тем же данным оставлять нельзя — двойной источник правды и дрейф контрактов.

## Considered Options

- **Оставить оба (`cpu:usage` + Live Snapshot)**: быстрее на один шаг для smoke-теста, но два способа получить одно и то же, поддержка и тесты раздваиваются.
- **Удалить `getUsage` только на слое Renderer**: preload/Main всё равно тащат мёртвый контракт.
- **Удалить полностью** (выбрано): `IPC_CHANNELS.cpuUsage`, `getUsage`, `CpuMonitor.getUsage` и его тесты уходят; канал `cpu:info` остаётся как статика.

## Consequences

- `IpcContracts` больше не содержит `cpuUsage`; compile-time assertion заставляет обновить все потребители (handlers, preload, renderer, smoke).
- Дым-проба (`runSmokeProbe`) переводится с `cpu.getInfo` на проверку `system:info` + `ping`; диагностика api-поверхности остаётся на `hasApplicationApi()`.
- `CpuMonitor` сокращается до статической части (`getInfo`) и переиспользуется планировщиком в Main для дельты на такте; пульс такта владеет Main, Renderer ничего не опрашивает.
- CONTEXT.md: уточнено, что `cpu:usage`/`getUsage` — историческое именование шины (ADR 0006), pull-метод удалён (ADR 0008).
