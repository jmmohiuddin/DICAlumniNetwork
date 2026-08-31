/* Executes api.js then app.js in one shared global scope with a minimal DOM
 * shim — the same way the browser loads them via two classic <script> tags.
 * Catches load-time throws and missing globals without needing a browser.
 */
const fs=require('fs'), vm=require('vm');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const files=process.argv.slice(2).length ? process.argv.slice(2)
  : require('./client-scripts').scripts().map(f => path.join(ROOT, f));

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

// Spot-check that the functions inline handlers depend on are really global.
const need=['showPage','logout','filterDirectory','switchAnalytics','filterEvents','switchAdmin',
            'showEditProfile','showEditProfileV2','handleSaveProfileV2','showToast','openModal',
            'closeModal','renderDashboard','initApp','loginAsRole','toggleSidebar'];
const missing=need.filter(n=>typeof ctx[n]!=='function');
console.log(`\nglobals present: ${need.length-missing.length}/${need.length}`);
if(missing.length){ console.log('MISSING: '+missing.join(', ')); process.exitCode=1; }

// Dump every global the scripts defined, for before/after comparison.
if (process.env.DUMP_GLOBALS) {
  const base = new Set(Object.keys(vm.createContext({})));
  const names = Object.keys(ctx)
    .filter(k => !base.has(k))
    .map(k => `${typeof ctx[k]}\t${k}`)
    .sort();
  require('fs').writeFileSync(process.env.DUMP_GLOBALS, names.join('\n'));
}
