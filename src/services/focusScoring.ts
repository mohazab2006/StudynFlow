/**
 * Priority scoring for school + life tasks. Produces FocusScore and tags.
 * Explainable, overrideable; no persistent mutation.
 */
import type { TaskWithCourse, FocusTag } from '../lib/types';

const HIGH_IMPACT_WEIGHT = 20;
const DUE_SOON_DAYS = 2;
const OVERDUE_PENALTY = 1.5;
const QUICK_WIN_MINUTES = 60;
const HIGH_EFFORT_MINUTES = 180;

export interface ScoredTask extends TaskWithCourse {
  focusScore: number;
  focusTags: FocusTag[];
  focusReason: string;
}

export function scoreTaskForFocus(
  task: TaskWithCourse,
  options: {
    now?: Date;
    courseWeight?: number; // max weight in course for normalization
    isExcludedByRule?: boolean;
  } = {}
): ScoredTask {
  const now = options.now ?? new Date();
  const reasons: string[] = [];
  let score = 50; // base

  const dueAt = task.due_at ? new Date(task.due_at) : null;
  const weight = task.grade?.weight_percent ?? null;
  const effort = task.effort_estimate_minutes ?? null;
  const isSchool = task.workspace === 'school';
  const isLife = task.workspace === 'life';

  if (dueAt) {
    const daysUntil = (dueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysUntil < 0) {
      score += 40 * OVERDUE_PENALTY;
      reasons.push('Overdue');
    } else if (daysUntil <= 1) {
      score += 35;
      reasons.push('Due tomorrow');
    } else if (daysUntil <= DUE_SOON_DAYS) {
      score += 25;
      reasons.push(`Due in ${Math.round(daysUntil)} days`);
    } else if (daysUntil <= 7) {
      score += 15;
      reasons.push('Due this week');
    }
  } else if (isSchool) {
    reasons.push('No due date');
  }

  if (isSchool && weight !== null && weight > 0) {
    const impact = Math.min(weight / 5, 20);
    score += impact;
    if (weight >= 20) reasons.push(`${weight}% of grade`);
    else if (weight >= 10) reasons.push(`${weight}% weight`);
  }

  if (effort !== null && effort > 0) {
    if (effort <= QUICK_WIN_MINUTES) {
      score += 10;
      reasons.push('Quick win');
    } else if (effort >= HIGH_EFFORT_MINUTES) {
      reasons.push('High effort');
    }
  }

  if (task.isRecurringTemplate || task.parentTemplateId) {
    reasons.push('Recurring');
  }

  const tags: FocusTag[] = [];
  if (dueAt && (dueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000) < 0) tags.push('At Risk');
  if (weight !== null && weight >= 25) tags.push('High Impact');
  if (effort !== null && effort >= HIGH_EFFORT_MINUTES) tags.push('High Effort');
  if (effort !== null && effort > 0 && effort <= QUICK_WIN_MINUTES) tags.push('Quick Win');
  if (!dueAt && isSchool) tags.push('Low Flexibility');

  return {
    ...task,
    focusScore: Math.round(Math.max(0, Math.min(100, score))),
    focusTags: tags,
    focusReason: reasons.length ? reasons.join(' · ') : 'Scheduled',
  };
}

export function rankTasksByFocus(
  tasks: TaskWithCourse[],
  options?: { now?: Date }
): ScoredTask[] {
  const scored = tasks.map((t) => scoreTaskForFocus(t, options));
  return scored.sort((a, b) => b.focusScore - a.focusScore);
}
