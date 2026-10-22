// Service worker do Placar Free Fire — deixa o app abrir offline.
// Ao publicar uma versão nova, troque o número em V para forçar atualização do cache.
const V = 'ffp-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'firebase-config.js', 'cloud.js',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const same = u.origin === location.origin;
  const gstatic = u.hostname === 'www.gstatic.com'; // módulos do Firebase
  if (!same && !gstatic) return;                    // APIs do Firebase passam direto

  // Páginas: tenta a rede primeiro (pega versão nova), cai no cache se estiver offline
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then(res => { const cp = res.clone(); caches.open(V).then(c => c.put('index.html', cp)); return res; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }

  // Demais arquivos: usa o cache e atualiza em segundo plano
  e.respondWith(
    caches.open(V).then(async c => {
      const hit = await c.match(r);
      const net = fetch(r)
        .then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res; })
        .catch(() => hit);
      return hit || net;
    })
  );
});
