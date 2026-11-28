import { useState } from "react";
import { Activity, Copy, HeartPulse, RefreshCw } from "lucide-react";
import { todayISO } from "../domain/dates";
import { isIOS } from "../native/planner-native";
import { useHealth } from "../state/health";
import { useToast } from "../state/toast";
import { Collapse } from "./Collapse";
import { Button, Panel } from "./ui";

const SHORTCUT_URL = "planner://health?active=..&steps=..&exercise=..&sleep=..&hr=..";

const nf = (n: number) => n.toLocaleString("en-US");

/** Apple Health panel: native read, or an Apple Shortcut fallback. */
export function HealthSettings() {
  const health = useHealth();
  const notify = useToast();
  const [copied, setCopied] = useState(false);
  const day = health.day(todayISO());
  const values: Array<[string, string]> = [];
  if (day?.activeKcal != null) values.push(["Active Energy", `${nf(day.activeKcal)} kcal`]);
  if (day?.steps != null) values.push(["Steps", nf(day.steps)]);
  if (day?.exerciseMin != null) values.push(["Exercise", `${nf(day.exerciseMin)} min`]);
  if (day?.distanceKm != null) values.push(["Distance", `${day.distanceKm} km`]);
  if (day?.sleepHours != null) values.push(["Sleep", `${day.sleepHours} h`]);
  if (day?.restingHr != null) values.push(["Resting HR", `${nf(day.restingHr)} bpm`]);

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(SHORTCUT_URL);
      setCopied(true);
      notify("URL template copied");
    } catch {
      notify("Could not copy: select the URL and copy it manually", "error");
    }
  }

  return (
    <Panel className="page-block">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <HeartPulse size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Apple Health</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Bring today&apos;s activity into Planner. With cloud sync on, daily totals are saved to your cloud too.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => void health.connect()}
          disabled={!isIOS() || health.busy}
        >
          <Activity size={15} /> Connect Apple Health
        </Button>
        <Button onClick={() => void health.refresh()} disabled={health.busy}>
          <RefreshCw size={15} /> {health.busy ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>
      <Collapse open={!isIOS()}>
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          Health reading is available in the iPhone app.
        </p>
      </Collapse>

      <p className="mt-4 text-[11.5px] text-muted" role="status">
        {health.connected ? "Connected · " : ""}
        Last updated: {health.lastUpdatedAt ? new Date(health.lastUpdatedAt).toLocaleString() : "never"}
      </p>

      <div className="mt-3 rounded-xl border border-line bg-ink/[0.02] px-3 py-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">Today</div>
        {values.length === 0 ? (
          <p className="py-1 text-[12px] text-muted">No Health data for today yet.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-4 text-[12px] sm:grid-cols-2">
            {values.map(([label, value]) => (
              <div key={label} className="flex min-w-0 items-baseline justify-between gap-2 py-0.5">
                <dt className="text-muted">{label}</dt>
                <dd className="shrink-0 font-medium tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <Collapse open={!!health.error}>
        <div className="mt-4 space-y-2" role="alert">
          <p className="break-words text-[11.5px] leading-relaxed text-rose">{health.error}</p>
          <p className="text-[11.5px] leading-relaxed text-muted">
            A sideloaded app may not be allowed to read Health. You can use an Apple Shortcut instead: find today&apos;s
            Active Energy, Steps, Exercise Minutes, Sleep and Resting Heart Rate, then use the &quot;Open URL&quot;
            action with this URL (replace the dots with your values):
          </p>
          <div className="flex min-w-0 gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-ink/[0.06] px-2.5 py-2 text-[11.5px] leading-relaxed text-ink">
              {SHORTCUT_URL}
            </code>
            <Button onClick={() => void copyTemplate()} className="shrink-0">
              <Copy size={14} /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </Collapse>
    </Panel>
  );
}
