const fg = require('./node_modules/fast-glob/out/index.js');
const path = require('path');
const cwd = process.cwd();
const workerPath = path.join(cwd, 'dist', 'server');

// Test with escaped path
const escapedPath = fg.escapePath(workerPath.split('\\').join('/'));
console.log('escapedPath:', escapedPath);
const escapedPattern = escapedPath + '/**';

fg.glob(escapedPattern).then(files => {
  console.log('escaped glob result:', files.length, 'files');
  files.forEach(f => console.log(' ', path.basename(f)));
}).catch(e => console.error('error:', e.message));
