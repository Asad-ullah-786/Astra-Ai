import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { NavLink } from "react-router";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";
import type { AstraTask } from "../types/index.ts";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function selectedDateValue(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function CalendarPage() {
  const { tasks, createTask, updateTask } = useAstra();
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [todayKey] = useState(() => dateKey(new Date()));

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.due_at || task.completed) continue;
      const key = dateKey(new Date(task.due_at));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const dayTasks = tasks
    .filter((task) => task.due_at && dateKey(new Date(task.due_at)) === selectedDate)
    .sort((left, right) => (left.due_at ?? "").localeCompare(right.due_at ?? ""));
  const selectedDateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(selectedDateValue(selectedDate));

  function moveMonth(amount: number) {
    const day = selectedDateValue(selectedDate).getDate();
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    nextMonth.setDate(Math.min(day, lastDay));
    setMonth(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1));
    setSelectedDate(dateKey(nextMonth));
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const dueAt = new Date(`${selectedDate}T${time}`);
      if (Number.isNaN(dueAt.getTime())) throw new Error("Choose a valid date and time.");
      await createTask({ title: title.trim(), notes: null, due_at: dueAt.toISOString() });
      setTitle("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The calendar item could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task: AstraTask) {
    setSaving(true);
    setError("");
    try {
      await updateTask(task.id, { completed: !task.completed });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The calendar item could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Panel title="MISSION CALENDAR">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="rounded-lg border border-white/10 p-2 text-astra-cyan hover:bg-white/5">
              <ChevronLeft className="size-4" />
            </button>
            <h1 className="min-w-36 text-center font-display text-sm tracking-[0.12em] text-white">
              {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </h1>
            <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="rounded-lg border border-white/10 p-2 text-astra-cyan hover:bg-white/5">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDate(dateKey(today));
              }}
              className="rounded-lg border border-astra-cyan/30 px-3 py-1.5 text-xs text-astra-cyan hover:bg-cyan-950/40"
            >
              TODAY
            </button>
            <NavLink to="/tasks" className="text-xs text-astra-cyan hover:text-white">Manage tasks</NavLink>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((day) => (
            <span key={day} className="py-2 text-center font-mono text-[0.69rem] tracking-wider text-astra-muted">{day}</span>
          ))}
          {days.map((day) => {
            const key = dateKey(day);
            const count = taskCounts.get(key) ?? 0;
            const isSelected = key === selectedDate;
            const isCurrentMonth = day.getMonth() === month.getMonth();
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${day.toLocaleDateString()}${count ? `, ${count} tasks` : ""}`}
                onClick={() => setSelectedDate(key)}
                className={`relative min-h-11 rounded-lg border px-1 py-2 text-sm transition ${
                  isSelected
                    ? "border-astra-cyan/70 bg-cyan-950/50 text-white"
                    : isCurrentMonth
                      ? "border-white/10 bg-black/20 text-astra-text hover:border-astra-cyan/40"
                      : "border-transparent text-slate-600 hover:border-white/10"
                } ${key === todayKey ? "ring-1 ring-astra-cyan/50" : ""}`}
              >
                {day.getDate()}
                {count ? <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-astra-cyan" /> : null}
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
        <Panel title={`SCHEDULE · ${selectedDateLabel.toUpperCase()}`}>
          <ul className="space-y-2">
            {dayTasks.map((task) => (
              <li key={task.id} className={`flex items-center gap-3 rounded-xl border p-3 ${task.completed ? "border-white/10 opacity-60" : "border-astra-cyan/20 bg-black/20"}`}>
                <button
                  type="button"
                  aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
                  disabled={saving}
                  onClick={() => void toggleTask(task)}
                  className={`grid size-7 shrink-0 place-items-center rounded-full border ${task.completed ? "border-astra-ok/50 text-astra-ok" : "border-astra-cyan/50 text-astra-cyan"}`}
                >
                  <Check className="size-4" />
                </button>
                <span className="min-w-0 flex-1">
                  <strong className={`block truncate text-sm ${task.completed ? "text-astra-muted line-through" : "text-white"}`}>{task.title}</strong>
                  {task.notes ? <small className="block truncate text-xs text-astra-muted">{task.notes}</small> : null}
                </span>
                <time className="flex shrink-0 items-center gap-1 text-xs text-astra-cyan">
                  <Clock3 className="size-3.5" /> {formatTime(task.due_at)}
                </time>
              </li>
            ))}
            {dayTasks.length === 0 ? (
              <li className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 p-4 text-sm text-astra-muted">
                <CalendarDays className="size-4" /> No scheduled tasks for this day.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel title="ADD TO TIMELINE">
          <form className="flex flex-col gap-3" onSubmit={(event) => void addTask(event)}>
            <label className="grid gap-1 text-xs text-astra-muted">
              Task or event
              <input
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs to happen?"
                className="rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
              />
            </label>
            <label className="grid gap-1 text-xs text-astra-muted">
              Date and time
              <input
                type="time"
                required
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
              />
            </label>
            <p className="text-xs text-astra-muted">{selectedDateLabel}</p>
            {error ? <p className="text-sm text-astra-danger" role="alert">{error}</p> : null}
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-lg border border-astra-cyan/40 px-4 py-2 text-sm text-astra-cyan hover:bg-cyan-950/40 disabled:opacity-50"
            >
              {saving ? "SAVING..." : "ADD TO CALENDAR"}
            </button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
