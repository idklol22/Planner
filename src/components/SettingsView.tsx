import { useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useStore } from "../state/store";
import { Button, Card, Chip, Input, SectionTitle } from "./ui";

export function SettingsView() {
  const { data, isNative, actions } = useStore();
  const [subject, setSubject] = useState("");
  const [goalDraft, setGoalDraft] = useState(String(data.settings.dailyCalorieGoal));

  function addSubject() {
    actions.addSubject(subject);
    setSubject("");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <SectionTitle>LearnHarness integration</SectionTitle>
        <p className="mb-4 text-sm leading-relaxed text-slate-400">
          Link a task to a LearnHarness subject, write its note, then press{" "}
          <span className="text-slate-200">Mark done &amp; prepare</span> and{" "}
          <span className="text-slate-200">Send to LearnHarness</span>. ToDoMate writes a
          Markdown file with frontmatter into the handoff folder below.
        </p>

        <label className="mb-1.5 block text-xs font-medium text-slate-400">
          Handoff folder (absolute path)
        </label>
        <div className="flex gap-2">
          <Input
            value={data.settings.handoffFolder}
            placeholder={isNative ? "Leave empty for app-data/handoff" : "Browser mode: virtual outbox"}
            onChange={(event) => actions.updateSettings({ handoffFolder: event.target.value })}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Point this at a folder you import into LearnHarness. LearnHarness does not watch
          folders automatically — import with its in-app file picker or run{" "}
          <code className="rounded bg-white/5 px-1 py-0.5 text-[11px]">
            npx tsx scripts/import-notes.ts &lt;dir&gt;
          </code>{" "}
          from its repo. See <code className="text-[11px]">docs/learnharness-integration.md</code>.
        </p>

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Subjects</h3>
          <div className="mb-3 flex flex-wrap gap-2">
            {data.settings.learnharnessSubjects.length === 0 && (
              <span className="text-xs text-slate-500">No subjects added yet.</span>
            )}
            {data.settings.learnharnessSubjects.map((name) => (
              <Chip key={name} tone="indigo">
                {name}
                <button
                  onClick={() => actions.removeSubject(name)}
                  className="ml-0.5 opacity-60 hover:opacity-100"
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
            <Button variant="outline" onClick={addSubject}>
              <Plus size={15} /> Add
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Preferences</SectionTitle>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">
          Daily calorie goal (kcal)
        </label>
        <div className="flex gap-2">
          <Input
            type="number"
            min="0"
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.target.value)}
          />
          <Button
            onClick={() => {
              const value = Number(goalDraft);
              if (Number.isFinite(value) && value > 0) {
                actions.updateSettings({ dailyCalorieGoal: Math.round(value) });
              }
            }}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Data</SectionTitle>
        <p className="text-sm text-slate-400">
          {isNative
            ? "Your tasks, habits, calories and notes live in a local JSON file in the app-data directory."
            : "Browser dev mode stores everything in localStorage. Build the Tauri shell to use local files."}
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-indigo-300">
          Finished notes hand off to LearnHarness <ArrowRight size={14} /> knowledge graph
        </div>
      </Card>
    </div>
  );
}
