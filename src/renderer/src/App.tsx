import { useState } from 'react';
import { useLiveMetrics } from './useLiveMetrics';
import CpuWidget from './components/CpuWidget';
import MemoryWidget from './components/MemoryWidget';
import DiskWidget from './components/DiskWidget';
import NetworkWidget from './components/NetworkWidget';
import GpuWidget from './components/GpuWidget';
import TemperatureWidget from './components/TemperatureWidget';
import SystemInfoWidget from './components/SystemInfoWidget';
import ProcessWidget from './components/ProcessWidget';
import ProcessPage from './components/ProcessPage';
import ProcessDetails from './components/ProcessDetails';
import StoragePage from './components/StoragePage';
import CleanerPage from './components/cleaner/CleanerPage';
import AppNav, { type AppPage } from './components/AppNav';
import { findProcessById } from './processTable';

function App(): React.JSX.Element {
  const [page, setPage] = useState<AppPage>('dashboard');
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const {
    snapshot,
    processSnapshot,
    cpuHistory,
    memoryHistory,
    stale,
    error,
    paused,
    togglePause,
  } = useLiveMetrics();

  const navigate = (next: AppPage): void => {
    if (next !== 'processes') setSelectedPid(null);
    setPage(next);
  };

  const selectedEntry = findProcessById(processSnapshot, selectedPid);

  return (
    <div className="sd-shell">
      <header className="sd-header">
        <h1 className="sd-header-title">SystemDeck</h1>
        <AppNav page={page} onNavigate={navigate} />
        <span className="sd-sampling">Опрос: 1 с{paused ? ' · пауза' : ''}</span>
        <button
          type="button"
          className="sd-pause-button"
          aria-pressed={paused}
          onClick={togglePause}
        >
          {paused ? 'Продолжить' : 'Пауза'}
        </button>
      </header>
      {page === 'processes' ? (
        <main className="sd-process-layout">
          <ProcessPage
            snapshot={processSnapshot}
            stale={stale}
            error={error}
            selectedPid={selectedPid}
            onSelect={(e) => setSelectedPid(e.pid)}
          />
          <ProcessDetails
            entry={selectedEntry}
            selectedPid={selectedPid}
            stale={stale}
            onClear={() => setSelectedPid(null)}
          />
        </main>
      ) : page === 'storage' ? (
        <main className="sd-storage-page">
          <StoragePage disks={snapshot?.disks ?? null} />
        </main>
      ) : page === 'cleaner' ? (
        <main className="sd-cleaner-page">
          <CleanerPage />
        </main>
      ) : (
        <main className="sd-dashboard">
          <CpuWidget cpu={snapshot?.cpu ?? null} history={cpuHistory} stale={stale} error={error} />
          <MemoryWidget
            memory={snapshot?.memory ?? null}
            history={memoryHistory}
            stale={stale}
            error={error}
          />
          <DiskWidget disks={snapshot?.disks ?? null} stale={stale} error={error} />
          <NetworkWidget network={snapshot?.network ?? null} stale={stale} error={error} />
          <GpuWidget gpu={snapshot?.gpu ?? null} stale={stale} error={error} />
          <TemperatureWidget
            temperatures={snapshot?.temperatures ?? null}
            stale={stale}
            error={error}
          />
          <SystemInfoWidget />
          <ProcessWidget processSnapshot={processSnapshot} stale={stale} error={error} />
        </main>
      )}
    </div>
  );
}

export default App;
