export const IPC_CHANNELS = {
  ping: 'systemdeck:ping',
  reportRendererError: 'systemdeck:renderer-error',
  cpuInfo: 'systemdeck:cpu:info',
  cpuUsage: 'systemdeck:cpu:usage',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
