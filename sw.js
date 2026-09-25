// Guarda la app en el teléfono para que abra aunque no haya señal.
// Estrategia: primero la red (siempre la versión más nueva) y, si no hay señal, lo guardado.
const CACHE = 'raid-v20';
const APP = ['./', 'index.html', 'carga.html', 'ayuda.html', 'instructivo.html', 'admin.html', 'admin.js', 'app.css', 'config.js', 'util.js', 'store.js', 'carga.js', 'panel.js', 'tema.js', 'manifest.webmanifest', 'manifest-carga.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'plantilla-participantes.xlsx', 'admin-icon.svg', 'admin-touch-icon.png', 'admin-192.png', 'admin-512.png', 'manifest-admin.webmanifest',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(APP.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const ours = u.origin === location.origin || u.host === 'www.gstatic.com' || u.host.endsWith('fonts.googleapis.com') || u.host.endsWith('fonts.gstatic.com');
  if (!ours) return; // los datos de Firebase los maneja Firebase
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
