import { useState } from "react";
import { Flame, Plus, Trash2 } from "lucide-react";
import { formatDay, type ISODate } from "../domain/dates";
import type { MealSlot } from "../domain/model";
import { useStore } from "../state/store";
import { Button, Card, Input, SectionTitle } from "./ui";

const SLOTS: Array<{ id: MealSlot; label: string }> = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
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

  function add(slot: MealSlot) {
    const draft = drafts[slot];
    const kcal = Number(draft.kcal);
    if (!draft.label.trim() || !Number.isFinite(kcal) || kcal <= 0) return;
    actions.addCalorie(date, slot, draft.label.trim(), Math.round(kcal));
    setDrafts((current) => ({ ...current, [slot]: { label: "", kcal: "" } }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <SectionTitle
          action={
            <input
              type="date"
              value={date}
              onChange={(event) => event.target.value && onDateChange(event.target.value)}
              className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-slate-300 outline-none"
            />
          }
        >
          {formatDay(date)}
        </SectionTitle>

        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-semibold text-slate-100">
              {total} <span className="text-sm font-normal text-slate-500">kcal</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">Daily goal: {goal} kcal</div>
          </div>
          <Flame className="text-amber-400" size={32} />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-amber-400 transition-all"
            style={{ width: `${Math.min(100, (total / Math.max(1, goal)) * 100)}%` }}
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {SLOTS.map((slot) => {
          const slotEntries = entries.filter((entry) => entry.slot === slot.id);
          const slotTotal = slotEntries.reduce((sum, entry) => sum + entry.kcal, 0);
          return (
            <Card key={slot.id}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">{slot.label}</h3>
                <span className="text-xs text-slate-500">{slotTotal} kcal</span>
              </div>

              <div className="space-y-2">
                {slotEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate text-slate-300">{entry.label}</span>
                    <span className="shrink-0 text-slate-400">{entry.kcal}</span>
                    <button
                      onClick={() => actions.deleteCalorie(entry.id)}
                      className="shrink-0 text-slate-600 hover:text-rose-300"
                      title="Delete entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {slotEntries.length === 0 && (
                  <p className="text-xs text-slate-600">Nothing logged.</p>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
                <Input
                  value={drafts[slot.id].label}
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
                    value={drafts[slot.id].kcal}
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
                  <Button variant="outline" onClick={() => add(slot.id)} className="px-2">
                    <Plus size={15} />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
