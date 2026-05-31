import { useEffect, useState } from 'react';
import GaugeComponent from 'react-gauge-component';
import './App.css';

interface ChronyData {
  offset: number;
  jitter: number;
  frequency: number;
}

function App() {
  const [data, setData] = useState<ChronyData>({ offset: 0, jitter: 0, frequency: 0 });
  const [error, setError] = useState<string>('');

  const fetchData = async () => {
    try {
      const resp = await fetch('/api/chrony');
      const json = await resp.json();
      const raw = json.output as string;
      const offsetMatch = raw.match(/Offset\s+([\-\d.]+)/i);
      const jitterMatch = raw.match(/RMS\s+offset\s+([\-\d.]+)/i);
      const freqMatch = raw.match(/Frequency\s+([\-\d.]+)/i);
      setData({
        offset: offsetMatch ? parseFloat(offsetMatch[1]) * 1000 : 0, // seconds to ms
        jitter: jitterMatch ? parseFloat(jitterMatch[1]) * 1000 : 0, // seconds to ms
        frequency: freqMatch ? parseFloat(freqMatch[1]) : 0,
      });
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to fetch');
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard">
      <div className="panel-header">
        <h1>Flight Telemetry</h1>
        <p className="subtitle">NTP Chrony Monitor</p>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="gauges-container">
        <div className="gauge-panel">
          <h2>OFFSET (ms)</h2>
          <GaugeComponent
            type="semicircle"
            arc={{
              width: 0.15,
              padding: 0.02,
              cornerRadius: 1,
              gradient: false,
              subArcs: [
                { limit: -50, color: '#EA4228' },
                { limit: -10, color: '#F5CD19' },
                { limit: 10, color: '#5BE12C' },
                { limit: 50, color: '#F5CD19' },
                { limit: 100, color: '#EA4228' }
              ]
            }}
            pointer={{
              type: "needle",
              elastic: true,
              animationDelay: 0,
              color: '#EA4228',
              length: 0.8,
              width: 15
            }}
            labels={{
              valueLabel: { formatTextValue: (v: any) => v.toFixed(2), style: { fill: '#fff', textShadow: 'none' } },
              tickLabels: { type: 'outer', ticks: [] }
            }}
            value={data.offset}
            minValue={-100}
            maxValue={100}
          />
        </div>
        <div className="gauge-panel">
          <h2>JITTER (ms)</h2>
          <GaugeComponent
            type="semicircle"
            arc={{
              width: 0.15,
              padding: 0.02,
              cornerRadius: 1,
              gradient: false,
              subArcs: [
                { limit: 5, color: '#5BE12C' },
                { limit: 15, color: '#F5CD19' },
                { limit: 50, color: '#EA4228' }
              ]
            }}
            pointer={{
              type: "needle",
              elastic: true,
              animationDelay: 0,
              color: '#EA4228',
              length: 0.8,
              width: 15
            }}
            labels={{
              valueLabel: { formatTextValue: (v: any) => v.toFixed(2), style: { fill: '#fff', textShadow: 'none' } },
              tickLabels: { type: 'outer', ticks: [] }
            }}
            value={data.jitter}
            minValue={0}
            maxValue={50}
          />
        </div>
        <div className="gauge-panel">
          <h2>FREQUENCY (ppm)</h2>
          <GaugeComponent
            type="semicircle"
            arc={{
              width: 0.15,
              padding: 0.02,
              cornerRadius: 1,
              gradient: false,
              subArcs: [
                { limit: -30, color: '#EA4228' },
                { limit: -10, color: '#F5CD19' },
                { limit: 10, color: '#5BE12C' },
                { limit: 30, color: '#F5CD19' },
                { limit: 50, color: '#EA4228' }
              ]
            }}
            pointer={{
              type: "needle",
              elastic: true,
              animationDelay: 0,
              color: '#EA4228',
              length: 0.8,
              width: 15
            }}
            labels={{
              valueLabel: { formatTextValue: (v: any) => v.toFixed(2), style: { fill: '#fff', textShadow: 'none' } },
              tickLabels: { type: 'outer', ticks: [] }
            }}
            value={data.frequency}
            minValue={-50}
            maxValue={50}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
