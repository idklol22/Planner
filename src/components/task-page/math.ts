/** Inline `$...$` detection used by the editor's input rule. */
const INLINE_MATH_AT_END = /(?:^|[^$\\])\$([^$\s](?:[^$]*[^$\s])?)\$$/;

export function matchInlineMath(textBeforeCursor: string): { latex: string; length: number } | null {
  const m = INLINE_MATH_AT_END.exec(textBeforeCursor);
  if (!m) return null;
  return { latex: m[1], length: m[1].length + 2 };
}
