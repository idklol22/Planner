import { describe, expect, it } from "vitest";

async function css(): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL("../theme.css", import.meta.url), "utf8").split("\r\n").join("\n");
}

describe("theme backgrounds on iOS", () => {
  it("does not use background-attachment: fixed (WKWebView ignores it)", async () => {
    const styles = await css();
    expect(styles).not.toContain("background-attachment");
    expect(styles).not.toMatch(/background:[^;]*\bfixed\b/);
  });

  it("paints the fixed background on a pseudo-element behind the app", async () => {
    const styles = await css();
    const pseudo = /html::before\s*\{([^}]*)\}/.exec(styles)?.[1] ?? "";
    expect(pseudo).toContain("position: fixed");
    expect(pseudo).toContain("inset: 0");
    expect(pseudo).toContain("z-index: -1");
    expect(pseudo).toContain("pointer-events: none");
    // Every themed background moved onto the pseudo-element, not body.
    expect(styles).not.toMatch(/body\s*\{[^}]*background:/);
  });
});
