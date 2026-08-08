const { spawnSync } = require("node:child_process");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run("node", ["./node_modules/expo/bin/cli", "export", "--platform", "web"], {
  env: { NODE_OPTIONS: "--max-old-space-size=4096" },
});
run("node", ["./scripts/copy-hostinger-htaccess.js"]);