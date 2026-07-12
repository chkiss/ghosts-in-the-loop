// Offline shell, deploy-safe. Navigations are NETWORK-FIRST so a new deploy
// is picked up on any reload (cache-first here once served a stale index whose
// assets were gone — the white-screen bug). Hashed assets are cache-first:
// their names change when their content does. Once loaded, it runs on a plane.
// Bump this to evict everything: the activate handler deletes every cache whose
// name isn't this one. v2 flushes the art that v1 had pinned cache-first.
const CACHE = 'gitl-v2'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.pathname.startsWith('/t')) return // replay/beacon path: never cache

  // The page itself: network-first, cache only as the offline fallback.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  // The art has STABLE filenames (art/seal_cn.png keeps its name when the seal
  // is redrawn), so cache-first would pin the old bytes forever: a returning
  // player would never see a new emblem without a hard refresh. Serve the
  // cached copy instantly, then refresh it in the background — the next load
  // is current. Offline still works: the fetch just fails and the hit stands.
  if (/\.(png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const fresh = fetch(e.request)
          .then((res) => {
            if (res.ok && url.origin === location.origin) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copy))
            }
            return res
          })
          .catch(() => hit)
        return hit || fresh
      }),
    )
    return
  }

  // Everything else is content-hashed (assets/index-<hash>.js): the name changes
  // when the bytes do, so cache-first is safe and free. No HTML fallback —
  // serving index.html where a script was expected is how white screens are made.
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok && url.origin === location.origin) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy))
          }
          return res
        }),
    ),
  )
})
