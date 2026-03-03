import { getDatabase } from './client';
import { generateId } from '../lib/utils';
import type { TaskTypeOption } from '../lib/types';

export async function getTaskTypes(): Promise<TaskTypeOption[]> {
  const db = await getDatabase();
  return await db.select<TaskTypeOption[]>(
    'SELECT * FROM task_types WHERE deleted_at IS NULL ORDER BY name ASC'
  );
}

export async function createTaskType(input: { name: string; color?: string }): Promise<TaskTypeOption> {
  const db = await getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const name = input.name.trim();
  const color = input.color ?? '#6B7280';

  await db.execute(
    `INSERT OR IGNORE INTO task_types (id, name, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, color, now, now]
  );

  // If name already existed, return the existing one.
  const rows = await db.select<TaskTypeOption[]>(
    'SELECT * FROM task_types WHERE name = ? AND deleted_at IS NULL LIMIT 1',
    [name]
  );
  if (!rows[0]) throw new Error('Failed to create task type');
  return rows[0];
}

export async function updateTaskType(input: { id: string; name?: string; color?: string }): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name.trim());
  }
  if (input.color !== undefined) {
    updates.push('color = ?');
    values.push(input.color);
  }
  updates.push('updated_at = ?');
  values.push(now);
  values.push(input.id);

  await db.execute(`UPDATE task_types SET ${updates.join(', ')} WHERE id = ?`, values);
}

export async function deleteTaskType(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const rows = await db.select<{ name: string }[]>('SELECT name FROM task_types WHERE id = ?', [id]);
  const name = rows[0]?.name;
  await db.execute('UPDATE task_types SET deleted_at = ? WHERE id = ?', [now, id]);
  // Keep tasks, but fall back to Other if they used this type name.
  if (name) {
    await db.execute('UPDATE tasks SET type = ? WHERE type = ?', ['Other', name]);
  }
}


























