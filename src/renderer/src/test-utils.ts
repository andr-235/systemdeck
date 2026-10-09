import type { AppAPI } from '@shared/api';
import { SHARED_CONTRACT_VERSION } from '@shared/api';
import type {
  CleanerPreviewResponse,
  CleanupPreviewCandidate,
  CleanupProgressEvent,
  CleanupReport,
  LiveSnapshot,
  ProcessEntry,
  ProcessSnapshot,
} from '@shared/ipc';

type MockApiOverrides = Partial<{
  ping: AppAPI['ping'];
  reportRendererError: AppAPI['reportRendererError'];
  getCpuInfo: AppAPI['cpu']['getInfo'];
  getSystemInfo: AppAPI['system']['getInfo'];
  getGpuInfo: AppAPI['gpu']['getInfo'];
  subscribe: AppAPI['live']['subscribe'];
  unsubscribe: AppAPI['live']['unsubscribe'];
  onLiveSnapshot: AppAPI['onLiveSnapshot'];
  onProcessSnapshot: AppAPI['onProcessSnapshot'];
  terminateProcess: AppAPI['terminateProcess'];
  startScan: AppAPI['storage']['startScan'];
  getScanResult: AppAPI['storage']['getScanResult'];
  cancelScan: AppAPI['storage']['cancelScan'];
  onScanProgress: AppAPI['storage']['onScanProgress'];
  cleanerPreview: AppAPI['cleaner']['preview'];
  cleanerDelete: AppAPI['cleaner']['delete'];
  cleanerCancel: AppAPI['cleaner']['cancel'];
  cleanerOnProgress: AppAPI['cleaner']['onProgress'];
}>;

export const emptyLiveSnapshot: LiveSnapshot = {
  timestamp: 0,
  cpu: { overall: null, perCore: [] },
  memory: { total: 0, used: 0, available: 0, percent: 0, swap: null },
  disks: [],
  network: [],
  gpu: [{ utilization: null }],
  temperatures: [],
};

export function setMockApi(overrides: MockApiOverrides = {}): void {
  const apiWindow = window as unknown as { api: AppAPI };
  apiWindow.api = {
    ping:
      overrides.ping ??
      (async () => ({
        ok: true as const,
        data: { version: SHARED_CONTRACT_VERSION, matched: true },
      })),
    reportRendererError:
      overrides.reportRendererError ?? (async () => ({ ok: true as const, data: undefined })),
    cpu: {
      getInfo:
        overrides.getCpuInfo ??
        (async () => ({
          ok: true as const,
          data: { model: '', clockMhz: 0, logicalCores: 1, physicalCores: null },
        })),
    },
    system: {
      getInfo:
        overrides.getSystemInfo ??
        (async () => ({
          ok: true as const,
          data: {
            osName: '',
            osVersion: '',
            osBuild: '',
            hostname: '',
            uptimeSeconds: 0,
            arch: 'x64',
            manufacturer: null,
            systemModel: null,
            motherboardManufacturer: null,
            motherboardProduct: null,
            installedRamBytes: null,
          },
        })),
    },
    gpu: {
      getInfo:
        overrides.getGpuInfo ??
        (async () => ({
          ok: true as const,
          data: { adapters: [] },
        })),
    },
    live: {
      subscribe:
        overrides.subscribe ?? (async () => ({ ok: true as const, data: { intervalMs: 1000 } })),
      unsubscribe: overrides.unsubscribe ?? (async () => ({ ok: true as const, data: undefined })),
    },
    onLiveSnapshot:
      overrides.onLiveSnapshot ??
      (() => () => {
        /* noop */
      }),
    onProcessSnapshot:
      overrides.onProcessSnapshot ??
      (() => () => {
        /* noop */
      }),
    terminateProcess:
      overrides.terminateProcess ?? (async () => ({ ok: true as const, data: undefined })),
    storage: {
      startScan: overrides.startScan ?? (async () => ({ ok: true as const, data: undefined })),
      getScanResult: overrides.getScanResult ?? (async () => ({ ok: true as const, data: null })),
      cancelScan: overrides.cancelScan ?? (async () => ({ ok: true as const, data: undefined })),
      onScanProgress:
        overrides.onScanProgress ??
        (() => () => {
          /* noop */
        }),
    },
    cleaner: {
      preview:
        overrides.cleanerPreview ??
        (async () => ({
          ok: true as const,
          data: { sessionId: '', candidates: [], estimatedBytes: 0, sources: [], expiresAt: 0 },
        })),
      delete:
        overrides.cleanerDelete ?? (async () => ({ ok: true as const, data: { operationId: '' } })),
      cancel: overrides.cleanerCancel ?? (async () => ({ ok: true as const, data: undefined })),
      onProgress:
        overrides.cleanerOnProgress ??
        (() => () => {
          /* noop */
        }),
    },
  };
}

export function makeLiveSnapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return { ...emptyLiveSnapshot, ...overrides };
}

type RunningProgress = Extract<CleanupProgressEvent, { status: 'running' }>;
type TerminalProgress = Extract<
  CleanupProgressEvent,
  { status: 'completed' | 'cancelled' | 'failed' }
>;

/** Фабрика preview-ответа Cleaner для тестов рендерера (issue #59). */
export function makeCleanupPreview(
  overrides: Partial<CleanerPreviewResponse> = {}
): CleanerPreviewResponse {
  return {
    sessionId: 'session-1',
    candidates: [],
    estimatedBytes: 0,
    sources: [],
    expiresAt: Date.now() + 5 * 60_000,
    ...overrides,
  };
}

export function makePreviewCandidate(
  overrides: Partial<CleanupPreviewCandidate> = {}
): CleanupPreviewCandidate {
  return {
    id: 'c1',
    path: 'C:\\Temp\\a.tmp',
    sizeBytes: 1024,
    category: 'user-temp',
    mtimeMs: Date.now() - 24 * 60 * 60_000,
    ...overrides,
  };
}

export function makeCleanupReport(overrides: Partial<CleanupReport> = {}): CleanupReport {
  return { items: [], total: 0, deleted: 0, skipped: 0, failed: 0, freedBytes: 0, ...overrides };
}

export function makeRunningProgress(overrides: Partial<RunningProgress> = {}): RunningProgress {
  return {
    operationId: 'op-1',
    sessionId: 'session-1',
    status: 'running',
    phase: 'deleting',
    timestamp: Date.now(),
    processed: 0,
    total: 0,
    freedBytes: 0,
    ...overrides,
  };
}

export function makeTerminalProgress(
  status: 'completed' | 'cancelled' | 'failed',
  overrides: Partial<Omit<TerminalProgress, 'status'>> = {}
): TerminalProgress {
  return {
    status,
    operationId: 'op-1',
    sessionId: 'session-1',
    timestamp: Date.now(),
    report: makeCleanupReport(),
    ...overrides,
  };
}

export function makeProcessSnapshot(overrides: Partial<ProcessSnapshot> = {}): ProcessSnapshot {
  return { timestamp: 0, processes: [], ...overrides };
}

/** Общая фабрика записи процесса для тестов рендерера (избегаем дублирования имени/полей). */
export function makeProcessEntry(overrides: Partial<ProcessEntry> = {}): ProcessEntry {
  return {
    pid: 1,
    name: 'a.exe',
    cpuPercent: 0,
    workingSetBytes: 1024,
    execPath: null,
    protected: false,
    commandLine: null,
    threadCount: 1,
    creationTime: null,
    parentPid: null,
    ...overrides,
  };
}
