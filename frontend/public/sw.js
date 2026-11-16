// Watodo service worker. It only exists so the app is installable and can
// receive web push notifications: every fetch is passed through to the
// network, and push events are shown as system notifications.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Watodo', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Watodo';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicons/android-chrome-192x192.png',
    badge: '/favicons/favicon-32x32.png',
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const target = new URL(url, self.location.origin).href;
      for (const client of clientList) {
        if (client.url === target && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
