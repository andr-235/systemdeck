/**
 * Application API — явная поверхность window.api.
 * SD-002: минимальный контракт без runtime Electron/Node, расширяется в SD-003.
 * Shared содержит только типы и строковые константы, импортируется Main/Preload/Renderer.
 */
export interface AppAPI {
  // SD-003 добавит методы, например: ping: () => Promise<{ ok: true }>
}

export const SHARED_CONTRACT_VERSION = 'sd-002' as const
