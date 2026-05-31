require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

// === Database Setup ===
const dbPath = path.resolve(__dirname, 'metrics.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    cpu REAL,
    ram REAL,
    temp REAL,
    offset REAL,
    jitter REAL,
    frequency REAL
  )`);
});

// === Basic Authentication ===
const authUser = process.env.AUTH_USER;
const authPass = process.env.AUTH_PASS;
if (authUser && authPass) {
  console.log(`Basic Auth Enabled for user: ${authUser}`);
  app.use((req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === authUser && password === authPass) {
      return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Chrony Monitor"');
    res.status(401).send('Authentication required.');
  });
}

// === Static Files ===
const staticPath = path.resolve(__dirname, 'dist');
app.use(express.static(staticPath));

// === Global State for Polling ===
let lastCpuTime = null;
let lastNetTime = null;

const getSystemMetrics = () => {
  // 1. CPU
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  });

  let cpuUsage = 0;
  if (lastCpuTime) {
    const idleDiff = idle - lastCpuTime.idle;
    const totalDiff = total - lastCpuTime.total;
    cpuUsage = totalDiff > 0 ? 100 - (100 * idleDiff / totalDiff) : 0;
  }
  lastCpuTime = { idle, total };

  // 2. RAM
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramUsagePercent = (usedMem / totalMem) * 100;

  // 3. Temp
  let temp = 0;
  try {
    const tempStr = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    temp = parseInt(tempStr) / 1000;
  } catch (e) {}

  // 4. Net Rate
  let rxRate = 0;
  let txRate = 0;
  try {
    const interfaces = os.networkInterfaces();
    const primaryIface = interfaces['eth0'] ? 'eth0' : (interfaces['wlan0'] ? 'wlan0' : Object.keys(interfaces)[0]);
    if (primaryIface) {
      const rxStr = fs.readFileSync(`/sys/class/net/${primaryIface}/statistics/rx_bytes`, 'utf8');
      const txStr = fs.readFileSync(`/sys/class/net/${primaryIface}/statistics/tx_bytes`, 'utf8');
      const rx = parseInt(rxStr);
      const tx = parseInt(txStr);
      const now = Date.now();
      if (lastNetTime) {
        const timeDiff = (now - lastNetTime.time) / 1000;
        rxRate = ((rx - lastNetTime.rx) / 1024) / timeDiff;
        txRate = ((tx - lastNetTime.tx) / 1024) / timeDiff;
      }
      lastNetTime = { time: now, rx, tx };
    }
  } catch (e) {}

  // 5. Disk Usage
  let diskUsage = 0;
  try {
    const df = require('child_process').execSync('df / | tail -1 | awk \'{print $5}\'', {encoding: 'utf8'});
    diskUsage = parseFloat(df.replace('%', ''));
  } catch(e) {}

  return { 
    cpu: cpuUsage, 
    ram: ramUsagePercent, 
    temp, 
    networkRate: Math.max(0, rxRate + txRate),
    rxRate: Math.max(0, rxRate),
    txRate: Math.max(0, txRate),
    disk: diskUsage || 0,
    uptime: os.uptime(),
    load: os.loadavg()[0]
  };
};

const getChronyMetrics = () => {
  return new Promise((resolve, reject) => {
    exec('chronyc tracking', (err, stdout) => {
      if (err) return reject(err);
      
      const offsetMatch = stdout.match(/Last offset\s*:\s*([+\-\d.]+)/i);
      const jitterMatch = stdout.match(/RMS offset\s*:\s*([+\-\d.]+)/i);
      const freqMatch = stdout.match(/Frequency\s*:\s*([+\-\d.]+)/i);
      
      resolve({
        offset: offsetMatch ? parseFloat(offsetMatch[1]) * 1000 : 0,
        jitter: jitterMatch ? parseFloat(jitterMatch[1]) * 1000 : 0,
        frequency: freqMatch ? parseFloat(freqMatch[1]) : 0,
        rawTracking: stdout
      });
    });
  });
};

const sendWebhookAlert = async (message) => {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;
  try {
    // Basic dynamic import for fetch since Node 18+ has it natively, or we can use curl/http
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `🚨 **Chrony Monitor Alert:** ${message}` })
    });
  } catch (e) {
    console.error('Failed to send webhook:', e.message);
  }
};

// Background Logger & Alerter (runs every 60s)
setInterval(async () => {
  try {
    const sys = getSystemMetrics();
    const chrony = await getChronyMetrics();
    
    // Insert into DB
    db.run(
      `INSERT INTO metrics (cpu, ram, temp, offset, jitter, frequency) VALUES (?, ?, ?, ?, ?, ?)`,
      [sys.cpu, sys.ram, sys.temp, chrony.offset, chrony.jitter, chrony.frequency]
    );

    // Check Alerts
    const maxTemp = parseFloat(process.env.ALERT_TEMP_C) || 80;
    const maxOffset = parseFloat(process.env.ALERT_OFFSET_MS) || 50;
    
    if (sys.temp >= maxTemp) {
      sendWebhookAlert(`High Temperature Detected: ${sys.temp.toFixed(1)}°C!`);
    }
    if (Math.abs(chrony.offset) >= maxOffset) {
      sendWebhookAlert(`High NTP Offset Detected: ${chrony.offset.toFixed(2)}ms!`);
    }

  } catch (err) {
    console.error('Background task error:', err);
  }
}, 60000);

// === API Endpoints ===

app.get('/api/chrony', (req, res) => {
  exec('chronyc tracking', (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ output: stdout });
  });
});

app.get('/api/sources', (req, res) => {
  exec('chronyc sources -v', (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ output: stdout });
  });
});

app.get('/api/system', (req, res) => {
  res.json(getSystemMetrics());
});

app.get('/api/history', (req, res) => {
  // Get last 24 hours (1440 minutes, but we sample every minute)
  db.all(`SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 1440`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.reverse());
  });
});

process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

app.listen(port, () => {
  console.log(`Chrony monitor listening on http://localhost:${port}`);
});
