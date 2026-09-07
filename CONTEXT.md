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

## Monitoring

**CPU Info**:
Статическая, редко меняющаяся информация о процессоре: модель, тактовая частота, число логических и физических ядер. Снимается редко и кэшируется в Main.
_Avoid_: CPU hardware info, CPU spec, CPU static

**CPU Utilization**:
Текущая загрузка процессора в процентах. Считается как дельта тиков между двумя последовательными CPU Snapshots, поэтому усредняется за время, прошедшее между запросами.
_Известное исключение_: IPC-канал и методы Application API названы `cpu:usage`/`getUsage()` (ADR 0006) — «usage» здесь именование шины/API, а не синоним термина.
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
