import type { AppAPI } from '@shared/api';
import { SHARED_CONTRACT_VERSION } from '@shared/api';
import type { LiveSnapshot, ProcessEntry, ProcessSnapshot } from '@shared/ipc';

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
  };
}

export function makeLiveSnapshot(overrides: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return { ...emptyLiveSnapshot, ...overrides };
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
