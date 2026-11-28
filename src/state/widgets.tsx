/** Keeps the widget profile on the hub and asks iOS to reload widgets. */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { App } from "@capacitor/app";
import { addDays, todayISO } from "../domain/dates";
import {
  backgroundReloadDecision,
  buildWidgetProfile,
  emptyWidgetUploadState,
  enqueueWidgetUpload,
  finishWidgetUpload,
  type WidgetUploadItem,
} from "../lib/widget";
import { isIOS, reloadWidgets } from "../native/planner-native";
import type { WidgetProfile } from "../storage/hub";
import { THEMES } from "../theme/themes";
import { useThemeState } from "../theme/store";
import { useStore } from "./store";
import { useSync } from "./sync";

const UPLOAD_DELAY_MS = 2_000;
const RELOAD_DELAY_MS = 400;

/** Mounted once for the app session; renders nothing. */
export function WidgetRunner() {
  const { data, ready, actions } = useStore();
  const sync = useSync();
  const { theme } = useThemeState();
  const themeDef = THEMES[theme];
  const profile = useMemo(
    () => buildWidgetProfile(data, themeDef.tokens, themeDef.dark),
    [data, themeDef],
  );
  const serialized = useMemo(() => JSON.stringify(profile), [profile]);

  const uploadState = useRef(emptyWidgetUploadState());
  const generation = useRef(0);
  const lastSynced = useRef(sync.status.lastSyncedAt);
  const statusRef = useRef(sync.status);
  statusRef.current = sync.status;
  const materializedFor = useRef<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** null = no background reload pending; otherwise the stamp it must exceed. */
  const pendingBackgroundReload = useRef<string | null>(null);

  const reload = useCallback(() => {
    void reloadWidgets().catch(() => {});
  }, []);

  const scheduleReload = useCallback(() => {
    if (!isIOS()) return;
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      // A queued background push will trigger its own reload once accepted.
      if (pendingBackgroundReload.current === null) reload();
    }, RELOAD_DELAY_MS);
  }, [reload]);

  // Requests run one at a time. Changes made during an upload are queued (only
  // the newest survives), so a fast theme/goal edit is never silently dropped.
  const beginUpload = useCallback(
    (item: WidgetUploadItem) => {
      const client = sync.client;
      if (!client) return;
      const gen = generation.current;
      void client.putWidgetProfile(item.value).then(
        () => {
          if (gen !== generation.current) return;
          const { state, start } = finishWidgetUpload(uploadState.current, item.json, true);
          uploadState.current = state;
          scheduleReload();
          if (start) beginUpload(start);
        },
        () => {
          if (gen !== generation.current) return;
          const { state, start } = finishWidgetUpload(uploadState.current, item.json, false);
          uploadState.current = state;
          if (start) beginUpload(start);
        },
      );
    },
    [sync.client, scheduleReload],
  );

  const upload = useCallback(
    (json: string, value: WidgetProfile) => {
      const { state, start } = enqueueWidgetUpload(uploadState.current, { json, value });
      uploadState.current = state;
      if (start) beginUpload(start);
    },
    [beginUpload],
  );

  // A different hub has not seen this profile yet. Ignore any response from a
  // request that was in flight when the hub changed.
  useEffect(() => {
    generation.current += 1;
    uploadState.current = emptyWidgetUploadState();
  }, [sync.client]);

  // Recurring tasks must exist for the days the widget can show.
  useEffect(() => {
    if (!ready) return;
    const materialize = () => {
      const today = todayISO();
      if (materializedFor.current === today) return;
      materializedFor.current = today;
      actions.materialize(Array.from({ length: 7 }, (_, i) => addDays(today, i)));
    };
    materialize();
    const timer = setInterval(materialize, 60_000); // handle a day rollover
    return () => clearInterval(timer);
  }, [ready, actions]);

  // Upload 2 s after the profile settles (theme / goals / calorie goal edits).
  useEffect(() => {
    if (!ready || !sync.configured) return;
    const timer = setTimeout(() => upload(serialized, profile), UPLOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, sync.configured, serialized, profile, upload]);

  // A successful cloud sync retries a failed upload and refreshes the widget.
  useEffect(() => {
    const stamp = sync.status.lastSyncedAt;
    if (!stamp || stamp === lastSynced.current) return;
    lastSynced.current = stamp;
    if (!sync.configured || sync.status.error) return;
    upload(serialized, profile);
    scheduleReload();
  }, [
    sync.status.lastSyncedAt,
    sync.status.error,
    sync.configured,
    serialized,
    profile,
    upload,
    scheduleReload,
  ]);

  // A reload armed on backgrounding may run only after a push was accepted.
  useEffect(() => {
    const decision = backgroundReloadDecision(pendingBackgroundReload.current, sync.status);
    pendingBackgroundReload.current = decision.pending;
    if (!decision.reload) return;
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = null;
    }
    reload();
  }, [sync.status.lastSyncedAt, sync.status.error, reload]);

  // Going to background is the last chance to show fresh data on the Home Screen.
  useEffect(() => {
    if (!isIOS()) return;
    let active = true;
    let listener: { remove(): void } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!active) return;
      if (isActive) {
        // Do not fire a stale background reload after the app came back.
        pendingBackgroundReload.current = null;
        return;
      }
      sync.flush();
      pendingBackgroundReload.current = statusRef.current.lastSyncedAt;
      // Fire and forget: neither the UI nor app backgrounding waits on the hub.
      // A successful sync advances lastSyncedAt, which releases the reload.
      void sync.syncNow().catch(() => {});
    })
      .then((handle) => {
        if (active) listener = handle;
        else handle.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      listener?.remove();
      pendingBackgroundReload.current = null;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [sync.flush, sync.syncNow]);

  return null;
}
