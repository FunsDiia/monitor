const CACHE_NAME = 'varta-tactical-v1';

// Указываем пути с учетом подпапки репозитория
const urlsToCache = [
  '/monitor/',
  '/monitor/index.html',
  '/monitor/manifest.json',
  '/monitor/Volja-Regular.otf', // Кэшируем шрифт для заголовка
  '/monitor/Nastup-Basic.otf'   // Кэшируем шрифт для списка угроз
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Виявлено нову загрозу',
    icon: '/monitor/icon.png', // Путь к иконке с учетом подпапки
    badge: '/monitor/icon.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };
  // Заголовок в уведомлении будет соответствовать стилистике проекта
  event.waitUntil(self.registration.showNotification('ВАРТА: Тактична тривога', options));
});
