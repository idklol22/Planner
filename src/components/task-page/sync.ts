/** Two-way sync between `taskItem` blocks and real subtasks. Pure. */

export const PLACEHOLDER_TITLE = "Untitled";

export interface BlockState {
  /** BlockNote block id. */
  blockId: string;
  subtaskId: string;
  title: string;
  checked: boolean;
}

export interface SubtaskState {
  id: string;
  title: string;
  done: boolean;
  deleted?: boolean;
}

export interface Snapshot {
  title: string;
  done: boolean;
}

export interface SyncPlan {
  /** Blocks without a subtask yet: create one. */
  create: { blockId: string; title: string }[];
  /** Editor changed: write to the store. */
  toStore: { id: string; title?: string; done?: boolean }[];
  /** Store changed: write to the editor. */
  toBlocks: { blockId: string; title?: string; checked?: boolean }[];
  /** Subtasks whose block disappeared from the document. */
  gone: string[];
  /** Blocks whose subtask was deleted elsewhere. */
  orphaned: string[];
  /** Next snapshot map (subtask id to the state both sides agree on). */
  next: Map<string, Snapshot>;
}

/**
 * `last` is what both sides agreed on after the previous pass. A side that
 * differs from `last` has changed; the editor wins a tie. An empty block
 * title never overwrites the subtask title.
 */
export function planSync(
  blocks: BlockState[],
  subtasks: SubtaskState[],
  last: Map<string, Snapshot>,
): SyncPlan {
  const plan: SyncPlan = { create: [], toStore: [], toBlocks: [], gone: [], orphaned: [], next: new Map() };
  const byId = new Map(subtasks.map((s) => [s.id, s]));
  const seen = new Set<string>();

  for (const block of blocks) {
    if (!block.subtaskId || seen.has(block.subtaskId)) {
      // No subtask yet (or a pasted duplicate of a task block): make a fresh one.
      plan.create.push({ blockId: block.blockId, title: block.title.trim() || PLACEHOLDER_TITLE });
      continue;
    }
    seen.add(block.subtaskId);
    const sub = byId.get(block.subtaskId);
    if (!sub || sub.deleted) {
      plan.orphaned.push(block.blockId);
      continue;
    }
    const prev = last.get(sub.id) ?? { title: sub.title, done: sub.done };
    const agreed: Snapshot = { title: sub.title, done: sub.done };

    const blockTitle = block.title.trim();
    if (block.title !== prev.title && blockTitle !== "" && blockTitle !== sub.title) {
      plan.toStore.push({ id: sub.id, title: blockTitle });
      agreed.title = blockTitle;
    } else if (sub.title !== prev.title && sub.title !== block.title) {
      plan.toBlocks.push({ blockId: block.blockId, title: sub.title });
    }

    if (block.checked !== prev.done && block.checked !== sub.done) {
      const entry = plan.toStore.find((e) => e.id === sub.id);
      if (entry) entry.done = block.checked;
      else plan.toStore.push({ id: sub.id, done: block.checked });
      agreed.done = block.checked;
    } else if (sub.done !== prev.done && sub.done !== block.checked) {
      const entry = plan.toBlocks.find((e) => e.blockId === block.blockId);
      if (entry) entry.checked = sub.done;
      else plan.toBlocks.push({ blockId: block.blockId, checked: sub.done });
    }
    plan.next.set(sub.id, agreed);
  }

  for (const id of last.keys()) {
    const sub = byId.get(id);
    if (!seen.has(id) && sub && !sub.deleted) plan.gone.push(id);
  }
  return plan;
}
