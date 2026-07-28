const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const source = path.join(projectRoot, "public_hostinger.htaccess");
const distDir = path.join(projectRoot, "dist");
const target = path.join(distDir, ".htaccess");

if (!fs.existsSync(source)) {
  throw new Error(`Missing Hostinger .htaccess template: ${source}`);
}

if (!fs.existsSync(distDir)) {
  throw new Error(`Missing Expo export folder: ${distDir}`);
}

fs.copyFileSync(source, target);
console.log(`Copied Hostinger .htaccess to ${target}`);
