const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const port = 3000;

console.log('=== Chrony monitor server starting ===');
const staticPath = path.resolve(__dirname, 'dist');
console.log('Serving static files from:', staticPath);
app.use(express.static(staticPath));

app.get('/api/chrony', (req, res) => {
  exec('chronyc tracking && chronyc sources -v', (err, stdout, stderr) => {
    if (err) {
      console.error('chronyc exec error:', err);
      res.status(500).json({ error: err.message, stderr });
    } else {
      res.json({ output: stdout });
    }
  });
});

let lastCpuTime = null;
let lastNetTime = null;

app.get('/api/system', (req, res) => {
  // 1. CPU Usage Calculation
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

  // 2. RAM Usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramUsagePercent = (usedMem / totalMem) * 100;

  // 3. Temperature
  let temp = 0;
  try {
    const tempStr = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    temp = parseInt(tempStr) / 1000;
  } catch (e) {
    // Ignore if not on a Pi
  }

  // 4. Network Bandwidth (rough estimate on eth0 or wlan0)
  let netTx = 0;
  let netRx = 0;
  let netRate = 0; // kbps
  try {
    // Try to find the primary interface, fallback to eth0
    const interfaces = os.networkInterfaces();
    const primaryIface = interfaces['eth0'] ? 'eth0' : (interfaces['wlan0'] ? 'wlan0' : Object.keys(interfaces)[0]);
    
    if (primaryIface) {
      const rxStr = fs.readFileSync(`/sys/class/net/${primaryIface}/statistics/rx_bytes`, 'utf8');
      const txStr = fs.readFileSync(`/sys/class/net/${primaryIface}/statistics/tx_bytes`, 'utf8');
      const rx = parseInt(rxStr);
      const tx = parseInt(txStr);
      const now = Date.now();

      if (lastNetTime) {
        const timeDiff = (now - lastNetTime.time) / 1000; // in seconds
        const bytesDiff = (rx - lastNetTime.rx) + (tx - lastNetTime.tx);
        // Rate in Kilobytes per second (kB/s)
        netRate = (bytesDiff / 1024) / timeDiff;
      }
      lastNetTime = { time: now, rx, tx };
    }
  } catch (e) {
    // Ignore network error
  }

  res.json({
    cpu: cpuUsage,
    ram: ramUsagePercent,
    temp: temp,
    networkRate: Math.max(0, netRate)
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

app.listen(port, () => {
  console.log(`Chrony monitor listening on http://localhost:${port}`);
});
