import { useEffect, useState } from 'react';
import GaugeComponent from 'react-gauge-component';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';

interface ChronyData { offset: number; jitter: number; frequency: number; }
interface SystemData { cpu: number; ram: number; temp: number; networkRate: number; }
interface HistoryData { timestamp: string; cpu: number; temp: number; offset: number; jitter: number; }

function App() {
  const [activeTab, setActiveTab] = useState<'gauges' | 'history' | 'sources'>('gauges');
  
  const [data, setData] = useState<ChronyData>({ offset: 0, jitter: 0, frequency: 0 });
  const [sysData, setSysData] = useState<SystemData>({ cpu: 0, ram: 0, temp: 0, networkRate: 0 });
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [sources, setSources] = useState<string>('');
  const [error, setError] = useState<string>('');

  const fetchData = async () => {
    try {
      const [chronyResp, sysResp] = await Promise.all([
        fetch('/api/chrony'),
        fetch('/api/system')
      ]);
      if (chronyResp.status === 401) {
        setError('Authentication Required (Check your basic auth credentials).');
        return;
      }
      const chronyJson = await chronyResp.json();
      const sysJson = await sysResp.json();
      
      const raw = chronyJson.output as string;
      const offsetMatch = raw.match(/Last offset\s*:\s*([+\-\d.]+)/i);
      const jitterMatch = raw.match(/RMS offset\s*:\s*([+\-\d.]+)/i);
      const freqMatch = raw.match(/Frequency\s*:\s*([+\-\d.]+)/i);
      
      setData({
        offset: offsetMatch ? parseFloat(offsetMatch[1]) * 1000 : 0,
        jitter: jitterMatch ? parseFloat(jitterMatch[1]) * 1000 : 0,
        frequency: freqMatch ? parseFloat(freqMatch[1]) : 0,
      });

      setSysData({
        cpu: sysJson.cpu || 0,
        ram: sysJson.ram || 0,
        temp: sysJson.temp || 0,
        networkRate: sysJson.networkRate || 0
      });
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to fetch telemetry');
    }
  };

  const fetchHistoryAndSources = async () => {
    try {
      const [histResp, srcResp] = await Promise.all([
        fetch('/api/history'),
        fetch('/api/sources')
      ]);
      if (histResp.ok) setHistory(await histResp.json());
      if (srcResp.ok) setSources((await srcResp.json()).output);
    } catch(e) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'history' || activeTab === 'sources') {
      fetchHistoryAndSources();
      const interval = setInterval(fetchHistoryAndSources, 60000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const defaultGaugeOptions = {
    type: "semicircle" as const,
    arc: { width: 0.15, padding: 0.02, cornerRadius: 1, gradient: false },
    pointer: { type: "needle" as const, elastic: true, animationDelay: 0, color: '#EA4228', length: 0.8, width: 15 },
    labels: {
      valueLabel: { formatTextValue: (v: any) => v.toFixed(1), style: { fill: '#fff', textShadow: 'none' } },
      tickLabels: { type: 'outer' as const, ticks: [] }
    }
  };

  return (
    <div className="dashboard">
      <div className="panel-header">
        <h1>Flight Telemetry</h1>
        <p className="subtitle">NTP Chrony & System Monitor</p>
        <div className="tabs">
          <button className={activeTab === 'gauges' ? 'active' : ''} onClick={() => setActiveTab('gauges')}>Live Gauges</button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>History</button>
          <button className={activeTab === 'sources' ? 'active' : ''} onClick={() => setActiveTab('sources')}>NTP Sources</button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {activeTab === 'gauges' && (
        <div className="tab-content">
          <h3 className="section-title">Chrony NTP</h3>
          <div className="gauges-container">
            <div className="gauge-panel">
              <h2>OFFSET (ms)</h2>
              <GaugeComponent
                {...defaultGaugeOptions}
                arc={{...defaultGaugeOptions.arc, subArcs: [
                  { limit: -50, color: '#EA4228' }, { limit: -10, color: '#F5CD19' },
                  { limit: 10, color: '#5BE12C' }, { limit: 50, color: '#F5CD19' },
                  { limit: 100, color: '#EA4228' }
                ]}}
                value={data.offset} minValue={-100} maxValue={100}
              />
            </div>
            <div className="gauge-panel">
              <h2>JITTER (ms)</h2>
              <GaugeComponent
                {...defaultGaugeOptions}
                arc={{...defaultGaugeOptions.arc, subArcs: [
                  { limit: 5, color: '#5BE12C' }, { limit: 15, color: '#F5CD19' }, { limit: 50, color: '#EA4228' }
                ]}}
                value={data.jitter} minValue={0} maxValue={50}
              />
            </div>
            <div className="gauge-panel">
              <h2>FREQ (ppm)</h2>
              <GaugeComponent
                {...defaultGaugeOptions}
                arc={{...defaultGaugeOptions.arc, subArcs: [
                  { limit: -30, color: '#EA4228' }, { limit: -10, color: '#F5CD19' },
                  { limit: 10, color: '#5BE12C' }, { limit: 30, color: '#F5CD19' }, { limit: 50, color: '#EA4228' }
                ]}}
                value={data.frequency} minValue={-50} maxValue={50}
              />
            </div>
          </div>

          <div className="divider"></div>
          <h3 className="section-title">System Health</h3>
          <div className="gauges-container">
            <div className="gauge-panel system-gauge">
              <h2>CPU (%)</h2>
              <GaugeComponent
                {...defaultGaugeOptions}
                arc={{...defaultGaugeOptions.arc, subArcs: [
                  { limit: 50, color: '#5BE12C' }, { limit: 80, color: '#F5CD19' }, { limit: 100, color: '#EA4228' }
                ]}}
                value={sysData.cpu} minValue={0} maxValue={100}
              />
            </div>
            <div className="gauge-panel system-gauge">
              <h2>TEMP (°C)</h2>
              <GaugeComponent
                {...defaultGaugeOptions}
                arc={{...defaultGaugeOptions.arc, subArcs: [
                  { limit: 50, color: '#5BE12C' }, { limit: 75, color: '#F5CD19' }, { limit: 100, color: '#EA4228' }
                ]}}
                value={sysData.temp} minValue={0} maxValue={100}
              />
            </div>
            <div className="gauge-panel system-gauge">
              <h2>RAM (%)</h2>
              <GaugeComponent
                {...defaultGaugeOptions}
                arc={{...defaultGaugeOptions.arc, subArcs: [
                  { limit: 60, color: '#5BE12C' }, { limit: 85, color: '#F5CD19' }, { limit: 100, color: '#EA4228' }
                ]}}
                value={sysData.ram} minValue={0} maxValue={100}
              />
            </div>
            <div className="gauge-panel system-gauge">
              <h2>NET (kB/s)</h2>
              <GaugeComponent
                {...defaultGaugeOptions}
                arc={{...defaultGaugeOptions.arc, subArcs: [
                  { limit: 100, color: '#5BE12C' }, { limit: 1000, color: '#F5CD19' }, { limit: 10000, color: '#EA4228' }
                ]}}
                value={sysData.networkRate} minValue={0} maxValue={10000}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="tab-content history-panel">
          <h2 className="section-title">24 Hour Offset & Temp History</h2>
          <div style={{ width: '100%', height: 400 }}>
            <ResponsiveContainer>
              <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="offset" stroke="#00ffcc" dot={false} name="Offset (ms)" />
                <Line type="monotone" dataKey="temp" stroke="#EA4228" dot={false} name="Temp (°C)" />
                <CartesianGrid stroke="#333" strokeDasharray="5 5" />
                <XAxis dataKey="timestamp" stroke="#aaa" tickFormatter={(t) => new Date(t).toLocaleTimeString()} />
                <YAxis stroke="#aaa" />
                <Tooltip contentStyle={{ backgroundColor: '#2a2a2a', borderColor: '#444' }} />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="tab-content sources-panel">
          <h2 className="section-title">Upstream NTP Sources</h2>
          <pre className="terminal-output">{sources}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
