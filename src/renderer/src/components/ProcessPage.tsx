import { Fragment, useMemo, useState } from 'react';
import type { ProcessEntry, ProcessSnapshot } from '@shared/ipc';
import { compareProcessEntryByCpuPid } from '@shared/processSort';
import {
  filterProcesses,
  groupProcesses,
  sortGroups,
  type ProcessGroup,
  type ProcessSortDir,
  type ProcessSortKey,
} from '../processTable';
import { formatBytes, formatPercent } from '../format';

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
  workingSetBytes: 'Память',
};

function Shield(): React.JSX.Element {
  return (
    <svg
      className="sd-shield"
      viewBox="0 0 24 24"
      role="img"
      aria-label="защищённый процесс"
      focusable="false"
    >
      <title>Защищённый/системный процесс</title>
      <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1.06 14.35-3.1-3.1 1.41-1.42 1.69 1.69 4.25-4.25 1.41 1.42-5.66 5.66z" />
    </svg>
  );
}

function ShieldBadge({ protected: isProtected }: { protected: boolean }): React.JSX.Element | null {
  return isProtected ? <Shield /> : null;
}

/** Русская плюрализация для единиц «процесс/процесса/процессов» (a11y-подпись). */
function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'процесс';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'процесса';
  return 'процессов';
}

function ProcessPage({
  snapshot,
  stale,
  error,
  selectedPid,
  onSelect,
}: ProcessPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'cpuPercent', dir: 'desc' });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const processes = snapshot?.processes ?? null;

  const groups = useMemo(() => {
    if (!processes) return [];
    const filtered = filterProcesses(processes, query);
    const grouped = groupProcesses(filtered);
    return sort ? sortGroups(grouped, sort.key, sort.dir) : grouped;
  }, [processes, query, sort]);

  const toggleSort = (key: ProcessSortKey): void => {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  const toggleExpand = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderProcessRow = (p: ProcessEntry, member = false, pid?: number): React.JSX.Element => (
    <tr
      key={p.pid}
      tabIndex={0}
      className={selectedPid === (pid ?? p.pid) ? 'sd-row-selected' : ''}
      aria-current={selectedPid === (pid ?? p.pid) ? 'true' : undefined}
      onClick={() => onSelect({ ...p, pid: pid ?? p.pid })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect({ ...p, pid: pid ?? p.pid });
        }
      }}
    >
      <td className="sd-num">{pid ?? p.pid}</td>
      <td>
        <span className={`sd-process-name${member ? ' sd-member-name' : ''}`}>
          <ShieldBadge protected={p.protected} />
          {p.name}
        </span>
      </td>
      <td className="sd-num">{formatPercent(p.cpuPercent)}</td>
      <td className="sd-num">{formatBytes(p.workingSetBytes)}</td>
    </tr>
  );

  const renderGroup = (g: ProcessGroup): React.JSX.Element => {
    const isOpen = expanded.has(g.key);
    return (
      <Fragment key={`g:${g.key}`}>
        <tr
          tabIndex={0}
          aria-expanded={isOpen}
          onClick={() => toggleExpand(g.key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpand(g.key);
            }
          }}
        >
          <td className="sd-num">
            <span
              className="sd-group-badge"
              aria-label={`${g.processes.length} ${plural(g.processes.length)}`}
            >
              {g.processes.length}
            </span>
          </td>
          <td>
            <span className="sd-process-name">
              <ShieldBadge protected={g.protected} />
              <span className="sd-group-caret" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </span>
              {g.name}
            </span>
          </td>
          <td className="sd-num">{formatPercent(g.cpuPercent)}</td>
          <td className="sd-num">{formatBytes(g.workingSetBytes)}</td>
        </tr>
        {isOpen &&
          [...g.processes].sort(compareProcessEntryByCpuPid).map((p) => renderProcessRow(p, true))}
      </Fragment>
    );
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
      ) : groups.length === 0 ? (
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
            {groups.map((g) => {
              const single = g.processes.length === 1 ? g.processes[0] : undefined;
              return single ? renderProcessRow(single, false, g.pid) : renderGroup(g);
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default ProcessPage;
