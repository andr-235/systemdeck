import { IPC_CHANNELS, type IpcChannel, IPC_PUSH_CHANNELS, type IpcPushChannel } from './channels';
import type { IpcError, IpcResult } from './errors';

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

// --- Cleaner engine (ADR 0017, issue #54) ----------------------------------------
// Источник кандидатов — только allow-правила движка в Main; Scan Result EPIC 4
// строго read-only и кандидатами не является. Удаление выполняет только Main.

export type CleanupCategory =
  'user-temp' | 'windows-temp' | 'recycle-bin' | 'thumbnail-cache' | 'browser-cache' | 'log-files';

export type CleanupCandidate = {
  path: string;
  sizeBytes: number;
  category: CleanupCategory;
  /** Флаг защищённости: защищённое никогда не попадает в кандидаты (REQ-004). */
  protected: boolean;
};

/** Исход удаления одного кандидата: успех, пропуск на валидации или ошибка. */
export type CleanupItemResult =
  | { path: string; outcome: 'deleted'; bytesFreed: number }
  | { path: string; outcome: 'skipped'; bytesFreed: 0; code: string }
  | { path: string; outcome: 'failed'; bytesFreed: 0; error: IpcError };

export type CleanupReport = {
  /** Per-item записи без скрытия частичных неуспехов; сводка сходится с их суммой. */
  items: CleanupItemResult[];
  total: number;
  deleted: number;
  skipped: number;
  failed: number;
  freedBytes: number;
};

// --- Cleaner IPC (ADR 0017, issue #55) -------------------------------------------
// Renderer передаёт только идентификаторы категорий и ID кандидатов действующей
// preview-сессии; raw path в запросах удаления отсутствует.

/** Кандидат preview-сессии: ID выдаёт Main, путь Renderer уже известен из превью. */
export type CleanupPreviewCandidate = {
  id: string;
  path: string;
  /** Оценочный размер байт на момент построения превью. */
  sizeBytes: number;
  category: CleanupCategory;
};

/** Статус источника (allow-корней одной категории) в ответе preview. */
export type CleanupPreviewSource = {
  category: CleanupCategory;
  /** ok — обход завершён; partial — есть недоступные каталоги; empty — кандидатов нет. */
  status: 'ok' | 'partial' | 'empty';
  candidateCount: number;
  estimatedBytes: number;
  inaccessibleDirectories: number;
};

export type CleanerPreviewRequest = {
  categories: CleanupCategory[];
};

export type CleanerPreviewResponse = {
  sessionId: string;
  candidates: CleanupPreviewCandidate[];
  /** Сумма оценочных байтов по всем кандидатам (не фактически освобождаемых). */
  estimatedBytes: number;
  sources: CleanupPreviewSource[];
  /** Epoch-ms истечения сессии; после — удаление невозможно (CLEAN_SESSION_NOT_FOUND). */
  expiresAt: number;
};

export type CleanerDeleteRequest = {
  sessionId: string;
  candidateIds: string[];
};

export type CleanerDeleteResponse = {
  /** Идентификатор операции: корреляция прогресса и идемпотентная отмена. */
  operationId: string;
};

export type CleanerCancelRequest = {
  operationId: string;
};

export type CleanerCancelResponse = void;

export type CleanupProgressEvent =
  | {
      operationId: string;
      sessionId: string;
      status: 'running';
      phase: 'validating' | 'deleting';
      timestamp: number;
      processed: number;
      total: number;
      freedBytes: number;
    }
  | {
      operationId: string;
      sessionId: string;
      status: 'completed' | 'cancelled' | 'failed';
      timestamp: number;
      /** Отчёт по фактически обработанным элементам; необработанные не входят в items. */
      report: CleanupReport;
    };

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
                        : K extends typeof IPC_CHANNELS.cleanerPreview
                          ? {
                              request: CleanerPreviewRequest;
                              response: CleanerPreviewResponse;
                            }
                          : K extends typeof IPC_CHANNELS.cleanerDelete
                            ? {
                                request: CleanerDeleteRequest;
                                response: CleanerDeleteResponse;
                              }
                            : K extends typeof IPC_CHANNELS.cleanerCancel
                              ? {
                                  request: CleanerCancelRequest;
                                  response: CleanerCancelResponse;
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
        : K extends typeof IPC_PUSH_CHANNELS.cleanerProgress
          ? CleanupProgressEvent
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
