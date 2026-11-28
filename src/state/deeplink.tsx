/** iOS deep-link handler. Navigation is exposed as a small signal so a link
 *  that arrives before views mount is still applied when they do. */

import { useEffect, useState, type ReactNode } from "react";
import { App } from "@capacitor/app";
import { todayISO, type ISODate } from "../domain/dates";
import {
  decideAppOpen,
  decideLaunchUrl,
  initialLaunchLinkState,
  parseDeepLink,
} from "../lib/deeplink";
import { describeSavedHealth } from "../lib/health";
import { isIOS } from "../native/planner-native";
import { useHealth } from "./health";
import { useToast } from "./toast";

export interface NavCommand {
  /** Increments for every navigation link (including ones seen before mount). */
  seq: number;
  date: ISODate;
  openCalories: boolean;
}

let sequence = 0;
/** Shared across provider mounts: iOS can deliver the launch link twice. */
let launchState = initialLaunchLinkState();
let current: NavCommand = { seq: 0, date: "", openCalories: false };
const listeners = new Set<(nav: NavCommand) => void>();

function publish(date: ISODate, openCalories: boolean): void {
  current = { seq: ++sequence, date, openCalories };
  for (const listener of listeners) listener(current);
}

function subscribe(listener: (nav: NavCommand) => void): () => void {
  listeners.add(listener);
  listener(current); // late subscribers still receive the last link
  return () => {
    listeners.delete(listener);
  };
}

export function useNavCommand(): NavCommand {
  const [nav, setNav] = useState<NavCommand>(current);
  useEffect(() => subscribe(setNav), []);
  return nav;
}

export function DeeplinkProvider({ children }: { children: ReactNode }) {
  const { record } = useHealth();
  const notify = useToast();

  useEffect(() => {
    if (!isIOS()) return;
    let active = true;
    let listener: { remove(): void } | undefined;

    const handle = (url: string) => {
      const link = parseDeepLink(url, todayISO());
      if (!link) return;
      if (link.kind === "health") {
        const saved = record(link.date, link.values, "shortcut");
        if (saved) notify(describeSavedHealth(saved), "success");
        else notify("No valid health values in that link", "error");
        return;
      }
      const today = todayISO();
      publish(today, link.kind === "calories");
    };

    const handleOpen = (url: string) => {
      const decision = decideAppOpen(launchState, url);
      launchState = decision.state;
      if (decision.handle) handle(url);
    };

    void App.addListener("appUrlOpen", (event) => {
      if (active) handleOpen(event.url);
    })
      .then((handle) => {
        if (active) listener = handle;
        else handle.remove();
      })
      .catch(() => {});

    void App.getLaunchUrl()
      .then((launch) => {
        if (!active) return;
        const decision = decideLaunchUrl(launchState, launch?.url ?? null);
        launchState = decision.state;
        if (decision.handle && launch?.url) handle(launch.url);
      })
      .catch(() => {});

    return () => {
      active = false;
      listener?.remove();
    };
  }, [record, notify]);

  return <>{children}</>;
}
