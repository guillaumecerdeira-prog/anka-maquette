// Service worker minimal : sa seule présence/activation est ce qui rend l'app
// installable en PWA. Pas de mise en cache offline pour l'instant (cf. specpwaanka.md).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
