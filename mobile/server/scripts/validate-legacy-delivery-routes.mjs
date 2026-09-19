import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..", "..");
const legacyRouteFile = path.join(root, "mobile", "server", "delivery", "deliveryRoutes.js");
const serverIndexFile = path.join(root, "mobile", "server", "index.js");

const legacyRoutes = fs.readFileSync(legacyRouteFile, "utf8");
const serverIndex = fs.readFileSync(serverIndexFile, "utf8");

assert.match(legacyRoutes, /status\(410\)/, "Legacy delivery routes must return HTTP 410");
assert.match(legacyRoutes, /Legacy \/api\/delivery routes are retired/, "Legacy retirement message is missing");
assert.doesNotMatch(legacyRoutes, /from ['"]@supabase\/supabase-js['"]|supabase\./, "Retired routes must not access the database");
assert.match(serverIndex, /app\.use\("\/api\/delivery", deliveryRoutes\)/, "Legacy mount must remain for an explicit retirement response");

const sourceRoots = [path.join(root, "mobile", "app"), path.join(root, "mobile", "components"), path.join(root, "mobile", "services")];
const ignored = new Set(["deliveryRoutes.js"]);
const callerPattern = /\/api\/delivery\/(?:add|assign|status)|apiUrl\([^)]*\/api\/delivery\//;

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(filePath);
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) return [];
    if (ignored.has(entry.name)) return [];
    return [filePath];
  });
}

const activeCallers = sourceRoots.flatMap(walk).filter((filePath) => callerPattern.test(fs.readFileSync(filePath, "utf8")));
assert.equal(activeCallers.length, 0, `Active UI still calls retired delivery routes: ${activeCallers.join(", ")}`);

console.log("Legacy delivery route validation passed: retired routes return 410 and no active UI caller remains.");
