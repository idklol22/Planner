import { useEffect, useState } from "react";
import { Check, Cloud, Link2, Palette, PlugZap, Power, RefreshCw, Target } from "lucide-react";
import { defaultData } from "../domain/model";
import { isTauri, storage } from "../storage";
import { clearPlannerLocalData } from "../storage/reset";
import {
  autostartError,
  autostartLabel,
  loadAutostart,
  setAutostart,
} from "../lib/autostart";
import { harnessLink, harnessStatus } from "../lib/harness-link";
import { useStore } from "../state/store";
import { useSync } from "../state/sync";
import { useToast } from "../state/toast";
import { HealthSettings } from "./HealthSettings";
import { ThemePicker } from "./ThemePicker";
import { WidgetSettings } from "./WidgetSettings";
import { Button, Input, Panel } from "./ui";

function ResetAll() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      clearPlannerLocalData(localStorage);
      // The native build keeps its data in a file: overwrite it with an empty planner.
      if (isTauri) await storage.save(defaultData());
    } finally {
      window.location.reload();
    }
  }
  return (
    <div className="mt-4 border-t border-line pt-3">
      {!open ? (
        <Button variant="danger" onClick={() => setOpen(true)}>
          Reset all data…
        </Button>
      ) : (
        <div role="alertdialog" aria-label="Reset all data" className="space-y-2">
          <p className="text-xs leading-relaxed text-muted">
            This deletes every task, category, goal, habit, calorie entry and note on this device, plus the sync outbox,
            sync cursor, cloud mirror, LetCode progress and hand-off state. Theme and Hub URL/token are kept. Type RESET
            to confirm.
          </p>
          <div className="flex gap-2">
            <Input aria-label="Type RESET to confirm" value={word} onChange={(e) => setWord(e.target.value)} placeholder="RESET" />
            <Button variant="danger" disabled={word !== "RESET" || busy} onClick={run}>
              Reset
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                setWord("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DesktopPanel() {
  const notify = useToast();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAutostart()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch((e: unknown) => {
        if (!active) return;
        const message = autostartError(e);
        setError(message);
        notify(message, "error");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [notify]);

  async function toggle() {
    if (busy) return;
    const previous = enabled;
    const next = !previous;
    setError(null);
    setEnabled(next);
    setBusy(true);
    try {
      await setAutostart(next);
      notify(next ? "Open at login enabled" : "Open at login disabled");
    } catch (e) {
      setEnabled(previous);
      const message = autostartError(e);
      setError(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Power size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Desktop</h3>
          <p className="mt-1 text-xs text-muted">Start ToDoMate when you sign in.</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink">Open at login</span>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Open at login"
            disabled={busy}
            onClick={() => void toggle()}
            className={`relative inline-flex h-7 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${enabled ? "bg-accent" : "bg-ink/10"}`}
          >
            <span
              className={`inline-block h-[22px] w-[22px] rounded-full bg-surface-3 shadow-sm transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`}
            />
          </button>
          <span className="text-xs text-faint">{autostartLabel(enabled, busy)}</span>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}

export function SettingsView() {
  const { data, isNative, actions } = useStore();
  const notify = useToast();
  const sync = useSync();
  const [hubUrl, setHubUrl] = useState(sync.config.url);
  const [hubToken, setHubToken] = useState(sync.config.token);
  const [hubTesting, setHubTesting] = useState(false);
  const [hubResult, setHubResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [goalDraft, setGoalDraft] = useState(String(data.settings.dailyCalorieGoal));
  const harnessState = harnessStatus(sync.configured, harnessLink(sync.mirror.subjects));

  async function testHub() {
    setHubTesting(true);
    setHubResult(null);
    const result = await sync.testConnection({ url: hubUrl, token: hubToken });
    setHubTesting(false);
    setHubResult(result);
    notify(result.message, result.ok ? "success" : "error");
  }

  function saveHub() {
    sync.setConfig({ url: hubUrl, token: hubToken });
    notify(hubUrl.trim() && hubToken.trim() ? "Cloud sync saved" : "Cloud sync turned off");
  }

  const lastSynced = sync.status.lastSyncedAt
    ? new Date(sync.status.lastSyncedAt).toLocaleString()
    : "never";
  const activeCategories = data.categories.filter((c) => !c.archived && !c.deletedAt);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Panel>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Palette size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Theme</h3>
            <p className="mt-1 text-xs text-muted">Saved on this device. Applies instantly.</p>
          </div>
        </div>
        <ThemePicker />
      </Panel>

      <Panel>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Link2 size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">LearnHarness</div>
            <p className="mt-0.5 text-[12px] text-muted">{harnessState}</p>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Cloud size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Cloud sync</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Sync tasks, categories and meals through your hub, mirror LearnHarness subjects and deadlines, and hand
              notes off through the hub. The token stays on this device. Leave both fields empty to stay offline.
              Photos in notes stay on this phone. They are sent to your computer only with the task that contains them.
            </p>
          </div>
        </div>

        <label htmlFor="hub-url" className="mb-2 block text-[11px] font-medium text-muted">
          Hub URL
        </label>
        <Input
          id="hub-url"
          value={hubUrl}
          placeholder="https://your-project.supabase.co/functions/v1/hub"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setHubUrl(event.target.value);
            setHubResult(null);
          }}
        />
        <label htmlFor="hub-token" className="mb-2 mt-4 block text-[11px] font-medium text-muted">
          Device token
        </label>
        <Input
          id="hub-token"
          type="password"
          autoComplete="off"
          value={hubToken}
          placeholder="Paste the token for this device"
          onChange={(event) => {
            setHubToken(event.target.value);
            setHubResult(null);
          }}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={saveHub}>
            <Check size={15} /> Save
          </Button>
          <Button onClick={() => void testHub()} disabled={hubTesting}>
            <PlugZap size={15} /> {hubTesting ? "Testing…" : "Test connection"}
          </Button>
          <Button onClick={() => void sync.syncNow()} disabled={!sync.configured || sync.status.syncing}>
            <RefreshCw size={15} /> {sync.status.syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
        {hubResult && (
          <p className={`mt-2 text-[11.5px] ${hubResult.ok ? "text-mint" : "text-rose"}`} role="status">
            {hubResult.message}
          </p>
        )}
        {sync.configured && (
          <p className="mt-3 text-[11.5px] text-muted" role="status">
            Last synced: {lastSynced}
            {sync.status.pending > 0 ? ` · ${sync.status.pending} waiting to upload` : ""}
            {sync.status.error ? ` · last error: ${sync.status.error}` : ""}
          </p>
        )}

        <label htmlFor="letcode-category" className="mb-2 mt-5 block text-[11px] font-medium text-muted">
          LetCode category
        </label>
        <select
          id="letcode-category"
          value={data.settings.letcodeCategoryId ?? ""}
          onChange={(event) => actions.updateSettings({ letcodeCategoryId: event.target.value || undefined })}
          className="inset-field w-full bg-transparent px-3 py-2 text-[16px] text-ink focus:outline-none"
        >
          <option value="">Daily (default)</option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Solved LetCode problems tick the matching task for that day, or add a finished task here.
        </p>
      </Panel>

      <WidgetSettings />
      <HealthSettings />

      <Panel>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber/15 text-amber">
            <Target size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Preferences</h3>
            <p className="mt-1 text-xs text-muted">Your daily calorie target.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            min="0"
            aria-label="Daily calorie goal"
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.target.value)}
          />
          <Button
            variant="primary"
            onClick={() => {
              const value = Number(goalDraft);
              if (Number.isFinite(value) && value > 0) {
                actions.updateSettings({ dailyCalorieGoal: Math.round(value) });
                notify("Daily goal updated");
              }
            }}
          >
            <Check size={15} /> Save
          </Button>
        </div>
      </Panel>

      {isNative && <DesktopPanel />}

      <Panel>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          Data
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {isNative
            ? "Tasks, habits, calories and notes live in a local JSON file in the app-data directory. Nothing leaves your machine except notes handed to the configured LearnHarness server."
            : "Browser dev mode stores everything in localStorage. Build the Tauri shell to use local files."}
        </p>
        <ResetAll />
      </Panel>
    </div>
  );
}
