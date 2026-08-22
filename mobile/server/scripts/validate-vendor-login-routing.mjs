import fs from "fs";
import path from "path";
import assert from "assert";

const root = path.resolve(process.cwd(), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function mustInclude(file, pattern, label) {
  assert.match(read(file), pattern, `${label} missing in ${file}`);
}

function mustNotInclude(file, pattern, label) {
  assert.doesNotMatch(read(file), pattern, `${label} must not appear in ${file}`);
}

mustInclude(
  "mobile/app/auth/Login.tsx",
  /async function openVerifiedVendorAccount\(authUserId: string\)/,
  "Vendor-intent OTP resolver"
);
mustInclude(
  "mobile/app/auth/Login.tsx",
  /\.from\("vendors"\)[\s\S]*\.eq\("owner_user_id", authUserId\)/,
  "Vendor login verifies authenticated user owns vendor row"
);
mustInclude(
  "mobile/app/auth/Login.tsx",
  /if \(isVendorLoginIntent && params\.registering !== "1"\)[\s\S]*await openVerifiedVendorAccount\(data\.user\.id\);[\s\S]*return;/,
  "Vendor intent bypasses generic role redirect after OTP"
);
mustInclude(
  "mobile/app/auth/Login.tsx",
  /Vendor login successful\. We are opening your vendor account\./,
  "Vendor login success message"
);
mustInclude(
  "mobile/app/auth/Login.tsx",
  /secureTextEntry/,
  "OTP input masking"
);

mustInclude(
  "mobile/lib/vendorLoginRouting.ts",
  /export function vendorDestinationForStatus/,
  "Vendor status routing matrix"
);
mustInclude(
  "mobile/lib/vendorLoginRouting.ts",
  /window\.sessionStorage\.removeItem\(MASTER_ADMIN_SESSION_STORAGE_KEY\)/,
  "Vendor context clears stale Master Admin session token"
);
mustInclude(
  "mobile/lib/vendorLoginRouting.ts",
  /window\.sessionStorage\.setItem\(ACTIVE_ROLE_CONTEXT_STORAGE_KEY, "vendor"\)/,
  "Vendor session context marker"
);
mustInclude(
  "mobile/providers/AuthProvider.tsx",
  /inVendorContext && inVendorArea/,
  "Auth provider allows verified vendor context in vendor area"
);
mustInclude(
  "mobile/providers/AuthProvider.tsx",
  /inVendorContext && inCompanyArea/,
  "Vendor context cannot enter Company CRM"
);
mustInclude(
  "mobile/utils/roleRouter.ts",
  /if \(normalized === "master_admin"\) return "\/company"/,
  "Only master_admin generic route opens Company CRM"
);
mustNotInclude(
  "mobile/utils/roleRouter.ts",
  /if \(isAdminRole\(normalized\)\) return "\/company"/,
  "Broad admin role redirect to Company CRM"
);
mustInclude(
  "mobile/app/vendor/SelectBusiness.tsx",
  /Select Business \/ Branch/,
  "Multiple vendor business selector"
);
mustInclude(
  "mobile/app/vendor/dashboard.tsx",
  /params\.vendor/,
  "Vendor dashboard respects selected vendor"
);
mustInclude(
  "mobile/app/vendor/Onboarding.tsx",
  /params\.vendor/,
  "Vendor onboarding respects selected vendor"
);

console.log("Vendor login routing validation passed.");
