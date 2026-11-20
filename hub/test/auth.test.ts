import { beforeAll, describe, expect, it } from "vitest";
import { call, seedDevice } from "./helpers";

const TOKEN = "auth-good-token";

beforeAll(async () => {
  await seedDevice(TOKEN, { name: "good" });
  await seedDevice("auth-revoked-token", { name: "revoked", revoked: true });
});

describe("bearer authentication", () => {
  it("accepts a token whose SHA-256 matches a non-revoked device", async () => {
    const response = await call("/sync", { token: TOKEN });
    expect(response.status).toBe(200);
  });

  it("rejects revoked tokens", async () => {
    const response = await call("/sync", { token: "auth-revoked-token" });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects missing or unknown tokens", async () => {
    expect((await call("/sync")).status).toBe(401);
    expect((await call("/sync", { token: "nope" })).status).toBe(401);
    expect((await call("/sync", { headers: { Authorization: "Basic abc" } })).status).toBe(401);
  });

  it("allows configured web origins and answers preflight without auth", async () => {
    const preflight = await call("/sync", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:1420" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("POST");

    const response = await call("/sync", {
      token: TOKEN,
      headers: { Origin: "http://localhost:1420" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:1420");
    expect(response.headers.get("Vary")).toContain("Origin");

    const other = await call("/sync", {
      token: TOKEN,
      headers: { Origin: "https://evil.example" },
    });
    expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
