/* Barnyard Auction service worker — offline app shell only (API sync uses fetch in the page). */
'use strict';

var CACHE_VERSION = 'barnyard-shell-v3';
var SHELL_PATHS = [
  '/',
  '/index.html',
  '/i18n.js',
  '/merge.js',
  '/legal.css',
  '/privacy',
  '/terms',
  '/privacidad',
  '/terminos',
  '/manifest.webmanifest'
];

function isRedirect(response) {
  return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
}

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  var accept = request.headers.get('accept') || '';
  return request.method === 'GET' && accept.indexOf('text/html') !== -1;
}

function rebuildFromRedirectedNavigation(request) {
  return fetch(request, { credentials: 'same-origin', redirect: 'follow' }).then(function (network) {
    if (!network || !network.ok || isRedirect(network)) return network;
    return network.clone();
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL_PATHS.map(function (p) {
        return new Request(p, { credentials: 'same-origin' });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;

  event.respondWith((async function () {
    var cache = await caches.open(CACHE_VERSION);

    if (isNavigationRequest(request)) {
      try {
        var networkNav = await fetch(request, { credentials: 'same-origin', redirect: 'follow' });
        if (isRedirect(networkNav)) {
          return rebuildFromRedirectedNavigation(request);
        }
        if (networkNav.ok) {
          await cache.put('/index.html', networkNav.clone());
          return networkNav;
        }
      } catch (ignore) { /* offline */ }
      var cachedNav = await cache.match('/index.html') || await cache.match('/');
      if (cachedNav) return cachedNav;
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    try {
      var network = await fetch(request, { credentials: 'same-origin', redirect: 'follow' });
      if (isRedirect(network)) {
        return fetch(network.url, { credentials: 'same-origin', redirect: 'follow' });
      }
      if (network.ok) {
        await cache.put(request, network.clone());
      }
      return network;
    } catch (err) {
      var hit = await cache.match(request);
      if (hit) return hit;
      throw err;
    }
  })());
});