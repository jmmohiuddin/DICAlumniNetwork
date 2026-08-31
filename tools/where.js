#!/usr/bin/env node
/* Locate a symbol after the reorganization.
 *
 *   npm run where renderRBACTable
 *   node tools/where.js FULL_USER_PROFILE
 *
 * app.js and server.js were split, so the `app.js:4288` style references in
 * docs/findings.md and the analysis notes no longer resolve. Line numbers are
 * also the wrong anchor — three superseded functions were removed before the
 * split, which shifted everything after them by 44 lines. Symbol names are
 * exact regardless, so this resolves by name.
 *
 * With no argument, prints the old app.js line ranges each client file covers,
 * which is what you want when a note cites a range rather than a name.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const name = process.argv[2];

const files = execFileSync('git', ['ls-files', 'src/**/*.js', 'server.js'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean);

if (!name) {
  console.log('Client files, and the app.js line range each one covers:\n');
  const scripts = require('./client-scripts').scripts();
  for (const f of scripts) {
    const head = fs.readFileSync(path.join(ROOT, f), 'utf8').slice(0, 900);
    const m = head.match(/lines?\s+(\d+)\s*[-–]\s*(\d+)/);
    console.log(`  ${(m ? `app.js:${m[1]}-${m[2]}` : 'api.js (verbatim)').padEnd(22)} ${f}`);
  }
  console.log('\nNote: those ranges are against the post-dedup app.js (6352 lines).');
  console.log('Notes citing the original 6396-line file are ~44 lines higher after line 4555.');
  console.log('\nPass a symbol name to locate it exactly:  node tools/where.js <name>');
  process.exit(0);
}

// Declarations, assignments and object-literal keys — enough to find anything
// the analysis notes are likely to cite.
const patterns = [
  new RegExp(`^\\s*(?:async\\s+)?function\\s+${name}\\b`),
  new RegExp(`^\\s*(?:const|let|var)\\s+${name}\\b`),
  new RegExp(`^\\s*class\\s+${name}\\b`),
  new RegExp(`^\\s*${name}\\s*=\\s*(?:async\\s+)?function\\b`),
  new RegExp(`^\\s*(?:async\\s+)?${name}\\s*\\(.*\\)\\s*\\{`),
];

const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((L, i) => {
    if (patterns.some(p => p.test(L))) hits.push({ f, line: i + 1, text: L.trim().slice(0, 76) });
  });
}

if (!hits.length) {
  console.log(`No declaration of "${name}" found.`);
  console.log('It may be a usage rather than a definition — try:');
  console.log(`  grep -rn "${name}" src/`);
  process.exit(1);
}

console.log(`"${name}" — ${hits.length} definition${hits.length > 1 ? 's' : ''}:\n`);
for (const h of hits) console.log(`  ${h.f}:${h.line}\n    ${h.text}`);
if (hits.length > 1) {
  console.log('\nMore than one definition. If these are a decorator wrapper pair');
  console.log('(the second captures the first via `const _origX = X`), BOTH are live');
  console.log('and the order matters — see docs/code-organization.html.');
}
