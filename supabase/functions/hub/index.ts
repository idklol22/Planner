// Supabase Edge Function entry (Deno). All routing lives in ./lib/logic.ts.
// Deploy with --no-verify-jwt: devices authenticate with their own bearer token,
// checked against the `device` table by the router.
import { handle } from "./lib/logic.ts";
import { PgStore, StorageFileStore, createServiceClient } from "./pg-store.ts";

const client = createServiceClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const store = new PgStore(client);
const files = new StorageFileStore(client);

/** Supabase routes /functions/v1/hub/<route> to the function as /hub/<route>; some setups
 * pass the full prefix. Strip either so the router sees /<route>. */
function stripPrefix(pathname: string): string {
  for (const prefix of ["/functions/v1/hub", "/hub"]) {
    if (pathname === prefix) return "/";
    if (pathname.startsWith(prefix + "/")) return pathname.slice(prefix.length);
  }
  return pathname;
}

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  url.pathname = stripPrefix(url.pathname);
  const routed = new Request(url, req);
  return handle(routed, store, files, {
    CAL_SECRET: Deno.env.get("CAL_SECRET") ?? "",
    ALLOWED_ORIGINS: Deno.env.get("ALLOWED_ORIGINS") ?? "",
  });
});
