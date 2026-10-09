import { describe, expect, it } from 'vitest';
import { IPC_ERROR_CODES } from '@shared/ipc/errors';
import { buildRecyclePreview, clearRecycleVolume } from './recycleBin';
import { volumeLetter, type RecycleShell, type RecycleVolumeState } from './recycleShell';

type ShellState = {
  volumes?: string[];
  listError?: string;
  states?: Record<string, RecycleVolumeState>;
  clearErrors?: Record<string, string>;
};

/** Фейковый Shell с журналом вызовов: проверяет, что тронут только выбранный том. */
function fakeShell(state: ShellState = {}): {
  shell: RecycleShell;
  cleared: string[];
  queried: string[];
} {
  const cleared: string[] = [];
  const queried: string[] = [];
  const shell: RecycleShell = {
    listVolumes: async () => {
      if (state.listError !== undefined) {
        throw new Error(state.listError);
      }
      return state.volumes ?? ['C:\\'];
    },
    query: async (volumeRoot) => {
      queried.push(volumeRoot);
      return state.states?.[volumeRoot] ?? { ok: false, reason: 'нет данных по тому' };
    },
    clear: async (volumeRoot) => {
      cleared.push(volumeRoot);
      const error = state.clearErrors?.[volumeRoot];
      if (error !== undefined) {
        throw new Error(error);
      }
    },
  };
  return { shell, cleared, queried };
}

function measured(sizeBytes: number, itemCount: number): RecycleVolumeState {
  return { ok: true, sizeBytes, itemCount };
}

describe('recycle preview', () => {
  it('reports unavailable without touching the shell when the rules exclude recycle', async () => {
    const { shell, queried } = fakeShell({ states: { 'C:\\': measured(100, 1) } });
    const preview = await buildRecyclePreview(shell, []);
    expect(preview.candidates).toHaveLength(0);
    expect(preview.source).toMatchObject({ status: 'unavailable', candidateCount: 0 });
    expect(preview.source.reason).toContain('правила');
    expect(queried).toHaveLength(0);
  });

  it('reports unavailable when the shell cannot list volumes', async () => {
    const { shell } = fakeShell({ listError: 'WMI доступен только на Windows' });
    const preview = await buildRecyclePreview(shell);
    expect(preview.candidates).toHaveLength(0);
    expect(preview.source).toMatchObject({ status: 'unavailable', candidateCount: 0 });
    expect(preview.source.reason).toContain('WMI доступен только на Windows');
  });

  it('reports unavailable when the shell returns no fixed volumes', async () => {
    const { shell } = fakeShell({ volumes: [] });
    const preview = await buildRecyclePreview(shell);
    expect(preview.source).toMatchObject({ status: 'unavailable', candidateCount: 0 });
    expect(preview.source.reason).toContain('фиксированные тома');
  });

  it('reports unavailable when no volume could be measured', async () => {
    const { shell } = fakeShell({
      volumes: ['C:\\', 'D:\\'],
      states: {
        'C:\\': { ok: false, reason: 'hr=0x80004005' },
        'D:\\': { ok: false, reason: 'hr=0x80004005' },
      },
    });
    const preview = await buildRecyclePreview(shell);
    expect(preview.candidates).toHaveLength(0);
    expect(preview.source).toMatchObject({ status: 'unavailable', candidateCount: 0 });
  });

  it('distinguishes an empty recycle source from an unavailable one', async () => {
    const { shell } = fakeShell({
      states: {
        'C:\\': measured(0, 0),
        'D:\\': measured(0, 0),
      },
      volumes: ['C:\\', 'D:\\'],
    });
    const preview = await buildRecyclePreview(shell);
    expect(preview.candidates).toHaveLength(0);
    expect(preview.source).toMatchObject({ status: 'empty', candidateCount: 0, estimatedBytes: 0 });
    expect(preview.source.reason).toBeUndefined();
  });

  it('creates one aggregate candidate per non-empty volume with measured sizes', async () => {
    const { shell } = fakeShell({
      volumes: ['C:\\', 'D:\\'],
      states: { 'C:\\': measured(4096, 4), 'D:\\': measured(0, 0) },
    });
    const preview = await buildRecyclePreview(shell);
    expect(preview.candidates).toEqual([
      { path: 'C:\\$Recycle.Bin', sizeBytes: 4096, category: 'recycle-bin' },
    ]);
    expect(preview.source).toMatchObject({
      status: 'ok',
      candidateCount: 1,
      estimatedBytes: 4096,
    });
  });

  it('keeps a failed volume out of the candidates and marks the source partial', async () => {
    const { shell } = fakeShell({
      volumes: ['C:\\', 'D:\\'],
      states: { 'C:\\': measured(100, 1), 'D:\\': { ok: false, reason: 'Shell отклонил запрос' } },
    });
    const preview = await buildRecyclePreview(shell);
    expect(preview.candidates.map((candidate) => candidate.path)).toEqual(['C:\\$Recycle.Bin']);
    expect(preview.source).toMatchObject({ status: 'partial', candidateCount: 1 });
    expect(preview.source.reason).toContain('D:');
  });
});

describe('recycle deletion', () => {
  it('clears only the selected volume and reports measured freed bytes', async () => {
    const cleared: string[] = [];
    const queried: string[] = [];
    let emptied = false;
    const shell: RecycleShell = {
      listVolumes: async () => ['C:\\', 'D:\\'],
      query: async (root) => {
        queried.push(root);
        if (root !== 'C:\\') {
          return { ok: false, reason: 'том не запрашивался' };
        }
        return emptied ? measured(0, 0) : measured(900, 3);
      },
      clear: async (root) => {
        cleared.push(root);
        emptied = true;
      },
    };
    const item = await clearRecycleVolume('C:\\$Recycle.Bin', shell);
    expect(item).toEqual({ path: 'C:\\$Recycle.Bin', outcome: 'deleted', bytesFreed: 900 });
    expect(cleared).toEqual(['C:\\']);
    expect(queried).toEqual(['C:\\', 'C:\\']);
  });

  it('never touches the fs guard for a foreign path', async () => {
    const { shell, cleared, queried } = fakeShell();
    const item = await clearRecycleVolume('C:\\$Recycle.Bin\\$R123.doc', shell);
    expect(item).toEqual({
      path: 'C:\\$Recycle.Bin\\$R123.doc',
      outcome: 'skipped',
      bytesFreed: 0,
      code: IPC_ERROR_CODES.CLEAN_OUTSIDE_RULES,
    });
    expect(cleared).toEqual([]);
    expect(queried).toEqual([]);
  });

  it('fails without clearing when the before-measurement is unavailable', async () => {
    const { shell, cleared } = fakeShell({
      states: { 'C:\\': { ok: false, reason: 'нет прав на запрос' } },
    });
    const item = await clearRecycleVolume('C:\\$Recycle.Bin', shell);
    expect(item).toMatchObject({ outcome: 'failed', bytesFreed: 0 });
    if (item.outcome === 'failed') {
      expect(item.error.code).toBe(IPC_ERROR_CODES.CLEAN_SHELL_UNAVAILABLE);
      expect(item.error.message).toContain('нет прав на запрос');
    }
    expect(cleared).toEqual([]);
  });

  it('skips an already empty recycle volume without invoking the shell clear', async () => {
    const { shell, cleared } = fakeShell({ states: { 'C:\\': measured(0, 0) } });
    const item = await clearRecycleVolume('C:\\$Recycle.Bin', shell);
    expect(item).toEqual({
      path: 'C:\\$Recycle.Bin',
      outcome: 'skipped',
      bytesFreed: 0,
      code: IPC_ERROR_CODES.CLEAN_ENTRY_INVALID,
    });
    expect(cleared).toEqual([]);
  });

  it('keeps a shell clear failure as a per-item failure', async () => {
    const { shell, cleared } = fakeShell({
      states: { 'C:\\': measured(50, 1) },
      clearErrors: { 'C:\\': 'Отказано в доступе' },
    });
    const item = await clearRecycleVolume('C:\\$Recycle.Bin', shell);
    expect(item).toMatchObject({ outcome: 'failed', bytesFreed: 0 });
    if (item.outcome === 'failed') {
      expect(item.error.code).toBe(IPC_ERROR_CODES.CLEAN_DELETE_FAILED);
      expect(item.error).not.toHaveProperty('stack');
    }
    expect(cleared).toEqual(['C:\\']);
  });

  it('reports cleared-but-unverified instead of inventing freed bytes', async () => {
    let cleared = false;
    const shell: RecycleShell = {
      listVolumes: async () => ['C:\\'],
      query: async () =>
        cleared ? { ok: false, reason: 'замер после очистки недоступен' } : measured(70, 2),
      clear: async () => {
        cleared = true;
      },
    };
    const item = await clearRecycleVolume('C:\\$Recycle.Bin', shell);
    expect(item).toMatchObject({ outcome: 'failed', bytesFreed: 0 });
    if (item.outcome === 'failed') {
      expect(item.error.code).toBe(IPC_ERROR_CODES.CLEAN_SIZE_UNVERIFIED);
      expect(item.error.message).toContain('очищена');
    }
  });

  it('never reports negative freed bytes when the bin grew during the run', async () => {
    const cleared: string[] = [];
    let grew = false;
    const shell: RecycleShell = {
      listVolumes: async () => ['D:\\'],
      query: async () => (grew ? measured(999, 9) : measured(10, 1)),
      clear: async (root) => {
        cleared.push(root);
        grew = true;
      },
    };
    const item = await clearRecycleVolume('D:\\$Recycle.Bin', shell);
    expect(item).toEqual({ path: 'D:\\$Recycle.Bin', outcome: 'deleted', bytesFreed: 0 });
    expect(cleared).toEqual(['D:\\']);
  });
});

describe('recycle shell helpers', () => {
  it('accepts only drive-root volumes as shell input', () => {
    expect(volumeLetter('C:\\')).toBe('C');
    expect(volumeLetter('z:\\')).toBe('Z');
    expect(volumeLetter('C:\\$Recycle.Bin')).toBeNull();
    expect(volumeLetter('C:/')).toBeNull();
    expect(volumeLetter('\\\\server\\share')).toBeNull();
    expect(volumeLetter('')).toBeNull();
  });
});
