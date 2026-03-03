import type { TaskWithCourse } from '../lib/types';

export type GradeWarning =
  | { kind: 'total_weight_over_100'; message: string; totalWeight: number }
  | { kind: 'final_missing'; message: string }
  | { kind: 'final_weight_missing'; message: string }
  | { kind: 'graded_missing_grade'; message: string; taskId: string; taskTitle: string }
  | { kind: 'counted_missing_weight'; message: string; taskId: string; taskTitle: string };

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

/** Optionally exclude task IDs (e.g. from course rules like Drop Lowest). */
export type GradeMathOptions = { excludedTaskIds?: Set<string> };

function isCounted(t: TaskWithCourse, excludedTaskIds?: Set<string>): boolean {
  if (excludedTaskIds?.has(t.id)) return false;
  return (t.grade?.counts ?? true) === true;
}

export function computeWeightStats(
  tasks: TaskWithCourse[],
  options?: GradeMathOptions
) {
  const excluded = options?.excludedTaskIds;
  const counted = tasks.filter((t) => isCounted(t, excluded));

  const weights = counted
    .map((t) => n(t.grade?.weight_percent))
    .filter((x): x is number => x !== null && x > 0);

  const totalCountedWeight = weights.reduce((a, b) => a + b, 0);

  const completedWeight = counted
    .filter((t) => (t.grade?.is_graded ?? false) === true)
    .map((t) => n(t.grade?.weight_percent))
    .filter((x): x is number => x !== null && x > 0)
    .reduce((a, b) => a + b, 0);

  const remainingWeight = 100 - totalCountedWeight;

  return { totalCountedWeight, completedWeight, remainingWeight };
}

// Current Grade So Far = graded-only, normalized by graded weights
export function computeCurrentSoFar(
  tasks: TaskWithCourse[],
  options?: GradeMathOptions
): number | null {
  const excluded = options?.excludedTaskIds;
  const gradedCounted = tasks.filter(
    (t) => isCounted(t, excluded) && (t.grade?.is_graded ?? false) === true
  );

  let sumW = 0;
  let sumWG = 0;

  for (const t of gradedCounted) {
    const w = n(t.grade?.weight_percent);
    const g = n(t.grade?.grade_percent);
    if (w === null || w <= 0) continue;
    if (g === null) continue; // graded flag but missing value -> handled by warnings
    sumW += w;
    sumWG += g * w;
  }

  if (sumW === 0) return null;
  return sumWG / sumW;
}

// Projected Overall = ungraded treated as 0 contribution (so only graded contributes)
export function computeProjectedOverall(
  tasks: TaskWithCourse[],
  options?: GradeMathOptions
): number {
  const excluded = options?.excludedTaskIds;
  const gradedCounted = tasks.filter(
    (t) => isCounted(t, excluded) && (t.grade?.is_graded ?? false) === true
  );

  let sum = 0;
  for (const t of gradedCounted) {
    const w = n(t.grade?.weight_percent);
    const g = n(t.grade?.grade_percent);
    if (w === null || w <= 0) continue;
    if (g === null) continue;
    sum += (g * w) / 100;
  }
  return sum;
}

export function computeKnownContribution(
  tasks: TaskWithCourse[],
  options?: GradeMathOptions
): number {
  return computeProjectedOverall(tasks, options);
}

export function computeNeededFinal(params: {
  target: number;
  knownContribution: number; // already /100 (e.g. 18.4 means 18.4% points)
  finalWeightPercent: number;
}): number | null {
  const { target, knownContribution, finalWeightPercent } = params;
  if (!Number.isFinite(finalWeightPercent) || finalWeightPercent <= 0) return null;
  return (target - knownContribution) / (finalWeightPercent / 100);
}

export function buildGradeWarnings(params: {
  tasks: TaskWithCourse[];
  finalTask: TaskWithCourse | null;
  excludedTaskIds?: Set<string>;
}): GradeWarning[] {
  const warnings: GradeWarning[] = [];
  const { tasks, finalTask, excludedTaskIds } = params;
  const options = excludedTaskIds ? { excludedTaskIds } : undefined;

  const { totalCountedWeight } = computeWeightStats(tasks, options);
  if (totalCountedWeight > 100.0001) {
    warnings.push({
      kind: 'total_weight_over_100',
      totalWeight: totalCountedWeight,
      message: `Total counted weight is ${totalCountedWeight.toFixed(1)}% (over 100%).`,
    });
  }

  for (const t of tasks) {
    if (!isCounted(t, excludedTaskIds)) continue;

    const w = n(t.grade?.weight_percent);
    if (w === null || w <= 0) {
      warnings.push({
        kind: 'counted_missing_weight',
        taskId: t.id,
        taskTitle: t.title,
        message: `Missing weight on counted item: ${t.title}`,
      });
    }

    if ((t.grade?.is_graded ?? false) === true) {
      const g = n(t.grade?.grade_percent);
      if (g === null) {
        warnings.push({
          kind: 'graded_missing_grade',
          taskId: t.id,
          taskTitle: t.title,
          message: `Marked graded but no grade entered: ${t.title}`,
        });
      }
    }
  }

  if (!finalTask) {
    warnings.push({ kind: 'final_missing', message: 'Final exam task not found (type “Final”).' });
  } else {
    const wFinal = n(finalTask.grade?.weight_percent);
    if (wFinal === null || wFinal <= 0) {
      warnings.push({ kind: 'final_weight_missing', message: 'Final exam weight is missing or 0%.' });
    }
  }

  return warnings;
}

/** Hypothetical: if I get X% on the final, what's my overall? Non-persistent. */
export function simulateOverallIfFinal(
  tasks: TaskWithCourse[],
  finalTask: TaskWithCourse | null,
  hypotheticalFinalPercent: number,
  options?: GradeMathOptions
): number | null {
  if (!finalTask || !Number.isFinite(hypotheticalFinalPercent)) return null;
  const excluded = options?.excludedTaskIds;
  const nonFinal = tasks.filter((t) => t.id !== finalTask.id && isCounted(t, excluded));
  let sum = 0;
  for (const t of nonFinal) {
    if ((t.grade?.is_graded ?? false) !== true) continue;
    const w = n(t.grade?.weight_percent);
    const g = n(t.grade?.grade_percent);
    if (w === null || w <= 0 || g === null) continue;
    sum += (g * w) / 100;
  }
  const wFinal = n(finalTask.grade?.weight_percent);
  if (wFinal === null || wFinal <= 0) return null;
  sum += (hypotheticalFinalPercent * wFinal) / 100;
  return sum;
}

/** Hypothetical: if I score X% on all remaining (ungraded) counted items, what's my overall? */
export function simulateOverallIfRemaining(
  tasks: TaskWithCourse[],
  hypotheticalRemainingPercent: number,
  options?: GradeMathOptions
): number | null {
  if (!Number.isFinite(hypotheticalRemainingPercent)) return null;
  const excluded = options?.excludedTaskIds;
  let sum = 0;
  for (const t of tasks) {
    if (!isCounted(t, excluded)) continue;
    const w = n(t.grade?.weight_percent);
    if (w === null || w <= 0) continue;
    const g = (t.grade?.is_graded ?? false) ? n(t.grade?.grade_percent) : hypotheticalRemainingPercent;
    sum += ((g ?? 0) * w) / 100;
  }
  return sum;
}

export type GradeRisk =
  | { kind: 'exam_pass_required'; message: string; thresholdPercent: number }
  | { kind: 'below_exam_threshold'; message: string; currentNeeded: number }
  | { kind: 'high_final_needed'; message: string; neededPercent: number };

/** Risk detection: exam pass requirement, below threshold, etc. Non-mutating. */
export function getGradeRisks(
  tasks: TaskWithCourse[],
  finalTask: TaskWithCourse | null,
  options?: GradeMathOptions
): GradeRisk[] {
  const risks: GradeRisk[] = [];
  if (!finalTask) return risks;
  const wFinal = n(finalTask.grade?.weight_percent);
  if (wFinal === null || wFinal <= 0) return risks;
  const known = computeKnownContribution(
    tasks.filter((t) => t.id !== finalTask.id),
    options
  );
  const neededFor90 = computeNeededFinal({
    target: 90,
    knownContribution: known,
    finalWeightPercent: wFinal,
  });
  if (neededFor90 !== null && neededFor90 > 50) {
    risks.push({
      kind: 'exam_pass_required',
      message: `Course may require ≥50% on final to pass.`,
      thresholdPercent: 50,
    });
  }
  const neededFor50 = computeNeededFinal({
    target: 50,
    knownContribution: known,
    finalWeightPercent: wFinal,
  });
  if (neededFor50 !== null && neededFor50 > 100) {
    risks.push({
      kind: 'below_exam_threshold',
      message: `You are below the exam-pass threshold: need ${neededFor50.toFixed(0)}% on final to reach 50% overall.`,
      currentNeeded: neededFor50,
    });
  }
  return risks;
}

























