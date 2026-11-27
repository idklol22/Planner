/** Inline `$...$` detection used by the editor's input rule. */
const INLINE_MATH_AT_END = /(?:^|[^$\\])\$([^$\s](?:[^$]*[^$\s])?)\$$/;

export function matchInlineMath(textBeforeCursor: string): { latex: string; length: number } | null {
  const m = INLINE_MATH_AT_END.exec(textBeforeCursor);
  if (!m) return null;
  return { latex: m[1], length: m[1].length + 2 };
}

/** BlockNote's parsed JSON is deliberately loosely typed here (it comes from the parser). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MathJson = any;

type Token = { kind: "text"; text: string } | { kind: "inline" | "display"; latex: string };

function closingDollar(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "$") return text[i + 1] === "$" ? -1 : i;
  }
  return -1;
}

/** Split one text node into literal text, inline `$...$` and display `$$...$$`. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push({ kind: "text", text: plain });
    plain = "";
  };
  for (let i = 0; i < text.length; ) {
    if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: "display", latex: text.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "$") {
      const end = closingDollar(text, i + 1);
      if (end > i + 1) {
        const raw = text.slice(i + 1, end);
        if (raw === raw.trim()) {
          flush();
          out.push({ kind: "inline", latex: raw });
          i = end + 1;
          continue;
        }
      }
    }
    plain += text[i++];
  }
  flush();
  return out;
}

function isCodeNode(node: MathJson): boolean {
  return !!node?.styles?.code || node?.type === "code";
}

function convertInline(content: MathJson[]): MathJson[] | null {
  let changed = false;
  const out: MathJson[] = [];
  for (const node of content) {
    if (node?.type !== "text" || typeof node.text !== "string" || isCodeNode(node)) {
      out.push(node);
      continue;
    }
    const tokens = tokenize(node.text);
    if (tokens.every((token) => token.kind === "text")) {
      out.push(node);
      continue;
    }
    changed = true;
    for (const token of tokens) {
      if (token.kind === "text") out.push({ ...node, text: token.text });
      // A display span mixed with other text cannot become its own block; keep
      // it as maths in place rather than losing the latex.
      else out.push({ type: "math", props: { latex: token.latex } });
    }
  }
  return changed ? out : null;
}

/** Latex when the whole block is exactly one `$$...$$` span, otherwise null. */
function wholeDisplay(content: MathJson[]): string | null {
  if (content.some(isCodeNode)) return null;
  const text = content
    .filter((node) => node?.type === "text" && typeof node.text === "string")
    .map((node) => node.text)
    .join("")
    .trim();
  const tokens = tokenize(text);
  return tokens.length === 1 && tokens[0].kind === "display" ? tokens[0].latex : null;
}

function convertBlock(block: MathJson): MathJson[] {
  if (!block || typeof block !== "object") return [block];
  const nested = Array.isArray(block.children);
  const children = nested ? mathifyParsedBlocks(block.children) : undefined;
  const extraChildren = nested ? { children } : {};
  if (block.type === "codeBlock") return [{ ...block, ...extraChildren }];
  const inline = Array.isArray(block.content) ? convertInline(block.content) : null;
  const display = inline && Array.isArray(block.content) ? wholeDisplay(block.content) : null;
  if (display !== null) {
    // Display maths is a `content: "none"` block: no inline content at all.
    const next = { ...block, type: "displayMath", props: { latex: display }, ...extraChildren };
    delete next.content;
    return [next];
  }
  return [{ ...block, ...(inline ? { content: inline } : {}), ...extraChildren }];
}

/**
 * Convert maths in blocks produced by BlockNote's Markdown parser: `$$...$$`
 * becomes a display maths block, `$...$` becomes the existing inline math node.
 * Code blocks and inline code spans are left untouched.
 */
export function mathifyParsedBlocks(blocks: MathJson[] | undefined | null): MathJson[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap(convertBlock);
}
