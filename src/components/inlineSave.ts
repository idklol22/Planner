/** Shared rule for inline "add/rename" fields.
 *
 * Enter or leaving the field saves non-empty text; Escape cancels. On iOS the keyboard's
 * "Done" key only blurs, so blur has to commit — but Enter followed by blur (or a blur fired
 * by tapping a cancel button) must not save twice. A successful commit or a cancellation
 * blocks further commits until the text actually changes.
 */
export interface InlineSave {
  /** Trimmed text worth saving, or null when there is nothing to do. */
  value: string | null;
  /** True when this attempt has already been handled and blur must be ignored. */
  blocked: boolean;
}

export function resolveInlineSave(raw: string, blocked: boolean): InlineSave {
  const value = raw.trim();
  if (blocked || !value) return { value: null, blocked };
  return { value, blocked: true };
}
