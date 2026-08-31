// Loads the Express app and dumps its route table in registration order.
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'x'.repeat(64);
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
const app = require(process.argv[2] || require('path').join(__dirname, '..', 'server.js'));

const router = app.router || app._router;
if (!router) { console.error('NO ROUTER'); process.exit(1); }

const out = [];
let i = 0;
for (const layer of router.stack) {
  if (layer.route) {
    const p = layer.route.path;
    const methods = Object.keys(layer.route.methods || {}).filter(m => layer.route.methods[m]);
    // handler chain: everything before the final handler is a guard
    const chain = (layer.route.stack || []).map(s => s.name || '<anon>');
    for (const m of methods) {
      out.push(`${String(i).padStart(3,'0')}  ${m.toUpperCase().padEnd(6)} ${p.padEnd(42)} [${chain.join(' > ')}]`);
    }
  } else {
    const name = layer.name || '<anon>';
    const re = layer.regexp ? String(layer.regexp) : '';
    out.push(`${String(i).padStart(3,'0')}  MW     ${name.padEnd(42)} ${re}`);
  }
  i++;
}
console.log(out.join('\n'));
console.log('\nTOTAL LAYERS: ' + router.stack.length);
