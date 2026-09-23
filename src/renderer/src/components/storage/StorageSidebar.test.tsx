import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import StorageSidebar from './StorageSidebar';
import type { ScanResult } from '@shared/ipc';

function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    volumeId: 'C:',
    timestamp: 0,
    durationMs: 100,
    totalBytes: 400,
    fileCount: 2,
    inaccessibleDirectories: 0,
    tree: {
      name: 'C:',
      path: 'C:',
      sizeBytes: 400,
      filesBytes: 400,
      fileCount: 2,
      inaccessible: false,
      children: [],
    },
    largestFiles: [{ path: 'C:\\a.iso', name: 'a.iso', sizeBytes: 300, category: 'Archives' }],
    typeTotals: [{ category: 'Archives', sizeBytes: 300, fileCount: 1 }],
    ...overrides,
  };
}

describe('Renderer — StorageSidebar', () => {
  it('компонует таблицу и сводку из ScanResult', () => {
    render(<StorageSidebar result={makeResult()} />);
    expect(screen.getByRole('heading', { name: 'Крупнейшие файлы и типы' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Крупнейшие файлы' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Сводка по типам файлов' })).toBeInTheDocument();
    expect(screen.getByText('C:\\a.iso')).toBeInTheDocument();
  });

  it('пустой результат с недоступностью — без ложного «пусто»', () => {
    render(
      <StorageSidebar
        result={makeResult({
          largestFiles: [],
          typeTotals: [],
          fileCount: 3,
          inaccessibleDirectories: 1,
        })}
      />
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(2);
    for (const status of statuses) expect(status).toHaveTextContent('это не «пусто»');
  });
});
