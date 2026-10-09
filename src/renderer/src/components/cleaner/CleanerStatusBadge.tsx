import type { CleanerState } from './useCleaner';

type CleanerStatus = CleanerState['status'];

const STATUS_TEXT: Record<CleanerStatus, string> = {
  idle: 'Ожидание — предпросмотр не запускался',
  scanning: 'Сканирование…',
  ready: 'Готово к очистке',
  cleaning: 'Очистка выполняется…',
  completed: 'Очистка завершена',
  cancelled: 'Очистка отменена',
  failed: 'Ошибка очистки',
};

function CleanerStatusBadge({ status }: { status: CleanerStatus }): React.JSX.Element {
  return (
    <span role="status" aria-label={`Статус: ${STATUS_TEXT[status]}`} className="sd-status-badge">
      {STATUS_TEXT[status]}
    </span>
  );
}

export default CleanerStatusBadge;
