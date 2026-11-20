import { beforeAll, describe, expect, it } from "vitest";
import { call, newContext, seedDevice, sha256Hex, type TestContext } from "./helpers";

const ctx: TestContext = newContext();
const TOKEN = "files-token";
const CONTENT = "hello R2 files\n";
const CONTENT_TYPE = "application/pdf";
let sha = "";

async function bodyText(response: Response): Promise<string> {
  return new TextDecoder().decode(await response.arrayBuffer());
}

beforeAll(async () => {
  await seedDevice(ctx, TOKEN);
  sha = await sha256Hex(CONTENT);
});

describe("/files/:sha256", () => {
  it("PUT verifies the hash, stores the content type, and GET/HEAD serve the file", async () => {
    const put = await call(ctx, `/files/${sha}`, {
      method: "PUT",
      token: TOKEN,
      rawBody: CONTENT,
      headers: { "Content-Type": CONTENT_TYPE },
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({
      sha256: sha,
      bytes: new TextEncoder().encode(CONTENT).byteLength,
    });

    const stored = await ctx.files.head(sha);
    expect(stored?.size).toBe(new TextEncoder().encode(CONTENT).byteLength);
    expect(stored?.contentType).toBe(CONTENT_TYPE);

    const head = await call(ctx, `/files/${sha}`, { method: "HEAD", token: TOKEN });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe(CONTENT_TYPE);
    expect(head.headers.get("Accept-Ranges")).toBe("bytes");

    const get = await call(ctx, `/files/${sha}`, { token: TOKEN });
    expect(get.status).toBe(200);
    expect(await bodyText(get)).toBe(CONTENT);
    expect(get.headers.get("Content-Type")).toBe(CONTENT_TYPE);
  });

  it("PUT is idempotent for an existing sha256", async () => {
    const again = await call(ctx, `/files/${sha}`, {
      method: "PUT",
      token: TOKEN,
      rawBody: CONTENT,
      headers: { "Content-Type": CONTENT_TYPE },
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({
      sha256: sha,
      bytes: new TextEncoder().encode(CONTENT).byteLength,
    });
  });

  it("PUT rejects a body whose sha256 does not match the URL", async () => {
    const wrongSha = "0".repeat(64);
    const response = await call(ctx, `/files/${wrongSha}`, {
      method: "PUT",
      token: TOKEN,
      rawBody: CONTENT,
      headers: { "Content-Type": CONTENT_TYPE },
    });
    expect(response.status).toBe(400);
    expect(await ctx.files.head(wrongSha)).toBeNull();
    expect((await call(ctx, `/files/${wrongSha}`, { method: "HEAD", token: TOKEN })).status).toBe(404);
  });

  it("GET supports byte ranges and reports unsatisfiable ranges", async () => {
    const size = new TextEncoder().encode(CONTENT).byteLength;
    const first = await call(ctx, `/files/${sha}`, {
      token: TOKEN,
      headers: { Range: "bytes=0-4" },
    });
    expect(first.status).toBe(206);
    expect(await bodyText(first)).toBe("hello");
    expect(first.headers.get("Content-Range")).toBe(`bytes 0-4/${size}`);
    expect(first.headers.get("Content-Length")).toBe("5");

    const openEnded = await call(ctx, `/files/${sha}`, {
      token: TOKEN,
      headers: { Range: "bytes=6-" },
    });
    expect(openEnded.status).toBe(206);
    expect(await bodyText(openEnded)).toBe(CONTENT.slice(6));

    const suffix = await call(ctx, `/files/${sha}`, {
      token: TOKEN,
      headers: { Range: "bytes=-4" },
    });
    expect(suffix.status).toBe(206);
    expect(await bodyText(suffix)).toBe(CONTENT.slice(-4));

    const invalid = await call(ctx, `/files/${sha}`, {
      token: TOKEN,
      headers: { Range: "bytes=9999-" },
    });
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get("Content-Range")).toBe(`bytes */${size}`);
  });

  it("requires a device token", async () => {
    expect((await call(ctx, `/files/${sha}`, { method: "PUT", rawBody: CONTENT })).status).toBe(401);
    expect((await call(ctx, `/files/${sha}`)).status).toBe(401);
    expect((await call(ctx, `/files/${sha}`, { method: "HEAD" })).status).toBe(401);
  });
});
