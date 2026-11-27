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
import { unreadCount } from "../lib/message-ui";
import {
  CURSOR_KEY,
  MessageClient,
  OUTBOX_KEY,
  THREADS_KEY,
  type SendMessageInput,
  type ThreadMessage,
} from "../lib/messages";
import { HubClient } from "../storage/hub";
import { isHubConfigured, useSync } from "./sync";

const LAST_OPEN_KEY = "planner.messages.lastOpen.v1";
const POLL_MS = 5_000;

function readLastOpen(): string | null {
  try {
    return localStorage.getItem(LAST_OPEN_KEY);
  } catch {
    return null;
  }
}

function writeLastOpen(value: string): void {
  try {
    localStorage.setItem(LAST_OPEN_KEY, value);
  } catch {
    // private mode / quota: the badge just stays conservative
  }
}

/** A new hub means a new message history: none of the old keys may leak into it. */
function clearMessageStorage(): void {
  try {
    localStorage.removeItem(THREADS_KEY);
    localStorage.removeItem(OUTBOX_KEY);
    localStorage.removeItem(CURSOR_KEY);
    localStorage.removeItem(LAST_OPEN_KEY);
  } catch {
    // ignore
  }
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface MessagesContextValue {
  configured: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;
  thread: ThreadMessage[];
  unread: number;
  refresh(): Promise<void>;
  send(input: SendMessageInput): Promise<void>;
  setActive(active: boolean): void;
  markOpened(): void;
}

const MessagesContext = createContext<MessagesContextValue | null>(null);

/** Message thread for the chat page. Pulls share one in-flight request so
 *  focus, visibility, sync and the active poll can never overlap. */
export function MessagesProvider({ children }: { children: ReactNode }) {
  const sync = useSync();
  const { url, token } = sync.config;
  const configured = isHubConfigured(sync.config);
  const [client, setClient] = useState<MessageClient | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOpenAt, setLastOpenAt] = useState<string | null>(readLastOpen);
  const [active, setActive] = useState(false);
  const clientRef = useRef<MessageClient | null>(null);
  const pullingRef = useRef<Promise<void> | null>(null);
  const generationRef = useRef(0);
  const previousConfig = useRef({ url, token });

  const refresh = useCallback(async () => {
    const current = clientRef.current;
    if (!current) return;
    if (pullingRef.current) {
      await pullingRef.current;
      return;
    }
    const generation = generationRef.current;
    const task = (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await current.pull();
        if (generationRef.current === generation) setThread(rows);
      } catch (cause) {
        if (generationRef.current === generation) setError(failureMessage(cause));
      } finally {
        if (generationRef.current === generation) setLoading(false);
      }
    })();
    pullingRef.current = task;
    try {
      await task;
    } finally {
      if (pullingRef.current === task) pullingRef.current = null;
    }
  }, []);

  // One client per hub. A changed URL or token discards every message key.
  useEffect(() => {
    const previous = previousConfig.current;
    const changed = previous.url !== url || previous.token !== token;
    previousConfig.current = { url, token };
    if (changed) {
      generationRef.current += 1;
      pullingRef.current = null;
      clearMessageStorage();
      setLastOpenAt(null);
      setThread([]);
      setError(null);
    }
    if (!configured) {
      clientRef.current = null;
      setClient(null);
      setLoading(false);
      return;
    }
    const hub = new HubClient(url, token);
    const next = new MessageClient({ transport: hub, storage: localStorage });
    clientRef.current = next;
    setClient(next);
    void refresh();
    return () => {
      if (clientRef.current === next) clientRef.current = null;
    };
  }, [configured, url, token, refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const lastSyncedAt = sync.status.lastSyncedAt;
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    void refresh();
  }, [lastSyncedAt, refresh]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  const send = useCallback(async (input: SendMessageInput) => {
    const current = clientRef.current;
    if (!current) throw new Error("Cloud sync is not configured");
    await current.send(input);
    setThread(current.thread());
  }, []);

  const markOpened = useCallback(() => {
    const now = new Date().toISOString();
    writeLastOpen(now);
    setLastOpenAt(now);
  }, []);

  const unread = useMemo(() => unreadCount(thread, lastOpenAt), [thread, lastOpenAt]);
  const ready = configured && client !== null;
  const value = useMemo<MessagesContextValue>(
    () => ({
      configured,
      ready,
      loading,
      error,
      thread,
      unread,
      refresh,
      send,
      setActive,
      markOpened,
    }),
    [configured, ready, loading, error, thread, unread, refresh, send, markOpened],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages(): MessagesContextValue {
  const value = useContext(MessagesContext);
  if (!value) throw new Error("useMessages must be used inside MessagesProvider");
  return value;
}
