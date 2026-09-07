import { IPC_CHANNELS, type IpcChannel } from './channels';
import type { IpcResult } from './errors';

export type PingRequest = void;

export type PingResponse = {
  pong: true;
  contractVersion: string;
  timestamp: number;
};

export type ReportRendererErrorRequest = {
  scope: 'renderer' | 'preload';
  message: string;
  stack?: string;
  componentStack?: string;
};

export type ReportRendererErrorResponse = void;

export type CpuInfoRequest = void;

export type CpuInfoResponse = {
  model: string;
  clockMhz: number;
  logicalCores: number;
  physicalCores: number | null;
};

export type CpuUsageRequest = void;

export type CpuUsageResponse = {
  overall: number | null;
  perCore: (number | null)[];
  timestamp: number;
};

export type IpcContracts = {
  [K in IpcChannel]: K extends typeof IPC_CHANNELS.ping
    ? { request: PingRequest; response: PingResponse }
    : K extends typeof IPC_CHANNELS.reportRendererError
      ? { request: ReportRendererErrorRequest; response: ReportRendererErrorResponse }
      : K extends typeof IPC_CHANNELS.cpuInfo
        ? { request: CpuInfoRequest; response: CpuInfoResponse }
        : K extends typeof IPC_CHANNELS.cpuUsage
          ? { request: CpuUsageRequest; response: CpuUsageResponse }
          : never;
};

// Helper to extract request/response for a channel with full type-safety
export type IpcRequest<K extends keyof IpcContracts> = IpcContracts[K]['request'];
export type IpcResponse<K extends keyof IpcContracts> = IpcContracts[K]['response'];
export type IpcResultFor<K extends keyof IpcContracts> = IpcResult<IpcResponse<K>>;

// Compile-time check: every IpcChannel must be in IpcContracts
type _AssertAllChannelsHaveContract = IpcChannel extends keyof IpcContracts ? true : false;
const _assertAllChannelsHaveContract: _AssertAllChannelsHaveContract = true;
void _assertAllChannelsHaveContract;
