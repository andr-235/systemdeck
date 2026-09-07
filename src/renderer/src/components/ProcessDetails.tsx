import { useState } from 'react';
import type { ProcessEntry } from '@shared/ipc';
import { formatBytes, formatDateTime } from '../format';
import ConfirmDialog from './ConfirmDialog';
import { cardStyle } from './WidgetCard';

type ProcessDetailsProps = {
  entry: ProcessEntry | null;
  selectedPid: number | null;
  stale: boolean;
  onClear: () => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
      <span style={{ opacity: 0.7, flex: '0 0 180px' }}>{label}</span>
      <span className="sd-num" style={{ wordBreak: 'break-all' }}>
        {children}
      </span>
    </div>
  );
}

function ProcessDetails({
  entry,
  selectedPid,
  stale,
  onClear,
}: ProcessDetailsProps): React.JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [terminateError, setTerminateError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    if (terminating || !entry) return;
    setConfirmOpen(false);
    setTerminateError(null);
    setTerminating(true);
    try {
      const result = await window.api.terminateProcess(entry.pid);
      if (result.ok) {
        onClear();
      } else {
        setTerminateError(result.error.message);
      }
    } finally {
      setTerminating(false);
    }
  };

  if (selectedPid === null) {
    return (
      <section style={cardStyle} aria-label="Детали процесса">
        <span style={{ fontSize: 13, opacity: 0.7 }}>Выберите процесс, чтобы увидеть детали</span>
      </section>
    );
  }

  if (!entry) {
    return (
      <section style={cardStyle} aria-label="Детали процесса">
        <span style={{ fontSize: 13 }}>Процесс завершён или больше не доступен</span>
      </section>
    );
  }

  return (
    <section style={cardStyle} aria-label="Детали процесса">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{entry.name}</h3>
        {entry.protected && (
          <span role="status" style={{ fontSize: 12, color: 'var(--sd-color-warn-strong)' }}>
            защищённый процесс
          </span>
        )}
        {stale && (
          <span role="status" style={{ fontSize: 12, color: 'var(--sd-color-warn-strong)' }}>
            данные устарели
          </span>
        )}
        <button
          type="button"
          aria-label="Закрыть детали"
          onClick={onClear}
          style={{
            marginLeft: 'auto',
            border: '1px solid var(--sd-color-border)',
            borderRadius: 6,
            background: 'transparent',
            cursor: 'pointer',
            minHeight: 32,
            minWidth: 32,
            color: 'var(--sd-color-foreground)',
          }}
        >
          ✕
        </button>
      </div>
      <Row label="PID">{entry.pid}</Row>
      <Row label="CPU%">{entry.cpuPercent}%</Row>
      <Row label="Память">{formatBytes(entry.memBytes)}</Row>
      <Row label="Исполняемый файл">{entry.execPath ?? '—'}</Row>
      <Row label="Командная строка">{entry.commandLine ?? '—'}</Row>
      <Row label="Потоков">{entry.threadCount}</Row>
      <Row label="Запущен">
        {entry.creationTime === null ? '—' : formatDateTime(entry.creationTime)}
      </Row>
      <Row label="Родительский PID">{entry.parentPid ?? '—'}</Row>
      {terminateError && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--sd-color-danger)' }}>
          {terminateError}
        </div>
      )}
      <button
        type="button"
        disabled={entry.protected || terminating}
        onClick={() => setConfirmOpen(true)}
        style={{
          border: 'none',
          borderRadius: 6,
          background: 'var(--sd-color-danger, #d33)',
          color: '#fff',
          cursor: entry.protected || terminating ? 'not-allowed' : 'pointer',
          opacity: entry.protected || terminating ? 0.5 : 1,
          padding: '6px 12px',
          justifySelf: 'start',
          minHeight: 32,
        }}
      >
        Завершить процесс
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Завершить процесс"
        message={
          <>
            Завершить процесс «{entry.name}» (PID {entry.pid})? Это действие необратимо.
          </>
        }
        confirmLabel="Завершить"
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}

export default ProcessDetails;
