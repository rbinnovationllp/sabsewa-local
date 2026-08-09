import crypto from "crypto";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const rl = readline.createInterface({ input, output });
const secret = await rl.question("Enter Master Admin Secret Code: ", { hideEchoBack: true });
const confirm = await rl.question("Confirm Master Admin Secret Code: ", { hideEchoBack: true });
rl.close();

if (!secret || secret.length < 10) {
  console.error("Secret must be at least 10 characters.");
  process.exit(1);
}
if (secret !== confirm) {
  console.error("Secret confirmation did not match.");
  process.exit(1);
}

const salt = crypto.randomBytes(32).toString("hex");
const hash = crypto.scryptSync(secret, salt, 64).toString("hex");
const signingKey = crypto.randomBytes(48).toString("hex");

console.log("\nAdd these backend-only values to mobile/server/.env on EC2 and local backend. Do not commit them:\n");
console.log(`MASTER_ADMIN_SECRET_SALT=${salt}`);
console.log(`MASTER_ADMIN_SECRET_HASH=${hash}`);
console.log(`MASTER_ADMIN_SESSION_SIGNING_KEY=${signingKey}`);
console.log("MASTER_ADMIN_SESSION_TTL_MS=1800000");
console.log("MASTER_ADMIN_SECRET_MAX_ATTEMPTS=5");
console.log("MASTER_ADMIN_SECRET_LOCKOUT_MS=900000");