import { describe, expect, it } from "vitest";

async function source(file: string): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL(file, import.meta.url), "utf8").split("\r\n").join("\n");
}

describe("widget profile upload cannot hang the queue", () => {
  it("abandons an in-flight PUT after a timeout so a newer profile is sent", async () => {
    const runner = await source("./widgets.tsx");
    expect(runner).toContain("new AbortController()");
    expect(runner).toMatch(/setTimeout\(\(\) => abort\.abort\(\), UPLOAD_TIMEOUT_MS\)/);
    expect(runner).toContain("clearTimeout(timeout)");
    expect(runner).toContain("putWidgetProfile(item.value, abort?.signal)");

    const hub = await source("../storage/hub.ts");
    expect(hub).toContain("putWidgetProfile(profile: WidgetProfile, signal?: AbortSignal)");
  });
});
