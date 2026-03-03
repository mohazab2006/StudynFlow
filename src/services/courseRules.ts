/**
 * Apply course rules (e.g. DROP_LOWEST) to get the set of task IDs excluded from grade calculation.
 * Does not mutate DB; manual counts toggle still applies on top.
 */
import type { TaskWithCourse } from '../lib/types';
import type { CourseRule } from '../lib/types';

export function getExcludedTaskIdsByRules(
  tasks: TaskWithCourse[],
  rules: CourseRule[]
): Set<string> {
  const excluded = new Set<string>();
  const enabledDropLowest = rules.filter((r) => r.enabled && r.type === 'DROP_LOWEST');

  for (const rule of enabledDropLowest) {
    const matching = tasks.filter(
      (t) =>
        (t.grade?.counts ?? true) &&
        t.type === rule.target &&
        t.course_id === rule.course_id
    );
    if (matching.length <= rule.keep) continue;
    const byGrade = [...matching].sort((a, b) => {
      const ga = a.grade?.grade_percent ?? null;
      const gb = b.grade?.grade_percent ?? null;
      if (ga == null && gb == null) return 0;
      if (ga == null) return 1;
      if (gb == null) return -1;
      return ga - gb;
    });
    const toDrop = byGrade.slice(0, rule.total - rule.keep);
    toDrop.forEach((t) => excluded.add(t.id));
  }
  return excluded;
}

/** Human-readable reason for a task being excluded (for UI). */
export function getExclusionReason(
  taskId: string,
  tasks: TaskWithCourse[],
  rules: CourseRule[]
): string | null {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const enabledDropLowest = rules.filter((r) => r.enabled && r.type === 'DROP_LOWEST');
  for (const rule of enabledDropLowest) {
    if (task.type !== rule.target || task.course_id !== rule.course_id) continue;
    const matching = tasks.filter(
      (t) =>
        (t.grade?.counts ?? true) &&
        t.type === rule.target &&
        t.course_id === rule.course_id
    );
    if (matching.length <= rule.keep) continue;
    const byGrade = [...matching].sort((a, b) => {
      const ga = a.grade?.grade_percent ?? null;
      const gb = b.grade?.grade_percent ?? null;
      if (ga == null && gb == null) return 0;
      if (ga == null) return 1;
      if (gb == null) return -1;
      return ga - gb;
    });
    const dropped = byGrade.slice(0, rule.total - rule.keep);
    if (dropped.some((t) => t.id === taskId)) {
      return `${rule.target} excluded due to Drop Lowest rule (best ${rule.keep} of ${rule.total}).`;
    }
  }
  return null;
}
