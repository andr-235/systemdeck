# Источники метрик — нативные Windows WMI/PDH-счётчики, без сторонних библиотек

EPIC 2 (SD-011…SD-017). Нужны источники для RAM, дисков, сети, GPU, температур, системной информации и списка процессов. Решили: без сторонних npm-библиотек мониторинга (`systeminformation` и т.п.) и без нативных аддонов — только Node API (`os`, `fs.statfs`) и WMI/PDH через `Get-CimInstance` / `Get-Counter` как дочерний PowerShell-процесс. Все источники читаются без прав администратора, кроме температуры (особый случай, ADR 0010).

## Considered Options

- **npm `systeminformation` (или аналог)**: тянет в проект чужой привилегированный слой, скрывает реальные источники, дублирует выборку, которую мы и так делаем точечно; нестабильно под `sandbox`/`contextIsolation`.
- **Нативные аддоны (node-ffi, N-API)**: сложность сборки под electron-rebuild, риск при sandbox.
- **`wmic` (CLI)**: устарел и медлен, заменитель — `Get-CimInstance`.

## Consequences

- RAM: `os.totalmem/freemem`; swap — `Win32_OperatingSystem` (виртуальная память) раз за сессию/по такту, при отсутствии pagefile — `null`.
- Диски: `Win32_LogicalDisk WHERE DriveType=3` (фиксированные), поля `DeviceID/Size/FreeSpace/FileSystem/VolumeName`, `used = Size - FreeSpace`; removable/сетевые не показываются.
- Сеть: rate-счётчики PDH `Network Interface` (`Bytes Received/Sent per sec`) — уже скорость, не накапливающийся счётчик; неактивные адаптеры скрываются.
- GPU статика: `Win32_VideoController` (имя/вендор/память/драйвер); GPU util — PDH `GPU Engine` (counter rate-типа, CookedValue уже процент, это дельта двух сэмплов PDH на такте Main; инстансы счётчика не несут тип движка 3D/Copy — по адаптеру берётся максимум по движкам). Адаптеры различаются по LUID из имени инстанса (`luid_0x…`), физические движки — суффиксом `_phys_0`; лайв-секция `gpu` — по одной записи на адаптер в порядке возрастания LUID (совпадает с нумерацией GPU в PDH/Task Manager), что соответствует индексации `gpu:info`. При недоступности счётчиков — `Unavailable` (`null`), не падение.
- Процессы: `Win32_Process` (PID/имя/`WorkingSetSize`/`UserModeTime`+`KernelModeTime`); CPU% — дельта на такте Main; `ExecutablePath` может быть `null` для чужих процессов без прав администратора — не роняет весь список.
- Системная инфа: `Win32_OperatingSystem`/`Win32_ComputerSystem`/`Win32_BaseBoard`, кэшируется на сессию в `system:info`.
- Powershell-спавн дорог: живые метрики с его участием — только там, где нет Node-эквивалента; задачи на такте выполняются вне основного цикла, результаты кэшируются.
