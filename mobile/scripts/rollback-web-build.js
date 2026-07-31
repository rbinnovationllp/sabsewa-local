const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const archiveRoot = path.join(projectRoot, "web-deployments");
const latestPath = path.join(archiveRoot, "latest-successful.json");
const requestedBuildId = process.argv[2];

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
  fs.copyFileSync(source, target);
}

function removeContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

if (!fs.existsSync(archiveRoot)) {
  console.error("No web deployment archive exists yet. Run npm run export:web:hostinger first.");
  process.exit(1);
}

let buildId = requestedBuildId;
if (!buildId) {
  if (!fs.existsSync(latestPath)) {
    console.error("Missing latest-successful.json. Pass a build ID explicitly.");
    process.exit(1);
  }
  const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  buildId = latest.previous_build_id || latest.build_id;
}

const archiveDir = path.join(archiveRoot, buildId);
if (!fs.existsSync(archiveDir)) {
  console.error(`Requested archived build does not exist: ${archiveDir}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
removeContents(distDir);
copyRecursive(archiveDir, distDir);

const validation = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "validate-production-web-build.js")], {
  cwd: projectRoot,
  stdio: "inherit",
});
if (validation.status !== 0) process.exit(validation.status || 1);

console.log(`Rolled back dist to archived static web build: ${buildId}`);
