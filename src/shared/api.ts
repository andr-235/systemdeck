/**
 * Application API — явная поверхность window.api.
 * Shared содержит только типы и строковые константы, импортируется Main/Preload/Renderer.
 * Живые метрики приходят push-ом (onLiveSnapshot/onProcessSnapshot, ADR 0008);
 * статическая информация и протокол подписки — request/response invoke.
 */
import type {
  IpcResultFor,
  CleanerCancelRequest,
  CleanerDeleteRequest,
  CleanerPreviewRequest,
  CleanupProgressEvent,
  LiveSnapshot,
  LiveSubscribeRequest,
  PingRequest,
  ProcessSnapshot,
  ReportRendererErrorRequest,
  ScanProgressEvent,
  StorageScanStartRequest,
} from './ipc/contracts';
import { IPC_CHANNELS } from './ipc/channels';

export interface CpuInfoApi {
  getInfo: () => Promise<IpcResultFor<typeof IPC_CHANNELS.cpuInfo>>;
}

export interface SystemInfoApi {
  getInfo: () => Promise<IpcResultFor<typeof IPC_CHANNELS.systemInfo>>;
}

export interface GpuInfoApi {
  getInfo: () => Promise<IpcResultFor<typeof IPC_CHANNELS.gpuInfo>>;
}

export interface LiveApi {
  subscribe: (
    request: LiveSubscribeRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.liveSubscribe>>;
  unsubscribe: () => Promise<IpcResultFor<typeof IPC_CHANNELS.liveUnsubscribe>>;
}

export type Unsubscribe = () => void;

export interface AppAPI {
  ping: (request: PingRequest) => Promise<IpcResultFor<typeof IPC_CHANNELS.ping>>;
  reportRendererError: (
    request: ReportRendererErrorRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.reportRendererError>>;
  cpu: CpuInfoApi;
  system: SystemInfoApi;
  gpu: GpuInfoApi;
  live: LiveApi;
  terminateProcess: (pid: number) => Promise<IpcResultFor<typeof IPC_CHANNELS.processTerminate>>;
  onLiveSnapshot: (callback: (snapshot: LiveSnapshot) => void) => Unsubscribe;
  onProcessSnapshot: (callback: (snapshot: ProcessSnapshot) => void) => Unsubscribe;
  storage: StorageApi;
  cleaner: CleanerApi;
}

export interface StorageApi {
  startScan: (
    request: StorageScanStartRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.storageScanStart>>;
  getScanResult: (volumeId: string) => Promise<IpcResultFor<typeof IPC_CHANNELS.storageScanGet>>;
  cancelScan: () => Promise<IpcResultFor<typeof IPC_CHANNELS.storageScanCancel>>;
  onScanProgress: (callback: (event: ScanProgressEvent) => void) => Unsubscribe;
}

/** Cleaner (ADR 0017): preview по категориям, удаление только по ID сессии, push-прогресс. */
export interface CleanerApi {
  preview: (
    request: CleanerPreviewRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.cleanerPreview>>;
  delete: (
    request: CleanerDeleteRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.cleanerDelete>>;
  cancel: (
    request: CleanerCancelRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.cleanerCancel>>;
  onProgress: (callback: (event: CleanupProgressEvent) => void) => Unsubscribe;
}

export const SHARED_CONTRACT_VERSION = 'sd-023' as const;
