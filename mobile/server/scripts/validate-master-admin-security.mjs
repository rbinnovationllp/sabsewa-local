import fs from "fs";
import path from "path";
import assert from "assert";

const root = path.resolve(process.cwd(), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function mustInclude(file, pattern, label) {
  const text = read(file);
  assert.match(text, pattern, `${label} missing in ${file}`);
}

function mustExist(file, label) {
  assert.ok(fs.existsSync(path.join(root, file)), `${label} missing: ${file}`);
}

mustInclude(
  "mobile/server/security/masterAdminSecurity.js",
  /export const MASTER_ADMIN_SESSION_COOKIE = "sabsewa_master_admin_session"/,
  "Master Admin HttpOnly cookie name"
);
mustInclude(
  "mobile/server/security/masterAdminSecurity.js",
  /req\.headers\["x-master-admin-session"\]\s*\|\|\s*cookieToken\(req\)/,
  "Master Admin session guard cookie/header fallback"
);

mustInclude(
  "mobile/server/auth/masterAdminRoutes.js",
  /res\.cookie\(MASTER_ADMIN_SESSION_COOKIE,\s*session\.token,\s*cookieOptions\)/,
  "Master Admin verification cookie"
);
mustInclude(
  "mobile/server/auth/masterAdminRoutes.js",
  /httpOnly:\s*true/,
  "Master Admin cookie HttpOnly flag"
);
mustInclude(
  "mobile/server/auth/masterAdminRoutes.js",
  /path:\s*"\/api"/,
  "Master Admin cookie shared API path"
);
mustInclude(
  "mobile/server/auth/masterAdminRoutes.js",
  /platform === "web"\s*\?\s*\{ expires_at: session\.expires_at, delivery: "http_only_cookie" \}/,
  "Web response avoids exposing Master Admin session token"
);
mustInclude(
  "mobile/server/auth/masterAdminRoutes.js",
  /router\.post\("\/logout"/,
  "Master Admin logout route"
);

mustInclude(
  "mobile/server/company/adminProfileService.js",
  /Master Admin role is required for Company CRM/,
  "Company CRM requires Master Admin role"
);
mustInclude(
  "mobile/server/company/adminProfileService.js",
  /verifyMasterAdminSessionToken\(sessionToken,\s*req\.auth\.user_id\)/,
  "Company CRM requires verified Master Admin session"
);

mustInclude(
  "mobile/app/company/_layout.tsx",
  /const hasMasterAdminRole = String\(role \|\| ""\)\.toLowerCase\(\) === "master_admin"/,
  "Company route layout requires master_admin"
);
mustInclude(
  "mobile/app/company/_layout.tsx",
  /credentials:\s*"include"/,
  "Company route includes HttpOnly cookie credentials"
);
mustInclude(
  "mobile/app/company/_layout.tsx",
  /Platform\.OS !== "web" && json\.master_admin_session\?\.token/,
  "Web does not persist Master Admin token in sessionStorage after verification"
);

mustInclude(
  "mobile/lib/backend.ts",
  /fetch\(apiUrl\(path\), \{ credentials: "include"/,
  "Authenticated backend fetch includes cookies"
);
mustInclude(
  "mobile/server/index.js",
  /cors\(\{ origin: process\.env\.CORS_ORIGIN\?\.split\(","\) \|\| true, credentials: true \}\)/,
  "Backend CORS supports credentialed CRM requests"
);
mustInclude(
  "mobile/server/security/apiSecurity.js",
  /Cache-Control", "no-store, private"/,
  "CRM API responses are marked no-store private"
);

mustInclude(
  "mobile/providers/AuthProvider.tsx",
  /if \(role === "master_admin"\) return "\/company"/,
  "Only master_admin role home targets Company CRM"
);
mustInclude(
  "mobile/providers/AuthProvider.tsx",
  /inCompanyArea && normalizedRole !== "master_admin"/,
  "Non-master users are blocked from Company CRM area"
);
mustInclude(
  "mobile/providers/AuthProvider.tsx",
  /apiUrl\("\/api\/admin\/master\/logout"\)/,
  "Sign out clears Master Admin backend session"
);
mustInclude(
  "mobile/app/index.tsx",
  /\/auth\/Login\?role=vendor&intent=vendor_login/,
  "Home vendor login route stays vendor-scoped"
);
mustInclude(
  "mobile/app/auth/Login.tsx",
  /signedInNonVendor/,
  "Vendor login blocks existing non-vendor sessions"
);

mustExist("mobile/app/admin/crm.tsx", "Admin CRM alias route");
mustExist("mobile/app/master-admin/crm.tsx", "Master Admin CRM alias route");
mustExist("mobile/app/company-crm.tsx", "Company CRM alias route");

console.log("Master Admin security validation passed.");
