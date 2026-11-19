import { useState } from "react";
import { Coffee, Flame, Moon, Plus, Sun, Trash2, Utensils } from "lucide-react";
import { formatDay, type ISODate } from "../domain/dates";
import type { MealSlot } from "../domain/model";
import { useStore } from "../state/store";
import { Button, Input, Panel, ProgressRing, SectionTitle } from "./ui";

const SLOTS: Array<{
  id: MealSlot;
  label: string;
  icon: typeof Coffee;
  color: string;
  tone: string;
}> = [
  { id: "breakfast", label: "Breakfast", icon: Coffee, color: "var(--color-amber)", tone: "text-amber" },
  { id: "lunch", label: "Lunch", icon: Sun, color: "var(--color-mint)", tone: "text-mint" },
  { id: "dinner", label: "Dinner", icon: Moon, color: "var(--color-accent)", tone: "text-accent" },
];

export function CaloriesView({
  date,
  onDateChange,
}: {
  date: ISODate;
  onDateChange: (date: ISODate) => void;
}) {
  const { data, actions } = useStore();
  const [drafts, setDrafts] = useState<Record<MealSlot, { label: string; kcal: string }>>({
    breakfast: { label: "", kcal: "" },
    lunch: { label: "", kcal: "" },
    dinner: { label: "", kcal: "" },
  });

  const entries = data.calories.filter((entry) => entry.date === date);
  const total = entries.reduce((sum, entry) => sum + entry.kcal, 0);
  const goal = data.settings.dailyCalorieGoal;
  const remaining = Math.max(0, goal - total);

  function add(slot: MealSlot) {
    const draft = drafts[slot];
    const kcal = Number(draft.kcal);
    if (!draft.label.trim() || !Number.isFinite(kcal) || kcal <= 0) return;
    actions.addCalorie(date, slot, draft.label.trim(), Math.round(kcal));
    setDrafts((current) => ({ ...current, [slot]: { label: "", kcal: "" } }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <SectionTitle
        eyebrow="Nourishment"
        action={
          <input
            type="date"
            value={date}
            onChange={(event) => event.target.value && onDateChange(event.target.value)}
            className="inset-field bg-surface-2 px-3 py-2 text-xs text-muted focus:outline-none"
          />
        }
      >
        Calories
      </SectionTitle>

      <Panel className="overflow-hidden !p-0">
        <div className="relative flex flex-wrap items-center justify-between gap-6 p-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber/10 blur-3xl" />
          <div className="relative flex items-center gap-6">
            <ProgressRing value={total} max={goal} size={116} stroke={10} color="var(--color-amber)">
              <span className="text-2xl font-semibold tabular-nums text-ink">{total}</span>
              <span className="text-[10px] uppercase tracking-wider text-faint">kcal</span>
            </ProgressRing>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber">
                {formatDay(date)}
              </div>
              <div className="text-lg font-medium text-ink">
                {total <= goal ? `${remaining} kcal left` : `${total - goal} kcal over`}
              </div>
              <p className="mt-1 text-xs text-faint">
                Daily goal · {goal.toLocaleString()} kcal
              </p>
            </div>
          </div>

          <div className="relative flex gap-3">
            {SLOTS.map((slot) => {
              const slotTotal = entries
                .filter((entry) => entry.slot === slot.id)
                .reduce((sum, entry) => sum + entry.kcal, 0);
              const Icon = slot.icon;
              return (
                <div
                  key={slot.id}
                  className="min-w-24 rounded-xl border border-line bg-black/20 px-3 py-2.5 text-center"
                >
                  <Icon size={15} className={`mx-auto mb-1.5 ${slot.tone}`} />
                  <div className="text-sm font-semibold tabular-nums text-ink">{slotTotal}</div>
                  <div className="text-[9px] uppercase tracking-wider text-faint">
                    {slot.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        {SLOTS.map((slot) => {
          const slotEntries = entries.filter((entry) => entry.slot === slot.id);
          const slotTotal = slotEntries.reduce((sum, entry) => sum + entry.kcal, 0);
          const Icon = slot.icon;
          const draft = drafts[slot.id];
          return (
            <Panel key={slot.id} className="flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                    <Icon size={15} className={slot.tone} />
                  </div>
                  <h3 className="text-sm font-semibold text-ink">{slot.label}</h3>
                </div>
                <span className="text-xs font-medium tabular-nums text-muted">{slotTotal}</span>
              </div>

              <div className="min-h-20 flex-1 space-y-2">
                {slotEntries.length === 0 && (
                  <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/[0.07] text-[11px] text-faint">
                    <Utensils size={13} className="mr-2" /> Nothing logged
                  </div>
                )}
                {slotEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex items-center gap-2 rounded-lg border border-line bg-white/[0.02] px-2.5 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {entry.label}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-ink">
                      {entry.kcal}
                    </span>
                    <button
                      onClick={() => actions.deleteCalorie(entry.id)}
                      className="text-faint opacity-0 transition-opacity hover:text-rose group-hover:opacity-100"
                      title="Delete entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 border-t border-line pt-3">
                <Input
                  value={draft.label}
                  placeholder="What did you eat?"
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [slot.id]: { ...current[slot.id], label: event.target.value },
                    }))
                  }
                  onKeyDown={(event) => event.key === "Enter" && add(slot.id)}
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={draft.kcal}
                    placeholder="kcal"
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [slot.id]: { ...current[slot.id], kcal: event.target.value },
                      }))
                    }
                    onKeyDown={(event) => event.key === "Enter" && add(slot.id)}
                    className="text-xs"
                  />
                  <Button variant="primary" onClick={() => add(slot.id)} className="px-3">
                    <Plus size={15} />
                  </Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <p className="flex items-center justify-center gap-2 text-[11px] text-faint">
        <Flame size={12} className="text-amber" /> Three check-ins a day is plenty.
      </p>
    </div>
  );
}
