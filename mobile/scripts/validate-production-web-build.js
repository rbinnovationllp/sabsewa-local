const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const expectedApiUrl = "https://api.sabsewa.in";
const expectedSupabaseUrl = "https://xodmazgfibftorrlbotk.supabase.co";
const expectedSupabaseRef = "xodmazgfibftorrlbotk";

const requiredFiles = [
  ".htaccess",
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "offline.html",
  "robots.txt",
  "sitemap.xml",
  "metadata.json",
  "deployment-meta.json",
  "pwa-icons/icon-192.png",
  "pwa-icons/icon-512.png",
];

const forbiddenNames = [
  ".env",
  ".env.local",
  ".pem",
  ".key",
  "server/",
  "supabase/",
  "package-lock.json",
  "package.json",
];

const secretMarkers = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "service_role",
];

function fail(message) {
  console.error(`Production web build validation failed: ${message}`);
  process.exit(1);
}

function listFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(absolute, relative);
    return relative;
  });
}

if (!fs.existsSync(distDir)) fail(`missing dist directory at ${distDir}`);

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(distDir, file))) fail(`missing required static file: ${file}`);
}

const files = listFiles(distDir);
const normalizedFiles = files.map((file) => file.replace(/\\/g, "/"));

for (const file of normalizedFiles) {
  const lower = file.toLowerCase();
  if (lower.startsWith("server/") || lower.startsWith("supabase/") || lower.startsWith("node_modules/")) {
    fail(`forbidden project directory found in dist: ${file}`);
  }
  if (forbiddenNames.some((name) => lower === name || lower.endsWith(`/${name}`) || lower.endsWith(name))) {
    fail(`forbidden deployment artifact found in dist: ${file}`);
  }
}

const textFiles = normalizedFiles.filter((file) => /\.(html|js|json|webmanifest|txt|xml|htaccess)$/i.test(file));
let combinedText = "";
for (const file of textFiles) {
  const absolute = path.join(distDir, file);
  combinedText += `\n/* ${file} */\n${fs.readFileSync(absolute, "utf8")}`;
}

if (!combinedText.includes(expectedApiUrl)) fail(`production API URL ${expectedApiUrl} was not found in the static bundle`);
if (!combinedText.includes(expectedSupabaseUrl) && !combinedText.includes(expectedSupabaseRef)) {
  fail(`Supabase project ${expectedSupabaseRef} was not found in the static bundle metadata`);
}
if (combinedText.includes("http://localhost:5001") || combinedText.includes("127.0.0.1:5001")) {
  fail("local SabSewa backend URL found in production bundle");
}
if (combinedText.includes("SabSewa-Alert") || combinedText.includes("sabsewa-alert")) {
  fail("incorrect SabSewa-Alert project reference found in production bundle");
}

for (const marker of secretMarkers) {
  if (combinedText.includes(marker)) fail(`server-only secret marker leaked into dist: ${marker}`);
}

const serviceWorker = fs.readFileSync(path.join(distDir, "service-worker.js"), "utf8");
for (const required of ["PRIVATE_PATTERNS", "api.sabsewa.in", "supabase.co", "razorpay", "authorization"]) {
  if (!serviceWorker.includes(required)) fail(`service worker missing private-cache guard: ${required}`);
}

const deploymentMeta = JSON.parse(fs.readFileSync(path.join(distDir, "deployment-meta.json"), "utf8"));
if (deploymentMeta.production_api_url !== expectedApiUrl) fail("deployment metadata has wrong production API URL");
if (deploymentMeta.supabase_project_ref !== expectedSupabaseRef) fail("deployment metadata has wrong Supabase project ref");

console.log("Production web build validation passed: static PWA files only, correct API/Supabase target, no server-secret markers.");
