import type { AstraTask } from "../types/index.ts";

export type MissionRange = "today" | "upcoming" | "all";
export type MissionStatus = "COMPLETED" | "OVERDUE" | "IN PROGRESS" | "SCHEDULED";

export function getMissionStatus(task: AstraTask, now: Date): MissionStatus {
  if (task.completed) return "COMPLETED";
  if (task.due_at && new Date(task.due_at) < now) return "OVERDUE";
  if (task.in_progress) return "IN PROGRESS";
  return "SCHEDULED";
}

export function getTimelineTasks(tasks: AstraTask[], range: MissionRange, now: Date): AstraTask[] {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(tomorrow);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return tasks
    .filter((task) => {
      if (range === "all") return true;
      if (!task.due_at) return false;
      const due = new Date(task.due_at);
      return range === "today"
        ? due >= todayStart && due < tomorrow
        : due >= tomorrow && due < weekEnd;
    })
    .sort((left, right) => {
      const leftDue = left.due_at ? new Date(left.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.due_at ? new Date(right.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    })
    .slice(0, 5);
}
