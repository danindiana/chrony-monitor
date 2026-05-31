const express = require('express');
const { exec } = require('child_process');
const path = require('path');

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

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

app.listen(port, () => {
  console.log(`Chrony monitor listening on http://localhost:${port}`);
});
