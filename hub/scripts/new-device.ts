import { createHash, randomBytes } from "node:crypto";

/** Generate a device token for the hub. The raw token is shown once; only its
 *  SHA-256 hash is stored in D1. */
const name = process.argv.slice(2).join(" ") || "new device";
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const id = `dev_${randomBytes(8).toString("hex")}`;
const createdAt = new Date().toISOString();
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

const sql =
  `INSERT INTO device (id, name, token_hash, created_at, revoked_at) VALUES (` +
  `${quote(id)}, ${quote(name)}, ${quote(hash)}, ${quote(createdAt)}, NULL);`;

console.log("Device token (save it now — it is not stored):");
console.log(token);
console.log("\nSHA-256:");
console.log(hash);
console.log("\nSQL:");
console.log(sql);
console.log("\nInsert locally:");
console.log(`npx wrangler d1 execute planner --local --command ${quote(sql)}`);
console.log("\nInsert remotely (when deploying):");
console.log(`npx wrangler d1 execute planner --remote --command ${quote(sql)}`);
