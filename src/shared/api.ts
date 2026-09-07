/**
 * Application API — явная поверхность window.api.
 * SD-002: минимальный контракт без runtime Electron/Node, расширяется в SD-003.
 * Shared содержит только типы и строковые константы, импортируется Main/Preload/Renderer.
 */
import type { IpcResultFor, ReportRendererErrorRequest } from './ipc/contracts';
import { IPC_CHANNELS } from './ipc/channels';

export interface AppAPI {
  ping: () => Promise<IpcResultFor<typeof IPC_CHANNELS.ping>>;
  reportRendererError: (
    request: ReportRendererErrorRequest
  ) => Promise<IpcResultFor<typeof IPC_CHANNELS.reportRendererError>>;
}

export const SHARED_CONTRACT_VERSION = 'sd-003' as const;
