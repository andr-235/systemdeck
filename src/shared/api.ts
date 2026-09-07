/**
 * Application API — явная поверхность window.api.
 * SD-012: ping — внутренний health/contract-drift чек (без UI), см. issue #26; ping
 * несёт ожидаемую версию контракта, Main сверяет с SHARED_CONTRACT_VERSION.
 * Shared содержит только типы и строковые константы, импортируется Main/Preload/Renderer.
 */
import type { IpcResultFor, PingRequest, ReportRendererErrorRequest } from './ipc/contracts';
import { IPC_CHANNELS } from './ipc/channels';

export interface CpuApi {
  getInfo: () => Promise<IpcResultFor<typeof IPC_CHANNELS.cpuInfo>>;
  getUsage: () => Promise<IpcResultFor<typeof IPC_CHANNELS.cpuUsage>>;
}

export interface AppAPI {
  ping: (request: PingRequest) => Promise<IpcResultFor<typeof IPC_CHANNELS.ping>>;
  reportRendererError: (
    request: ReportRendererErrorRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.reportRendererError>>;
  cpu: CpuApi;
}

export const SHARED_CONTRACT_VERSION = 'sd-012' as const;
