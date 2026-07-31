const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const archiveRoot = path.join(projectRoot, "web-deployments");
const latestPath = path.join(archiveRoot, "latest-successful.json");

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

const validation = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "validate-production-web-build.js")], {
  cwd: projectRoot,
  stdio: "inherit",
});
if (validation.status !== 0) process.exit(validation.status || 1);

const metaPath = path.join(distDir, "deployment-meta.json");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const buildId = meta.build_id || new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
const archiveDir = path.join(archiveRoot, buildId);

fs.mkdirSync(archiveRoot, { recursive: true });
if (fs.existsSync(archiveDir)) {
  console.log(`Deployment archive already exists: ${archiveDir}`);
} else {
  copyRecursive(distDir, archiveDir);
  console.log(`Archived validated web build: ${archiveDir}`);
}

let previousBuildId = null;
if (fs.existsSync(latestPath)) {
  try {
    previousBuildId = JSON.parse(fs.readFileSync(latestPath, "utf8")).build_id || null;
  } catch {
    previousBuildId = null;
  }
}

fs.writeFileSync(
  latestPath,
  `${JSON.stringify(
    {
      build_id: buildId,
      previous_build_id: previousBuildId && previousBuildId !== buildId ? previousBuildId : null,
      archived_at: new Date().toISOString(),
      archive_dir: archiveDir,
      note: "Static frontend rollback archive only. It contains no database, S3 or backend data.",
    },
    null,
    2
  )}\n`,
  "utf8"
);
