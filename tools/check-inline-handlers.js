/* Verifies every function name referenced from an inline on*= attribute
 * (in index.html AND in HTML template strings inside the client scripts) is
 * actually declared as a top-level global somewhere under src/client/.
 * With classic <script> tags this is the app's real public surface.
 *
 * app.js/api.js were split into per-feature files under src/client/ (see
 * docs/code-organization.html). This tool now sources the same list
 * tools/client-scripts.js derives from index.html's <script> tags, so it
 * keeps covering exactly what ships regardless of how the client is split.
 */
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || require('path').join(__dirname, '..');
// index.html and the client scripts live under the web root, which is public/
// since the CDN-exposure fix; the <script src> paths are relative to it.
const WEB_ROOT = path.join(ROOT, 'public');
const read = f => fs.readFileSync(path.join(WEB_ROOT, f), 'utf8');
const { scripts } = require('./client-scripts');

const html = read('index.html');
const clientFiles = scripts(path.join(WEB_ROOT, 'index.html'));
const apiClientFile = clientFiles.find(f => f.endsWith('api-client.js'));
const appFiles = clientFiles.filter(f => f !== apiClientFile);
const apijs = apiClientFile ? read(apiClientFile) : '';
const appjs = appFiles.map(read).join('\n');

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

// Defects that predate this tooling are recorded in known-issues.json so the
// gate still fails loudly on anything NEW while not blocking on a bug whose
// fix is a product decision. That file should only ever shrink.
const known = new Set(
  require('./known-issues.json').unresolvedInlineHandlers.map(i => i.name)
);

const unresolved = [...refs.entries()].filter(([n]) => !declared.has(n) && !BUILTIN.has(n));
const missing = unresolved.filter(([n]) => !known.has(n));
const accepted = unresolved.filter(([n]) => known.has(n));
const resolved = [...refs.keys()].filter(n => declared.has(n));

console.log(`inline handler names referenced : ${refs.size}`);
console.log(`  resolved to a global          : ${resolved.length}`);
console.log(`  known pre-existing breaks     : ${accepted.length}`);
console.log(`  NEW UNRESOLVED (fails build)  : ${missing.length}`);
if (accepted.length) {
  console.log('\nknown pre-existing (see tools/known-issues.json):');
  for (const [n, srcs] of accepted.sort()) console.log(`  ${n.padEnd(38)} ${[...srcs].join(', ')}`);
}
if (missing.length) {
  console.log('\nNEW UNRESOLVED HANDLERS — these will throw at runtime:');
  for (const [n, srcs] of missing.sort()) console.log(`  ${n.padEnd(38)} referenced from: ${[...srcs].join(', ')}`);
}

// 4. Functions defined more than once. Two different things look alike here:
//
//    (a) a DECORATOR WRAPPER — `const _origX = X;` captures the previous
//        implementation and the replacement delegates to it. Both definitions
//        are live and the order is load-bearing. Deleting the first one, or
//        hoisting the second over it, makes the wrapper call itself.
//    (b) a genuine DUPLICATE — the later definition silently wins and the
//        earlier one is unreachable.
//
// Only (b) is a finding. Wrappers are reported separately so they are not
// mistaken for dead code.
const wrapped = new Set();
let wm; const WRAP = /^const\s+_orig[A-Za-z_$][\w$]*\s*=\s*([A-Za-z_$][\w$]*)\s*;/gm;
while ((wm = WRAP.exec(appjs))) wrapped.add(wm[1]);

const counts = new Map();
let d; const FN = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;
while ((d = FN.exec(appjs))) counts.set(d[1], (counts.get(d[1]) || 0) + 1);
// A reassignment counts as a definition too.
let rm; const REASSIGN = /^([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/gm;
while ((rm = REASSIGN.exec(appjs))) counts.set(rm[1], (counts.get(rm[1]) || 0) + 1);

const lineOf = (n) => {
  const out = [];
  appjs.split('\n').forEach((L, i) => {
    if (new RegExp(`^(async )?function ${n}\\s*\\(`).test(L) ||
        new RegExp(`^${n}\\s*=\\s*(async )?function\\b`).test(L)) out.push(i + 1);
  });
  return out;
};

const multi = [...counts.entries()].filter(([, c]) => c > 1);
const wrappers = multi.filter(([n]) => wrapped.has(n));
const dupes = multi.filter(([n]) => !wrapped.has(n));

console.log(`\ntop-level functions in app.js   : ${counts.size} unique`);
console.log(`decorator wrappers (intentional) : ${wrappers.length}`);
for (const [n] of wrappers.sort()) {
  console.log(`  ${n.padEnd(38)} lines ${lineOf(n).join(', ')}   [_orig capture — do NOT delete the first]`);
}
console.log(`DUPLICATE definitions            : ${dupes.length}`);
for (const [n, c] of dupes.sort()) {
  console.log(`  ${n.padEnd(38)} x${c}  lines ${lineOf(n).join(', ')}`);
}
process.exit(missing.length || dupes.length ? 1 : 0);
