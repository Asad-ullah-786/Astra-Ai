import { describe, expect, it } from "vitest";
import { getMissionStatus, getTimelineTasks } from "./mission.ts";
import type { AstraTask } from "../types/index.ts";

function task(id: string, dueAt: Date | null, completed = false, inProgress = false): AstraTask {
  const timestamp = new Date(2026, 10, 15, 8).toISOString();
  return {
    id,
    title: id,
    notes: null,
    due_at: dueAt?.toISOString() ?? null,
    completed,
    in_progress: inProgress,
    reminded_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

describe("mission timeline", () => {
  const now = new Date(2026, 10, 15, 12);

  it("filters scheduled tasks into today and the next seven days", () => {
    const today = task("today", new Date(2026, 10, 15, 15));
    const upcoming = task("upcoming", new Date(2026, 10, 17, 9));
    const unscheduled = task("unscheduled", null);

    expect(getTimelineTasks([today, upcoming, unscheduled], "today", now).map((item) => item.id))
      .toEqual(["today"]);
    expect(getTimelineTasks([today, upcoming, unscheduled], "upcoming", now).map((item) => item.id))
      .toEqual(["upcoming"]);
  });

  it("reports completion before overdue status and sorts unscheduled tasks last", () => {
    const overdue = task("overdue", new Date(2026, 10, 14, 9));
    const completed = task("completed", new Date(2026, 10, 14, 9), true);
    const inProgress = task("in-progress", new Date(2026, 11, 16, 9), false, true);
    const unscheduled = task("unscheduled", null);

    expect(getMissionStatus(overdue, now)).toBe("OVERDUE");
    expect(getMissionStatus(completed, now)).toBe("COMPLETED");
    expect(getMissionStatus(inProgress, now)).toBe("IN PROGRESS");
    expect(getTimelineTasks([unscheduled, overdue, inProgress], "all", now).map((item) => item.id))
      .toEqual(["overdue", "in-progress", "unscheduled"]);
  });

  it("shows five scheduled missions in the dashboard timeline", () => {
    const tasks = Array.from({ length: 6 }, (_, index) =>
      task(`mission-${index}`, new Date(2026, 10, 15, 13 + index)),
    );

    expect(getTimelineTasks(tasks, "all", now).map((item) => item.id))
      .toEqual(["mission-0", "mission-1", "mission-2", "mission-3", "mission-4"]);
  });
});
