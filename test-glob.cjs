const {glob} = require('./node_modules/fast-glob/out/index.js');
const path = require('path');
const cwd = process.cwd();
const workerPath = path.join(cwd, 'dist', 'server');
console.log('workerPath:', workerPath);

const fwdPattern = workerPath.split('\\').join('/') + '/**';
const backPattern = workerPath + '/**';

console.log('fwd pattern:', fwdPattern);
console.log('back pattern:', backPattern);

Promise.all([
  glob(fwdPattern),
  glob(backPattern).catch(e => 'ERROR: ' + e.message)
]).then(([fwd, back]) => {
  console.log('\nForward slash glob result:', Array.isArray(fwd) ? fwd.length + ' files' : fwd);
  if (Array.isArray(fwd)) fwd.forEach(f => console.log('  ' + path.basename(f)));
  console.log('\nBackslash glob result:', Array.isArray(back) ? back.length + ' files' : back);
  if (Array.isArray(back)) back.forEach(f => console.log('  ' + path.basename(f)));
});
