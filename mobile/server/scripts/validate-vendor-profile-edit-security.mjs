import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "..", "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const profileRoutes = read("mobile/server/vendor/profileRoutes.js");
assert.match(profileRoutes, /requireUserJwt\(supabase\)/, "vendor profile routes must require authenticated Supabase JWT");
assert.match(profileRoutes, /\.eq\("owner_user_id", userId\)/, "vendor profile routes must verify vendor ownership server-side");
assert.match(profileRoutes, /ORDINARY_FIELDS/, "ordinary operational fields must be explicitly allow-listed");
assert.match(profileRoutes, /vendor_profile_change_requests/, "sensitive profile edits must create change requests");
assert.match(profileRoutes, /vendor_profile_change_audit/, "profile edits must create audit records");
assert.match(profileRoutes, /secure-account/, "secure account flow must revoke suspicious trusted sessions");

const deviceRoutes = read("mobile/server/auth/deviceRoutes.js");
assert.match(deviceRoutes, /router\.post\("\/trusted-device", requireAuth/, "trusted-device registration must be authenticated");
assert.match(deviceRoutes, /req\.auth\.user_id/, "trusted-device routes must derive user from JWT");
assert.doesNotMatch(deviceRoutes, /const \{ user_id, device_id/, "trusted-device routes must not trust frontend user_id for registration");
assert.match(deviceRoutes, /me\/trusted-devices/, "authenticated current-user trusted device listing must exist");
assert.match(deviceRoutes, /me\/revoke-device/, "authenticated current-user trusted device revocation must exist");

const login = read("mobile/app/auth/Login.tsx");
assert.match(login, /Authorization: `Bearer \$\{data\.session\.access_token\}`/, "OTP trust-device registration must send bearer token");
assert.doesNotMatch(login, /user_id: data\.session\.user\.id/, "OTP trust-device registration must not send user_id from frontend");

const profileScreen = read("mobile/app/vendor/Profile.tsx");
assert.match(profileScreen, /Edit Vendor Profile/, "vendor profile edit screen must exist");
assert.match(profileScreen, /Save Operational Profile/, "ordinary profile updates must be exposed");
assert.match(profileScreen, /Submit Profile Change Request/, "sensitive change request UI must exist");
assert.match(profileScreen, /Trusted Devices/, "trusted devices UI must be exposed in vendor profile");
assert.match(profileScreen, /This Was Not Me - Secure My Account/, "secure-my-account action must exist");

const companyScreenExists = existsSync(resolve(root, "mobile/app/company/VendorProfileChangeRequests.tsx"));
assert.ok(companyScreenExists, "Company CRM vendor profile change request screen must exist");

const migration = read("supabase/RUN_ONLY_VENDOR_PROFILE_EDIT_AND_TRUSTED_DEVICE_SECURITY_2026_08_23.sql");
assert.match(migration, /create table if not exists public\.vendor_profile_change_requests/, "migration must create profile change request table");
assert.match(migration, /create table if not exists public\.vendor_profile_change_audit/, "migration must create profile change audit table");
assert.match(migration, /enable row level security/, "migration must enable RLS");

console.log("Vendor profile edit and trusted-device security validation passed.");
