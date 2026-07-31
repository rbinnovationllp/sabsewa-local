const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "public_hostinger.htaccess");
const distDir = path.join(projectRoot, "dist");
const target = path.join(distDir, ".htaccess");
const pwaIconDir = path.join(distDir, "pwa-icons");

if (!fs.existsSync(source)) {
  throw new Error(`Missing Hostinger .htaccess template: ${source}`);
}

if (!fs.existsSync(distDir)) {
  throw new Error(`Missing Expo export folder: ${distDir}`);
}

fs.copyFileSync(source, target);
console.log(`Copied Hostinger .htaccess to ${target}`);

const indexPath = path.join(distDir, "index.html");
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, "utf8");
  if (!html.includes("manifest.webmanifest")) {
    html = html.replace(
      "</head>",
      [
        '  <meta name="theme-color" content="#0f766e">',
        '  <link rel="manifest" href="/manifest.webmanifest">',
        '  <link rel="apple-touch-icon" href="/pwa-icons/icon-192.png">',
        "</head>"
      ].join("\n")
    );
  }
  if (!html.includes("navigator.serviceWorker.register")) {
    html = html.replace(
      "</body>",
      [
        '  <script>',
        '    if ("serviceWorker" in navigator) {',
        '      window.addEventListener("load", function () {',
        '        navigator.serviceWorker.register("/service-worker.js").catch(function () {});',
        "      });",
        "    }",
        "  </script>",
        "</body>"
      ].join("\n")
    );
  }
  fs.writeFileSync(indexPath, html, "utf8");
}

fs.mkdirSync(pwaIconDir, { recursive: true });

const iconSource = path.join(projectRoot, "assets", "images", "icon.png");
const splashSource = path.join(projectRoot, "assets", "images", "splash-icon.png");
if (fs.existsSync(iconSource)) {
  fs.copyFileSync(iconSource, path.join(pwaIconDir, "icon-192.png"));
}
if (fs.existsSync(splashSource)) {
  fs.copyFileSync(splashSource, path.join(pwaIconDir, "icon-512.png"));
}

const manifest = {
  name: "SabSewa Local",
  short_name: "SabSewa",
  description: "SabSewa Local hyperlocal marketplace for customers, vendors and riders.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#ffffff",
  theme_color: "#0f766e",
  categories: ["shopping", "business", "food"],
  icons: [
    {
      src: "/pwa-icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any maskable"
    },
    {
      src: "/pwa-icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable"
    }
  ]
};

fs.writeFileSync(
  path.join(distDir, "manifest.webmanifest"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

fs.writeFileSync(
  path.join(distDir, "offline.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SabSewa Local Offline</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 32px; color: #0f172a; background: #f8fafc; }
    main { max-width: 560px; margin: 10vh auto; }
    h1 { color: #0f766e; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>SabSewa Local is offline</h1>
    <p>Please check your internet connection. Saved app screens may open, but live shop, order, wallet and payment information requires secure network access.</p>
  </main>
</body>
</html>
`,
  "utf8"
);

fs.writeFileSync(
  path.join(distDir, "service-worker.js"),
  `const CACHE_NAME = "sabsewa-local-shell-20260731";
const APP_SHELL = ["/", "/index.html", "/metadata.json", "/favicon.ico", "/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/index.html")) || cache.match("/offline.html");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
`,
  "utf8"
);

console.log("Prepared PWA manifest, offline shell and service worker in dist");
