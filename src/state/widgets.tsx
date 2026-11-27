/** Keeps the widget profile on the hub and asks iOS to reload widgets. */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { App } from "@capacitor/app";
import { addDays, todayISO } from "../domain/dates";
import { buildWidgetProfile } from "../lib/widget";
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

  const lastUploaded = useRef<string | null>(null);
  const uploading = useRef(false);
  const lastSynced = useRef(sync.status.lastSyncedAt);
  const materializedFor = useRef<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReload = useCallback(() => {
    if (!isIOS()) return;
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void reloadWidgets().catch(() => {});
    }, RELOAD_DELAY_MS);
  }, []);

  const upload = useCallback(
    (json: string, value: WidgetProfile) => {
      const client = sync.client;
      if (!client || uploading.current || lastUploaded.current === json) return;
      uploading.current = true;
      void client
        .putWidgetProfile(value)
        .then(() => {
          uploading.current = false;
          lastUploaded.current = json;
          scheduleReload();
        })
        .catch(() => {
          // Leave the profile unsent; the next successful sync retries it.
          uploading.current = false;
        });
    },
    [sync.client, scheduleReload],
  );

  // A different hub has not seen this profile yet.
  useEffect(() => {
    lastUploaded.current = null;
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

  // Going to background is the last chance to show fresh data on the Home Screen.
  useEffect(() => {
    if (!isIOS()) return;
    let active = true;
    let listener: { remove(): void } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      // Ask at once: a delayed timer may never fire once the app is suspended.
      if (active && !isActive) void reloadWidgets().catch(() => {});
    })
      .then((handle) => {
        if (active) listener = handle;
        else handle.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      listener?.remove();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
  }, [scheduleReload]);

  return null;
}
