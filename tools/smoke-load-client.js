/* Executes api.js then app.js in one shared global scope with a minimal DOM
 * shim — the same way the browser loads them via two classic <script> tags.
 * Catches load-time throws and missing globals without needing a browser.
 */
const fs=require('fs'), vm=require('vm');
const path=require('path');
const ROOT=path.join(__dirname,'..');
// Web root — index.html and the client scripts moved under public/.
const WEB_ROOT=path.join(ROOT,'public');
const files=process.argv.slice(2).length ? process.argv.slice(2)
  : require('./client-scripts').scripts().map(f => path.join(WEB_ROOT, f));

const el=()=>new Proxy(function(){},{
  get(t,p){
    if(p==='classList')return {add(){},remove(){},contains(){return false},toggle(){}};
    if(p==='style')return {};
    if(p==='dataset')return {};
    if(p==='children'||p==='childNodes')return [];
    if(p===Symbol.toPrimitive||p==='toString')return ()=>'';
    if(p==='value'||p==='textContent'||p==='innerHTML')return '';
    return el();
  },
  set(){return true},
  apply(){return el()}
});

const listeners={};
const sandbox={
  console,
  setTimeout(fn,ms){ return 0; },            // never actually fire deferred boot
  setInterval(){ return 0; },
  clearTimeout(){}, clearInterval(){},
  requestAnimationFrame(){ return 0; },
  fetch: async () => ({ ok:true, status:200, json:async()=>({}), headers:{get:()=>''} }),
  AbortController: class { constructor(){this.signal={}} abort(){} },
  localStorage:{ store:{}, getItem(k){return this.store[k]??null}, setItem(k,v){this.store[k]=v}, removeItem(k){delete this.store[k]} },
  document:{
    readyState:'loading',
    head:{ appendChild(){} }, body:el(),
    addEventListener(t,f){ (listeners[t]||(listeners[t]=[])).push(f) },
    getElementById(){ return null },
    querySelector(){ return null },
    querySelectorAll(){ return [] },
    createElement(){ return el() },
    documentElement:el(),
  },
  navigator:{ onLine:true, userAgent:'node' },
  location:{ origin:'http://localhost:8000', href:'http://localhost:8000/', hash:'' },
  Chart: function(){ return {destroy(){},update(){}} },
  QRCode: function(){ return {} },
};
sandbox.window=sandbox;
sandbox.globalThis=sandbox;
sandbox.window.addEventListener=(t,f)=>{(listeners[t]||(listeners[t]=[])).push(f)};

const ctx=vm.createContext(sandbox);
for(const f of files){
  try{ vm.runInContext(fs.readFileSync(f,'utf8'),ctx,{filename:f}); console.log(`  loaded OK   ${f}`); }
  catch(e){ console.log(`  THREW       ${f}: ${e.message}`); process.exitCode=1; }
}

// Check that every function index.html's inline handlers call is really global
// AFTER the scripts have actually executed. check-inline-handlers.js proves the
// same thing statically; this proves it at runtime, which also catches a
// handler that is declared but wiped out by a later assignment.
//
// The list is derived from index.html rather than hardcoded, so removing a
// feature (and its handler) does not leave this failing on a stale name.
const indexHtml = fs.readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');
const BUILTIN = new Set(['alert','confirm','prompt','event','this','window','document',
  'parseInt','parseFloat','JSON','Object','Array','String','Number','Boolean','Date','Math','console']);
const need = new Set();
for (const m of indexHtml.matchAll(/\bon[a-z]+\s*=\s*"([^"]*)"/gi)) {
  const code = m[1].replace(/'[^']*'/g, "''");
  for (const c of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!BUILTIN.has(c[2])) need.add(c[2]);
  }
}
const names = [...need].sort();
const missing = names.filter(n => typeof ctx[n] !== 'function');
console.log(`\ninline handlers resolved at runtime: ${names.length - missing.length}/${names.length}`);
if (missing.length) {
  // known-issues.json records handlers that are already broken in the product.
  const known = new Set(require('./known-issues.json').unresolvedInlineHandlers.map(i => i.name));
  const newly = missing.filter(n => !known.has(n));
  if (missing.length !== newly.length) {
    console.log(`  known pre-existing: ${missing.filter(n => known.has(n)).join(', ')}`);
  }
  if (newly.length) {
    console.log('  MISSING (fails build): ' + newly.join(', '));
    process.exitCode = 1;
  }
}

// Dump every global the scripts defined, for before/after comparison.
if (process.env.DUMP_GLOBALS) {
  const base = new Set(Object.keys(vm.createContext({})));
  const names = Object.keys(ctx)
    .filter(k => !base.has(k))
    .map(k => `${typeof ctx[k]}\t${k}`)
    .sort();
  require('fs').writeFileSync(process.env.DUMP_GLOBALS, names.join('\n'));
}
