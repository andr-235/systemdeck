import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import StorageTreemap from './StorageTreemap';
import type { DirectoryNode } from '@shared/ipc';

function makeNode(overrides: Partial<DirectoryNode> = {}): DirectoryNode {
  return {
    name: 'C:',
    path: 'C:',
    sizeBytes: 300,
    filesBytes: 100,
    fileCount: 5,
    inaccessible: false,
    children: [],
    ...overrides,
  };
}

function makeTree(): DirectoryNode {
  return makeNode({
    children: [
      makeNode({
        name: 'Windows',
        path: 'C:\\Windows',
        sizeBytes: 200,
        filesBytes: 50,
        fileCount: 3,
        children: [
          makeNode({
            name: 'System32',
            path: 'C:\\Windows\\System32',
            sizeBytes: 150,
            filesBytes: 150,
            fileCount: 2,
            children: [],
          }),
        ],
      }),
      makeNode({
        name: 'Secret',
        path: 'C:\\Secret',
        sizeBytes: 0,
        filesBytes: 0,
        fileCount: 0,
        inaccessible: true,
        children: [],
      }),
    ],
  });
}

describe('Renderer — StorageTreemap (jsdom project)', () => {
  it('рендерит SVG с tooltip «имя + размер»', () => {
    render(<StorageTreemap tree={makeTree()} />);
    const svg = screen.getByTestId('storage-treemap-svg');
    expect(svg).toBeInTheDocument();
    expect(svg.querySelector('title')?.textContent).toMatch(/—/);
    expect(screen.getByText(/C: ·/)).toBeInTheDocument();
  });

  it('клик по квадрату делает drill-down, breadcrumb возвращает назад', () => {
    render(<StorageTreemap tree={makeTree()} />);
    const tile = screen.getByRole('button', { name: /Windows/ });
    fireEvent.click(tile);
    expect(screen.getByText(/C:\\Windows ·/)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки каталога' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'C:' }));
    expect(screen.getByText(/C: ·/)).toBeInTheDocument();
  });

  it('клавиатурный Enter на тайле проваливается внутрь', () => {
    render(<StorageTreemap tree={makeTree()} />);
    const tile = screen.getByRole('button', { name: /Windows/ });
    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(screen.getAllByText(/System32/).length).toBeGreaterThan(0);
    expect(screen.getByText(/C:\\Windows ·/)).toBeInTheDocument();
  });

  it('недоступный каталог помечается и не трактуется как «пусто»', () => {
    render(<StorageTreemap tree={makeTree()} />);
    expect(screen.getByRole('button', { name: /Secret/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Secret/ }));
    expect(screen.getByText(/Недоступен для чтения/)).toBeInTheDocument();
    expect(screen.queryByText(/Папка пуста/)).not.toBeInTheDocument();
  });

  it('синтетический лист «Файлы» не кликабелен', () => {
    render(<StorageTreemap tree={makeTree()} />);
    const svg = screen.getByTestId('storage-treemap-svg');
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.getAttribute('aria-label') ?? '');
    expect(labels.some((l) => l.startsWith('Файлы'))).toBe(false);
    expect(svg.querySelectorAll('g.sd-treemap-tile').length).toBeGreaterThan(buttons.length);
  });
});
