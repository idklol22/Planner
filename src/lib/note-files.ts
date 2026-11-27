/** Note photos live in IndexedDB as bytes keyed by their SHA-256. Note blocks
 *  only ever contain a short `planner-file:<sha256>` reference, so the note row
 *  (and localStorage) never carries image data. Storage is injectable so the
 *  pure parts can be tested with an in-memory store. */

import type { HubClient } from "../storage/hub";

export const FILE_REF_PREFIX = "planner-file:";
export const DB_NAME = "planner-files";
export const STORE_NAME = "files";
/** Longest edge we keep after downscaling. */
export const MAX_SIDE = 2048;
/** Hard limit for both the original and the re-encoded bytes. */
export const MAX_BYTES = 15 * 1024 * 1024;
/** Small PNGs are already cheap and keep their transparency. */
export const KEEP_PNG_BELOW = 500 * 1024;
export const JPEG_QUALITY = 0.82;

const REF_SOURCE = `${FILE_REF_PREFIX}([0-9a-f]{64})`;
const REF_GLOBAL = new RegExp(REF_SOURCE, "gi");
const REF_EXACT = new RegExp(`^${REF_SOURCE}$`, "i");

/** A tiny inline image used when neither local storage nor the hub has the file. */
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">' +
  '<rect width="320" height="180" fill="#191916"/>' +
  '<path d="M132 66h56v48h-56zM112 130l32-36 22 24 14-16 28 28" fill="none" stroke="#807d72" stroke-width="6" stroke-linejoin="round"/>' +
  "</svg>";

export interface StoredFile {
  hash: string;
  blob: Blob;
  mime: string;
  name: string;
  /** True once the hub has accepted the bytes. */
  uploaded: boolean;
}

export interface FileStore {
  get(hash: string): Promise<StoredFile | undefined>;
  put(file: StoredFile): Promise<void>;
  all(): Promise<StoredFile[]>;
  markUploaded(hash: string): Promise<void>;
}

export interface PreparedImage {
  blob: Blob;
  mime: string;
  name: string;
  width: number;
  height: number;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Scale a rectangle so its longest edge fits `maxSide`, preserving ratio. */
export function fitToMaxSide(
  width: number,
  height: number,
  maxSide: number = MAX_SIDE,
): { width: number; height: number; scale: number } {
  if (!(width > 0) || !(height > 0) || !(maxSide > 0)) {
    return { width: 0, height: 0, scale: 1 };
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/** Return the hash carried by a `planner-file:` ref, or null for any other URL. */
export function parseFileRef(url: string): string | null {
  const match = REF_EXACT.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

/** In-memory store used by tests and as a fallback when IndexedDB is missing. */
export function memoryFileStore(initial: StoredFile[] = []): FileStore {
  const map = new Map(initial.map((file) => [file.hash, { ...file }]));
  return {
    async get(hash) {
      const file = map.get(hash);
      return file ? { ...file } : undefined;
    },
    async put(file) {
      map.set(file.hash, { ...file });
    },
    async all() {
      return [...map.values()].map((file) => ({ ...file }));
    },
    async markUploaded(hash) {
      const file = map.get(hash);
      if (file) map.set(hash, { ...file, uploaded: true });
    },
  };
}

export function placeholderUrl(): string {
  return `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/** Replace every file reference in Markdown with bytes LearnHarness can read.
 *  Unknown files become the inline placeholder, never a dangling reference. */
export async function expandFileRefs(markdown: string, store?: FileStore): Promise<string> {
  const found = markdown.match(REF_GLOBAL);
  if (!found?.length) return markdown;

  let target = store;
  if (!target) {
    try {
      target = getFileStore();
    } catch {
      return markdown;
    }
  }

  const hashes = [...new Set(found.map((ref) => parseFileRef(ref)!).filter(Boolean))];
  const dataUrls = new Map<string, string>();
  for (const hash of hashes) {
    try {
      const file = await target.get(hash);
      dataUrls.set(hash, file ? await blobToDataUrl(file.blob) : placeholderUrl());
    } catch {
      dataUrls.set(hash, placeholderUrl());
    }
  }
  return markdown.replace(REF_GLOBAL, (ref: string, hash: string) => dataUrls.get(hash.toLowerCase()) ?? ref);
}

// ── IndexedDB storage ──────────────────────────────────────────────────────

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Photo storage failed."));
  });
}

function idbDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Photo storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Photo storage failed."));
  });
}

/** The real browser store. Throws a readable error when IndexedDB is blocked. */
export function createIdbFileStore(): FileStore {
  if (typeof indexedDB === "undefined") {
    throw new Error("Photo storage isn't available on this device.");
  }
  let opened: Promise<IDBDatabase> | null = null;
  const open = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "hash" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Photo storage failed."));
    });
    return opened;
  };

  return {
    async get(hash) {
      const database = await open();
      return idbRequest(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(hash));
    },
    async put(file) {
      const database = await open();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(file);
      await idbDone(transaction);
    },
    async all() {
      const database = await open();
      return idbRequest(database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll());
    },
    async markUploaded(hash) {
      const database = await open();
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(hash);
        request.onsuccess = () => {
          const file = request.result as StoredFile | undefined;
          if (file) store.put({ ...file, uploaded: true });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("Photo storage failed."));
        transaction.onabort = () => reject(transaction.error ?? new Error("Photo storage failed."));
      });
    },
  };
}

let activeStore: FileStore | null = null;

/** Lazily created so importing this module never needs IndexedDB. */
export function getFileStore(): FileStore {
  if (!activeStore) activeStore = createIdbFileStore();
  return activeStore;
}

/** Swap the backing store (tests, or a device without IndexedDB). */
export function setFileStore(store: FileStore | null): void {
  activeStore = store;
}

// ── Image preparation ──────────────────────────────────────────────────────

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup(): void;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Older iOS WebViews only decode through an <img>.
    }
  }
  if (typeof Image === "undefined" || typeof document === "undefined") {
    throw new Error("This browser can't read that photo.");
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This browser can't read that photo."));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function jpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
}

/** Keep GIFs and small PNGs byte-for-byte; re-encode everything else as JPEG. */
export async function prepareImage(input: Blob & { name?: string }): Promise<PreparedImage> {
  const mime = (input.type || "").toLowerCase();
  if (!mime.startsWith("image/")) {
    throw new Error("Only images can be added to a note.");
  }
  if (input.size > MAX_BYTES) {
    throw new Error("That photo is over 15 MB. Choose a smaller one.");
  }

  if (mime === "image/gif" || (mime === "image/png" && input.size <= KEEP_PNG_BELOW)) {
    return { blob: input, mime, name: input.name || "image", width: 0, height: 0 };
  }

  const decoded = await decodeImage(input);
  try {
    const size = fitToMaxSide(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't prepare that photo.");
    context.drawImage(decoded.source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("Could not save that photo."))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
    if (blob.size > MAX_BYTES) {
      throw new Error("That photo is still over 15 MB after resizing. Choose a smaller one.");
    }
    return {
      blob,
      mime: "image/jpeg",
      name: jpegName(input.name || "photo"),
      width: size.width,
      height: size.height,
    };
  } finally {
    decoded.cleanup();
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ── Upload queue ───────────────────────────────────────────────────────────

let hubClient: HubClient | null = null;

/** Called by the sync provider; null when the hub is not configured. */
export function setFileHubClient(client: HubClient | null): void {
  hubClient = client;
}

/** Uploads pending files one at a time. A failure leaves the file pending for
 *  the next sync/online retry; a concurrent flush is folded into the current run. */
export class FileUploadQueue {
  private running = false;
  private again = false;

  constructor(private readonly store: FileStore) {}

  async flush(client: HubClient): Promise<number> {
    if (this.running) {
      this.again = true;
      return 0;
    }
    this.running = true;
    let uploaded = 0;
    try {
      do {
        this.again = false;
        const pending = (await this.store.all()).filter((file) => !file.uploaded);
        for (const file of pending) {
          try {
            await client.putFile(file.hash, file.blob, file.mime || file.blob.type || "image/jpeg");
            await this.store.markUploaded(file.hash);
            uploaded += 1;
          } catch {
            // Offline or rejected: keep it pending and try again later.
          }
        }
      } while (this.again);
    } catch {
      // Storage may disappear while the app is running; the queue stays intact.
    } finally {
      this.running = false;
    }
    return uploaded;
  }
}

const queues = new WeakMap<FileStore, FileUploadQueue>();

/** Fire-and-forget upload of whatever is still pending. Never awaited by the UI. */
export function flushPendingUploads(client: HubClient | null, store?: FileStore): Promise<number> {
  if (!client) return Promise.resolve(0);
  try {
    const target = store ?? getFileStore();
    let queue = queues.get(target);
    if (!queue) {
      queue = new FileUploadQueue(target);
      queues.set(target, queue);
    }
    return queue.flush(client);
  } catch {
    return Promise.resolve(0);
  }
}

export function scheduleUploads(client: HubClient | null = hubClient, store?: FileStore): void {
  void flushPendingUploads(client, store).catch(() => {});
}

/** Store prepared bytes and return the short reference used in note blocks. */
export async function saveImage(
  input: Blob & { name?: string },
  store: FileStore = getFileStore(),
): Promise<string> {
  const prepared = await prepareImage(input);
  const hash = await sha256Hex(await prepared.blob.arrayBuffer());
  await store.put({
    hash,
    blob: prepared.blob,
    mime: prepared.mime,
    name: prepared.name,
    uploaded: false,
  });
  scheduleUploads(hubClient, store);
  return `${FILE_REF_PREFIX}${hash}`;
}

// ── URL resolution ─────────────────────────────────────────────────────────

const objectUrls = new Map<string, string>();

/** Drop cached object URLs (tests, or when the editor is torn down). */
export function resetFileUrlCache(): void {
  for (const url of objectUrls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Nothing to revoke in a non-browser environment.
    }
  }
  objectUrls.clear();
}

function objectUrlFor(blob: Blob): string | null {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Resolve a note block URL. Plain URLs pass through; file refs resolve from
 *  local storage first, then the hub, with a small SVG as the last resort. */
export async function resolveFileUrl(
  url: string,
  client: HubClient | null = null,
  store?: FileStore,
): Promise<string> {
  const hash = parseFileRef(url);
  if (!hash) return url;

  const cached = objectUrls.get(hash);
  if (cached) return cached;

  let resolved: string | null = null;
  try {
    const target = store ?? getFileStore();
    let file = await target.get(hash);
    if (!file && client) {
      const blob = await client.getFile(hash);
      file = { hash, blob, mime: blob.type || "image/jpeg", name: hash, uploaded: true };
      await target.put(file);
    }
    if (file) resolved = objectUrlFor(file.blob);
  } catch {
    // Missing or offline: use the placeholder below.
  }
  if (!resolved) return placeholderUrl();
  objectUrls.set(hash, resolved);
  return resolved;
}
