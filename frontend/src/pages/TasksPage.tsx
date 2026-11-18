import { useEffect, useState, type FormEvent } from "react";
import { Check, Clock3, Pause, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { Panel } from "../components/Panel.tsx";
import { useAstra } from "../hooks/useAstra.ts";
import { getMissionStatus } from "../lib/mission.ts";
import type { AstraTask } from "../types/index.ts";

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatDue(value: string | null): string {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "The task could not be saved.";
}

export function TasksPage() {
  const { tasks, refreshTasks, createTask, updateTask, deleteTask } = useAstra();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const poll = () => {
      void refreshTasks()
        .then(() => {
          if (active) setNow(Date.now());
        })
        .catch((caught: unknown) => {
          if (active) setError(describeError(caught));
        });
    };
    poll();
    const timer = window.setInterval(poll, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshTasks]);

  function resetForm() {
    setTitle("");
    setNotes("");
    setDueAt("");
    setEditingId(null);
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const input = {
      title: title.trim(),
      notes: notes.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    };
    try {
      if (editingId) {
        await updateTask(editingId, input);
      } else {
        await createTask(input);
      }
      resetForm();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  function editTask(task: AstraTask) {
    setEditingId(task.id);
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setDueAt(localDateTime(task.due_at));
    setError("");
  }

  async function toggleTask(task: AstraTask) {
    setSaving(true);
    setError("");
    try {
      await updateTask(task.id, { completed: !task.completed });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function toggleTaskProgress(task: AstraTask) {
    setSaving(true);
    setError("");
    try {
      await updateTask(task.id, { in_progress: !task.in_progress });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(task: AstraTask) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteTask(task.id);
      if (editingId === task.id) resetForm();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  const pendingTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Panel title={editingId ? "EDIT TASK" : "CREATE A TASK"}>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void submitTask(event)}>
          <label className="flex flex-col gap-1 text-xs text-astra-muted md:col-span-2">
            Task
            <input
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to get done?"
              className="rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-astra-muted">
            Notes
            <textarea
              maxLength={2000}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional details"
              className="resize-y rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-astra-muted">
            Due date and reminder time
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="rounded-lg border border-astra-cyan/25 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-astra-cyan"
            />
            <span>ASTRA checks due tasks locally, including after a restart.</span>
          </label>
          {error ? <p className="text-sm text-astra-danger md:col-span-2" role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-astra-cyan/50 bg-cyan-950/60 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-900/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editingId ? <Check className="size-4" /> : <Plus className="size-4" />}
              {saving ? "SAVING..." : editingId ? "SAVE CHANGES" : "ADD TASK"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-astra-muted hover:text-white"
              >
                <X className="size-4" /> CANCEL
              </button>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title={`UPCOMING TASKS · ${pendingTasks.length}`}>
        <ul className="space-y-2">
          {pendingTasks.map((task) => {
            const status = getMissionStatus(task, new Date(now));
            const overdue = status === "OVERDUE";
            return (
              <li
                key={task.id}
                className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 ${
                  overdue ? "border-amber-400/40 bg-amber-950/15" : "border-astra-cyan/20 bg-slate-950/45"
                }`}
              >
                <button
                  type="button"
                  aria-label={`Complete ${task.title}`}
                  disabled={saving}
                  onClick={() => void toggleTask(task)}
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-astra-cyan/50 text-astra-cyan hover:bg-cyan-900/50"
                >
                  <Check className="size-3.5" />
                </button>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-white">{task.title}</strong>
                  {task.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-astra-muted">{task.notes}</p> : null}
                  <div className={`mt-2 flex items-center gap-1.5 text-xs ${overdue ? "text-amber-300" : "text-astra-cyan"}`}>
                    <Clock3 className="size-3.5" />
                    <time>{formatDue(task.due_at)}</time>
                    <span className="ml-1">{status}</span>
                    {task.reminded_at ? <span className="ml-1 text-astra-muted">· reminder sent</span> : null}
                    {overdue && !task.reminded_at ? <span className="ml-1">· due</span> : null}
                  </div>
                  <button
                    type="button"
                    aria-label={`${task.in_progress ? "Mark scheduled" : "Mark in progress"}: ${task.title}`}
                    disabled={saving}
                    onClick={() => void toggleTaskProgress(task)}
                    className="mt-2 inline-flex items-center gap-1 rounded border border-astra-cyan/25 px-2 py-1 text-[10px] text-astra-cyan hover:bg-cyan-900/30 disabled:opacity-50"
                  >
                    {task.in_progress ? <Pause className="size-3" /> : <Play className="size-3" />}
                    {task.in_progress ? "MARK SCHEDULED" : "MARK IN PROGRESS"}
                  </button>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${task.title}`}
                  disabled={saving}
                  onClick={() => editTask(task)}
                  className="rounded p-1.5 text-astra-muted hover:text-astra-cyan disabled:opacity-50"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${task.title}`}
                  disabled={saving}
                  onClick={() => void removeTask(task)}
                  className="rounded p-1.5 text-astra-muted hover:text-astra-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
          {pendingTasks.length === 0 ? (
            <li className="rounded-xl border border-dashed border-astra-cyan/20 px-4 py-6 text-center text-sm text-astra-muted">
              No upcoming tasks. Add one above to create a reminder.
            </li>
          ) : null}
        </ul>
      </Panel>

      {completedTasks.length ? (
        <Panel title={`COMPLETED · ${completedTasks.length}`}>
          <ul className="space-y-2">
            {completedTasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2">
                <button
                  type="button"
                  aria-label={`Reopen ${task.title}`}
                  disabled={saving}
                  onClick={() => void toggleTask(task)}
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-astra-ok/50 text-astra-ok"
                >
                  <Check className="size-3.5" />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-astra-muted line-through">{task.title}</span>
                <button
                  type="button"
                  aria-label={`Delete ${task.title}`}
                  disabled={saving}
                  onClick={() => void removeTask(task)}
                  className="rounded p-1.5 text-astra-muted hover:text-astra-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
