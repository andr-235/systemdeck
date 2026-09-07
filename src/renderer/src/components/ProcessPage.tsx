import { useMemo, useState } from 'react';
import type { ProcessEntry, ProcessSnapshot } from '@shared/ipc';
import {
  filterProcesses,
  sortProcesses,
  type ProcessSortDir,
  type ProcessSortKey,
} from '../processTable';
import { formatBytes } from '../format';

type SortState = { key: ProcessSortKey; dir: ProcessSortDir } | null;

type ProcessPageProps = {
  snapshot: ProcessSnapshot | null;
  stale: boolean;
  error: string | null;
  selectedPid?: number | null;
  onSelect: (entry: ProcessEntry) => void;
};

const SORT_KEY_LABEL: Record<ProcessSortKey, string> = {
  pid: 'PID',
  name: 'Имя',
  cpuPercent: 'CPU%',
  memBytes: 'Память',
};

function ProcessPage({
  snapshot,
  stale,
  error,
  selectedPid,
  onSelect,
}: ProcessPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'cpuPercent', dir: 'desc' });

  const processes = snapshot?.processes ?? null;

  const visible = useMemo(() => {
    if (!processes) return [];
    const filtered = filterProcesses(processes, query);
    return sort ? sortProcesses(filtered, sort.key, sort.dir) : filtered;
  }, [processes, query, sort]);

  const toggleSort = (key: ProcessSortKey): void => {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  return (
    <section className="sd-page" aria-label="Процессы">
      <h2 className="sd-page-title">Процессы</h2>
      <div className="sd-process-toolbar">
        <label className="sd-search">
          <span className="sd-sr-only">Поиск по имени или PID</span>
          <input
            type="search"
            placeholder="Поиск по имени или PID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sd-search-input"
          />
        </label>
      </div>

      {stale && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--sd-color-accent)' }}>
          данные устарели
        </p>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--sd-color-destructive)', fontSize: 12 }}>
          Процессы: {error}
        </p>
      )}

      {!processes ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 200, height: 8 }} />
      ) : processes.length === 0 ? (
        <span style={{ fontSize: 12 }}>Нет данных о процессах</span>
      ) : visible.length === 0 ? (
        <span style={{ fontSize: 12 }}>Ничего не найдено</span>
      ) : (
        <table className="sd-process-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {(Object.keys(SORT_KEY_LABEL) as ProcessSortKey[]).map((key) => (
                <th key={key} scope="col">
                  <button
                    type="button"
                    className="sd-sort-button"
                    onClick={() => toggleSort(key)}
                    aria-pressed={sort?.key === key}
                  >
                    {SORT_KEY_LABEL[key]}
                    {sort?.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr
                key={p.pid}
                className={selectedPid === p.pid ? 'sd-row-selected' : ''}
                aria-selected={selectedPid === p.pid}
                onClick={() => onSelect(p)}
              >
                <td className="sd-num">{p.pid}</td>
                <td>
                  <span className="sd-process-name">
                    {p.protected && (
                      <span
                        role="img"
                        aria-label="защищённый процесс"
                        title="Защищённый/системный процесс"
                      >
                        🛡️
                      </span>
                    )}
                    {p.name}
                  </span>
                </td>
                <td className="sd-num">{p.cpuPercent}</td>
                <td className="sd-num">{formatBytes(p.memBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default ProcessPage;
