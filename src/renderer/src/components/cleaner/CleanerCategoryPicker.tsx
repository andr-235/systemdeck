import type { CleanupCategory, CleanupPreviewSource } from '@shared/ipc/contracts';
import { CLEANER_CATEGORIES, categoryLabel } from './cleanerText';
import CleanerSourceRow from './CleanerSourceRow';

type CleanerCategoryPickerProps = {
  categories: CleanupCategory[];
  sources: CleanupPreviewSource[] | null;
  busy: boolean;
  disabled: boolean;
  onToggle: (category: CleanupCategory) => void;
  onPreview: () => void;
};

function CleanerCategoryPicker({
  categories,
  sources,
  busy,
  disabled,
  onToggle,
  onPreview,
}: CleanerCategoryPickerProps): React.JSX.Element {
  return (
    <>
      <fieldset className="sd-cleaner-fieldset" disabled={disabled}>
        <legend className="sd-cleaner-legend">Категории для предпросмотра</legend>
        {CLEANER_CATEGORIES.map((category) => (
          <label key={category} className="sd-cleaner-option">
            <input
              type="checkbox"
              checked={categories.includes(category)}
              onChange={() => onToggle(category)}
            />
            {categoryLabel(category)}
          </label>
        ))}
      </fieldset>
      <div className="sd-cleaner-toolbar">
        <button
          type="button"
          className="sd-button sd-cleaner-run"
          onClick={onPreview}
          disabled={disabled || busy || categories.length === 0}
        >
          {busy ? 'Сканирование…' : 'Предпросмотр'}
        </button>
        <span className="sd-hint">
          Ничего не удаляется на этом шаге — только список кандидатов.
        </span>
      </div>
      {sources && (
        <ul className="sd-cleaner-source" aria-label="Состояние источников">
          {sources.map((source) => (
            <CleanerSourceRow key={source.category} source={source} />
          ))}
        </ul>
      )}
    </>
  );
}

export default CleanerCategoryPicker;
