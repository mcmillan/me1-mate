/**
 * The service worker that makes the editor work offline. Not part of the app
 * bundle: the `serviceWorker` plugin in vite.config.ts copies it to `sw.js`
 * at the build's root, with `VERSION` and `PRECACHE` (every file of the build
 * the app needs, relative to this script) defined above this comment. The dev
 * server never registers it.
 *
 * - Install precaches the whole app shell into a cache named for this build,
 *   then takes over at once (skipWaiting, claim) and drops older builds'
 *   caches. GitHub Pages' CDN caches files for up to 10 minutes, so just after
 *   a deploy it can hand out the old page beside this new worker: install
 *   checks the page it saved names only this build's files, fetches it again
 *   past the CDN if not, and gives up (leaving the old worker in charge, to
 *   try again on the next visit) if it still doesn't match. It never reloads a page: an open page keeps running the code it
 *   loaded, and picks up the new build the next time it's opened.
 * - Pages go to the network first, revalidating past the browser's HTTP
 *   cache (Pages sends max-age=600), so a visit online gets the latest deploy;
 *   a page is saved for offline use only if it matches this build. They fall
 *   back to the cached page when offline or after a few
 *   seconds without an answer.
 * - Everything else of this origin comes from the cache, falling back to the
 *   network (and is cached then, so a new build's files stay available).
 */

/* global VERSION, PRECACHE */

const PREFIX = 'me1-mate-';
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = new URL('index.html', self.registration.scope).href;
const SCOPE = self.registration.scope;
/** How long a page request may take before the cached page is used instead. */
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Past the HTTP cache, so a new build never precaches an old file.
      await cache.addAll(PRECACHE.map((path) => new Request(path, { cache: 'reload' })));
      if (!(await matchesBuild(await cache.match(SHELL)))) {
        // A query string misses the CDN's cached copy.
        const fresh = await fetch(`${SHELL}?v=${VERSION}`, { cache: 'reload' });
        if (!fresh.ok || !(await matchesBuild(fresh.clone()))) {
          throw new Error('The page served is not from this build');
        }
        await cache.put(SHELL, fresh);
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  event.respondWith(request.mode === 'navigate' ? page(request) : asset(request));
});

/** Network first, so online visits get the latest build; the cached page offline. */
const page = async (request) => {
  const cache = await caches.open(CACHE);
  const bare = request.url.split(/[?#]/)[0];
  const isShell = bare === SCOPE || bare === SHELL;
  try {
    const response = await Promise.race([
      // no-cache: ask the server (a cheap 304 when unchanged) rather than trust
      // the HTTP cache, whose old page could name files a deploy has removed.
      fetch(new Request(request, { cache: 'no-cache' })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PAGE_TIMEOUT_MS)),
    ]);
    if (response.ok && isShell && (await matchesBuild(response.clone()))) {
      await cache.put(SHELL, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(SHELL, { ignoreVary: true });
    if (cached) return cached;
    return Response.error();
  }
};

/** Cache first; files fetched from the network are kept for next time. */
const asset = async (request) => {
  const cache = await caches.open(CACHE);
  // ignoreVary: servers send `Vary: Origin` or `Accept-Encoding`, and the
  // page's crossorigin requests carry an Origin the precache's didn't.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
};

const PRECACHED = new Set(PRECACHE.map((path) => new URL(path, SCOPE).href));

/**
 * Whether a copy of the page names only this build's hashed files (`assets/`),
 * so it will load from this worker's cache offline.
 */
const matchesBuild = async (response) => {
  if (!response) return false;
  const html = await response.text();
  const assets = new URL('assets/', SCOPE).href;
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(ref, SCOPE).href;
    if (url.startsWith(assets) && !PRECACHED.has(url)) return false;
  }
  return true;
};
