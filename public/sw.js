/**
 * PW-01: Service Worker Fetch Handler
 *
 * Cache-first strategy for static assets
 * Network-first strategy for HTML pages and API
 *
 * 重要: このファイルはpublic/に配置する必要がある。
 * Viteのビルドパイプラインを通さず、そのままOxygenにデプロイされる。
 */

const CACHE_NAME = 'astromeda-v1';
const STATIC_ASSETS = [
  '/favicon-192.png',
  '/favicon-512.png',
  '/manifest.json',
  '/offline.html', // PW-03: Offline fallback page
];

// SW install: static assetsをプリキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Try to cache static assets, but don't fail if they don't exist yet
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore errors - assets may not exist during initial deployment
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// SW activate: 古いキャッシュをクリーンアップ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// PW-01: Fetch handler with cache-first for statics, network-first for pages
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip admin and API endpoints (they need fresh data)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  // Cache-first for static assets (hashed filenames in /assets or common static extensions)
  if (
    url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|webp)$/) ||
    url.pathname.includes('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(request).then((response) => {
          // Only cache successful responses
          if (response.ok && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        });
      }).catch(() => {
        // If offline and not cached, return offline placeholder
        return new Response(
          'Offline - this resource is not cached',
          { status: 503, statusText: 'Service Unavailable' }
        );
      })
    );
    return;
  }

  // Network-first for HTML pages (with offline fallback to cached version)
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful page responses for offline use
        if (response.ok && response.status === 200 && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fall back to cached version if available
        return caches.match(request).then((cached) => {
          if (cached) return cached;

          // PW-03: If not cached, return offline.html fallback
          return caches.match('/offline.html').then((offlinePage) => {
            return offlinePage || new Response(
              'Offline - no cached version available',
              { status: 503, statusText: 'Service Unavailable' }
            );
          });
        });
      })
  );
});
