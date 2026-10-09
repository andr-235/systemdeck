import CleanerCandidateList from './CleanerCandidateList';
import CleanerProgressView from './CleanerProgressView';
import CleanerReportView from './CleanerReportView';
import type { CleanerHook } from './useCleaner';

type CleanerWorkspaceProps = {
  cleaner: CleanerHook;
  onRequestDelete: () => void;
};

function CleanerWorkspace({
  cleaner,
  onRequestDelete,
}: CleanerWorkspaceProps): React.JSX.Element | null {
  const { state } = cleaner;
  switch (state.status) {
    case 'idle':
      return (
        <p className="sd-hint">
          Выберите категории и запустите предпросмотр — кандидаты появятся здесь.
        </p>
      );
    case 'ready':
      return (
        <section className="sd-card" aria-label="Кандидаты на очистку">
          <CleanerCandidateList
            preview={state.preview}
            selectedIds={state.selectedIds}
            selectedCount={cleaner.selectedCandidates.length}
            selectedEstimatedBytes={cleaner.selectedEstimatedBytes}
            stale={state.stale}
            staleReason={state.staleReason}
            onToggle={cleaner.toggleCandidate}
            onToggleAll={cleaner.toggleSelectAll}
            onRequestDelete={onRequestDelete}
          />
        </section>
      );
    case 'cleaning':
      return (
        <section className="sd-card" aria-label="Прогресс очистки">
          <CleanerProgressView
            progress={state.progress}
            operationId={state.operationId}
            cancelRequested={state.cancelRequested}
            stale={cleaner.progressStale}
            onCancel={cleaner.requestCancel}
          />
        </section>
      );
    case 'completed':
    case 'cancelled':
      return (
        <section className="sd-card" aria-label="Отчёт об очистке">
          <CleanerReportView
            status={state.status}
            report={state.report}
            estimatedBytes={state.estimatedBytes}
            message={null}
          />
        </section>
      );
    case 'failed':
      return state.stage === 'delete' ? (
        <section className="sd-card" aria-label="Отчёт об очистке">
          <CleanerReportView
            status="failed"
            report={state.report}
            estimatedBytes={state.estimatedBytes}
            message={state.message}
          />
        </section>
      ) : null;
    default:
      return null;
  }
}

export default CleanerWorkspace;
