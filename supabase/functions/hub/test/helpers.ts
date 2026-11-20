import type { HubConfig } from "../lib/db";
import { handle, sha256Hex } from "../lib/logic";
import { MemoryFileStore, MemoryStore } from "../lib/memory-store";

export const ORIGIN = "https://hub.test";
export const ENV: HubConfig = {
  CAL_SECRET: "test-secret",
  ALLOWED_ORIGINS: "http://localhost:1420",
};

export interface TestContext {
  store: MemoryStore;
  files: MemoryFileStore;
}

export function newContext(): TestContext {
  return { store: new MemoryStore(), files: new MemoryFileStore() };
}

export interface CallOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  rawBody?: string | Uint8Array | ArrayBuffer;
  headers?: Record<string, string>;
}

/** Call the router directly, as a unit test, with the in-memory bindings. */
export async function call(
  ctx: TestContext,
  path: string,
  options: CallOptions = {},
): Promise<Response> {
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
    body: body as BodyInit | undefined,
  });
  return handle(request, ctx.store, ctx.files, ENV);
}

export function seedDevice(
  ctx: TestContext,
  token: string,
  options: { name?: string; revoked?: boolean; role?: string } = {},
): Promise<string> {
  return ctx.store.seedDevice(token, options);
}

export { sha256Hex };
