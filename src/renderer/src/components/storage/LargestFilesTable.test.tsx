import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LargestFilesTable from './LargestFilesTable';
import type { LargestFileEntry } from '@shared/ipc';

function makeFiles(): LargestFileEntry[] {
  return [
    { path: 'C:\\a.iso', name: 'a.iso', sizeBytes: 300, category: 'Archives' },
    { path: 'C:\\b.mp4', name: 'b.mp4', sizeBytes: 100, category: 'Video' },
  ];
}

describe('Renderer — LargestFilesTable', () => {
  it('показывает путь, размер и готовую категорию', () => {
    render(<LargestFilesTable files={makeFiles()} fileCount={2} inaccessibleDirectories={0} />);
    expect(screen.getByRole('region', { name: 'Крупнейшие файлы' })).toBeInTheDocument();
    expect(screen.getByText('a.iso')).toBeInTheDocument();
    expect(screen.getByText('C:\\a.iso')).toBeInTheDocument();
    expect(screen.getByText('Archives')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('ограничивает таблицу сотней строк', () => {
    const files: LargestFileEntry[] = Array.from({ length: 105 }, (_, i) => ({
      path: `C:\\f${i}.bin`,
      name: `f${i}.bin`,
      sizeBytes: 1000 - i,
      category: 'Other',
    }));
    render(<LargestFilesTable files={files} fileCount={105} inaccessibleDirectories={0} />);
    expect(screen.getAllByRole('row')).toHaveLength(101);
    expect(screen.queryByText('C:\\f104.bin')).not.toBeInTheDocument();
  });

  it('пусто при fileCount 0 — честное «не найдены»', () => {
    render(<LargestFilesTable files={[]} fileCount={0} inaccessibleDirectories={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Файлы не найдены');
  });

  it('пусто при несобранных данных — не «пусто», а недоступность', () => {
    render(<LargestFilesTable files={[]} fileCount={5} inaccessibleDirectories={2} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('не собраны');
    expect(status).toHaveTextContent('недоступно каталогов: 2');
    expect(status).toHaveTextContent('это не «пусто»');
  });
});
