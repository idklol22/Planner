/**
 * Pure decision for a pointerdown outside the calorie form.
 *
 * The form's inputs stay mounted while it is collapsed, and iOS often does not
 * blur them when the user taps the page above the keyboard. A document-level
 * pointerdown therefore has to commit the draft itself. Unlike a plain blur,
 * that tap must not also reach the control under the finger, so the click that
 * follows is swallowed — the same rule the inline task field uses.
 *
 * The shared `outsideTapDecision` carries the "a drag produces no click" rule:
 * every pointerdown overwrites the suppression flag, so a touch-scroll that
 * never produced a click cannot swallow the next real tap. This module adds
 * the two calorie-specific pieces: a keep-tap control saves without collapsing
 * the row (its click still has to land on the same button), and a dismissed
 * empty form only swallows when the keyboard was actually up.
 */

import { outsideTapDecision, type OutsideTapDecision } from "./inlineSave";

export interface CalorieTapDecision extends OutsideTapDecision {
  /** Collapse the form on this pointerdown. False for keep-tap controls. */
  close: boolean;
}

/** No action at all — also what clears a stale suppression when closed. */
export const noCalorieTap: CalorieTapDecision = {
  commit: false,
  blur: false,
  suppress: false,
  close: false,
};

/**
 * @param formOpen   The calorie form is expanded (not merely mounted).
 * @param typed      Either field holds uncommitted text.
 * @param keyboardUp The on-screen keyboard is up for the open form.
 * @param keepTap    The tap is on a form control, another "+", "Add goal", etc.
 * @param discard    The tap is on Cancel: its own click throws the draft away,
 *                   so committing here would save what the user just cancelled.
 */
export function calorieOutsideTapDecision(
  formOpen: boolean,
  typed: boolean,
  keyboardUp: boolean,
  keepTap: boolean,
  discard = false,
): CalorieTapDecision {
  // A closed form is never a reason to swallow a click. Returning the empty
  // decision on every pointerdown also clears a suppression left behind by a
  // scroll gesture that produced no click. Cancel is the same kind of no-op:
  // the click that follows does the discarding.
  if (!formOpen || discard) return noCalorieTap;

  // Meters, Remove and other "+" buttons must save the draft, but the
  // row has to stay put until their own click fires — collapsing now would
  // move the button out from under the finger. Their handler decides what to
  // do with the open form once the click has landed.
  if (keepTap) return { ...outsideTapDecision(true, true), commit: true, close: false };

  const dismissal = outsideTapDecision(true, false);
  return {
    commit: dismissal.commit,
    blur: dismissal.blur,
    close: dismissal.commit,
    // Text to lose, or a keyboard the tap is meant to dismiss: swallow the
    // click. An open but empty form with no keyboard lets the tap through.
    suppress: typed || keyboardUp,
  };
}
