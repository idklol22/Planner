import { env } from "cloudflare:workers";
import worker from "../src/index";

export const ORIGIN = "https://hub.test";

export interface CallOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  rawBody?: string | Uint8Array | ArrayBuffer;
  headers?: Record<string, string>;
}

/** Call the Worker directly, as a unit test, with the test bindings. */
export async function call(path: string, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  const body =
    options.rawBody !== undefined
      ? options.rawBody
      : options.body === undefined
        ? undefined
        : JSON.stringify(options.body);
  const request = new Request(`${ORIGIN}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });
  return worker.fetch(request, env);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function seedDevice(
  token: string,
  options: { name?: string; revoked?: boolean; role?: "user" | "harness" } = {},
): Promise<string> {
  const id = `dev_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO device (id, name, role, token_hash, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      options.name ?? "test device",
      options.role ?? "user",
      await sha256Hex(token),
      now,
      options.revoked ? now : null,
    )
    .run();
  return id;
}
