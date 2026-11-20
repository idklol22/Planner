#!/usr/bin/env node
// Usage: node scripts/supabase-new-device.mjs <name> [--role harness]
// Prints a fresh device token (keep it secret) and the SQL to register it in Supabase.
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const roleAt = args.indexOf("--role");
const role = roleAt >= 0 ? args[roleAt + 1] : "user";
const name = args.find((a, i) => !a.startsWith("--") && i !== roleAt + 1);
if (!name || !role) {
  console.error("usage: node scripts/supabase-new-device.mjs <name> [--role harness]");
  process.exit(1);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const token = randomBytes(32).toString("hex");
const hash = createHash("sha256").update(token).digest("hex");
const id = `dev_${randomBytes(8).toString("hex")}`;
const now = new Date().toISOString();

console.log(`Device token (paste into the app, shown once):\n${token}\n`);
console.log("Run this in the Supabase SQL editor:\n");
console.log(
  `insert into device (id, name, token_hash, role, created_at) values (${q(id)}, ${q(name)}, ${q(hash)}, ${q(role)}, ${q(now)});`,
);
