/* Parses every tracked .js file with node --check.
 * Cheap standing guard: catches a syntax error introduced by a bad edit
 * before it ever reaches the browser or a deploy.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = execFileSync('git', ['ls-files', '*.js'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error(`FAIL ${f}`);
    console.error(String(e.stderr).split('\n').slice(0, 4).join('\n'));
  }
}
console.log(`${files.length - failed}/${files.length} JS files parse cleanly`);
process.exit(failed ? 1 : 0);
