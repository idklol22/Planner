import { describe, expect, it } from "vitest";
import {
  PHOTO_REMOVED,
  redactCommandPayload,
  shouldRedactCommand,
} from "../lib/command-payload";

describe("redactCommandPayload", () => {
  it("replaces every inline base64 image in a string", () => {
    const markdown =
      "![a](data:image/png;base64,AAAA) and " +
      "![b](data:image/jpeg;base64,BBBB/==) and " +
      "![c](DATA:IMAGE/SVG+XML;BASE64,PHN2Zz4=)";
    expect(redactCommandPayload(markdown)).toBe(
      `![a](${PHOTO_REMOVED}) and ![b](${PHOTO_REMOVED}) and ![c](${PHOTO_REMOVED})`,
    );
  });

  it("walks nested payloads without changing other fields or URLs", () => {
    const payload = {
      externalId: "task-1",
      markdown: "![x](data:image/png;base64,QUJD)",
      extra: [
        { note: "![y](data:image/webp;base64,MTIz)" },
        "https://example.com/photo.png",
      ],
      plainUrl: "data:image/svg+xml,%3Csvg%3E",
      textUrl: "data:text/plain;base64,SGVsbG8=",
      finished: true,
    };
    expect(redactCommandPayload(payload)).toEqual({
      externalId: "task-1",
      markdown: `![x](${PHOTO_REMOVED})`,
      extra: [{ note: `![y](${PHOTO_REMOVED})` }, "https://example.com/photo.png"],
      plainUrl: "data:image/svg+xml,%3Csvg%3E",
      textUrl: "data:text/plain;base64,SGVsbG8=",
      finished: true,
    });
  });

  it("leaves primitives and null alone", () => {
    expect(redactCommandPayload(null)).toBeNull();
    expect(redactCommandPayload(42)).toBe(42);
    expect(redactCommandPayload(false)).toBe(false);
  });
});

describe("shouldRedactCommand", () => {
  it("only strips the payload of a successfully completed note hand-off", () => {
    expect(shouldRedactCommand("harness.note", "done")).toBe(true);
    expect(shouldRedactCommand("harness.note", "failed")).toBe(false);
    expect(shouldRedactCommand("harness.note", "queued")).toBe(false);
    expect(shouldRedactCommand("harness.note", "claimed")).toBe(false);
    expect(shouldRedactCommand("other", "done")).toBe(false);
    expect(shouldRedactCommand(undefined, "done")).toBe(false);
  });
});
