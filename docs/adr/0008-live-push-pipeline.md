# Живые метрики: единый push-пайплайн (Live Snapshot) вместо per-card pull-циклов

EPIC 2 (SD-018). Спека требует «центральный планировщик в привилегированном слое, без отдельных polling-циклов на карточку», но зашедший в EPIC 1 виджет CPU делал pull-цикл в Renderer (`setTimeout` → `invoke('cpu:usage')`). Решили: Main-планировщик на одном такте собирает все живые метрики (CPU, RAM, диски, сеть, GPU util, температуры) и пушит их в Renderer единым пакетом **Live Snapshot** через `webContents.send`; Renderer подписывается один раз (`live:subscribe`) и не владеет каденсом. Статика остаётся pull (`cpu:info`, `system:info`), собирается редко и кэшируется.

## Considered Options

- **Оставить pull по Renderer-таймеру** (как сделано в EPIC 1): прямо противоречит #18 и размножает циклы на виджет; дельта CPU считалась бы по каденсу Renderer, а не Main.
- **Push отдельным каналом на метрику**: усложняет жизненный цикл подписок и backpressure; не нужен, раз есть один отрисующий потребитель.
- **Renderer тянет агрегат с единой точки**: оставляет владение каденсом в Renderer и риск «чат»ного рассинхрона; не даёт паузы при скрытии окна без кода в Renderer.

## Consequences

- Появляется push-транспорт: preload получает `onLiveSnapshot(cb) → off()` поверх `ipcRenderer.on`; до этого transport был только request/response (`invoke`). `IpcResult`/`IpcError` остаются только для pull; push несёт уже готовые типы ответов.
- Дельта CPU (и GPU util) считается в Main на собственном такте: CPU Utilization = среднее за интервал с прошлого такта Main, а не с прошлого pull-запроса Renderer (зафиксировано в CONTEXT.md).
- `live:subscribe({ intervalMs })` / `live:unsubscribe` — единственная точка владения каденсом; дефолт 1000 мс, валидация диапазона [500, 5000] в Main.
- Такт паузится при скрытии окна (Main слушает `BrowserWindow hide/show`) — минимизация фона из #18 без доверия к Renderer; подписка живёт на время подписки и освобождается при закрытии окна.
- Renderer отличает `Unavailable` (значения `null` от ОС) от `Stale` (timestamp старше `3 × intervalMs`) — новые термины в CONTEXT.md.
