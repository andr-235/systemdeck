import { IPC_CHANNELS, type IpcChannel, IPC_PUSH_CHANNELS, type IpcPushChannel } from './channels';
import type { IpcResult } from './errors';

export type PingRequest = {
  version: string;
};

export type PingResponse = {
  version: string;
  matched: boolean;
};

export type ReportRendererErrorRequest = {
  scope: 'renderer' | 'preload';
  message: string;
  stack?: string;
  componentStack?: string;
};

export type ReportRendererErrorResponse = void;

// --- Live metrics (ADR 0008) -------------------------------------------------

export type CpuLiveMetrics = {
  overall: number | null;
  perCore: (number | null)[];
};

export type SwapMetrics = {
  total: number;
  used: number;
  percent: number;
};

export type MemoryMetrics = {
  total: number | null;
  used: number | null;
  available: number | null;
  percent: number | null;
  swap: SwapMetrics | null;
};

export type DiskVolumeMetrics = {
  id: string;
  name: string | null;
  fileSystem: string | null;
  total: number;
  used: number | null;
  free: number | null;
  percent: number | null;
};

export type NetworkInterfaceMetrics = {
  id: string;
  name: string;
  rxBytesPerSec: number;
  txBytesPerSec: number;
};

export type GpuUtilizationEntry = {
  utilization: number | null;
};

export type TemperatureEntry = {
  sensor: string;
  valueC: number;
};

/**
 * Live Snapshot — единый push-пакет всех живых метрик (ADR 0008).
 * Каждая секция допускает null-части (= Unavailable), но секции не отсутствуют.
 */
export type LiveSnapshot = {
  timestamp: number;
  cpu: CpuLiveMetrics;
  memory: MemoryMetrics;
  disks: DiskVolumeMetrics[];
  network: NetworkInterfaceMetrics[];
  gpu: GpuUtilizationEntry[];
  temperatures: TemperatureEntry[];
};

export type ProcessEntry = {
  pid: number;
  name: string;
  /** CPU% по дельте с предыдущим сэмплом; null (Unavailable), когда дельты нет
   *  (первый сэмпл, сброс счётчиков) — аналог первого CPU Snapshot (ADR 0012). */
  cpuPercent: number | null;
  /** Резидентная физическая память процесса (Working Set, Process Working Set). */
  workingSetBytes: number;
  execPath: string | null;
  /** Защищённый/системный процесс — блокирует завершение (классификация в Main). */
  protected: boolean;
  commandLine: string | null;
  threadCount: number;
  /** Epoch-ms запуска процесса; null, если платформа/привилегии не отдают. */
  creationTime: number | null;
  parentPid: number | null;
};

export type ProcessSnapshot = {
  timestamp: number;
  processes: ProcessEntry[];
};

export type ProcessTerminateRequest = {
  pid: number;
};

export type ProcessTerminateResponse = void;

// --- Static info (pull, cached in Main) ---------------------------------------

export type CpuInfoRequest = void;

export type CpuInfoResponse = {
  model: string;
  clockMhz: number;
  logicalCores: number;
  physicalCores: number | null;
};

export type SystemInfoRequest = void;

export type SystemInfoResponse = {
  osName: string;
  osVersion: string;
  osBuild: string;
  hostname: string;
  uptimeSeconds: number;
  arch: string;
  manufacturer: string | null;
  systemModel: string | null;
  motherboardManufacturer: string | null;
  motherboardProduct: string | null;
  installedRamBytes: number | null;
};

export type GpuInfoRequest = void;

export type GpuInfoAdapter = {
  name: string;
  vendor: string | null;
  dedicatedMemoryBytes: number | null;
  sharedMemoryBytes: number | null;
  driverVersion: string | null;
};

export type GpuInfoResponse = {
  adapters: GpuInfoAdapter[];
};

// --- Live subscription protocol (ADR 0008) ------------------------------------

export type LiveSubscribeRequest = {
  intervalMs?: number;
};

export type LiveSubscribeResponse = {
  intervalMs: number;
};

export type LiveUnsubscribeRequest = void;

export type LiveUnsubscribeResponse = void;

// --- Storage scan (ADR 0013) --------------------------------------------------

export type FileTypeCategory =
  | 'Documents'
  | 'Images'
  | 'Video'
  | 'Audio'
  | 'Archives'
  | 'Installers'
  | 'Code'
  | 'System'
  | 'Other';

export type LargestFileEntry = {
  path: string;
  name: string;
  sizeBytes: number;
  category: FileTypeCategory;
};

export type FileTypeTotal = {
  category: FileTypeCategory;
  sizeBytes: number;
  fileCount: number;
};

/** Узел дерева каталогов тома. sizeBytes — суммарный размер поддерева
 *  (принадлежащие файлу байты + байты дочерних каталогов). */
export type DirectoryNode = {
  name: string;
  path: string;
  sizeBytes: number;
  /** Байты файлов, принадлежащих непосредственно этому каталогу. */
  filesBytes: number;
  fileCount: number;
  /** Каталог недоступен для чтения (Access Denied) — поддерево не обходилось. */
  inaccessible: boolean;
  children: DirectoryNode[];
};

export type ScanResult = {
  volumeId: string;
  timestamp: number;
  durationMs: number;
  totalBytes: number;
  fileCount: number;
  inaccessibleDirectories: number;
  tree: DirectoryNode;
  largestFiles: LargestFileEntry[];
  typeTotals: FileTypeTotal[];
};

export type StorageScanStartRequest = {
  volumeId: string;
};

export type StorageScanStartResponse = void;

export type StorageScanGetRequest = {
  volumeId: string;
};

export type StorageScanGetResponse = ScanResult | null;

export type StorageScanCancelRequest = void;

export type StorageScanCancelResponse = void;

export type ScanProgressEvent =
  | {
      status: 'scanning';
      volumeId: string;
      scannedEntries: number;
      scannedBytes: number;
      inaccessibleDirectories: number;
      currentPath: string;
    }
  | { status: 'complete'; volumeId: string; result: ScanResult }
  | { status: 'cancelled'; volumeId: string }
  | { status: 'failed'; volumeId: string; message: string };

// --- Contract maps -------------------------------------------------------------

export type IpcContracts = {
  [K in IpcChannel]: K extends typeof IPC_CHANNELS.ping
    ? { request: PingRequest; response: PingResponse }
    : K extends typeof IPC_CHANNELS.reportRendererError
      ? { request: ReportRendererErrorRequest; response: ReportRendererErrorResponse }
      : K extends typeof IPC_CHANNELS.cpuInfo
        ? { request: CpuInfoRequest; response: CpuInfoResponse }
        : K extends typeof IPC_CHANNELS.systemInfo
          ? { request: SystemInfoRequest; response: SystemInfoResponse }
          : K extends typeof IPC_CHANNELS.gpuInfo
            ? { request: GpuInfoRequest; response: GpuInfoResponse }
            : K extends typeof IPC_CHANNELS.liveSubscribe
              ? { request: LiveSubscribeRequest; response: LiveSubscribeResponse }
              : K extends typeof IPC_CHANNELS.liveUnsubscribe
                ? { request: LiveUnsubscribeRequest; response: LiveUnsubscribeResponse }
                : K extends typeof IPC_CHANNELS.processTerminate
                  ? { request: ProcessTerminateRequest; response: ProcessTerminateResponse }
                  : K extends typeof IPC_CHANNELS.storageScanStart
                    ? {
                        request: StorageScanStartRequest;
                        response: StorageScanStartResponse;
                      }
                    : K extends typeof IPC_CHANNELS.storageScanGet
                      ? { request: StorageScanGetRequest; response: StorageScanGetResponse }
                      : K extends typeof IPC_CHANNELS.storageScanCancel
                        ? {
                            request: StorageScanCancelRequest;
                            response: StorageScanCancelResponse;
                          }
                        : never;
};

export type IpcPushContracts = {
  [K in IpcPushChannel]: K extends typeof IPC_PUSH_CHANNELS.liveSnapshot
    ? LiveSnapshot
    : K extends typeof IPC_PUSH_CHANNELS.processSnapshot
      ? ProcessSnapshot
      : K extends typeof IPC_PUSH_CHANNELS.storageScanProgress
        ? ScanProgressEvent
        : never;
};

// Helper to extract request/response for a channel with full type-safety
export type IpcRequest<K extends keyof IpcContracts> = IpcContracts[K]['request'];
export type IpcResponse<K extends keyof IpcContracts> = IpcContracts[K]['response'];
export type IpcResultFor<K extends keyof IpcContracts> = IpcResult<IpcResponse<K>>;
export type IpcPushPayload<K extends keyof IpcPushContracts> = IpcPushContracts[K];

// Compile-time check: every IpcChannel must be in IpcContracts
type _AssertAllChannelsHaveContract = IpcChannel extends keyof IpcContracts ? true : false;
const _assertAllChannelsHaveContract: _AssertAllChannelsHaveContract = true;
void _assertAllChannelsHaveContract;

// Compile-time check: every IpcPushChannel must be in IpcPushContracts
type _AssertAllPushChannelsHaveContract = IpcPushChannel extends keyof IpcPushContracts
  ? true
  : false;
const _assertAllPushChannelsHaveContract: _AssertAllPushChannelsHaveContract = true;
void _assertAllPushChannelsHaveContract;
