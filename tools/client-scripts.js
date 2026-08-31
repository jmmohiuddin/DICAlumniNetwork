/* Reads index.html and returns the local client scripts in load order.
 *
 * The frontend has no bundler: index.html lists its <script src> tags and the
 * browser executes them in order into one shared global scope. Order is
 * therefore part of the program. Deriving the list from index.html rather than
 * hardcoding it means the smoke test always exercises exactly what ships, and
 * a script added to the page is covered automatically.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** @returns {string[]} repo-relative paths, in the order the browser runs them. */
function scripts(indexHtml = path.join(ROOT, 'index.html')) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  const out = [];
  const TAG = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = TAG.exec(html))) {
    const src = m[1];
    if (/^https?:\/\//i.test(src) || src.startsWith('//')) continue; // CDN
    out.push(src.replace(/^\.?\//, ''));
  }
  return out;
}

module.exports = { scripts, ROOT };

if (require.main === module) {
  for (const s of scripts()) console.log(s);
}
