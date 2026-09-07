import { describe, it, expect, vi, beforeEach } from 'vitest';

const psMock = vi.hoisted(() => ({
  runPowershell: vi.fn(),
  runPowershellJson: vi.fn(),
}));

vi.mock('./ps', () => psMock);

import { terminateProcess, resolveProcessName } from './processTerminator';

describe('processTerminator (node project)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('terminateProcess invokes Stop-Process -Force for the given pid', async () => {
    psMock.runPowershell.mockResolvedValueOnce('');
    await terminateProcess(4242);
    expect(psMock.runPowershell).toHaveBeenCalledWith(
      expect.stringContaining('Stop-Process -Id 4242 -Force')
    );
  });

  it('terminateProcess propagates shell failure (access denied etc.)', async () => {
    psMock.runPowershell.mockRejectedValueOnce(new Error('Отказано в доступе'));
    await expect(terminateProcess(4242)).rejects.toThrow('Отказано в доступе');
  });

  it('resolveProcessName returns the first row name', async () => {
    psMock.runPowershellJson.mockResolvedValueOnce([{ Name: 'chrome.exe' }]);
    const name = await resolveProcessName(4242);
    expect(name).toBe('chrome.exe');
    expect(psMock.runPowershellJson).toHaveBeenCalledWith(
      expect.stringContaining('ProcessId = 4242')
    );
  });

  it('resolveProcessName returns null when no process matches', async () => {
    psMock.runPowershellJson.mockResolvedValueOnce([]);
    const name = await resolveProcessName(4242);
    expect(name).toBeNull();
  });
});
