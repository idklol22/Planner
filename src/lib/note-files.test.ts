import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HubClient } from "../storage/hub";
import {
  addPhoto,
  expandFileRefs,
  FILE_REF_PREFIX,
  fitToMaxSide,
  KEEP_PNG_BELOW,
  memoryFileStore,
  MAX_SIDE,
  MissingPhotoError,
  parseFileRef,
  photoBlockName,
  placeholderUrl,
  resetFileUrlCache,
  resolveFileUrl,
  scheduleUploads,
  setFileHubClient,
  setFileStore,
  type FileStore,
  type StoredFile,
} from "./note-files";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const refA = `${FILE_REF_PREFIX}${hashA}`;

function stored(fileHash: string, body = "photo"): StoredFile {
  return {
    hash: fileHash,
    blob: new Blob([body], { type: "image/jpeg" }),
    mime: "image/jpeg",
    name: "photo.jpg",
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
  setFileStore(null);
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

  it("throws a typed error naming the missing ref instead of emitting placeholder bytes", async () => {
    const failure = expandFileRefs(`![](${refA})`, memoryFileStore());
    await expect(failure).rejects.toBeInstanceOf(MissingPhotoError);
    await expect(failure).rejects.toMatchObject({ refs: [refA] });
  });

  it("throws when the store is unavailable or its read throws", async () => {
    const broken: FileStore = {
      get: async () => {
        throw new Error("IndexedDB blocked");
      },
      put: async () => {},
    };
    await expect(expandFileRefs(`![](${refA})`, broken)).rejects.toBeInstanceOf(MissingPhotoError);

    // No device store at all (Node has no IndexedDB): also a missing photo.
    setFileStore(null);
    await expect(expandFileRefs(`![](${refA})`)).rejects.toBeInstanceOf(MissingPhotoError);
  });

  it("does not throw when every ref is readable, and sends no placeholder", async () => {
    const embedded = await expandFileRefs(`![](${refA})`, memoryFileStore([stored(hashA)]));
    expect(embedded).toBe("![](data:image/jpeg;base64,cGhvdG8=)");
    expect(embedded).not.toContain("data:image/svg+xml");
  });

  it("returns text with no references unchanged even when storage is unavailable", async () => {
    expect(await expandFileRefs("Just words", memoryFileStore())).toBe("Just words");
    setFileStore(null);
    expect(await expandFileRefs("Just words")).toBe("Just words");
  });
});

describe("photo naming", () => {
  it("stamps local time in the exact `photo YYYY-MM-DD HH.mm.ss.<ext>` format", () => {
    expect(photoBlockName("image/jpeg", new Date(2026, 10, 27, 9, 5, 3))).toBe(
      "photo 2026-11-27 09.05.03.jpg",
    );
    expect(photoBlockName("image/png", new Date(2026, 0, 1, 0, 0, 0))).toBe(
      "photo 2026-01-01 00.00.00.png",
    );
    expect(photoBlockName("image/gif", new Date(2026, 11, 31, 23, 59, 59))).toBe(
      "photo 2026-12-31 23.59.59.gif",
    );
    expect(photoBlockName("image/jpeg; charset=binary", new Date(2026, 4, 6, 7, 8, 9))).toBe(
      "photo 2026-05-06 07.08.09.jpg",
    );
  });

  it("names a newly added photo from the stored type, not the picked file name", async () => {
    const store = memoryFileStore();
    const picked = Object.assign(new Blob(["GIF89a"], { type: "image/gif" }), {
      name: "IMG_1234.HEIC",
    });
    const when = new Date(2026, 8, 15, 16, 30, 45);
    const { ref, name } = await addPhoto(picked, store, when);

    expect(ref).toMatch(new RegExp(`^${FILE_REF_PREFIX}[0-9a-f]{64}$`));
    expect(name).toBe("photo 2026-09-15 16.30.45.gif");
    expect(await store.get(ref.slice(FILE_REF_PREFIX.length))).toMatchObject({
      mime: "image/gif",
      name,
    });
  });
});

describe("legacy hub hooks", () => {
  it("expose no-op uploads that never touch a hub client or local storage", async () => {
    const putFile = vi.fn();
    const client = { putFile } as unknown as HubClient;
    const store = memoryFileStore([stored(hashA)]);

    expect(() => setFileHubClient(client)).not.toThrow();
    expect(() => scheduleUploads(client, store)).not.toThrow();
    expect(() => setFileHubClient(null)).not.toThrow();
    expect(() => scheduleUploads(null)).not.toThrow();
    expect(putFile).not.toHaveBeenCalled();
    expect(await store.get(hashA)).toEqual(stored(hashA));
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

  it("uses the placeholder when local storage has no file", async () => {
    expect(await resolveFileUrl(refA, null, memoryFileStore())).toBe(placeholderUrl());
  });

  it("never downloads from a hub client, even when one is supplied", async () => {
    const store = memoryFileStore();
    const getFile = vi.fn(async () => new Blob(["remote"], { type: "image/png" }));
    const client = { getFile } as unknown as HubClient;

    expect(await resolveFileUrl(refA, client, store)).toBe(placeholderUrl());
    expect(getFile).not.toHaveBeenCalled();
    expect(await store.get(hashA)).toBeUndefined();
  });
});
