/** Pure BlockNote JSON to Markdown (no DOM), so it is unit-testable and
 *  handles the custom `taskItem` block and inline `math`. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function styled(text: string, styles: Record<string, unknown> | undefined): string {
  if (!text) return "";
  if (styles?.code) return "`" + text + "`";
  let out = text;
  if (styles?.strike) out = `~~${out}~~`;
  if (styles?.italic) out = `*${out}*`;
  if (styles?.bold) out = `**${out}**`;
  return out;
}

export function inlineToMarkdown(content: Json): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((node: Json) => {
      if (node.type === "math") return `$${node.props?.latex ?? ""}$`;
      if (node.type === "link") return `[${inlineToMarkdown(node.content)}](${node.href})`;
      if (node.type === "text") return styled(node.text, node.styles);
      return "";
    })
    .join("");
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? line : pad + line))
    .join("\n");
}

function blockToText(block: Json, number: number): string {
  const text = inlineToMarkdown(block.content);
  const level = block.props?.level ?? 1;
  switch (block.type) {
    case "heading":
      return `${"#".repeat(Math.min(Math.max(level, 1), 6))} ${text}`;
    case "bulletListItem":
      return `- ${indent(text, "  ")}`;
    case "numberedListItem":
      return `${number}. ${indent(text, "   ")}`;
    case "checkListItem":
    case "taskItem":
      return `- [${block.props?.checked ? "x" : " "}] ${indent(text, "  ")}`;
    case "quote":
      return text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "codeBlock": {
      const lang = block.props?.language && block.props.language !== "text" ? block.props.language : "";
      return "```" + lang + "\n" + text + "\n```";
    }
    case "displayMath":
      return `$$${block.props?.latex ?? ""}$$`;
    case "image": {
      const url = block.props?.url ?? "";
      if (!url) return "";
      return `![${block.props?.caption || block.props?.name || "image"}](${url})`;
    }
    case "divider":
      return "---";
    default:
      return text;
  }
}

const LIST_TYPES = new Set(["bulletListItem", "numberedListItem", "checkListItem", "taskItem"]);

function render(blocks: Json[], depth: number): string[] {
  const out: string[] = [];
  let number = 0;
  let prevType: string | null = null;
  for (const block of blocks) {
    number = block.type === "numberedListItem" ? (prevType === "numberedListItem" ? number + 1 : 1) : 0;
    const line = blockToText(block, number);
    const pad = "  ".repeat(depth);
    const isList = LIST_TYPES.has(block.type);
    const sameList = isList && prevType !== null && LIST_TYPES.has(prevType);
    if (out.length && !sameList) out.push("");
    if (line !== "") {
      out.push(
        line
          .split("\n")
          .map((l) => (l ? pad + l : l))
          .join("\n"),
      );
    }
    if (block.children?.length) {
      const nested = render(block.children, isList ? depth + 1 : depth);
      if (nested.length) out.push(...(isList ? nested : ["", ...nested]));
    }
    prevType = block.type;
  }
  return out;
}

export function blocksToMarkdown(blocks: Json[] | undefined | null): string {
  if (!blocks?.length) return "";
  const body = render(blocks, 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return body ? body + "\n" : "";
}
