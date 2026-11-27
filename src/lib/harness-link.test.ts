import { afterEach, describe, expect, it, vi } from "vitest";
import type { HSubjectRow } from "../storage/hub";
import { harnessStatus } from "./harness-link";
import { harnessLink } from "./messages";

afterEach(() => {
  vi.useRealTimers();
});

describe("harnessStatus", () => {
  it("asks for cloud sync before anything else", () => {
    expect(
      harnessStatus(false, { exists: true, newestUpdatedAt: "2026-11-20T10:00:00.000Z" }),
    ).toBe("Set up cloud sync first");
    expect(harnessStatus(false, { exists: false, newestUpdatedAt: null })).toBe(
      "Set up cloud sync first",
    );
  });

  it("reports an empty mirror as not linked", () => {
    expect(harnessStatus(true, { exists: false, newestUpdatedAt: null })).toBe("Not linked yet");
  });

  it("formats the newest mirror timestamp with the local locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:34:56.000Z"));
    const newestUpdatedAt = "2026-11-20T10:00:00.000Z";
    expect(harnessStatus(true, { exists: true, newestUpdatedAt })).toBe(
      `Linked, last synced ${new Date(newestUpdatedAt).toLocaleString()}`,
    );
  });

  it("treats a deleted-only mirror as not linked", () => {
    const deleted: HSubjectRow[] = [
      {
        id: "s1",
        name: "Biology",
        color: "#fff",
        order: 0,
        updatedAt: "2026-11-20T10:00:00.000Z",
        deletedAt: "2026-11-21T10:00:00.000Z",
      },
    ];
    expect(harnessStatus(true, harnessLink(deleted))).toBe("Not linked yet");
  });
});
