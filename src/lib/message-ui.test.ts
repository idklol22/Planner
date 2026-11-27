import { describe, expect, it } from "vitest";
import type { MessageRow } from "./messages";
import {
  groupByDay,
  MAX_ATTACHMENT_BYTES,
  needsDownscale,
  pickAudioMime,
  unreadCount,
  validateOutgoing,
} from "./message-ui";

const T0 = "2026-11-27T09:00:00.000Z";
const T1 = "2026-11-27T10:00:00.000Z";

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: "m-1",
    subjectId: null,
    topicId: null,
    sender: "harness",
    text: "hello",
    attachments: [],
    createdAt: T0,
    updatedAt: T0,
    deliveredAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("unreadCount", () => {
  it("counts only live harness rows newer than lastOpenAt", () => {
    const rows = [
      row({ id: "old", createdAt: T0 }),
      row({ id: "new", createdAt: T1 }),
      row({ id: "same", createdAt: "2026-11-27T10:00:00.000Z" }),
      row({ id: "mine", sender: "planner", createdAt: "2026-11-28T00:00:00.000Z" }),
      row({ id: "gone", deletedAt: T1, createdAt: "2026-11-28T00:00:00.000Z" }),
    ];
    expect(unreadCount(rows, T0)).toBe(2);
    expect(unreadCount(rows, T1)).toBe(0);
    expect(unreadCount(rows, null)).toBe(3);
    expect(unreadCount([], T0)).toBe(0);
  });
});

describe("pickAudioMime", () => {
  it("prefers mp4, falls back to webm and returns null with no support", () => {
    const all = () => true;
    expect(pickAudioMime(all)).toBe("audio/mp4");
    expect(pickAudioMime((mime) => mime === "audio/webm")).toBe("audio/webm");
    expect(pickAudioMime(() => false)).toBeNull();
  });
});

describe("validateOutgoing", () => {
  it("accepts a valid text-only message", () => {
    expect(validateOutgoing({ text: "hello laptop" })).toEqual({ ok: true });
  });

  it("rejects empty drafts, too much text, too many files, bad mimes and huge files", () => {
    expect(validateOutgoing({ text: "   " })).toMatchObject({ ok: false });
    expect(validateOutgoing({ text: "x".repeat(20_001) })).toMatchObject({ ok: false });
    expect(
      validateOutgoing({
        text: "ok",
        attachments: Array.from({ length: 7 }, () => ({ mime: "image/jpeg", bytes: 10 })),
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateOutgoing({
        text: "ok",
        attachments: [{ mime: "application/pdf", bytes: 10 }],
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateOutgoing({
        text: "ok",
        attachments: [{ mime: "audio/mp4", bytes: MAX_ATTACHMENT_BYTES + 1 }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("accepts a file-only message at each limit", () => {
    expect(
      validateOutgoing({
        text: "",
        attachments: [{ mime: "image/jpeg", bytes: MAX_ATTACHMENT_BYTES }],
      }),
    ).toEqual({ ok: true });
  });
});

describe("needsDownscale", () => {
  it("downscales past 2048 px or 15 MB, but not at 2048 px", () => {
    expect(needsDownscale({ width: 2048, height: 1024, bytes: 1024 })).toBe(false);
    expect(needsDownscale({ width: 2049, height: 10, bytes: 1024 })).toBe(true);
    expect(needsDownscale({ width: 10, height: 2049, bytes: 1024 })).toBe(true);
    expect(needsDownscale({ width: 10, height: 10, bytes: MAX_ATTACHMENT_BYTES + 1 })).toBe(true);
  });
});

describe("groupByDay", () => {
  it("keeps row order and uses the supplied label per local day", () => {
    const first = new Date(2026, 10, 27, 9, 0).toISOString();
    const second = new Date(2026, 10, 27, 12, 0).toISOString();
    const third = new Date(2026, 10, 28, 8, 0).toISOString();
    const rows = [
      { id: "a", createdAt: first },
      { id: "b", createdAt: second },
      { id: "c", createdAt: third },
    ];
    const label = (date: Date) =>
      date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const groups = groupByDay(rows, label);
    expect(groups.map((group) => group.rows.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
    expect(groups.map((group) => group.label)).toEqual(["27 Nov", "28 Nov"]);
    expect(groups[0].key).not.toBe(groups[1].key);
    expect(groupByDay([], label)).toEqual([]);
  });
});
