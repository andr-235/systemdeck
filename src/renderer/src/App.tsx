import CpuWidget from './components/CpuWidget';

function App(): React.JSX.Element {
  return (
    <div className="sd-shell">
      <header className="sd-header">
        <h1 className="sd-header-title">SystemDeck</h1>
        <span className="sd-sampling">Опрос: 1 с</span>
      </header>
      <main className="sd-dashboard">
        <CpuWidget />
      </main>
    </div>
  );
}

export default App;
