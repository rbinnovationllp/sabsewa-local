import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const onboardingRoutes = read("mobile/server/vendor/onboardingRoutes.js");
const registerScreen = read("mobile/app/auth/Register.tsx");
const loginScreen = read("mobile/app/auth/Login.tsx");
const registrationCompletion = read("mobile/lib/registrationCompletion.ts");
const authEntry = read("mobile/app/auth/index.tsx");
const publicHome = read("mobile/app/index.tsx");
const rootLayout = read("mobile/app/_layout.tsx");
const companyLayout = read("mobile/app/company/_layout.tsx");
const hlmLanding = read("mobile/app/hlm/index.tsx");
const authProvider = read("mobile/providers/AuthProvider.tsx");
const roleRouter = read("mobile/utils/roleRouter.ts");
const apiSecurity = read("mobile/server/security/apiSecurity.js");
const adminProfileService = read("mobile/server/company/adminProfileService.js");
const serviceWorker = read("mobile/web-public/service-worker.js");
const legacyVendorRegistrationRoute = read("mobile/app/vendor-registration.tsx");
const publicVendorRegistrationRoute = read("mobile/app/vendor/register.tsx");
const walletScreen = read("mobile/app/vendor/SecurityWallet.tsx");
const sql = read("supabase/RUN_ONLY_VENDOR_ENTITY_BRANCH_ONBOARDING_FOUNDATION_2026_08_22.sql");

assert.match(onboardingRoutes, /router\.post\("\/detect-existing-registration"/, "existing vendor detection route must exist");
assert.match(onboardingRoutes, /register_additional_branch/, "additional branch action must be handled by backend");
assert.match(onboardingRoutes, /register_additional_legal_entity/, "additional legal entity action must be handled by backend");
assert.match(onboardingRoutes, /add_authorized_terminal/, "additional terminal action must be handled by backend");
assert.match(onboardingRoutes, /business_establishment_address_proof/, "vendor/branch KYC must require business-establishment address proof");
assert.match(onboardingRoutes, /occupancyTypes/, "vendor/branch KYC must capture premises occupancy type");

assert.match(registerScreen, /You are already registered with SabSewa Local/, "repeat vendor registration message must be visible");
assert.match(registerScreen, /Register Another Branch of Existing Business/, "additional branch choice must be visible");
assert.match(registerScreen, /Register Another Business \/ Legal Entity/, "additional legal entity choice must be visible");
assert.match(registerScreen, /Add Another Authorized Terminal \/ Device/, "additional terminal choice must be visible");
assert.match(registerScreen, /pathname === "\/vendor\/register"/, "shared registration screen must infer vendor role on public vendor route");
assert.match(registerScreen, /openVendorOnlyRoute\("\/vendor\/dashboard"\)/, "existing vendor dashboard action must use vendor dashboard route");
assert.match(registerScreen, /openVendorOnlyRoute\("\/vendor\/KYC"\)/, "existing vendor KYC action must require vendor-session-aware routing");
assert.match(registerScreen, /openVendorOnlyRoute\("\/vendor\/SecurityWallet"\)/, "existing vendor payment action must require vendor-session-aware routing");
assert.match(registerScreen, /You are signed in with a non-vendor account/, "non-vendor sessions must not be redirected from vendor actions to admin CRM");
assert.doesNotMatch(registerScreen, /registered_vendor_phone:\s*registeredVendorPhone/, "existing registration decision payload must not send full stored vendor phone");
assert.doesNotMatch(registerScreen, /with mobile \{registeredVendorPhone\}/, "existing registration notice must not expose full stored vendor phone");
assert.match(registerScreen, /savePendingRegistrationDraft\(formattedPhone, authMetadata\)/, "vendor phone registration must save the pending registration draft before OTP");
assert.match(registerScreen, /savePendingRegistrationDraft\(email\.trim\(\)\.toLowerCase\(\), authMetadata\)/, "vendor email registration must save the pending registration draft before OTP");
assert.match(publicHome, /window\.location\.href = "\/vendor\/register"/, "Home Register Your Shop must use public vendor route");
assert.match(hlmLanding, /window\.location\.href = "\/vendor\/register"/, "HLM Register as Vendor must use public vendor route");
assert.match(authEntry, /role === "vendor"[\s\S]*router\.push\("\/vendor\/register"/, "Auth role chooser must route vendors to public vendor route");
assert.match(rootLayout, /const handleGoHome = \(\) => \{[\s\S]*router\.replace\("\/" as any\);[\s\S]*\};/, "root Home button must always route to public Home");
assert.doesNotMatch(rootLayout, /router\.replace\("\/company" as any\)/, "root Home button must not route signed-in admins back to Company CRM");
assert.doesNotMatch(companyLayout, /\{renderHeader\(\)\}/, "Company verification page must not render a duplicate nested Home/Back header");
assert.match(authProvider, /isPublicVendorRegistrationRoute/, "auth guard must allow public vendor registration route");
assert.match(authProvider, /pathname === "\/vendor\/register"/, "auth guard must explicitly allow /vendor/register");
assert.match(loginScreen, /params\.registering === "1"[\s\S]*String\(params\.role \|\| pendingMetadata\.role \|\| "customer"\)/, "registration login must prefer intended registration role over stale user metadata");
assert.match(loginScreen, /\/vendor\/KYC\?vendor=\$\{registrationResult\.vendorId\}/, "vendor registration success must route to linked vendor KYC upload");
assert.doesNotMatch(loginScreen, /params\.registering === "1" && role === "vendor"[\s\S]*navigateTo\("\/vendor\/dashboard"\)/, "vendor registration must not route directly to vendor dashboard");
assert.match(registrationCompletion, /already linked to an administrative account/, "vendor registration must block reuse of an administrative account");
assert.match(registrationCompletion, /applicationReference/, "vendor registration completion must return an application reference");
assert.match(registrationCompletion, /vendorId/, "vendor registration completion must return the created or matched vendor id");
assert.match(roleRouter, /lastModuleAllowedForRole/, "role router must validate last_module before honoring it");
assert.match(roleRouter, /lastModule\.startsWith\("\/company"\)[\s\S]*isAdminRole/, "role router must allow /company only for admin roles");
assert.match(authProvider, /metadataRole && !isAdminRoleValue\(metadataRole\)/, "frontend role resolver must ignore admin roles from user_metadata");
assert.match(authProvider, /removeItem\(MASTER_ADMIN_SESSION_STORAGE_KEY\)/, "auth provider must clear cached master admin sessions on logout or non-admin role");
assert.match(apiSecurity, /resolveTrustedRole/, "backend JWT middleware must resolve roles from trusted server-side records");
assert.match(apiSecurity, /admin_profiles/, "backend JWT middleware must check admin profiles for CRM authorization");
assert.match(apiSecurity, /metadataRole && !ADMIN_ROLES\.has\(metadataRole\)/, "backend must ignore admin roles supplied by user_metadata");
assert.doesNotMatch(apiSecurity, /role:\s*data\.user\.user_metadata\?\.role/, "backend must not trust user_metadata directly for req.auth.role");
assert.match(adminProfileService, /profile && profile\.account_status !== "active"/, "Company CRM guard must reject suspended or revoked admin profiles");
assert.doesNotMatch(adminProfileService, /new Set\(\[role, profile\?\.role/, "Company CRM guard must not authorize from request role alone");
assert.match(serviceWorker, /"\/company"/, "service worker must treat Company CRM routes as private network-only routes");
assert.match(serviceWorker, /"\/admin"/, "service worker must treat Admin routes as private network-only routes");
assert.match(legacyVendorRegistrationRoute, /href="\/vendor\/register"/, "legacy vendor-registration route must forward to canonical vendor route");
assert.match(publicVendorRegistrationRoute, /export \{ default \} from "\.\.\/auth\/Register"/, "canonical public vendor route must reuse working registration form");

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
