import { getDatabase, executeWithRetry } from './client';
import type { TaskGrade } from '../lib/types';

function mapRow(row: any): TaskGrade {
  return {
    task_id: row.task_id,
    grade_percent: row.grade_percent === null || row.grade_percent === undefined ? null : Number(row.grade_percent),
    weight_percent: row.weight_percent === null || row.weight_percent === undefined ? null : Number(row.weight_percent),
    is_graded: Boolean(row.is_graded),
    counts: Boolean(row.counts),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getTaskGrade(taskId: string): Promise<TaskGrade | null> {
  const db = await getDatabase();
  const rows = await db.select<any[]>(
    `SELECT task_id, grade_percent, weight_percent, is_graded, counts, created_at, updated_at
     FROM task_grades
     WHERE task_id = ?`,
    [taskId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertTaskGrade(input: {
  task_id: string;
  grade_percent: number | null;
  weight_percent: number | null;
  is_graded: boolean;
  counts: boolean;
}): Promise<TaskGrade> {
  const now = new Date().toISOString();

  await executeWithRetry(
    `INSERT INTO task_grades (task_id, grade_percent, weight_percent, is_graded, counts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET
       grade_percent = excluded.grade_percent,
       weight_percent = excluded.weight_percent,
       is_graded = excluded.is_graded,
       counts = excluded.counts,
       updated_at = excluded.updated_at`,
    [
      input.task_id,
      input.grade_percent,
      input.weight_percent,
      input.is_graded ? 1 : 0,
      input.counts ? 1 : 0,
      now,
      now,
    ]
  );

  const saved = await getTaskGrade(input.task_id);
  if (!saved) throw new Error('Failed to save grade');
  return saved;
}

export async function deleteTaskGrade(taskId: string): Promise<void> {
  await executeWithRetry(`DELETE FROM task_grades WHERE task_id = ?`, [taskId]);
}

























