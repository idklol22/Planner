import { paletteFor } from "../domain/palette";
import { setAnimation, setFx, setGlass, setTheme, useThemeState } from "../theme/store";
import { THEME_LIST, type ThemeDef } from "../theme/themes";

/** Small scene thumbnails (the same artwork LetCode uses for its theme dots). */
const SCENE_THUMB: Record<string, string> = {
  particles:
    "radial-gradient(circle,#000 25%,#cfd6e2 26%,#cfd6e2 40%,#0b1018 41%,#0b1018 55%,#8a96ab 56%)",
  smoke: "radial-gradient(circle at 30% 30%,#5a5a5c,#0a0a0a 70%)",
  clouds: "radial-gradient(circle at 70% 70%,#f1eddb 35%,#05060f 36%)",
  uzumaki: "repeating-radial-gradient(circle at 50% 50%,#ebe6da 0 1.5px,#23221e 1.5px 3px)",
};

function Preview({ t }: { t: ThemeDef }) {
  const k = t.tokens;
  const dots = paletteFor(t.id).slice(0, 4);
  return (
    <div className="theme-preview" style={{ background: k.bg }} aria-hidden="true">
      <div
        className="absolute inset-x-2 bottom-2 top-2 rounded-lg p-1.5"
        style={{ background: k.surface, boxShadow: `inset 0 0 0 1px ${k.border}` }}
      >
        <div className="h-1.5 w-10 rounded-full" style={{ background: k.text }} />
        <div className="mt-1 h-1 w-14 rounded-full" style={{ background: k.textMuted }} />
        <div className="mt-1.5 flex items-center gap-1">
          {dots.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          ))}
          <span className="ml-auto h-3 w-6 rounded-full" style={{ background: k.accent }} />
        </div>
      </div>
      {t.scene && (
        <span
          className="absolute right-2 top-2 h-4 w-4 rounded-full"
          style={{ background: SCENE_THUMB[t.scene], boxShadow: `0 0 0 1px ${k.borderStrong}` }}
        />
      )}
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center gap-3 py-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink">{label}</span>
        <span className="block text-[12px] text-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

/** Settings: a grid of theme cards (live preview of bg/surface/accent/text plus the scene thumbnail). */
export function ThemePicker() {
  const { theme, glass, animation, fx } = useThemeState();
  const def = THEME_LIST.find((t) => t.id === theme)!;
  const contrast = theme === "contrast";
  return (
    <div>
      <div role="group" aria-label="Theme" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {THEME_LIST.map((t) => (
          <button
            key={t.id}
            type="button"
            className="theme-card"
            aria-pressed={t.id === theme}
            onClick={() => setTheme(t.id)}
          >
            <Preview t={t} />
            <span className="px-0.5 text-[13px] font-semibold text-ink">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 divide-y divide-line">
        <Toggle
          label="Glass & animated backgrounds"
          hint="Off: every theme uses plain solid surfaces and no moving scenes."
          on={fx}
          onChange={setFx}
        />
        <Toggle
          label="Glass tiles"
          hint={contrast ? "Off in high contrast." : "Translucent cards over the background."}
          on={glass}
          disabled={contrast || !fx}
          onChange={setGlass}
        />
        <Toggle
          label="Background animation"
          hint={
            contrast || !def.scene
              ? "This theme has no animated background."
              : "Drifting dust and clouds. Pauses when the tab is hidden; still with reduced motion."
          }
          on={animation}
          disabled={contrast || !fx || !def.scene}
          onChange={setAnimation}
        />
      </div>
    </div>
  );
}
