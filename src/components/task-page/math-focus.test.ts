import { describe, expect, it } from "vitest";

async function source(): Promise<string> {
  const { readFileSync } = await import(/* @vite-ignore */ "node:" + "fs");
  return readFileSync(new URL("./schema.tsx", import.meta.url), "utf8").split("\r\n").join("\n");
}

describe("the inline maths field opens its keyboard from the tap", () => {
  it("does not rely on automatic focus, which WKWebView may ignore", async () => {
    const schema = await source();
    expect(schema).not.toMatch(/\bautoFocus\b/);
  });

  it("renders the input synchronously inside the click, then focuses it", async () => {
    const schema = await source();
    expect(schema).toContain('import { flushSync } from "react-dom"');
    expect(schema).toContain("useRef<HTMLInputElement>(null)");
    expect(schema).toContain("ref={inputRef}");
    const click = /onClick=\{\(\) => \{[\s\S]*?\n      \}\}/.exec(schema)?.[0] ?? "";
    expect(click).toContain("flushSync(");
    expect(click).toContain("inputRef.current?.focus()");
    expect(click.indexOf("flushSync(")).toBeLessThan(click.indexOf("inputRef.current?.focus()"));
    expect(schema).not.toContain("setTimeout");
  });
});
