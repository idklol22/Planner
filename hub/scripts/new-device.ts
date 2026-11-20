import { createHash, randomBytes } from "node:crypto";

/** Generate a device token for the hub. The raw token is shown once; only its
 *  SHA-256 hash is stored in D1. Pass --role harness for the laptop agent. */
const args = process.argv.slice(2);
const nameParts: string[] = [];
let role = "user";
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--role") {
    role = args[++i] ?? "";
  } else if (arg.startsWith("--role=")) {
    role = arg.slice("--role=".length);
  } else {
    nameParts.push(arg);
  }
}
if (role !== "user" && role !== "harness") {
  console.error("Invalid role: use --role user or --role harness");
  process.exit(1);
}

const name = nameParts.join(" ").trim() || "new device";
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const id = `dev_${randomBytes(8).toString("hex")}`;
const createdAt = new Date().toISOString();
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

const sql =
  `INSERT INTO device (id, name, role, token_hash, created_at, revoked_at) VALUES (` +
  `${quote(id)}, ${quote(name)}, ${quote(role)}, ${quote(hash)}, ${quote(createdAt)}, NULL);`;

console.log("Device token (save it now — it is not stored):");
console.log(token);
console.log("\nRole:");
console.log(role);
console.log("\nSHA-256:");
console.log(hash);
console.log("\nSQL:");
console.log(sql);
console.log("\nInsert locally:");
console.log(`npx wrangler d1 execute planner --local --command ${quote(sql)}`);
console.log("\nInsert remotely (when deploying):");
console.log(`npx wrangler d1 execute planner --remote --command ${quote(sql)}`);
