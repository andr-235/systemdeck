/**
 * Application API — явная поверхность window.api.
 * SD-002: минимальный контракт без runtime Electron/Node, расширяется в SD-003.
 * Shared содержит только типы и строковые константы, импортируется Main/Preload/Renderer.
 */
import type { IpcResultFor } from './ipc/contracts';
import { IPC_CHANNELS } from './ipc/channels';

export interface AppAPI {
  ping: () => Promise<IpcResultFor<typeof IPC_CHANNELS.ping>>;
}

export const SHARED_CONTRACT_VERSION = 'sd-003' as const;
