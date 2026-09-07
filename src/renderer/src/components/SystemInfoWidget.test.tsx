import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SystemInfoWidget from './SystemInfoWidget';
import { setMockApi } from '../test-utils';
import type { SystemInfoResponse } from '@shared/ipc';

const systemOk: SystemInfoResponse = {
  osName: 'Windows',
  osVersion: '10.0.22631',
  osBuild: '22631',
  hostname: 'pc-1',
  uptimeSeconds: 7200,
  arch: 'x64',
  manufacturer: null,
  systemModel: null,
  motherboardManufacturer: null,
  motherboardProduct: null,
  installedRamBytes: 8589934592,
};

describe('Renderer — SystemInfoWidget (jsdom project)', () => {
  beforeEach(() => {
    setMockApi({
      getSystemInfo: async () => ({ ok: true as const, data: systemOk }),
      getCpuInfo: async () => ({
        ok: true as const,
        data: { model: 'Model X', clockMhz: 2400, logicalCores: 8, physicalCores: null },
      }),
    });
  });

  it('renders static OS/hardware info from pull api', async () => {
    render(<SystemInfoWidget />);

    await waitFor(() => expect(screen.getByText('Windows')).toBeInTheDocument());

    expect(screen.getByText('pc-1')).toBeInTheDocument();
    expect(screen.getByText('2 ч 0 мин')).toBeInTheDocument();
    expect(screen.getByText('Model X')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });
});
