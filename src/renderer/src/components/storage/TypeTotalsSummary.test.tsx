import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TypeTotalsSummary from './TypeTotalsSummary';
import type { FileTypeTotal } from '@shared/ipc';

describe('Renderer — TypeTotalsSummary', () => {
  it('сортирует desc и показывает байты с процентами', () => {
    render(
      <TypeTotalsSummary
        totals={
          [
            { category: 'Video', sizeBytes: 100, fileCount: 1 },
            { category: 'Archives', sizeBytes: 300, fileCount: 2 },
          ] satisfies FileTypeTotal[]
        }
        totalBytes={400}
        fileCount={3}
        inaccessibleDirectories={0}
      />
    );
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    const first = within(rows[1] as HTMLElement).getAllByRole('cell');
    expect(first[0]).toHaveTextContent('Archives');
    expect(first[2]).toHaveTextContent('75.0%');
  });

  it('не мутирует входной порядок и считает долю от totalBytes', () => {
    const totals = [
      { category: 'Video', sizeBytes: 50, fileCount: 1 },
      { category: 'Other', sizeBytes: 50, fileCount: 1 },
    ] satisfies FileTypeTotal[];
    render(
      <TypeTotalsSummary
        totals={totals}
        totalBytes={200}
        fileCount={2}
        inaccessibleDirectories={0}
      />
    );
    expect(totals[0]?.category).toBe('Video');
    expect(screen.getAllByText('25.0%')).toHaveLength(2);
  });

  it('пусто при fileCount 0 — честное «нет», при недоступности — пояснение', () => {
    const { rerender } = render(
      <TypeTotalsSummary totals={[]} totalBytes={0} fileCount={0} inaccessibleDirectories={0} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Категорий нет');
    rerender(
      <TypeTotalsSummary totals={[]} totalBytes={500} fileCount={4} inaccessibleDirectories={1} />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('не собрана');
    expect(status).toHaveTextContent('это не «пусто»');
  });
});
