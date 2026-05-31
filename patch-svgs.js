const fs = require('fs');
const path = require('path');

const rfiDist = path.join(__dirname, 'node_modules', 'react-flight-indicators', 'dist');
const publicDir = path.join(__dirname, 'public');

if (fs.existsSync(rfiDist)) {
  const files = fs.readdirSync(rfiDist);
  files.forEach(f => {
    if (f.endsWith('.svg')) {
      fs.copyFileSync(path.join(rfiDist, f), path.join(publicDir, f));
    }
  });

  ['index.js', 'index.modern.js'].forEach(file => {
    const p = path.join(rfiDist, file);
    if (fs.existsSync(p)) {
      let content = fs.readFileSync(p, 'utf8');
      content = content.replace(/require\([\"']\.\/([^\"']+\.svg)[\"']\)/g, '\'/\$1\'');
      fs.writeFileSync(p, content);
    }
  });
  console.log('Successfully patched react-flight-indicators SVGs.');
}
