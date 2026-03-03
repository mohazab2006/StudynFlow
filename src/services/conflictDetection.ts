/**
 * Schedule conflict detection. No auto-reschedule; suggest only.
 */
import type { TaskWithCourse } from '../lib/types';

export type ConflictWarning =
  | { kind: 'overloaded_day'; date: string; count: number; message: string }
  | { kind: 'two_major_same_day'; date: string; taskTitles: string[]; message: string };

const OVERLOAD_THRESHOLD = 4;
const MAJOR_WEIGHT = 15;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getConflictWarnings(tasks: TaskWithCourse[]): ConflictWarning[] {
  const byDate = new Map<string, TaskWithCourse[]>();
  for (const t of tasks) {
    if (!t.due_at) continue;
    const key = dateKey(new Date(t.due_at));
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(t);
  }
  const warnings: ConflictWarning[] = [];
  for (const [date, dayTasks] of byDate) {
    if (dayTasks.length >= OVERLOAD_THRESHOLD) {
      warnings.push({
        kind: 'overloaded_day',
        date,
        count: dayTasks.length,
        message: `${dayTasks.length} tasks due on ${date}. Consider spreading out.`,
      });
    }
    const major = dayTasks.filter(
      (t) => (t.grade?.weight_percent ?? 0) >= MAJOR_WEIGHT
    );
    if (major.length >= 2) {
      warnings.push({
        kind: 'two_major_same_day',
        date,
        taskTitles: major.map((t) => t.title),
        message: `Two or more high-weight items on ${date}: ${major.map((t) => t.title).join(', ')}`,
      });
    }
  }
  return warnings;
}
