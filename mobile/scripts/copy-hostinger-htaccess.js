const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "web-public");
const distDir = path.join(projectRoot, "dist");
const pwaIconDir = path.join(distDir, "pwa-icons");
const buildId = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let content = fs.readFileSync(source);
  if (path.basename(source) === "service-worker.js") {
    content = Buffer.from(content.toString("utf8").replaceAll("__BUILD_ID__", buildId), "utf8");
  }
  fs.writeFileSync(target, content);
}

if (!fs.existsSync(publicDir)) {
  throw new Error(`Missing version-controlled web public assets directory: ${publicDir}`);
}

if (!fs.existsSync(distDir)) {
  throw new Error(`Missing Expo export folder: ${distDir}`);
}

copyRecursive(publicDir, distDir);
console.log(`Copied version-controlled web public assets from ${publicDir} to ${distDir}`);

const indexPath = path.join(distDir, "index.html");
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, "utf8");
  if (!html.includes("manifest.webmanifest")) {
    html = html.replace(
      "</head>",
      [
        '  <meta name="theme-color" content="#0f766e">',
        '  <meta name="apple-mobile-web-app-capable" content="yes">',
        '  <meta name="apple-mobile-web-app-title" content="SabSewa Local">',
        '  <meta name="apple-mobile-web-app-status-bar-style" content="default">',
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

const deploymentMeta = {
  build_id: buildId,
  built_at: new Date().toISOString(),
  source: "mobile/web-public",
  public_app_url: "https://www.sabsewa.in",
  production_api_url: "https://api.sabsewa.in",
  supabase_project_ref: "xodmazgfibftorrlbotk",
  note: "Static frontend deployment only. No database migrations, storage deletion or backend deployment are performed by this export script.",
};

fs.writeFileSync(
  path.join(distDir, "deployment-meta.json"),
  `${JSON.stringify(deploymentMeta, null, 2)}\n`,
  "utf8"
);

console.log("Prepared complete Hostinger PWA public assets in dist");
