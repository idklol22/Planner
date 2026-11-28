import { describe, expect, it } from "vitest";

async function healthProvider(): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL("./health.tsx", import.meta.url), "utf8").split("\r\n").join("\n");
}

describe("pulled health days reach the live provider", () => {
  it("re-reads storage into both React state and the ref when a remote row is applied", async () => {
    const source = await healthProvider();
    expect(source).toContain("HEALTH_REMOTE_EVENT");
    expect(source).toMatch(/addEventListener\(HEALTH_REMOTE_EVENT/);
    expect(source).toMatch(/daysRef\.current\s*=\s*next/);
    expect(source).toMatch(/setDays\(next\)/);
  });
});
