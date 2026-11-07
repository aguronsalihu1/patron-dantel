// Ruan fotot e produkteve dhe të furnitorëve në pajisje: fotoja e parë shkarkohet një herë, pastaj hapet menjëherë.
// Prek vetëm kërkesat e këtyre fotove; çdo gjë tjetër (të dhënat, faqja) shkon drejt e në internet si zakonisht.
const KESH = { vogla: 'pd-foto-vogla-v2', mdha: 'pd-foto-mdha-v2' };   // versioni i ri zëvendëson krejt fotot e ruajtura më parë
const KUFI = { vogla: 4000, mdha: 400 };
const BUCKET = /^\/storage\/v1\/object\/sign\/(produktet-fotot|furnitoret-fotot)\//;
let shtuar = 0;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((kk) => Promise.all(kk.filter((k) => k.startsWith('pd-foto') && !Object.values(KESH).includes(k)).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));

async function shkurto(emri, kufi) {   // më të vjetrat dalin të parat
  const c = await caches.open(emri), kk = await c.keys();
  for (const k of kk.slice(0, Math.max(0, kk.length - kufi))) await c.delete(k);
}

async function foto(url) {
  const lloji = url.pathname.includes('/thumb/') ? 'vogla' : 'mdha';
  const c = await caches.open(KESH[lloji]), celes = url.origin + url.pathname;   // pa token-in: lidhja e re e së njëjtës foto s'e shkarkon sërish
  const h = await c.match(celes);
  if (h) return h;
  const r = await fetch(url.href, { mode: 'cors', credentials: 'omit' });
  if (r.ok && r.headers.get('content-length') !== '0') { c.put(celes, r.clone()).then(() => { if (++shtuar % 50 === 0) return shkurto(KESH[lloji], KUFI[lloji]); }).catch(() => {}); }
  return r;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!url.hostname.endsWith('.supabase.co') || !BUCKET.test(url.pathname)) return;
  e.respondWith(foto(url).catch(() => fetch(e.request)));   // çdo problem me ruajtjen: fotoja merret normalisht nga interneti
});
