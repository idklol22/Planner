import { beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_LIST } from "./themes";

/** "Glass & animated backgrounds" is a master switch, off by default: it forces solid surfaces and no scene. */
describe("glass & animated backgrounds switch", () => {
  const mem = new Map<string, string>();
  const root = { dataset: {} as Record<string, string> };
  beforeEach(() => {
    mem.clear();
    root.dataset = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
    vi.stubGlobal("document", { documentElement: root, querySelector: () => null });
    vi.resetModules();
  });

  it("defaults to wabi with fx off, flat layout and no scene", async () => {
    const s = await import("./store");
    s.initTheme();
    expect(s.loadTheme()).toBe("wabi");
    expect(root.dataset).toMatchObject({ theme: "wabi", fx: "0", scene: "0", layout: "flat" });
  });

  it("with fx off every theme is flat and sceneless, even those that default to glass", async () => {
    const s = await import("./store");
    for (const t of THEME_LIST) {
      s.setTheme(t.id);
      expect(root.dataset.layout, t.id).toBe("flat");
      expect(root.dataset.scene, t.id).toBe("0");
    }
  });

  it("with fx on, scene themes get their scene and glass themes their tiles", async () => {
    const s = await import("./store");
    s.setFx(true);
    s.setTheme("midnight");
    expect(root.dataset).toMatchObject({ fx: "1", scene: "1", layout: "tiles" });
    s.setTheme("contrast");
    expect(root.dataset).toMatchObject({ scene: "0", layout: "flat" });
    s.setTheme("wabi");
    expect(root.dataset).toMatchObject({ scene: "0", layout: "flat" });
  });
});
