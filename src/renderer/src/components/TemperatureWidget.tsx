import type { TemperatureEntry } from '@shared/ipc';
import WidgetCard from './WidgetCard';

type TemperatureWidgetProps = {
  temperatures: TemperatureEntry[] | null;
  stale: boolean;
  error: string | null;
};

function TemperatureWidget({
  temperatures,
  stale,
  error,
}: TemperatureWidgetProps): React.JSX.Element {
  return (
    <WidgetCard title="Температуры" stale={stale} error={error}>
      {!temperatures ? (
        <span role="presentation" className="skeleton-bar" style={{ width: 160, height: 8 }} />
      ) : temperatures.length === 0 ? (
        /* Graceful degradation (ADR 0009): без прав/ACPI — пустая секция, никогда не 0°C. */
        <span style={{ fontSize: 12 }}>Температуры недоступны (нет прав или ACPI)</span>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {temperatures.map((entry) => (
            <li
              key={entry.sensor}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
            >
              <span>{entry.sensor}</span>
              <span className="sd-num">{entry.valueC}°C</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export default TemperatureWidget;
