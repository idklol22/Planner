/** Inline note photos are only needed while a `harness.note` command is being
 *  processed. Once it succeeds, the bytes are stripped from the stored payload
 *  so the database does not keep them. This is a pure helper shared by both
 *  HubStore implementations (in-memory tests and Postgres). */

export const PHOTO_REMOVED = "photo-removed";

const DATA_IMAGE_BASE64 = /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=_-]+/gi;

/** Replace every inline base64 image anywhere in a command payload, recursively.
 *  Non-image data URLs and everything else is left untouched. */
export function redactCommandPayload(payload: unknown): unknown {
  if (typeof payload === "string") return payload.replace(DATA_IMAGE_BASE64, PHOTO_REMOVED);
  if (Array.isArray(payload)) return payload.map((item) => redactCommandPayload(item));
  if (payload !== null && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      out[key] = redactCommandPayload(value);
    }
    return out;
  }
  return payload;
}

/** Only a successful `harness.note` completion strips the stored photos.
 *  Failures and retries must keep the payload so the agent can still run it. */
export function shouldRedactCommand(type: unknown, status: unknown): boolean {
  return type === "harness.note" && status === "done";
}
