import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  it('по умолчанию открыт таб файлов, типы — по клику', () => {
    render(<StorageSidebar result={makeResult()} />);
    expect(screen.getByRole('heading', { name: 'Крупнейшие файлы и типы' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Крупнейшие файлы' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Сводка по типам файлов' })).not.toBeInTheDocument();
    expect(screen.getByText('C:\\a.iso')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'По типам' }));
    expect(screen.getByRole('region', { name: 'Сводка по типам файлов' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Крупнейшие файлы' })).not.toBeInTheDocument();
  });

  it('стрелки, Home и End переключают табы с клавиатуры', () => {
    render(<StorageSidebar result={makeResult()} />);
    const filesTab = screen.getByRole('tab', { name: 'Файлы' });
    filesTab.focus();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'По типам' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Файлы' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'По типам' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Файлы' })).toHaveAttribute('aria-selected', 'true');
  });

  it('помечает неполноту при недоступных каталогах', () => {
    render(<StorageSidebar result={makeResult({ inaccessibleDirectories: 2 })} />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('неполными');
    expect(note).toHaveTextContent('недоступно каталогов: 2');
  });

  it('пустой результат с недоступностью — без ложного «пусто» на обоих табах', () => {
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
    expect(screen.getByRole('status')).toHaveTextContent('это не «пусто»');
    fireEvent.click(screen.getByRole('tab', { name: 'По типам' }));
    expect(screen.getByRole('status')).toHaveTextContent('это не «пусто»');
  });
});
