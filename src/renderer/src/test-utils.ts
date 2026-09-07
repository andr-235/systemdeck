import { SHARED_CONTRACT_VERSION, type AppAPI } from '@shared/api';

type MockApiOverrides = Partial<{
  ping: AppAPI['ping'];
  reportRendererError: AppAPI['reportRendererError'];
  getInfo: AppAPI['cpu']['getInfo'];
  getUsage: AppAPI['cpu']['getUsage'];
}>;

export function setMockApi(overrides: MockApiOverrides = {}): void {
  const apiWindow = window as unknown as { api: AppAPI };
  apiWindow.api = {
    ping:
      overrides.ping ??
      (async () => ({
        ok: true as const,
        data: { pong: true as const, contractVersion: SHARED_CONTRACT_VERSION, timestamp: 0 },
      })),
    reportRendererError:
      overrides.reportRendererError ?? (async () => ({ ok: true as const, data: undefined })),
    cpu: {
      getInfo:
        overrides.getInfo ??
        (async () => ({
          ok: true as const,
          data: { model: '', clockMhz: 0, logicalCores: 1, physicalCores: null },
        })),
      getUsage:
        overrides.getUsage ??
        (async () => ({
          ok: true as const,
          data: { overall: null, perCore: [null], timestamp: 0 },
        })),
    },
  };
}
