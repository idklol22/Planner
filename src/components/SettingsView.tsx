import { useState } from "react";
import { Check, Link2, Palette, PlugZap, Target } from "lucide-react";
import { DEFAULT_HARNESS_URL } from "../domain/model";
import { HarnessClient } from "../lib/harness";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { ThemePicker } from "./ThemePicker";
import { Button, Input, Panel, SectionTitle } from "./ui";

export function SettingsView() {
  const { data, isNative, actions } = useStore();
  const notify = useToast();
  const [goalDraft, setGoalDraft] = useState(String(data.settings.dailyCalorieGoal));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    const result = await new HarnessClient(data.settings.harnessUrl || DEFAULT_HARNESS_URL).subjects();
    setTesting(false);
    if (result.ok) {
      const message = `Connected · ${result.data.subjects.length} subjects`;
      setTestResult({ ok: true, message });
      notify(message, "success");
    } else {
      const message = `LearnHarness not reachable · ${result.error}`;
      setTestResult({ ok: false, message });
      notify(message, "error");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionTitle eyebrow="Connections">Settings</SectionTitle>

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
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Link2 size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">LearnHarness integration</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Point Planner at a running LearnHarness dev server. Its real subjects and topics then fill the
              picker on each category, and linked notes are handed off automatically.
            </p>
          </div>
        </div>

        <label
          htmlFor="harness-url"
          className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted"
        >
          <Link2 size={13} className="text-faint" /> LearnHarness URL
        </label>
        <div className="flex gap-2">
          <Input
            id="harness-url"
            value={data.settings.harnessUrl ?? DEFAULT_HARNESS_URL}
            placeholder={DEFAULT_HARNESS_URL}
            onChange={(event) => {
              actions.updateSettings({ harnessUrl: event.target.value });
              setTestResult(null);
            }}
          />
          <Button onClick={() => void testConnection()} disabled={testing}>
            <PlugZap size={15} /> {testing ? "Testing…" : "Test connection"}
          </Button>
        </div>
        {testResult && (
          <p className={`mt-2 text-[12px] ${testResult.ok ? "text-mint" : "text-rose"}`} role="status">
            {testResult.message}
          </p>
        )}
      </Panel>

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

      <Panel>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          Data
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {isNative
            ? "Tasks, habits, calories and notes live in a local JSON file in the app-data directory. Nothing leaves your machine except notes handed to the configured LearnHarness server."
            : "Browser dev mode stores everything in localStorage. Build the Tauri shell to use local files."}
        </p>
      </Panel>
    </div>
  );
}
