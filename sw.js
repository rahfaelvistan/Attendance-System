const CACHE_NAME = 'auraattend-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Inter:wght@400;500;600&display=swap',
  'https://fonts.gstatic.com/s/outfit/v11/FanaR0ed02F7Si7aMZ7K.woff2',
  'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp5GP37T.woff2',
  'https://unpkg.com/lucide@0.262.0/dist/umd/lucide.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js'
];

// Install Service Worker and cache all static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker and clean up obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event handler with Cache-First strategy for static assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Define whitelisted external domains for CDNs
  const isWhitelistedCDN = [
    'unpkg.com',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'www.gstatic.com'
  ].some(domain => url.hostname.includes(domain));

  const isSameOrigin = url.origin === self.location.origin;

  // Only intercept same-origin static assets or whitelisted CDNs
  // Skip Firebase Auth, Database REST API, WebSockets, or other external auth handlers
  if (!isSameOrigin && !isWhitelistedCDN) {
    return;
  }

  // Also skip Firebase Realtime Database websocket/SSE/REST requests and Auth handlers
  if (url.hostname.includes('firebaseio.com') || url.pathname.includes('/__/auth/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately
        // Fetch a fresh version in the background (stale-while-revalidate) to update the cache
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => { /* Ignore background update failures */ });

        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Cache resources only if valid response status 200
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Cache the newly fetched resource if it's a valid resource
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((err) => {
        console.warn('[Service Worker] Fetch failed, resource not available offline:', event.request.url);
      });
    })
  );
});
