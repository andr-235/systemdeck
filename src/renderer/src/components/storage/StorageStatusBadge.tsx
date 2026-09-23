import type { StorageScanState } from '../../useStorageScan';

type ScanStatus = StorageScanState['status'];

const STATUS_TEXT: Record<ScanStatus, string> = {
  idle: 'Ожидание — скан не запускался',
  scanning: 'Сканирование…',
  complete: 'Готово',
  cancelled: 'Отменено',
  failed: 'Ошибка',
};

function StorageStatusBadge({ status }: { status: ScanStatus }): React.JSX.Element {
  return (
    <span role="status" aria-label={`Статус: ${STATUS_TEXT[status]}`} className="sd-status-badge">
      {STATUS_TEXT[status]}
    </span>
  );
}

export default StorageStatusBadge;
