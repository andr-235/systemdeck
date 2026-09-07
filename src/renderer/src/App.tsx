import { useLiveMetrics } from './useLiveMetrics';
import CpuWidget from './components/CpuWidget';
import MemoryWidget from './components/MemoryWidget';
import DiskWidget from './components/DiskWidget';
import NetworkWidget from './components/NetworkWidget';
import GpuWidget from './components/GpuWidget';
import TemperatureWidget from './components/TemperatureWidget';
import SystemInfoWidget from './components/SystemInfoWidget';
import ProcessWidget from './components/ProcessWidget';

function App(): React.JSX.Element {
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

  return (
    <div className="sd-shell">
      <header className="sd-header">
        <h1 className="sd-header-title">SystemDeck</h1>
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
    </div>
  );
}

export default App;
