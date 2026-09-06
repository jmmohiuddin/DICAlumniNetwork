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
/* The web root moved to public/ so that Vercel's CDN stops serving the whole
 * repository (see src/server/config/paths.js). The <script src> values in
 * index.html are URLs relative to that web root, not repo-relative paths, so
 * they resolve under public/ — the tools have to join them there. */
const WEB_ROOT = path.join(ROOT, 'public');

/** @returns {string[]} repo-relative paths, in the order the browser runs them. */
function scripts(indexHtml = path.join(WEB_ROOT, 'index.html')) {
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

module.exports = { scripts, ROOT, WEB_ROOT };

if (require.main === module) {
  for (const s of scripts()) console.log(s);
}
