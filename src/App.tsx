// Chrony Telemetry Dashboard
import { useEffect, useState } from 'react';
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
      // Parse chronyc output for offset, jitter, frequency
      const offsetMatch = raw.match(/Offset\s+([\-\d.]+)/i);
      const jitterMatch = raw.match(/RMS\s+offset\s+([\-\d.]+)/i);
      const freqMatch = raw.match(/Frequency\s+([\-\d.]+)/i);
      setData({
        offset: offsetMatch ? parseFloat(offsetMatch[1]) : 0,
        jitter: jitterMatch ? parseFloat(jitterMatch[1]) : 0,
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
      <h1>Chrony Telemetry</h1>
      {error && <p className="error">{error}</p>}
      <div className="gauges">
        <div className="gauge">
          <h2>Offset (ms)</h2>
          <div className="value">{data.offset.toFixed(3)}</div>
        </div>
        <div className="gauge">
          <h2>Jitter (ms)</h2>
          <div className="value">{data.jitter.toFixed(3)}</div>
        </div>
        <div className="gauge">
          <h2>Frequency (ppm)</h2>
          <div className="value">{data.frequency.toFixed(3)}</div>
        </div>
      </div>
    </div>
  );
}

export default App;
