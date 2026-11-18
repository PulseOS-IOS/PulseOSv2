// PulseOS service worker: offline app shell + background push alerts.
const CACHE = 'pulseos-v2', SHELL = ['/', '/manifest.webmanifest', '/icon-180.png', '/icon-192.png', '/icon-512.png'];
const post = async (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

self.addEventListener('push', (e) => e.waitUntil((async () => {
  const sub = await self.registration.pushManager.getSubscription();
  let items = [];
  try { items = (await (await post('/api/pending', { endpoint: sub && sub.endpoint })).json()).items || []; } catch (_) {}
  if (!items.length) items = [{ title: 'PulseOS reminder', body: 'Open PulseOS to see what’s next.', tag: 'pulseos' }];
  await Promise.all(items.map((i) => self.registration.showNotification(i.title, {
    body: i.body, tag: i.tag, renotify: true, requireInteraction: true, vibrate: i.vibrate || [200, 100, 200],
    icon: '/icon-192.png', badge: '/icon-192.png', data: i, actions: [{ action: 'done', title: 'Got it' }] })));
})()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const sub = await self.registration.pushManager.getSubscription();
    try { await post('/api/ack', { endpoint: sub && sub.endpoint, tid: d.tid }); } catch (_) {}
    if (e.action === 'done') return;
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return cs.length ? cs[0].focus() : self.clients.openWindow('/');
  })());
});
