import { useState } from 'react';
import CleanerCategoryPicker from './CleanerCategoryPicker';
import CleanerConfirmDialog from './CleanerConfirmDialog';
import CleanerStatusBadge from './CleanerStatusBadge';
import CleanerWorkspace from './CleanerWorkspace';
import { useCleaner } from './useCleaner';

function CleanerPage(): React.JSX.Element {
  const cleaner = useCleaner();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { state } = cleaner;

  const closeDialog = (): void => setConfirmOpen(false);
  const confirmDelete = (): void => {
    closeDialog();
    cleaner.startDelete();
  };

  return (
    <section className="sd-page" aria-label="Очистка">
      <div className="sd-storage-head">
        <h2 className="sd-page-title">Очистка</h2>
        <CleanerStatusBadge status={state.status} />
      </div>
      <section className="sd-card" aria-label="Категории очистки">
        <CleanerCategoryPicker
          categories={cleaner.categories}
          sources={state.status === 'ready' ? state.preview.sources : null}
          busy={state.status === 'scanning'}
          disabled={state.status === 'cleaning'}
          onToggle={cleaner.toggleCategory}
          onPreview={cleaner.runPreview}
        />
        {state.status === 'scanning' && (
          <p role="status" className="sd-hint">
            Сканирование разрешённых каталогов…
          </p>
        )}
        {state.status === 'failed' && state.stage === 'preview' && (
          <p role="alert" className="sd-hint">
            {state.message}
          </p>
        )}
      </section>
      <CleanerWorkspace cleaner={cleaner} onRequestDelete={() => setConfirmOpen(true)} />
      <CleanerConfirmDialog
        open={confirmOpen}
        selected={cleaner.selectedCandidates}
        estimatedBytes={cleaner.selectedEstimatedBytes}
        onConfirm={confirmDelete}
        onCancel={closeDialog}
      />
    </section>
  );
}

export default CleanerPage;
