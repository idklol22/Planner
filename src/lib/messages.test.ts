import { describe, expect, it, vi } from "vitest";
import {
  HubClient,
  HubError,
  type HubOp,
  type HSubjectRow,
  type PullResult,
  type PushResult,
  type PullRow,
  type TaskRow,
} from "../storage/hub";
import {
  ackMessage,
  CURSOR_KEY,
  harnessLink,
  MessageClient,
  type MessageStorage,
  type MessageTransport,
  mergeThread,
  messageStatus,
  newMessage,
  OUTBOX_KEY,
  sha256Hex,
  THREADS_KEY,
  type MessageRow,
} from "./messages";

const NOW = new Date("2026-11-27T10:00:00.000Z");
const T0 = "2026-11-27T09:00:00.000Z";
const T1 = "2026-11-27T10:00:00.000Z";

function messageRow(overrides: Partial<MessageRow> = {}): MessageRow {
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

function memoryStorage(seed: Record<string, string> = {}): MessageStorage & {
  map: Map<string, string>;
} {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

interface TransportHarness {
  transport: MessageTransport;
  pushCalls: HubOp[][];
  pullCalls: number[];
  putFileCalls: Array<{
    sha256: string;
    bytes: Blob | ArrayBuffer | Uint8Array;
    mime: string;
  }>;
  getFileCalls: string[];
  order: string[];
}

function transportWith(
  handlers: {
    push?: (ops: HubOp[]) => Promise<PushResult>;
    pull?: (since: number) => Promise<PullResult>;
    putFile?: (sha: string, bytes: Blob | ArrayBuffer | Uint8Array, mime: string) =>
      Promise<{ sha256: string; bytes: number }>;
    getFile?: (sha: string) => Promise<Blob>;
  } = {},
): TransportHarness {
  const pushCalls: HubOp[][] = [];
  const pullCalls: number[] = [];
  const putFileCalls: TransportHarness["putFileCalls"] = [];
  const getFileCalls: string[] = [];
  const order: string[] = [];
  return {
    pushCalls,
    pullCalls,
    putFileCalls,
    getFileCalls,
    order,
    transport: {
      push: async (ops) => {
        pushCalls.push(ops);
        order.push("push");
        return handlers.push ? handlers.push(ops) : { applied: ops.length, cursor: 1 };
      },
      pull: async (since = 0) => {
        pullCalls.push(since);
        order.push("pull");
        return handlers.pull
          ? handlers.pull(since)
          : { changes: [], cursor: since + 1, more: false };
      },
      putFile: async (sha, bytes, mime) => {
        putFileCalls.push({ sha256: sha, bytes, mime });
        order.push("putFile");
        return handlers.putFile
          ? handlers.putFile(sha, bytes, mime)
          : { sha256: sha, bytes: bytes instanceof Blob ? bytes.size : bytes.byteLength };
      },
      getFile: async (sha) => {
        getFileCalls.push(sha);
        order.push("getFile");
        return handlers.getFile
          ? handlers.getFile(sha)
          : new Blob(["file"], { type: "application/octet-stream" });
      },
    },
  };
}

function clientWith(
  transport: MessageTransport,
  storage: MessageStorage = memoryStorage(),
  overrides: { now?: () => Date; id?: () => string } = {},
): MessageClient {
  return new MessageClient({
    transport,
    storage,
    now: overrides.now ?? (() => NOW),
    id: overrides.id ?? (() => "m-1"),
  });
}

describe("pure message helpers", () => {
  it("newMessage applies all defaults and uses the injected id/clock", () => {
    expect(newMessage({ text: "hi" }, { id: "m-1", now: NOW })).toEqual({
      id: "m-1",
      subjectId: null,
      topicId: null,
      sender: "planner",
      text: "hi",
      attachments: [],
      createdAt: T1,
      updatedAt: T1,
      deliveredAt: null,
      deletedAt: null,
    });
  });

  it("messageStatus distinguishes queued, received and sent", () => {
    expect(messageStatus(messageRow(), true)).toBe("queued");
    expect(messageStatus(messageRow(), false)).toBe("sent");
    expect(messageStatus(messageRow({ deliveredAt: T1 }), false)).toBe("received");
    expect(messageStatus(messageRow({ deliveredAt: T1 }), true)).toBe("queued");
  });

  it("mergeThread drops tombstones, dedupes by newest update, sorts and tags status", () => {
    const rows: MessageRow[] = [
      messageRow({
        id: "b",
        createdAt: T1,
        updatedAt: T0,
        text: "b",
        deliveredAt: T1,
      }),
      messageRow({ id: "a", createdAt: T0, updatedAt: T0, text: "old" }),
      messageRow({ id: "a", createdAt: T0, updatedAt: T1, text: "new" }),
      messageRow({ id: "gone", createdAt: T0, deletedAt: T1 }),
    ];
    expect(
      mergeThread(rows, new Set(["a"])).map(({ id, text, status }) => ({ id, text, status })),
    ).toEqual([
      { id: "a", text: "new", status: "queued" },
      { id: "b", text: "b", status: "received" },
    ]);
  });

  it("ackMessage returns null when delivered and otherwise bumps updatedAt by at least 1ms", () => {
    expect(ackMessage(messageRow({ deliveredAt: T1 }), { now: NOW })).toBeNull();

    const row = messageRow({ sender: "harness" });
    const ack = ackMessage(row, { now: new Date(Date.parse(T0)) });
    expect(ack).not.toBeNull();
    expect(ack?.deliveredAt).toBe(T0);
    expect(ack?.updatedAt).toBe(new Date(Date.parse(T0) + 1).toISOString());
    expect(ack?.text).toBe(row.text);
    expect(ack?.attachments).toBe(row.attachments);
  });

  it("harnessLink ignores deleted subjects and reports the newest live updatedAt", () => {
    const subjects = [
      { id: "s1", name: "A", color: "#fff", order: 0, updatedAt: T0 },
      { id: "s2", name: "B", color: "#fff", order: 1, updatedAt: T1 },
      { id: "s3", name: "C", color: "#fff", order: 2, updatedAt: "2026-11-28T00:00:00.000Z", deletedAt: T1 },
    ] as HSubjectRow[];
    expect(harnessLink(subjects)).toEqual({ exists: true, newestUpdatedAt: T1 });
    expect(harnessLink([])).toEqual({ exists: false, newestUpdatedAt: null });
    expect(harnessLink([subjects[2]])).toEqual({ exists: false, newestUpdatedAt: null });
  });
});

describe("MessageClient.send", () => {
  it("uploads with the computed sha and mime before pushing, then queues the row", async () => {
    const image = new TextEncoder().encode("image-bytes");
    const blob = new Blob([image], { type: "image/png" });
    const sha = await sha256Hex(image);
    const { transport, putFileCalls, pushCalls, order } = transportWith({
      push: async () => {
        throw new Error("offline");
      },
    });
    const storage = memoryStorage();
    const client = clientWith(transport, storage);

    const row = await client.send({
      text: "photo",
      subjectId: "subject-1",
      files: [{ name: "p.png", mime: "image/png", bytes: blob, durationSec: 3 }],
    });

    expect(order.slice(0, 2)).toEqual(["putFile", "push"]);
    expect(putFileCalls).toHaveLength(1);
    expect(putFileCalls[0].sha256).toBe(sha);
    expect(putFileCalls[0].mime).toBe("image/png");
    expect(putFileCalls[0].bytes).toBe(blob);
    expect(row.attachments).toEqual([
      { sha256: sha, name: "p.png", mime: "image/png", bytes: image.byteLength, durationSec: 3 },
    ]);
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]).toHaveLength(1);
    expect(pushCalls[0][0].table).toBe("message");
    expect(pushCalls[0][0].row.id).toBe("m-1");
    expect(JSON.parse(storage.getItem(THREADS_KEY)!)).toHaveLength(1);
    expect(client.thread()).toMatchObject([{ id: "m-1", status: "queued" }]);
    expect(JSON.parse(storage.getItem(OUTBOX_KEY)!)).toHaveLength(1);
  });

  it("a failed upload rejects and stores nothing", async () => {
    const { transport, pushCalls } = transportWith({
      putFile: async () => {
        throw new Error("upload down");
      },
    });
    const storage = memoryStorage();
    const client = clientWith(transport, storage);

    await expect(
      client.send({
        text: "photo",
        files: [{ name: "p.png", mime: "image/png", bytes: new ArrayBuffer(4) }],
      }),
    ).rejects.toThrow("upload down");
    expect(pushCalls).toHaveLength(0);
    expect(storage.map.size).toBe(0);
  });
});

describe("MessageClient outbox", () => {
  it("retries with the same id, never duplicates and becomes sent once pushed", async () => {
    let pushes = 0;
    const { transport, pushCalls } = transportWith({
      push: async (ops) => {
        pushes += 1;
        if (pushes === 1) throw new Error("offline");
        return { applied: ops.length, cursor: pushes };
      },
    });
    const storage = memoryStorage();
    const client = clientWith(transport, storage);

    await client.send({ text: "retry me" });
    expect(client.thread()[0].status).toBe("queued");
    expect(JSON.parse(storage.getItem(OUTBOX_KEY)!)).toHaveLength(1);

    expect(await client.flush()).toBe(1);
    expect(pushCalls).toHaveLength(2);
    expect(pushCalls.map((ops) => ops[0].row.id)).toEqual(["m-1", "m-1"]);
    expect(JSON.parse(storage.getItem(OUTBOX_KEY) ?? "[]")).toEqual([]);
    expect(client.thread()[0].status).toBe("sent");
  });
});

describe("MessageClient.pull", () => {
  it("stores only message rows, advances its own cursor and acks harness rows once", async () => {
    const harness = messageRow({ id: "h-1", sender: "harness", text: "from harness" });
    const planner = messageRow({
      id: "p-1",
      sender: "planner",
      text: "from planner",
      createdAt: T1,
      updatedAt: T1,
    });
    const task = { id: "task-1", updatedAt: T0 } as unknown as TaskRow;
    const subject = { id: "s-1", updatedAt: T0 } as HSubjectRow;
    const pageOne: PullResult = {
      changes: [
        { table: "task", row: task as unknown as PullRow },
        { table: "h_subject", row: subject },
        { table: "message", row: harness },
      ],
      cursor: 10,
      more: true,
    };
    const pageTwo: PullResult = {
      changes: [
        { table: "message", row: planner },
        { table: "h_subject", row: subject },
      ],
      cursor: 20,
      more: false,
    };
    const { transport, pushCalls, pullCalls } = transportWith({
      pull: async (since) => (since >= 20
        ? { changes: [{ table: "message", row: harness }], cursor: 20, more: false }
        : since === 0
          ? pageOne
          : pageTwo),
    });
    const storage = memoryStorage({
      "planner.cursor.v1": "999",
      "planner.outbox.v1": "[]",
      unrelated: "keep-me",
    });
    const client = clientWith(transport, storage);

    expect((await client.pull()).map(({ id }) => id)).toEqual(["h-1", "p-1"]);
    expect(pullCalls).toEqual([0, 10]);
    expect(storage.getItem(CURSOR_KEY)).toBe("20");
    expect(storage.getItem("planner.cursor.v1")).toBe("999");
    expect(storage.getItem("planner.outbox.v1")).toBe("[]");
    expect(storage.getItem("unrelated")).toBe("keep-me");
    expect([...storage.map.keys()].sort()).toEqual(
      [CURSOR_KEY, THREADS_KEY, "planner.cursor.v1", "planner.outbox.v1", "unrelated"].sort(),
    );

    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]).toHaveLength(1);
    const ack = pushCalls[0][0].row as MessageRow;
    expect(pushCalls[0][0].table).toBe("message");
    expect(ack.id).toBe("h-1");
    expect(ack.deliveredAt).toBe(T1);
    expect(Date.parse(ack.updatedAt)).toBe(Date.parse(T1));
    expect(ack.text).toBe("from harness");
    expect(client.thread()).toMatchObject([
      { id: "h-1", status: "received" },
      { id: "p-1", status: "sent" },
    ]);

    await client.pull();
    expect(pushCalls).toHaveLength(1);
  });

  it("stops when a non-advancing cursor is returned with more:true", async () => {
    const { transport, pullCalls } = transportWith({
      pull: async () => ({ changes: [], cursor: 0, more: true }),
    });
    const client = clientWith(transport);
    expect(await client.pull()).toEqual([]);
    expect(pullCalls).toEqual([0]);
  });
});

describe("MessageClient attachments", () => {
  it("getAttachment delegates to the transport", async () => {
    const blob = new Blob(["attachment"]);
    const { transport, getFileCalls } = transportWith({ getFile: async () => blob });
    const client = clientWith(transport);
    expect(await client.getAttachment("abc")).toBe(blob);
    expect(getFileCalls).toEqual(["abc"]);
  });
});

describe("HubClient.putFile", () => {
  it("PUTs to /files/<sha> with the bearer token and binary mime, verifying the digest", async () => {
    const bytes = new TextEncoder().encode("file payload");
    const sha = await sha256Hex(bytes);
    const response = new Response("ok", { status: 200 });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response);
    vi.stubGlobal("fetch", fetchMock);
    try {
      const hub = new HubClient("https://hub.example/", "tok");
      expect(await hub.putFile(sha, bytes, "image/png")).toEqual({
        sha256: sha,
        bytes: bytes.byteLength,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`https://hub.example/files/${sha}`);
      expect(init?.method).toBe("PUT");
      expect(init?.headers).toEqual({
        Authorization: "Bearer tok",
        "Content-Type": "image/png",
      });
      expect(init?.body).toBe(bytes);

      await expect(hub.putFile("0".repeat(64), bytes, "image/png")).rejects.toMatchObject({
        name: "HubError",
        status: 400,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws HubError when the hub rejects the upload", async () => {
    const bytes = new ArrayBuffer(2);
    const sha = await sha256Hex(new Uint8Array(bytes));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no space", { status: 507 })),
    );
    try {
      const hub = new HubClient("https://hub.example", "tok");
      await expect(hub.putFile(sha, bytes, "audio/mpeg")).rejects.toBeInstanceOf(HubError);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
