/* Verifies every function name referenced from an inline on*= attribute
 * (in index.html AND in HTML template strings inside app.js) is actually
 * declared as a top-level global in api.js or app.js.
 * With classic <script> tags this is the app's real public surface.
 */
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || require('path').join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const html = read('index.html');
const appjs = read('app.js');
const apijs = read('api.js');

// 1. Collect referenced handler names from on*= attributes in both sources.
const refs = new Map(); // name -> Set(source)
const ON_ATTR = /\bon[a-z]+\s*=\s*(["'`])([\s\S]*?)\1/gi;
function harvest(src, label) {
  let m;
  while ((m = ON_ATTR.exec(src))) {
    // Strip string literals first — a word inside a message such as
    // onclick="showToast('API key revealed (30s)')" is not a call.
    const code = m[2].replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
    // function-call identifiers: foo( ... )
    const CALL = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = CALL.exec(code))) {
      const n = c[2];
      if (['if','for','while','return','typeof','new','function','switch','catch','void','delete','in','of','do','else','try'].includes(n)) continue;
      if (!refs.has(n)) refs.set(n, new Set());
      refs.get(n).add(label);
    }
  }
}
harvest(html, 'index.html');
harvest(appjs, 'app.js');

// 2. Collect top-level declarations from app.js + api.js (column 0 only = global).
const declared = new Set();
const DECL = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)/gm;
for (const [src] of [[appjs],[apijs]]) {
  let m; DECL.lastIndex = 0;
  while ((m = DECL.exec(src))) declared.add(m[1] || m[2] || m[3]);
}
// window.X = ... assignments also create globals
let w; const WIN = /window\.([A-Za-z_$][\w$]*)\s*=/g;
while ((w = WIN.exec(appjs + apijs))) declared.add(w[1]);

// 3. Browser/global builtins that are legitimately available.
const BUILTIN = new Set(['alert','confirm','prompt','fetch','setTimeout','setInterval','clearTimeout','clearInterval',
  'parseInt','parseFloat','encodeURIComponent','decodeURIComponent','JSON','Object','Array','String','Number','Boolean',
  'Date','Math','console','event','this','require','Number','isNaN','String','open','print','focus','blur','scrollTo']);

const missing = [...refs.entries()].filter(([n]) => !declared.has(n) && !BUILTIN.has(n));
const resolved = [...refs.keys()].filter(n => declared.has(n));

console.log(`inline handler names referenced : ${refs.size}`);
console.log(`  resolved to a global          : ${resolved.length}`);
console.log(`  UNRESOLVED (broken UI)        : ${missing.length}`);
if (missing.length) {
  console.log('\nUNRESOLVED HANDLERS:');
  for (const [n, srcs] of missing.sort()) console.log(`  ${n.padEnd(38)} referenced from: ${[...srcs].join(', ')}`);
}

// 4. Duplicate top-level function definitions (later silently wins).
const counts = new Map();
let d; const FN = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;
while ((d = FN.exec(appjs))) counts.set(d[1], (counts.get(d[1]) || 0) + 1);
const dupes = [...counts.entries()].filter(([, c]) => c > 1);
console.log(`\ntop-level functions in app.js   : ${counts.size} unique`);
console.log(`DUPLICATE definitions            : ${dupes.length}`);
for (const [n, c] of dupes.sort()) {
  const lines = [];
  appjs.split('\n').forEach((L, i) => { if (new RegExp(`^(async )?function ${n}\\s*\\(`).test(L)) lines.push(i + 1); });
  console.log(`  ${n.padEnd(38)} x${c}  lines ${lines.join(', ')}`);
}
process.exit(missing.length ? 1 : 0);
