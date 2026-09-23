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
Отдельный медленный push-пакет (интервал ~5 с) списка процессов: `pid`, `name`, `cpuPercent`, `workingSetBytes`, `execPath`, `protected`. Не входит в Live Snapshot из-за объёма; `execPath` может быть `null` для чужих/привилегированных процессов без прав администратора. `cpuPercent` — дельта с предыдущим сэмплом (ADR 0012); `null` (Unavailable, прочерк в UI), когда дельты нет (первый сэмпл после старта, сброс счётчиков WMI).
_Avoid_: Process list (как контракт), Processes

**Process Working Set**:
Резидентная физическая память процесса в байтах — поле `workingSetBytes` в ProcessEntry (из WMI `WorkingSetSize`). Не виртуальная и не private память; в UI отображается как «Память».
_Avoid_: Process memory, RAM (как синоним поля контракта)

**Protected Process**:
Процесс, помеченный в Main флагом `protected: true`. Классификация — по имени из хардкод-списка системных процессов в Main (ADR 0011); намеренно НЕ включает владельца/сессию и процессы антивирусов — это осознанная граница первого шага. Renderer только читает флаг и блокирует «Завершить». Никогда не решается на стороне Renderer.
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

## Storage

**Scan**:
Одноразовая read-only операция обхода фиксированного тома (Disk Volume), выполняемая в Main по `storage:scan:start`. Один активный Scan за раз (повторный start — `SCAN_ALREADY_ACTIVE`); отменяется по `storage:scan:cancel`. Ничего не изменяет — только читает атрибуты.
_Avoid_: Analyze, Disk scan, Rescan (режим операции — это повторный Scan)

**Scan Result**:
Агрегированный результат завершившегося Scan: дерево Directory Node, Largest Files и сводка по File Type Category. Lean — не содержит per-file дерева; хранится в Main на сессию на том (кэш), доставляется терминальным push-событием прогресса и читается через `storage:scan:get`. Не путать с Snapshot: Live/Process Snapshot — периодические push-пакеты, Scan Result — итог долгой операции.
_Avoid_: Snapshot (для результата скана), Storage snapshot, Scan data

**Directory Node**:
Узел агрегированного дерева каталогов в Scan Result: имя, размер (сумма по содержимому и потомкам), счётчик файлов, флаг Inaccessible Directory. Файлы узлами не представляются — только каталоги.
_Avoid_: Folder (в контракте), Directory entry, Tree node

**File Type Category**:
Категория файла по расширению (Documents, Images, Video, Audio, Archives, Installers, Code, System, Other). Присваивается в Main по хардкод-таблице расширений (как список Protected Process); Renderer классификацию не выполняет и получает готовые строки.
_Avoid_: File type (как синоним категории), Extension group

**Largest Files**:
Список 100 самых больших файлов тома из последнего Scan Result (путь, размер, категория), собираемый top-100 heap'ом в Main на одном проходе. Константа v1, без UI-настройки.
_Avoid_: Top files, Biggest files, Largest file list

**Reparse Point**:
Junction или symlink в файловой системе. Сканер никогда по нему не обходит: ссылка учитывается без обхода цели, размер цели не считается — политика против циклов и непредсказуемого времени скана.
_Avoid_: Symlink, Junction (как отдельные термины политики)

**Inaccessible Directory**:
Свойство Directory Node: доступ к каталогу запрещён, содержимое не собрано. Скан не аборится — узел помечается, учитывается в счётчике недоступных папок, визуализация не трактует его как «пусто».
_Avoid_: Access denied (как свойство результата), Skipped directory

## Agent Skills

**Agent**:
Автономный исполнитель, работающий по `ready-for-agent` через `gh` (issue → PR). Владеет только триажем/имплементацией в границах `Main`/`Preload`/`Renderer`/`Shared`.
_Avoid_: Bot, Copilot (как синоним роли)

**Skill**:
Версионируемый пакет инструкций (`SKILL.md` + запись в `skills-lock.json`), устанавливаемый через `npx skills add`. Не рантайм.
_Avoid_: Plugin, Extension

**Instruction**:
Постоянный системный промпт (`AGENTS.md` / `.github/copilot-instructions.md`), задающий инварианты проекта.
_Avoid_: Prompt, System message
