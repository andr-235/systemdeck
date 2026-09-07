# SystemDeck

Настольное приложение Electron для системного мониторинга. Первый контекст — Shell с Dashboard (карточка CPU); язык расширяется по мере появления панелей/виджетов.

## Language

**SystemDeck**:
Настольное приложение Electron как продукт.
_Avoid_: Deck, Board, Dashboard (для продукта)

**Main**:
Главный процесс Node, владеет жизненным циклом окна и приложения.
_Avoid_: Backend, Server

**Preload**:
Изолированный мост между Main и Renderer, единственное место с `contextBridge`.
_Avoid_: Bridge, IPC layer (как синоним)

**Renderer**:
Процесс UI на React, выполняется в браузере без доступа к Node API.
_Avoid_: Frontend, Client, UI layer (как синоним)

**Shell**:
Оболочка приложения SystemDeck: шапка (заголовок продукта) и область Dashboard. Первое состояние при запуске; не содержит бизнес-логики метрик.
_Avoid_: UI chrome, App frame, Window chrome

**Dashboard**:
Страница SystemDeck, живущая в Shell: здесь размещаются карточки метрик (сейчас — карточка CPU). Это UI-страница, а не синоним продукта.
_Avoid_: Dashboard (как синоним продукта), Metrics page

**Shared**:
Кросс-слойные контракты без runtime-зависимостей от Electron/Node — типы и константы, импортируемые Main, Preload и Renderer.
_Avoid_: Common, Shared Types (как отдельный термин), Cross-layer Contracts (как синоним)

**Application API**:
Явная поверхность, которую Preload прокидывает в Renderer через `contextBridge` как `window.api`.
_Avoid_: Preload API, Bridge API, Electron API (для продукта)

**Privileged API**:
Любой импорт `electron` / `node:*` / `fs` / `path` и доступ к `BrowserWindow`, `ipcMain` — разрешён только в Main и Preload.
_Avoid_: Node API, Electron API (как обобщённый термин)

**IPC Channel**:
Каноническая строковая константа с префиксом `systemdeck:` из `Shared` (`IPC_CHANNELS`), единственный идентификатор вызова между Renderer и Main.
_Avoid_: Channel name, Event name, IPC string

**IPC Contract**:
Типизированная карта в `Shared` `channel -> { request, response }` (`IpcContracts`), единственный источник правды для Preload и Main.
_Avoid_: Channel type, IPC type, Request/Response type (как обобщённый термин)

**IPC Result**:
Дискриминированное объединение `{ ok: true; data } | { ok: false; error: IPC Error }` — единственная форма ответа IPC.
_Avoid_: IPC response, Result wrapper, Either

**IPC Error**:
Безопасная сериализуемая ошибка `{ code, message }` без `stack`/`cause`; полный текст логируется только в Main.
_Avoid_: Serialized error, IPC exception

**Application Log**:
Структурированный JSON-lines файл в `userData/logs/systemdeck.log`, принадлежит Main и является единственным источником диагностики.
_Avoid_: File log, Electron log

**Error Boundary**:
Верхнеуровневая React-граница в Renderer вокруг `<App />`, ловит ошибки рендера и репортит их в Main через Application API.
_Avoid_: Catch boundary, Fallback UI

**Log Redaction**:
Правило Application Log заменять значения ключей `password|token|secret|key|auth|credential` на `[REDACTED]` перед записью.
Сканируются только имена ключей: секрет внутри значения строки (например в `message` или URL) не детектится — осознанный компромисс против ложных срабатываний.
_Avoid_: Sanitization, Masking

**Live Snapshot**:
Единый пакет всех текущих живых метрик (CPU, RAM, диски, сеть, GPU util, температуры) с `timestamp`, который Main-планировщик пушит в Renderer одним push-событием на каждом такте. Единственный источник живых данных для Dashboard. Не путать с CPU Snapshot (внутреннее чтение тиков).
_Avoid_: Snapshot (без уточнения), Telemetry Frame, Metric Batch

**Process Snapshot**:
Отдельный медленный push-пакет (интервал ~5 с) списка процессов: `pid`, `name`, `cpuPercent`, `memBytes`, `execPath`, `protected`. Не входит в Live Snapshot из-за объёма; `execPath` может быть `null` для чужих/привилегированных процессов без прав администратора.
_Avoid_: Process list (как контракт), Processes

**Protected Process**:
Процесс, помеченный в Main флагом `protected: true` (система/привилегированный процесс). Классификация — источник правды в Main; Renderer только читает флаг и блокирует «Завершить». Никогда не решается на стороне Renderer.
_Avoid_: System process (как решение клиента), Protected (без уточнения)

**Process Termination**:
Деструктивная операция Main, выполняемая по invoke-каналу `systemdeck:process:terminate` (`Stop-Process -Force`). Renderer никогда не инициирует её напрямую: сначала явное подтверждение пользователем, затем Main выполняет и логирует в Application Log. Результат — `IpcResult`.
_Avoid_: Kill, End process (как контракт)

**System Information**:
Статический pull-контракт `system:info`: Windows версия/build, hostname, uptime, архитектура, производитель/модель платы, установленная RAM. Собирается один раз и кэшируется на сессию в Main.
_Avoid_: OS info, System info (как синоним контракта)

**Live Subscription**:
Протокол «подписка»: Renderer вызывает `live:subscribe({ intervalMs })`, Main начинает слать Live Snapshot по такту и останавливается по `live:unsubscribe`; такт паузится при скрытии окна. Единственная точка владения каденсом — Main.
_Avoid_: Polling, Watcher, Ticker

## Monitoring

**CPU Info**:
Статическая, редко меняющаяся информация о процессоре: модель, тактовая частота, число логических и физических ядер. Снимается редко и кэшируется в Main.
_Avoid_: CPU hardware info, CPU spec, CPU static

**CPU Utilization**:
Текущая загрузка процессора в процентах. Считается как дельта тиков между двумя последовательными CPU Snapshots, поэтому усредняется за время с прошлого такта сэмплирования Main (а не с прошлого запроса Renderer — Live Snapshot).
_Известное исключение_: IPC-канал и методы Application API названы `cpu:usage`/`getUsage()` (ADR 0006) — «usage» здесь именование шины/API, а не синоним термина; в EPIC 2 pull-метод удаляется (ADR 0008).
_Avoid_: CPU load

**CPU Snapshot**:
Мгновенный замер тиков CPU (`user/nice/sys/idle/irq`) по каждому логическому ядру в момент времени. Пара последовательных снапшотов даёт CPU Utilization.
_Avoid_: CPU sample, CPU times snapshot

**Logical Core**:
Вычислительный поток, который видит ОС (гипертрединг). Число логических ядер = `os.cpus().length`; по ним же считаются тики.
_Avoid_: Core (без уточнения), hardware thread

**Physical Core**:
Физический вычислительный блок процессора. На Windows получается через WMI `Win32_Processor.NumberOfCores` однократно и кэшируется; при недоступности — Unavailable.
_Avoid_: CPU core, hardware core

**Unavailable**:
Значение `null` для поля метрики, которое платформа или железо не предоставляет. Никогда не выдумывается и не считается по аналогии.
_Avoid_: Not supported, n/a, missing (как синоним)

**Memory**:
RAM-секция Live Snapshot: `total`, `used`, `available`, `percent` в байтах/процентах, считаемые из `os.totalmem/freemem` в Main. Swap — отдельная null-абельная подсекция из WMI `Win32_OperatingSystem`, при отсутствии pagefile — `null`.
_Avoid_: RAM metrics, Memory usage

**Disk Volume**:
Локальный фиксированный том (DriveType=3): `id` (буква), `name`, `fileSystem`, `total`, `used`, `free`, `percent` в байтах/процентах. Removable/сетевые/оптические не показываются. Источник — WMI `Win32_LogicalDisk`.
_Avoid_: Drive, Partition, Disk (без уточнения)

**Network Interface**:
Активный сетевой адаптер с `rxBytesPerSec`/`txBytesPerSec`, полученных из rate-счётчиков PDH `Network Interface`. Виртуальные адаптеры (Hyper-V/WSL/VPN) с нулевой активностью скрываются.
_Avoid_: NIC, Adapter, Net iface

**GPU Adapter**:
Статический GPU из WMI `Win32_VideoController`: имя, вендор, выделенная/разделяемая память, версия драйвера. Pull-контракт, отделён от живых метрик. На гибридных ноутбуках — список из нескольких адаптеров.
_Avoid_: VideoCard, Graphics card, GPU (без уточнения)

**GPU Utilization**:
Живой процент загрузки GPU из rate-счётчиков PDH `GPU Engine` (дельта двух сэмплов, движок 3D). `null` (Unavailable), когда счётчики недоступны (нет WDDM 2.x).
_Avoid_: GPU load, GPU usage

**Temperature**:
Значение температуры сенсора в градусах Цельсия (`sensor`, `valueC`). В v0.1 заполняется только если стартовый probe в Main нашёл доступный источник без прав администратора; иначе секция пуста — никогда не выдаётся `0°C`. `MSAcpi_ThermalZoneTemperature` требует elevation, LibreHardwareMonitor — драйвер, поэтому по умолчанию пусто.
_Avoid_: Temp, CPU temp (как единственный термин)

**Stale**:
Состояние виджета, когда live-данных ещё были, но `timestamp` последнего Live Snapshot старше порога (`3 × intervalMs`) — поток прервался. Отличается от Unavailable (нет данных от ОС) и от error (подписка не поднялась).
_Avoid_: Outdated, Frozen, Offline
