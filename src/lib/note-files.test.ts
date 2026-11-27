import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubClient } from "../storage/hub";
import {
  expandFileRefs,
  FILE_REF_PREFIX,
  FileUploadQueue,
  fitToMaxSide,
  flushPendingUploads,
  KEEP_PNG_BELOW,
  memoryFileStore,
  MAX_SIDE,
  parseFileRef,
  placeholderUrl,
  resetFileUrlCache,
  resolveFileUrl,
  type StoredFile,
} from "./note-files";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const refA = `${FILE_REF_PREFIX}${hashA}`;

function stored(fileHash: string, body = "photo", uploaded = false): StoredFile {
  return {
    hash: fileHash,
    blob: new Blob([body], { type: "image/jpeg" }),
    mime: "image/jpeg",
    name: "photo.jpg",
    uploaded,
  };
}

const realCreate = URL.createObjectURL?.bind(URL);
const realRevoke = URL.revokeObjectURL?.bind(URL);

beforeEach(() => {
  resetFileUrlCache();
  URL.createObjectURL = vi.fn(() => "blob:mock") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  resetFileUrlCache();
  if (realCreate) URL.createObjectURL = realCreate;
  if (realRevoke) URL.revokeObjectURL = realRevoke;
  vi.restoreAllMocks();
});

describe("fitToMaxSide", () => {
  it("shrinks the long edge to 2048 and keeps the aspect ratio", () => {
    expect(fitToMaxSide(4032, 3024)).toEqual({ width: 2048, height: 1536, scale: MAX_SIDE / 4032 });
    expect(fitToMaxSide(3024, 4032)).toEqual({ width: 1536, height: 2048, scale: MAX_SIDE / 4032 });
  });

  it("leaves small images alone and honours a custom limit", () => {
    expect(fitToMaxSide(100, 200)).toEqual({ width: 100, height: 200, scale: 1 });
    expect(fitToMaxSide(200, 100, 50)).toEqual({ width: 50, height: 25, scale: 0.25 });
    expect(KEEP_PNG_BELOW).toBe(500 * 1024);
  });

  it("does not produce NaN for an empty rectangle", () => {
    expect(fitToMaxSide(0, 100)).toEqual({ width: 0, height: 0, scale: 1 });
  });
});

describe("parseFileRef", () => {
  it("accepts exact, case-insensitive references", () => {
    expect(parseFileRef(refA)).toBe(hashA);
    expect(parseFileRef(`  ${FILE_REF_PREFIX}${hashA.toUpperCase()}  `)).toBe(hashA);
  });

  it("rejects ordinary URLs and truncated hashes", () => {
    expect(parseFileRef("https://example.com/photo.jpg")).toBeNull();
    expect(parseFileRef(`${FILE_REF_PREFIX}abc`)).toBeNull();
    expect(parseFileRef(`data:image/png;base64,${hashA}`)).toBeNull();
    expect(parseFileRef("")).toBeNull();
  });
});

describe("expandFileRefs", () => {
  it("replaces every reference with a data URL and leaves other URLs intact", async () => {
    const store = memoryFileStore([stored(hashA, "one"), stored(hashB, "two")]);
    const markdown = `![a](${refA}) and ![b](${FILE_REF_PREFIX}${hashB}) and https://example.com/x`;

    expect(await expandFileRefs(markdown, store)).toBe(
      "![a](data:image/jpeg;base64,b25l) and ![b](data:image/jpeg;base64,dHdv) and https://example.com/x",
    );
  });

  it("uses the inline placeholder for a missing file", async () => {
    expect(await expandFileRefs(`![](${refA})`, memoryFileStore())).toBe(`![](${placeholderUrl()})`);
  });

  it("returns text with no references unchanged", async () => {
    expect(await expandFileRefs("Just words", memoryFileStore())).toBe("Just words");
  });
});

describe("FileUploadQueue", () => {
  it("uploads pending bytes and retries the failures on the next pass", async () => {
    const store = memoryFileStore([
      stored(hashA),
      stored(hashB),
      stored("c".repeat(64), "already uploaded", true),
    ]);
    let failB = true;
    const putFile = vi.fn(async (fileHash: string) => {
      if (fileHash === hashB && failB) {
        failB = false;
        throw new Error("offline");
      }
      return { sha256: fileHash, bytes: 4 };
    });
    const client = { putFile } as unknown as HubClient;

    const queue = new FileUploadQueue(store);
    expect(await queue.flush(client)).toBe(1);
    expect((await store.get(hashA))?.uploaded).toBe(true);
    expect((await store.get(hashB))?.uploaded).toBe(false);

    expect(await queue.flush(client)).toBe(1);
    expect((await store.get(hashB))?.uploaded).toBe(true);
    expect(putFile.mock.calls.map((call) => call[0])).toEqual([hashA, hashB, hashB]);
  });

  it("does nothing when no hub client is available", async () => {
    expect(await flushPendingUploads(null, memoryFileStore([stored(hashA)]))).toBe(0);
  });
});

describe("resolveFileUrl", () => {
  it("returns non-file URLs unchanged", async () => {
    const url = "https://example.com/photo.jpg";
    expect(await resolveFileUrl(url, null, memoryFileStore())).toBe(url);
  });

  it("resolves local bytes to a cached object URL", async () => {
    const store = memoryFileStore([stored(hashA)]);
    expect(await resolveFileUrl(refA, null, store)).toBe("blob:mock");
    expect(await resolveFileUrl(refA, null, store)).toBe("blob:mock");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("uses the placeholder when neither storage nor hub has the file", async () => {
    expect(await resolveFileUrl(refA, null, memoryFileStore())).toBe(placeholderUrl());
  });

  it("downloads from the hub, caches the bytes and does not download twice", async () => {
    const store = memoryFileStore();
    const getFile = vi.fn(async () => new Blob(["remote"], { type: "image/png" }));
    const client = { getFile } as unknown as HubClient;

    expect(await resolveFileUrl(refA, client, store)).toBe("blob:mock");
    expect((await store.get(hashA))?.blob.type).toBe("image/png");
    expect((await store.get(hashA))?.uploaded).toBe(true);
    expect(await resolveFileUrl(refA, client, store)).toBe("blob:mock");
    expect(getFile).toHaveBeenCalledTimes(1);
  });

  it("falls back to the placeholder when the hub cannot deliver", async () => {
    const client = {
      getFile: vi.fn(async () => {
        throw new Error("offline");
      }),
    } as unknown as HubClient;
    expect(await resolveFileUrl(refA, client, memoryFileStore())).toBe(placeholderUrl());
  });
});
