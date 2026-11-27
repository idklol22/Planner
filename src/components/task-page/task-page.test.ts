import { describe, expect, it } from "vitest";
import { matchInlineMath, mathifyParsedBlocks } from "./math";
import { blocksToMarkdown } from "./markdown";
import { planSync, type Snapshot } from "./sync";

const text = (t: string, styles: Record<string, boolean> = {}) => ({ type: "text", text: t, styles });

describe("blocksToMarkdown", () => {
  it("exports headings, lists, task blocks, math and code", () => {
    const md = blocksToMarkdown([
      { type: "heading", props: { level: 2 }, content: [text("Plan")] },
      { type: "paragraph", content: [text("Energy "), { type: "math", props: { latex: "E=mc^2" } }, text(" is "), text("key", { bold: true })] },
      { type: "taskItem", props: { subtaskId: "t1", checked: true }, content: [text("Read chapter 3")] },
      { type: "taskItem", props: { subtaskId: "t2", checked: false }, content: [text("Do exercises")] },
      { type: "bulletListItem", content: [text("note")] },
      { type: "codeBlock", props: { language: "ts" }, content: [text("const a = 1;")] },
    ]);
    expect(md).toBe(
      [
        "## Plan",
        "",
        "Energy $E=mc^2$ is **key**",
        "",
        "- [x] Read chapter 3",
        "- [ ] Do exercises",
        "- note",
        "",
        "```ts",
        "const a = 1;",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("numbers lists and nests children", () => {
    const md = blocksToMarkdown([
      { type: "numberedListItem", content: [text("a")], children: [{ type: "bulletListItem", content: [text("x")] }] },
      { type: "numberedListItem", content: [text("b")] },
    ]);
    expect(md).toBe("1. a\n  - x\n2. b\n");
  });

  it("returns empty string for an empty document", () => {
    expect(blocksToMarkdown([])).toBe("");
  });
});

describe("matchInlineMath", () => {
  it("matches a closed $...$ at the end", () => {
    expect(matchInlineMath("so $x^2$")).toEqual({ latex: "x^2", length: 5 });
    expect(matchInlineMath("costs $5 and")).toBeNull();
    expect(matchInlineMath("$ x $")).toBeNull();
  });
});

describe("mathifyParsedBlocks", () => {
  it("turns $...$ in parsed text into inline math nodes", () => {
    expect(
      mathifyParsedBlocks([
        {
          type: "paragraph",
          content: [text("Energy "), text("$E=mc^2$"), text(" is key")],
        },
      ]),
    ).toEqual([
      {
        type: "paragraph",
        content: [
          text("Energy "),
          { type: "math", props: { latex: "E=mc^2" } },
          text(" is key"),
        ],
      },
    ]);
  });

  it("turns a whole $$...$$ block into display maths", () => {
    expect(mathifyParsedBlocks([{ type: "paragraph", content: [text("$$\\frac{a}{b}$$")] }])).toEqual([
      { type: "displayMath", props: { latex: "\\frac{a}{b}" } },
    ]);
  });

  it("does not touch dollars in code blocks, inline code or escaped text", () => {
    const code = { type: "codeBlock", props: { language: "ts" }, content: [text("const $x = 1;")] };
    const inlineCode = { type: "paragraph", content: [text("$x$", { code: true })] };
    expect(mathifyParsedBlocks([code, inlineCode])).toEqual([code, inlineCode]);
  });

  it("converts nested children and leaves non-math text alone", () => {
    expect(
      mathifyParsedBlocks([{ type: "bulletListItem", content: [text("plain")], children: [{ type: "paragraph", content: [text("$y$")] }] }]),
    ).toEqual([
      {
        type: "bulletListItem",
        content: [text("plain")],
        children: [{ type: "paragraph", content: [{ type: "math", props: { latex: "y" } }] }],
      },
    ]);
  });

  it("keeps round-tripped markdown stable", () => {
    // Stand-in for BlockNote's parser: our own exported Markdown split back into
    // BlockNote-shaped blocks. Math must survive the trip unchanged.
    const parseLike = (md: string) =>
      md
        .trim()
        .split(/\n\s*\n/)
        .map((chunk) => {
          if (chunk.startsWith("```")) {
            const [fence, ...lines] = chunk.split("\n");
            return {
              type: "codeBlock",
              props: { language: fence.slice(3) || "text" },
              content: lines.slice(0, -1).map((line) => text(line)),
            };
          }
          return { type: "paragraph", content: [text(chunk)] };
        });

    const original = [
      { type: "displayMath", props: { latex: "E=mc^2" } },
      { type: "paragraph", content: [text("Use "), { type: "math", props: { latex: "x^2" } }, text(" here")] },
      { type: "codeBlock", props: { language: "ts" }, content: [text("const $x = 1;")] },
    ];
    const markdown = blocksToMarkdown(original);
    expect(markdown).toContain("$$E=mc^2$$");
    expect(markdown).toContain("Use $x^2$ here");
    expect(mathifyParsedBlocks(parseLike(markdown))).toEqual(original);
  });
});

describe("planSync", () => {
  const empty = new Map<string, Snapshot>();

  it("creates a subtask for a block without one, with a placeholder title", () => {
    const plan = planSync([{ blockId: "b1", subtaskId: "", title: "", checked: false }], [], empty);
    expect(plan.create).toEqual([{ blockId: "b1", title: "Untitled" }]);
  });

  it("pushes editor changes to the store", () => {
    const last = new Map([["s1", { title: "Old", done: false }]]);
    const plan = planSync(
      [{ blockId: "b1", subtaskId: "s1", title: "New", checked: true }],
      [{ id: "s1", title: "Old", done: false }],
      last,
    );
    expect(plan.toStore).toEqual([{ id: "s1", title: "New", done: true }]);
    expect(plan.toBlocks).toEqual([]);
    expect(plan.next.get("s1")).toEqual({ title: "New", done: true });
  });

  it("pushes store changes to the editor", () => {
    const last = new Map([["s1", { title: "Old", done: false }]]);
    const plan = planSync(
      [{ blockId: "b1", subtaskId: "s1", title: "Old", checked: false }],
      [{ id: "s1", title: "Renamed", done: true }],
      last,
    );
    expect(plan.toBlocks).toEqual([{ blockId: "b1", title: "Renamed", checked: true }]);
    expect(plan.toStore).toEqual([]);
  });

  it("does not overwrite the subtask with an empty block title", () => {
    const last = new Map([["s1", { title: "Untitled", done: false }]]);
    const plan = planSync(
      [{ blockId: "b1", subtaskId: "s1", title: "", checked: false }],
      [{ id: "s1", title: "Untitled", done: false }],
      last,
    );
    expect(plan.toStore).toEqual([]);
    expect(plan.toBlocks).toEqual([]);
  });

  it("reports removed blocks and orphaned blocks", () => {
    const last = new Map([
      ["s1", { title: "A", done: false }],
      ["s2", { title: "B", done: false }],
    ]);
    const plan = planSync(
      [{ blockId: "b2", subtaskId: "s2", title: "B", checked: false }],
      [
        { id: "s1", title: "A", done: false },
        { id: "s2", title: "B", done: false, deleted: true },
      ],
      last,
    );
    expect(plan.gone).toEqual(["s1"]);
    expect(plan.orphaned).toEqual(["b2"]);
  });
});
