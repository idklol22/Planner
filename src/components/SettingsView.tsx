import { useState } from "react";
import {
  ArrowRight,
  Check,
  FileOutput,
  FolderOpen,
  Link2,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { useStore } from "../state/store";
import { useToast } from "../state/toast";
import { Button, Chip, Input, Panel, SectionTitle } from "./ui";

export function SettingsView() {
  const { data, isNative, actions } = useStore();
  const notify = useToast();
  const [subject, setSubject] = useState("");
  const [goalDraft, setGoalDraft] = useState(String(data.settings.dailyCalorieGoal));

  function addSubject() {
    if (!subject.trim()) return;
    actions.addSubject(subject);
    notify(`Subject “${subject.trim()}” added`, "info");
    setSubject("");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionTitle eyebrow="Connections">Settings</SectionTitle>

      <Panel>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Link2 size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">LearnHarness integration</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Link a task to a subject, write its note, then hand it off. ToDoMate writes a
              self-contained Markdown file with frontmatter into the folder below.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[11px] font-medium text-muted">
            <FolderOpen size={13} className="text-faint" /> Handoff folder
          </label>
          <Input
            value={data.settings.handoffFolder}
            placeholder={
              isNative ? "Leave empty for app-data/handoff" : "Browser mode: virtual outbox"
            }
            onChange={(event) => actions.updateSettings({ handoffFolder: event.target.value })}
          />
          <p className="text-[11px] leading-relaxed text-muted/80">
            Point this at a folder you import into LearnHarness. LH doesn&apos;t watch folders —
            use its in-app file picker or{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">
              npx tsx scripts/import-notes.ts &lt;dir&gt;
            </code>
            .
          </p>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-muted">
            <Link2 size={13} className="text-faint" /> Subjects
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {data.settings.learnharnessSubjects.length === 0 && (
              <span className="text-xs text-faint">No subjects added yet.</span>
            )}
            {data.settings.learnharnessSubjects.map((name) => (
              <Chip key={name} tone="accent" className="!px-2.5 !py-1">
                {name}
                <button
                  onClick={() => actions.removeSubject(name)}
                  className="ml-1 opacity-60 hover:opacity-100 hover:text-rose"
                  title={`Remove ${name}`}
                >
                  <Trash2 size={11} />
                </button>
              </Chip>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={subject}
              placeholder="e.g. Organic Chemistry"
              onChange={(event) => setSubject(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addSubject()}
            />
            <Button variant="primary" onClick={addSubject}>
              <Plus size={15} /> Add
            </Button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-accent/15 bg-accent/[0.06] px-4 py-3">
          <FileOutput size={16} className="shrink-0 text-accent" />
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <span>Finished note</span>
            <ArrowRight size={12} className="text-faint" />
            <span>Markdown file</span>
            <ArrowRight size={12} className="text-faint" />
            <span className="text-ink">LearnHarness memory</span>
          </div>
        </div>
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
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          Data
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {isNative
            ? "Tasks, habits, calories and notes live in a local JSON file in the app-data directory. Nothing leaves your machine."
            : "Browser dev mode stores everything in localStorage. Build the Tauri shell to use local files."}
        </p>
      </Panel>
    </div>
  );
}
