import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle } from "lucide-react";
import { todayISO } from "../domain/dates";
import type { AppData } from "../domain/model";
import type { HarnessNote } from "../lib/harness-types";
import { isTauri } from "../storage";
import { HubClient, type HubOp } from "../storage/hub";
import { MIRROR_KEY, SyncController, type SyncStatus } from "../sync/controller";
import {
  CONFLICTS_KEY,
  describeConflicts,
  type ConflictRecord,
  LocalConflictStore,
} from "../sync/conflicts";
import { localCursorStore, CURSOR_KEY, LAST_SYNC_KEY } from "../sync/engine";
import { applyRemoteHealthRow, getLocalHealthRow } from "../sync/health-apply";
import { emptyMirror, type Mirror } from "../sync/mapping";
import { LocalOutbox, OUTBOX_KEY } from "../sync/queue";
import { useStore } from "./store";

export const HUB_CONFIG_KEY = "planner.hub.v1";
const SYNC_INTERVAL_MS = 60_000;
const COMMAND_POLL_MS = 5_000;
const PUSH_DEBOUNCE_MS = 1_500;

export interface HubConfig {
  url: string;
  token: string;
}

export function loadHubConfig(storage: Pick<Storage, "getItem"> = localStorage): HubConfig {
  try {
    const raw = storage.getItem(HUB_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HubConfig>;
      // A half-filled saved config must not hide the build-time default below.
      if (parsed.url?.trim() && parsed.token?.trim()) return { url: parsed.url.trim(), token: parsed.token.trim() };
    }
  } catch {
    // Unreadable config: treat as not configured.
  }
  // Build-time default for this machine (planner/.env.local, git-ignored; never set in CI builds).
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  return { url: env.VITE_HUB_URL ?? "", token: env.VITE_HUB_TOKEN ?? "" };
}

export const isHubConfigured = (config: HubConfig): boolean =>
  Boolean(config.url.trim() && config.token.trim());

export interface SyncContextValue {
  config: HubConfig;
  /** True when a hub URL and token are set. */
  configured: boolean;
  setConfig(config: HubConfig): void;
  status: SyncStatus;
  mirror: Mirror;
  syncNow(): Promise<void>;
  /** Best-effort save + push on tab hide / app close. */
  flush(): void;
  testConnection(config?: HubConfig): Promise<{ ok: boolean; message: string }>;
  /** Hub mode: queue a `harness.note` command. Rejects when no hub is set. */
  sendNote(note: HarnessNote): Promise<string>;
  /** Queue rows owned outside AppData (health days) for the normal outbox/retry path. */
  enqueue(ops: HubOp[]): void;
  /** Authenticated hub client, or null when not configured. */
  client: HubClient | null;
}

const IDLE: SyncStatus = { syncing: false, lastSyncedAt: null, error: null, pending: 0 };

interface ConflictNotice {
  id: number;
  message: string;
}

/** SyncProvider sits above ToastProvider in App, so its conflict notice uses
 *  the same toast styling directly (like the store's recovery notice). */
function SyncConflictNotice({
  notice,
  onDismiss,
}: {
  notice: ConflictNotice | null;
  onDismiss(): void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!notice) return;
    setOpen(true);
    const timer = window.setTimeout(() => setOpen(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice?.id]);
  if (!notice || !open) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed left-1/2 top-[calc(12px+var(--safe-top))] z-[110] w-max max-w-[calc(100vw-32px)] -translate-x-1/2"
    >
      <div className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line-2 bg-surface-2/95 px-4 py-2.5 text-sm text-ink shadow-2xl shadow-black/50 backdrop-blur-xl">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose" />
        <span>{notice.message}</span>
        <button
          onClick={() => {
            setOpen(false);
            onDismiss();
          }}
          className="ui-press ml-2 shrink-0 text-faint hover:text-ink"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { data, ready, getData, flush: storeFlush, applyData, actions } = useStore();
  const [config, setConfigState] = useState<HubConfig>(() => loadHubConfig());
  const [status, setStatus] = useState<SyncStatus>(IDLE);
  const [mirror, setMirror] = useState<Mirror>(emptyMirror);
  const [conflictNotice, setConflictNotice] = useState<ConflictNotice | null>(null);
  const controllerRef = useRef<SyncController | null>(null);
  const prevDataRef = useRef<AppData | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const onConflicts = useCallback((records: ConflictRecord[]) => {
    if (records.length === 0) return;
    setConflictNotice({ id: Date.now() + Math.random(), message: describeConflicts(records) });
  }, []);

  const configured = isHubConfigured(config);
  const client = useMemo(
    () => (configured ? new HubClient(config.url.trim(), config.token.trim()) : null),
    [configured, config.url, config.token],
  );

  const setConfig = useCallback((next: HubConfig) => {
    const clean = { url: next.url.trim(), token: next.token.trim() };
    setConfigState((old) => {
      if (old.url !== clean.url) {
        try {
          // The old hub's queue, mirror and cursor must not be replayed into a
          // different hub (they would overwrite matching rows with stale data).
          for (const key of [CURSOR_KEY, LAST_SYNC_KEY, OUTBOX_KEY, MIRROR_KEY, CONFLICTS_KEY]) {
            localStorage.removeItem(key);
          }
        } catch {
          // ignore
        }
      }
      try {
        localStorage.setItem(HUB_CONFIG_KEY, JSON.stringify(clean));
      } catch {
        // ignore
      }
      return clean;
    });
  }, []);

  // One controller per hub; torn down when the hub changes or is cleared.
  useEffect(() => {
    if (!client || !ready) {
      controllerRef.current = null;
      setStatus(IDLE);
      return;
    }
    const cursorStore = localCursorStore();
    const controller = new SyncController({
      client,
      getData,
      apply: applyData,
      storage: localStorage,
      outbox: new LocalOutbox(),
      conflicts: new LocalConflictStore(),
      onConflicts,
      cursorStore,
      // Undated solved events belong to the device's day, not UTC's.
      today: () => todayISO(),
      keepalive: (ops) => client.pushKeepalive(ops),
      letcode: {
        addDoneTask: (categoryId, title, date) => actionsRef.current.addDoneTask(categoryId, title, date),
        toggleTask: (id) => actionsRef.current.toggleTask(id),
      },
      recordHandoff: (taskId, patch) => actionsRef.current.recordHandoff(taskId, patch),
      onNoteItems: (categoryId, items) => actionsRef.current.addNoteItems(categoryId, items),
      onMirror: setMirror,
      // Pulled health days are written in the same format HealthProvider reads.
      getLocalHealth: (id) => getLocalHealthRow(localStorage, id),
      applyRemoteHealth: (row) => {
        applyRemoteHealthRow(localStorage, row);
      },
    });
    controllerRef.current = controller;
    prevDataRef.current = getData();
    setMirror(controller.mirror);
    let lastSyncedAt: string | null = null;
    try {
      lastSyncedAt = localStorage.getItem(LAST_SYNC_KEY);
    } catch {
      // ignore
    }
    setStatus({ ...controller.status, lastSyncedAt });
    const unsubscribe = controller.subscribe(() => {
      setStatus(controller.status);
      if (controller.status.lastSyncedAt) {
        try {
          localStorage.setItem(LAST_SYNC_KEY, controller.status.lastSyncedAt);
        } catch {
          // ignore
        }
      }
    });
    if (cursorStore.get() === 0) controller.seedOutbox();
    controller.start(SYNC_INTERVAL_MS);
    const commandTimer = setInterval(() => {
      if (controller.hasOpenCommands()) void controller.trackCommands().catch(() => {});
    }, COMMAND_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(commandTimer);
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [client, ready, getData, applyData, onConflicts]);

  // Local edits -> outbox -> debounced push.
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const controller = controllerRef.current;
    const prev = prevDataRef.current;
    prevDataRef.current = data;
    if (!controller || !prev || prev === data) return;
    controller.handleChange(prev, data);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void controller.engine.push().catch(() => {});
    }, PUSH_DEBOUNCE_MS);
  }, [data]);
  useEffect(
    () => () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    },
    [],
  );

  const syncNow = useCallback(async () => {
    await controllerRef.current?.syncNow();
  }, []);

  const enqueue = useCallback((ops: HubOp[]) => {
    const controller = controllerRef.current;
    if (!controller) {
      // Not connected yet (app start, or no hub): the saved outbox is sent later.
      new LocalOutbox().enqueueAll(ops);
      return;
    }
    controller.enqueue(ops);
    void controller.engine.push().catch(() => {});
  }, []);

  // Stable for the provider's lifetime: the unload listeners hold this function
  // directly, so it must not be replaced on re-renders.
  const flush = useRef<() => void>(() => {
    void storeFlush()
      .catch(() => {})
      .then(() => controllerRef.current?.flush());
  }).current;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", flush);
      window.addEventListener("beforeunload", flush);
    }

    if (isTauri) {
      void (async () => {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const stop = await getCurrentWindow().onCloseRequested(async (event) => {
          event.preventDefault();
          flush();
          await new Promise((r) => setTimeout(r, 300));
          await getCurrentWindow().destroy();
        });
        if (disposed) stop();
        else unlisten = stop;
      })().catch(() => {
        // Listener registration is best effort too.
      });
    }

    return () => {
      disposed = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", flush);
        window.removeEventListener("beforeunload", flush);
      }
      unlisten?.();
    };
  }, [flush]);

  const testConnection = useCallback(
    async (candidate?: HubConfig) => {
      const target = candidate ?? config;
      if (!isHubConfigured(target)) return { ok: false, message: "Enter the hub URL and device token" };
      try {
        await new HubClient(target.url.trim(), target.token.trim()).ping();
        return { ok: true, message: "Connected to the hub" };
      } catch (error) {
        return {
          ok: false,
          message: `Hub not reachable · ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    [config],
  );

  const sendNote = useCallback(
    async (note: HarnessNote) => {
      const controller = controllerRef.current;
      if (!controller) throw new Error("Hub is not configured");
      return controller.sendNote(note);
    },
    [],
  );

  const value = useMemo<SyncContextValue>(
    () => ({ config, configured, setConfig, status, mirror, syncNow, flush, testConnection, sendNote, enqueue, client }),
    [config, configured, setConfig, status, mirror, syncNow, flush, testConnection, sendNote, enqueue, client],
  );

  return (
    <SyncContext.Provider value={value}>
      {children}
      <SyncConflictNotice
        notice={conflictNotice}
        onDismiss={() => setConflictNotice(null)}
      />
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync must be used inside SyncProvider");
  return value;
}
