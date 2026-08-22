import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const onboardingRoutes = read("mobile/server/vendor/onboardingRoutes.js");
const registerScreen = read("mobile/app/auth/Register.tsx");
const walletScreen = read("mobile/app/vendor/SecurityWallet.tsx");
const sql = read("supabase/RUN_ONLY_VENDOR_ENTITY_BRANCH_ONBOARDING_FOUNDATION_2026_08_22.sql");

assert.match(onboardingRoutes, /router\.post\("\/detect-existing-registration"/, "existing vendor detection route must exist");
assert.match(onboardingRoutes, /register_additional_branch/, "additional branch action must be handled by backend");
assert.match(onboardingRoutes, /register_additional_legal_entity/, "additional legal entity action must be handled by backend");
assert.match(onboardingRoutes, /add_authorized_terminal/, "additional terminal action must be handled by backend");

assert.match(registerScreen, /You are already registered with SabSewa Local/, "repeat vendor registration message must be visible");
assert.match(registerScreen, /Register Another Branch of Existing Business/, "additional branch choice must be visible");
assert.match(registerScreen, /Register Another Business \/ Legal Entity/, "additional legal entity choice must be visible");
assert.match(registerScreen, /Add Another Authorized Terminal \/ Device/, "additional terminal choice must be visible");

assert.match(walletScreen, /Plan 1 total: Rs 5,590/, "plan 1 total must be shown");
assert.match(walletScreen, /Plan 2 total: Rs 6,180/, "plan 2 total must be shown");
assert.match(walletScreen, /Plan 3 total: Rs 7,360/, "plan 3 total must be shown");
assert.match(walletScreen, /GST is charged only on the non-refundable onboarding\/platform fee/, "GST basis must be explained");

assert.match(sql, /create table if not exists public\.vendor_owner_accounts/i, "owner account table must be created");
assert.match(sql, /create table if not exists public\.vendor_legal_entities/i, "legal entity table must be created");
assert.match(sql, /create table if not exists public\.vendor_branches/i, "branch table must be created");
assert.match(sql, /create table if not exists public\.vendor_onboarding_plans/i, "onboarding plan table must be created");
assert.match(sql, /559000/, "plan 1 paise total must be present");
assert.match(sql, /618000/, "plan 2 paise total must be present");
assert.match(sql, /736000/, "plan 3 paise total must be present");
assert.match(sql, /SECURITY_DEPOSIT_CREDIT/, "security-deposit ledger line must be present");
assert.match(sql, /ONBOARDING_PLATFORM_FEE/, "platform-fee ledger line must be present");
assert.match(sql, /OUTPUT_GST/, "GST ledger line must be present");

console.log("Vendor entity/branch onboarding foundation validation passed.");
