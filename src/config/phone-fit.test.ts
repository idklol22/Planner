import { describe, expect, it } from "vitest";
import config from "../../capacitor.config";
import indexHtml from "../../index.html?raw";

describe("phone fit", () => {
  it("never lets Capacitor inset the iOS web view", () => {
    expect(config.ios?.contentInset).toBe("never");
  });

  it("locks zoom and opts into safe areas in the viewport meta", () => {
    const viewport = /<meta\s+name="viewport"\s+content="([^"]+)"/.exec(indexHtml)?.[1] ?? "";
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("maximum-scale=1.0");
    expect(viewport).toContain("user-scalable=no");
    expect(viewport).toContain("viewport-fit=cover");
  });

  it("pins the document to the viewport and floors inputs at 16px", async () => {
    // The project has no @types/node, so load fs dynamically (see theme/themes.test.ts).
    const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8").split("\r\n").join("\n");
    const layout = /html,\s*body,\s*#root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(layout).toContain("width: 100%");
    expect(layout).toContain("height: 100%");
    expect(layout).toContain("margin: 0");
    expect(layout).toContain("overflow: hidden");
    expect(layout).toContain("overscroll-behavior: none");
    expect(css).toContain("--safe-top: env(safe-area-inset-top, 0px)");
    expect(css).toMatch(/input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*16px/);
  });
});
