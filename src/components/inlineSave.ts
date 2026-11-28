/**
 * Save-once rule for the inline add field.
 *
 * iOS blurs a field for the keyboard's "Done" key, but a tap on the page above
 * the keyboard (or the keyboard sliding away on its own) may not blur it at
 * all. Every one of those gestures — plus navigation, backgrounding and
 * unmounting — funnels through `reduceDraft`. The reducer is pure: it decides
 * what to persist and whether the field closes, and its `settled` flag makes a
 * second event for the same draft harmless.
 */

/** Every way the field can be asked to let go of its draft. */
export type InlineCommitReason =
  | "done" // the keyboard's Done key (arrives as a blur on iOS)
  | "blur"
  | "outside" // pointerdown somewhere else, captured before iOS can blur
  | "keyboard-hide" // the keyboard inset went from open to zero with no blur
  | "switch" // another "+" (or the n shortcut) takes over the field
  | "day-change" // the selected day changed; save to the day it was typed for
  | "navigation" // a task document or a menu page covered the day
  | "unmount"
  | "background"; // visibilitychange / pagehide

export interface DraftState {
  /** Current, untrimmed contents of the field. */
  value: string;
  /** True once this draft has been saved or discarded. */
  settled: boolean;
}

export const emptyDraft: DraftState = { value: "", settled: false };

export type DraftEvent =
  | { type: "change"; value: string }
  /** Enter: save and stay open with an empty field for the next item. */
  | { type: "enter" }
  | { type: "commit"; reason: InlineCommitReason }
  /** Escape: drop the draft without saving. */
  | { type: "cancel" };

export interface DraftResult {
  state: DraftState;
  /** Trimmed text to persist, or null when there is nothing new to save. */
  save: string | null;
  /** Whether the field should close. */
  close: boolean;
}

/**
 * One transition of the field. A non-empty draft is saved at most once: a
 * commit (or an Escape) settles it, and only real new text unsettles it again.
 */
export function reduceDraft(state: DraftState, event: DraftEvent): DraftResult {
  switch (event.type) {
    case "change": {
      // Re-typing the same characters must not resurrect a settled draft; a
      // genuinely new value opens a fresh draft.
      const settled = event.value === state.value ? state.settled : false;
      return { state: { value: event.value, settled }, save: null, close: false };
    }
    case "enter": {
      const clean = state.value.trim();
      const save = !state.settled && clean ? clean : null;
      return { state: { value: "", settled: false }, save, close: false };
    }
    case "commit": {
      if (state.settled) return { state, save: null, close: true };
      const clean = state.value.trim();
      return { state: { value: state.value, settled: true }, save: clean || null, close: true };
    }
    case "cancel":
      return { state: { value: state.value, settled: true }, save: null, close: true };
  }
}

/** Convenience for the component's commit function. */
export function commitDraft(state: DraftState, reason: InlineCommitReason): DraftResult {
  return reduceDraft(state, { type: "commit", reason });
}

/** The older, one-shot helper still used by the category and subtask fields. */
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
