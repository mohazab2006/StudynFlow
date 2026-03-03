import { getDatabase, executeWithRetry } from './client';
import { generateId } from '../lib/utils';
import type { CourseRule, CourseRuleType } from '../lib/types';

function mapRow(row: Record<string, unknown>): CourseRule {
  return {
    id: row.id as string,
    course_id: row.course_id as string,
    type: row.type as CourseRuleType,
    target: row.target as string,
    keep: Number(row.keep),
    total: Number(row.total),
    enabled: Boolean(row.enabled),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export async function getCourseRules(courseId: string): Promise<CourseRule[]> {
  const db = await getDatabase();
  const rows = await db.select<Record<string, unknown>[]>(
    'SELECT * FROM course_rules WHERE course_id = ? ORDER BY created_at',
    [courseId]
  );
  return rows.map(mapRow);
}

export async function createCourseRule(input: {
  course_id: string;
  type: CourseRuleType;
  target: string;
  keep: number;
  total: number;
  enabled?: boolean;
}): Promise<CourseRule> {
  const id = generateId();
  const now = new Date().toISOString();
  await executeWithRetry(
    `INSERT INTO course_rules (id, course_id, type, target, keep, total, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.course_id,
      input.type,
      input.target,
      input.keep,
      input.total,
      input.enabled !== false ? 1 : 0,
      now,
      now,
    ]
  );
  const rules = await getCourseRules(input.course_id);
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error('Failed to create course rule');
  return rule;
}

export async function updateCourseRule(
  id: string,
  patch: { enabled?: boolean; keep?: number; total?: number; target?: string }
): Promise<CourseRule> {
  const now = new Date().toISOString();
  const db = await getDatabase();
  const updates: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];
  if (patch.enabled !== undefined) {
    updates.push('enabled = ?');
    values.push(patch.enabled ? 1 : 0);
  }
  if (patch.keep !== undefined) {
    updates.push('keep = ?');
    values.push(patch.keep);
  }
  if (patch.total !== undefined) {
    updates.push('total = ?');
    values.push(patch.total);
  }
  if (patch.target !== undefined) {
    updates.push('target = ?');
    values.push(patch.target);
  }
  values.push(id);
  await executeWithRetry(
    `UPDATE course_rules SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM course_rules WHERE id = ?', [id]);
  if (!rows[0]) throw new Error('Course rule not found');
  return mapRow(rows[0]);
}

export async function deleteCourseRule(id: string): Promise<void> {
  await executeWithRetry('DELETE FROM course_rules WHERE id = ?', [id]);
}
