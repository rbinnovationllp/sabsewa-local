import fs from "fs";
import path from "path";
import assert from "assert";

const root = path.resolve(process.cwd(), "..", "..");
const resetSqlPath = path.join(root, "supabase", "RUN_SAFE_RESET_TEST_DATA.sql");
const resetSql = fs.readFileSync(resetSqlPath, "utf8");
const executableSql = resetSql
  .replace(/--.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

assert.match(
  resetSql,
  /ssl_safe_test_reset_inventory/,
  "Safe reset inventory function must exist"
);
assert.match(
  resetSql,
  /ssl_safe_test_reset_dry_run/,
  "Safe reset dry-run function must exist"
);
assert.match(
  resetSql,
  /ssl_safe_test_reset_execute/,
  "Safe reset execute function must exist"
);
assert.match(
  resetSql,
  /Safe reset rejected: explicit test user IDs, vendor IDs, partner IDs or phone numbers are required/,
  "Safe reset must reject an empty cleanup scope"
);
assert.match(
  resetSql,
  /DELETE APPROVED TEST DATA ONLY/,
  "Safe reset execution must require exact confirmation text"
);
assert.match(
  resetSql,
  /financial_conflict_report/,
  "Safe reset must produce a financial conflict report"
);
assert.match(
  resetSql,
  /Auth users and sessions are not deleted by SQL/,
  "Auth deletion must remain a manual protected service-role step"
);
assert.match(
  resetSql,
  /revoke all on function public\.ssl_safe_test_reset_/,
  "Safe reset functions must not be executable by public/anon/authenticated roles"
);
assert.match(
  resetSql,
  /revoke all on function public\.ssl_delete_by_uuid_column\(text, text, uuid\[\]\) from public, anon, authenticated/,
  "Generic delete helper must not be executable by public/anon/authenticated roles"
);
assert.match(
  resetSql,
  /grant execute on function public\.ssl_safe_test_reset_.* to service_role/s,
  "Safe reset functions must be service-role only"
);
assert.doesNotMatch(
  executableSql,
  /truncate\s+table/i,
  "Safe reset SQL must not use TRUNCATE"
);
assert.doesNotMatch(
  executableSql,
  /cascade/i,
  "Safe reset SQL must not use CASCADE deletion"
);
assert.doesNotMatch(
  executableSql,
  /delete\s+from\s+auth\.users/i,
  "Safe reset SQL must not delete Supabase Auth users directly"
);

console.log("Safe test-data reset validation passed.");
