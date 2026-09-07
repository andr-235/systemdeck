import { BrowserWindow } from 'electron';
import { IPC_PUSH_CHANNELS } from '@shared/ipc/channels';
import type { CpuLiveMetrics, LiveSnapshot } from '@shared/ipc';
import { getLogger } from '../../logger';
import { CpuMonitor } from '../cpu/CpuMonitor';
import { MemoryMonitor } from '../memory/MemoryMonitor';
import { DiskMonitor } from '../disk/DiskMonitor';
import { NetworkMonitor } from '../network/NetworkMonitor';
import { GpuMonitor } from '../gpu/GpuMonitor';
import { TemperatureMonitor } from '../temperature/TemperatureMonitor';
import { ProcessMonitor } from '../process/ProcessMonitor';

export const MIN_INTERVAL_MS = 500;
export const MAX_INTERVAL_MS = 5000;
export const DEFAULT_INTERVAL_MS = 1000;
export const PROCESS_READ_INTERVAL_MS = 5000;

export type LiveSchedulerOptions = {
  window?: BrowserWindow;
  cpu?: CpuMonitor;
  memory?: MemoryMonitor;
  disks?: DiskMonitor;
  network?: NetworkMonitor;
  gpu?: GpuMonitor;
  temperatures?: TemperatureMonitor;
  processes?: ProcessMonitor;
};

type Sender = (channel: string, payload: unknown) => void;

/**
 * Центральный планировщик живых метрик (ADR 0008). Владеет тактом: собирает
 * все секции мониторов и пушит единый LiveSnapshot в Renderer. При скрытии/
 * минимизации окна такт паузится; при закрытии окна всё освобождается.
 */
export class LiveScheduler {
  private readonly window: BrowserWindow;
  private readonly cpu: CpuMonitor;
  private readonly memory: MemoryMonitor;
  private readonly disks: DiskMonitor;
  private readonly network: NetworkMonitor;
  private readonly gpu: GpuMonitor;
  private readonly temperatures: TemperatureMonitor;
  private readonly processes: ProcessMonitor;
  private send: Sender;

  private intervalMs = DEFAULT_INTERVAL_MS;
  private intervalTimer: NodeJS.Timeout | null = null;
  private processTimer: NodeJS.Timeout | null = null;
  private running = false;
  private subscribed = false;
  private ticking = false;
  private windowVisible = true;
  private lastSnapshotAt = 0;
  private readonly processReadIntervalMs: number;

  constructor(options: LiveSchedulerOptions = {}) {
    if (!options.window) throw new Error('LiveScheduler: window required');
    this.window = options.window;
    this.cpu = options.cpu ?? new CpuMonitor();
    this.memory = options.memory ?? new MemoryMonitor();
    this.disks = options.disks ?? new DiskMonitor();
    this.network = options.network ?? new NetworkMonitor();
    this.gpu = options.gpu ?? new GpuMonitor();
    this.temperatures = options.temperatures ?? new TemperatureMonitor();
    this.processes = options.processes ?? new ProcessMonitor();
    this.processReadIntervalMs = PROCESS_READ_INTERVAL_MS;
    this.send = this.window.webContents.send.bind(this.window.webContents);
  }

  subscribe(intervalMs: number): number {
    const validated = this.validateInterval(intervalMs);
    this.intervalMs = validated;
    this.subscribed = true;
    this.start();
    return validated;
  }

  unsubscribe(): void {
    this.subscribed = false;
    this.stop();
  }

  validateInterval(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_INTERVAL_MS;
    return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(value)));
  }

  setWindowVisible(visible: boolean): void {
    this.windowVisible = visible;
    if (visible) {
      this.start();
    } else {
      this.stop();
    }
  }

  /** @internal — только для тестов: заменяет отправитель. */
  setSenderForTest(sender: Sender): void {
    this.send = sender;
  }

  /** @internal — только для тестов: проверяет флаг работы планировщика. */
  isRunningForTest(): boolean {
    return this.running;
  }

  async dispose(): Promise<void> {
    this.stop();
  }

  private start(): void {
    if (this.running) return;
    if (!this.windowVisible) return;
    this.running = true;
    void this.tick().catch((error) =>
      getLogger('live').error('live tick failed', { error: String(error) })
    );
    this.intervalTimer = setInterval(() => {
      void this.tick().catch((error) =>
        getLogger('live').error('live tick failed', { error: String(error) })
      );
    }, this.intervalMs);
    this.intervalTimer.unref?.();
    // Подписанный рендерер после паузы (скрытие окна) возобновляет и медленный
    // цикл процессов: таймер был очищен в stop(), guard в startProcessLoop не мешает.
    if (this.subscribed) this.startProcessLoop();
  }

  private stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.clearProcessTimer();
  }

  private async tick(): Promise<void> {
    // In-flight guard: медленный тик (WMI-таймаут до 5с) не накапливается поверх
    // себя — очередные interval-тики просто пропускаются, пока не завершился текущий (SD-018).
    if (this.ticking) return;
    this.ticking = true;
    const logger = getLogger('live');
    try {
      const snapshot = await this.collectSnapshot();
      this.lastSnapshotAt = snapshot.timestamp;
      try {
        this.send(IPC_PUSH_CHANNELS.liveSnapshot, snapshot);
      } catch (error) {
        logger.error('live push failed', { error: String(error) });
      }
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Примитив свёртки Promise.allSettled: fulfilled → значение, rejected → fallback.
   * Fallback для секции означает Unavailable (пусто / null-части), не выдуманные
   * числа (ADR 0009).
   */
  private static settledOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
    return result.status === 'fulfilled' ? result.value : fallback;
  }

  private async collectSnapshot(): Promise<LiveSnapshot> {
    // CpuMonitor.getLive синхронный — отдельный try/catch вместо fake-promise
    let cpu: CpuLiveMetrics = { overall: null, perCore: [] };
    try {
      cpu = this.cpu.getLive();
    } catch (error) {
      getLogger('live').error('live cpu read failed', { error: String(error) });
    }
    const [memory, gpu] = await Promise.allSettled([
      this.memory.readMemoryWithSwap(),
      this.gpu.getLive(),
    ]);
    const [disks, network, temperatures] = await Promise.allSettled([
      this.disks.read(),
      this.network.read(),
      this.temperatures.getLive(),
    ]);

    const timestamp = Date.now();
    return {
      timestamp,
      cpu,
      memory: LiveScheduler.settledOr(memory, {
        total: null,
        used: null,
        available: null,
        percent: null,
        swap: null,
      }),
      disks: LiveScheduler.settledOr(disks, []),
      network: LiveScheduler.settledOr(network, []),
      gpu: LiveScheduler.settledOr(gpu, [{ utilization: null }]),
      temperatures: LiveScheduler.settledOr(temperatures, []),
    };
  }

  get lastSnapshotTimestamp(): number {
    return this.lastSnapshotAt;
  }

  /** Eager-probe температуры при старте Main (ADR 0009); ошибки уже внутри probe. */
  async probeTemperatures(): Promise<void> {
    await this.temperatures.probe().catch((error) => {
      getLogger('live').error('temperature probe failed', { error: String(error) });
    });
  }

  /** Запускает медленный цикл чтения процессов (не обязан тикать каждый такт Live). */
  startProcessLoop(): void {
    if (this.processTimer) return;
    const tick = (): void => {
      void this.readProcesses();
      this.processTimer = setTimeout(tick, this.processReadIntervalMs);
      this.processTimer.unref?.();
    };
    void this.readProcesses();
    this.processTimer = setTimeout(tick, this.processReadIntervalMs);
    this.processTimer.unref?.();
  }

  private clearProcessTimer(): void {
    if (this.processTimer) {
      clearTimeout(this.processTimer);
      this.processTimer = null;
    }
  }

  private async readProcesses(): Promise<void> {
    try {
      const snapshot = await this.processes.read();
      this.send(IPC_PUSH_CHANNELS.processSnapshot, snapshot);
    } catch (error) {
      getLogger('live').error('process read failed', { error: String(error) });
    }
  }
}
