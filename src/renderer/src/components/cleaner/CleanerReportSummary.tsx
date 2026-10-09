import type { CleanupReport } from '@shared/ipc/contracts';
import { formatBytes } from '../../format';

type CleanerReportStatus = 'completed' | 'cancelled' | 'failed';

type CleanerReportSummaryProps = {
  status: CleanerReportStatus;
  report: CleanupReport | null;
  estimatedBytes: number | null;
  message: string | null;
};

function headline(
  status: CleanerReportStatus,
  report: CleanupReport | null,
  message: string | null
): string {
  if (status === 'cancelled') return 'Очистка отменена — уже удалённое не возвращается.';
  if (report === null) return message ?? 'Отчёт об очистке недоступен.';
  if (status === 'failed') return 'Очистка завершилась с ошибками — см. строки отчёта.';
  if (report.failed > 0 || report.skipped > 0) {
    return `Частично: удалено ${report.deleted}, пропущено ${report.skipped}, ошибок ${report.failed} из ${report.total}.`;
  }
  return `Все выбранные элементы удалены: ${report.deleted} из ${report.total}.`;
}

function num(value: number | undefined): string {
  return value === undefined ? '—' : String(value);
}

function CleanerReportSummary({
  status,
  report,
  estimatedBytes,
  message,
}: CleanerReportSummaryProps): React.JSX.Element {
  const cells: Array<{ label: string; value: string }> = [
    { label: 'Всего в отчёте', value: num(report?.total) },
    { label: 'Удалено', value: num(report?.deleted) },
    { label: 'Пропущено', value: num(report?.skipped) },
    { label: 'Ошибок', value: num(report?.failed) },
    {
      label: 'Оценка размера',
      value: estimatedBytes === null ? '—' : formatBytes(estimatedBytes),
    },
    {
      label: 'Фактически освобождено',
      value: report === null ? '—' : formatBytes(report.freedBytes),
    },
  ];
  return (
    <>
      <p role="status" className="sd-hint">
        {headline(status, report, message)}
      </p>
      <div className="sd-stat-grid">
        {cells.map((cell) => (
          <div key={cell.label} className="sd-stat-card">
            <span className="sd-stat-label">{cell.label}</span>
            <p className="sd-stat-value sd-num">{cell.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export default CleanerReportSummary;
