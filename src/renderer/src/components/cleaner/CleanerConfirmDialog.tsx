import type { CleanupPreviewCandidate } from '@shared/ipc/contracts';
import { formatBytes } from '../../format';
import ConfirmDialog from '../ConfirmDialog';
import { categoryLabel, pluralRu } from './cleanerText';

type CleanerConfirmDialogProps = {
  open: boolean;
  selected: CleanupPreviewCandidate[];
  estimatedBytes: number;
  onConfirm: () => void;
  onCancel: () => void;
};

function CleanerConfirmDialog({
  open,
  selected,
  estimatedBytes,
  onConfirm,
  onCancel,
}: CleanerConfirmDialogProps): React.JSX.Element | null {
  const categoryIds = [...new Set(selected.map((candidate) => candidate.category))];
  const count = selected.length;
  return (
    <ConfirmDialog
      open={open}
      title="Подтверждение очистки"
      confirmLabel={`Удалить ${pluralRu(count, 'элемент', 'элемента', 'элементов')}`}
      onConfirm={onConfirm}
      onCancel={onCancel}
      message={
        <>
          <p>Будет удалено: {pluralRu(count, 'элемент', 'элемента', 'элементов')}</p>
          <p>Категории: {categoryIds.map(categoryLabel).join(', ')}</p>
          <p>Оценка размера: {formatBytes(estimatedBytes)}</p>
          {categoryIds.includes('recycle-bin') && (
            <p>
              Внимание: корзина очищается одной агрегированной операцией — будет очищено всё
              содержимое корзины выбранных томов, а не только отмеченные строки.
            </p>
          )}
          <p>Удаление необратимо: уже удалённые файлы не восстановить.</p>
        </>
      }
    />
  );
}

export default CleanerConfirmDialog;
