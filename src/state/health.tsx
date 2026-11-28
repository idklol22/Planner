/** Health data provider: local per-day store + native HealthKit reads. */

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
import { App } from "@capacitor/app";
import type { ISODate } from "../domain/dates";
import {
  HEALTH_CONNECTED_KEY,
  HEALTH_KEY,
  healthToPatch,
  isISODate,
  mergeHealthDay,
  parseHealthData,
  sanitizeHealthData,
  serializeHealthData,
  type HealthData,
  type HealthRecord,
  type HealthValues,
} from "../lib/health";
import { isIOS, readHealth } from "../native/planner-native";
import type { HubOp } from "../storage/hub";
import { useSync } from "./sync";

interface HealthContextValue {
  days: HealthData;
  day(date: ISODate): HealthRecord | null;
  /** True after a successful HealthKit connection. */
  connected: boolean;
  busy: boolean;
  error: string | null;
  /** Newest update timestamp across all stored days. */
  lastUpdatedAt: string | null;
  connect(): Promise<boolean>;
  refresh(): Promise<boolean>;
  /** Store a day from a Shortcut link (or another local source). */
  record(date: ISODate, values: HealthValues, source?: HealthRecord["source"]): HealthRecord | null;
}

const HealthContext = createContext<HealthContextValue | null>(null);

function loadConnected(): boolean {
  try {
    return localStorage.getItem(HEALTH_CONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

function readable(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const sync = useSync();
  const [days, setDays] = useState<HealthData>(() => {
    try {
      return parseHealthData(localStorage.getItem(HEALTH_KEY));
    } catch {
      return {};
    }
  });
  const [connected, setConnected] = useState(loadConnected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const daysRef = useRef(days);
  const connectedRef = useRef(connected);
  const busyRef = useRef(busy);
  const refreshOnMount = useRef(loadConnected());

  const commit = useCallback(
    (next: HealthData, nextConnected: boolean, ops: HubOp[]) => {
      daysRef.current = next;
      connectedRef.current = nextConnected;
      setDays(next);
      setConnected(nextConnected);
      try {
        localStorage.setItem(HEALTH_KEY, serializeHealthData(next));
        localStorage.setItem(HEALTH_CONNECTED_KEY, nextConnected ? "1" : "0");
      } catch {
        // Storage blocked: the current session still works.
      }
      if (ops.length > 0) sync.enqueue(ops);
    },
    [sync.enqueue],
  );

  const record = useCallback(
    (date: ISODate, values: HealthValues, source: HealthRecord["source"] = "shortcut") => {
      if (!isISODate(date)) return null;
      const { record: merged, changed } = mergeHealthDay(
        daysRef.current[date],
        { ...values, date },
        source,
        new Date().toISOString(),
      );
      if (!changed && daysRef.current[date]) return daysRef.current[date];
      const next = { ...daysRef.current, [date]: merged };
      // Push only fields this device actually knows; the hub merges the rest.
      commit(next, connectedRef.current, [{ table: "health", row: healthToPatch(merged) as HubOp["row"] }]);
      return merged;
    },
    [commit],
  );

  const load = useCallback(
    async (markConnected: boolean): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await readHealth({ days: 7 });
        const now = new Date().toISOString();
        const next: HealthData = { ...daysRef.current };
        const ops: HubOp[] = [];
        for (const incoming of result.days ?? []) {
          if (!incoming || !isISODate(incoming.date)) continue;
          const { record: merged, changed } = mergeHealthDay(
            next[incoming.date],
            sanitizeHealthData({ days: { [incoming.date]: incoming } })[incoming.date] ?? { date: incoming.date },
            "healthkit",
            now,
          );

          if (changed || !next[incoming.date]) {
            next[incoming.date] = merged;
            ops.push({ table: "health", row: healthToPatch(merged) as HubOp["row"] });
          }
        }
        commit(next, markConnected || connectedRef.current, ops);
        return true;
      } catch (cause) {
        setError(readable(cause));
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [commit],
  );

  const connect = useCallback(async () => {
    refreshOnMount.current = false; // connect loads today's data itself
    return load(true);
  }, [load]);
  const refresh = useCallback(async () => load(false), [load]);

  // A previous successful connect means Health is allowed: refresh on start.
  useEffect(() => {
    if (!refreshOnMount.current) return;
    refreshOnMount.current = false;
    void load(false);
  }, [load]);

  // And refresh again whenever the app returns to the foreground.
  useEffect(() => {
    if (!isIOS()) return;
    let active = true;
    let listener: { remove(): void } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (active && isActive && connectedRef.current && !busyRef.current) void load(false);
    })
      .then((handle) => {
        if (active) listener = handle;
        else handle.remove();
      })
      .catch(() => {
        // Listener registration is best effort.
      });
    return () => {
      active = false;
      listener?.remove();
    };
  }, [load]);

  const value = useMemo<HealthContextValue>(
    () => ({
      days,
      day: (date) => days[date] ?? null,
      connected,
      busy,
      error,
      lastUpdatedAt: Object.values(days).reduce<string | null>(
        (latest, item) => (!latest || item.updatedAt > latest ? item.updatedAt : latest),
        null,
      ),
      connect,
      refresh,
      record,
    }),
    [days, connected, busy, error, connect, refresh, record],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthContextValue {
  const value = useContext(HealthContext);
  if (!value) throw new Error("useHealth must be used inside HealthProvider");
  return value;
}
