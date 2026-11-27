import { useState } from "react";
import { Cloud, Copy, KeyRound } from "lucide-react";
import { encodeWidgetCode } from "../lib/widget";
import { useSync } from "../state/sync";
import { useToast } from "../state/toast";
import { Button, Input, Panel } from "./ui";

const STEPS = [
  "Touch and hold the Home Screen.",
  "Tap Edit.",
  "Tap Add Widget.",
  "Choose Planner.",
];

/** Settings panel for the iPhone Home Screen widget. */
export function WidgetSettings() {
  const sync = useSync();
  const notify = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createCode() {
    if (!sync.client) return;
    setBusy(true);
    setError(null);
    try {
      const token = await sync.client.createWidgetToken();
      setCode(encodeWidgetCode(sync.config.url, token));
      notify("Widget code created");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      notify(`Could not create widget code · ${message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      notify("Widget code copied");
    } catch {
      notify("Could not copy: select the code and copy it manually", "error");
    }
  }

  return (
    <Panel>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <KeyRound size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Home Screen widgets</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Show today&apos;s goals, calories and tasks on your iPhone Home Screen. Widgets read from your hub, so cloud
            sync is required.
          </p>
        </div>
      </div>

      {!sync.configured && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-line bg-ink/[0.03] px-3 py-2.5 text-[13px] leading-relaxed text-muted">
          <Cloud size={15} className="mt-0.5 shrink-0" />
          Set up cloud sync above before creating a widget code.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void createCode()} disabled={!sync.configured || !sync.client || busy}>
          <KeyRound size={15} /> {busy ? "Creating…" : "Create widget code"}
        </Button>
      </div>

      {code && (
        <div className="mt-4">
          <label htmlFor="widget-code" className="mb-2 block text-[11px] font-medium text-muted">
            Widget code
          </label>
          <div className="flex min-w-0 gap-2">
            <Input id="widget-code" readOnly value={code} className="min-w-0 flex-1 text-[16px]" />
            <Button onClick={() => void copyCode()} className="shrink-0">
              <Copy size={15} /> Copy
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Creating a new code stops the old one working. You will need to paste the new code into every widget.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 break-words text-[12px] leading-relaxed text-rose">
          {error}
        </p>
      )}

      <ol className="mt-5 space-y-2">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3 text-[13px] leading-relaxed text-muted">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
              {index + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        Then touch and hold the widget, tap <strong className="font-semibold text-ink">Edit Widget</strong>, paste the
        code, and choose what to show.
      </p>
    </Panel>
  );
}
