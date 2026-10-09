import type { CleanupReport } from '@shared/ipc/contracts';
import CleanerReportRow from './CleanerReportRow';
import CleanerReportSummary from './CleanerReportSummary';

type CleanerReportStatus = 'completed' | 'cancelled' | 'failed';

type CleanerReportViewProps = {
  status: CleanerReportStatus;
  report: CleanupReport | null;
  estimatedBytes: number | null;
  message: string | null;
};

function CleanerReportView({
  status,
  report,
  estimatedBytes,
  message,
}: CleanerReportViewProps): React.JSX.Element {
  return (
    <>
      <div className="sd-storage-head">
        <h3 className="sd-page-title">Отчёт об очистке</h3>
      </div>
      <CleanerReportSummary
        status={status}
        report={report}
        estimatedBytes={estimatedBytes}
        message={message}
      />
      {report === null ? (
        <p role="alert" className="sd-hint">
          Отчёт недоступен{message ? `: ${message}` : '.'}
        </p>
      ) : report.items.length === 0 ? (
        <p className="sd-hint">Нет обработанных элементов — нечего было удалять.</p>
      ) : (
        <table className="sd-cleaner-table">
          <thead>
            <tr>
              <th scope="col">Путь</th>
              <th scope="col">Результат</th>
              <th scope="col">Освобождено</th>
              <th scope="col">Причина</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((item, index) => (
              <CleanerReportRow key={`${item.path}-${index}`} item={item} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default CleanerReportView;
