const CACHE_NAME = "sabsewa-local-shell-__BUILD_ID__";
const APP_SHELL = ["/", "/index.html", "/metadata.json", "/favicon.ico", "/offline.html", "/manifest.webmanifest"];
const PRIVATE_PATTERNS = [
  "/api/",
  "/auth/",
  "/rest/v1/",
  "/storage/v1/",
  "/functions/v1/",
  "supabase.co",
  "api.sabsewa.in",
  "razorpay",
  "otp",
  "payment",
  "wallet",
  "address",
  "profile"
];

function isPrivateRequest(request) {
  const url = new URL(request.url);
  const combined = (url.href + " " + url.pathname).toLowerCase();
  if (request.headers.has("authorization")) return true;
  if (request.headers.has("apikey")) return true;
  if (request.cache === "no-store") return true;
  return PRIVATE_PATTERNS.some((pattern) => combined.includes(pattern));
}

function isCacheableAsset(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && (
    url.pathname.startsWith("/_expo/static/") ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/pwa-icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/metadata.json" ||
    url.pathname === "/offline.html"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (isPrivateRequest(event.request)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/index.html")) || (await cache.match("/offline.html"));
      })
    );
    return;
  }

  if (isCacheableAsset(event.request)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "SabSewa Local", body: "You have a SabSewa Local update." };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title || "SabSewa Local", {
      body: payload.body || "You have a SabSewa Local update.",
      icon: "/pwa-icons/icon-192.png",
      badge: "/pwa-icons/icon-192.png",
      data: payload.data || { url: "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(targetUrl).then((nextClient) => (nextClient || client).focus());
        }
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
