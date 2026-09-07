export const IPC_CHANNELS = {
  ping: 'systemdeck:ping',
  reportRendererError: 'systemdeck:renderer-error',
  cpuInfo: 'systemdeck:cpu:info',
  systemInfo: 'systemdeck:system:info',
  gpuInfo: 'systemdeck:gpu:info',
  liveSubscribe: 'systemdeck:live:subscribe',
  liveUnsubscribe: 'systemdeck:live:unsubscribe',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * Push-каналы Main → Renderer (webContents.send / ipcRenderer.on).
 * Отделены от IPC_CHANNELS, т.к. это не request/response-каналы,
 * а однонаправленные события с батчами Live/Process Snapshot (ADR 0008).
 */
export const IPC_PUSH_CHANNELS = {
  liveSnapshot: 'systemdeck:push:live:snapshot',
  processSnapshot: 'systemdeck:push:process:snapshot',
} as const;

export type IpcPushChannel = (typeof IPC_PUSH_CHANNELS)[keyof typeof IPC_PUSH_CHANNELS];
