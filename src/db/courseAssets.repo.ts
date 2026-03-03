import { getDatabase, executeWithRetry } from './client';
import { generateId } from '../lib/utils';
import type { CourseAsset } from '../lib/types';

export async function getAssetsByCourseId(courseId: string | null): Promise<CourseAsset[]> {
  const db = await getDatabase();
  if (courseId === null) {
    const rows = await db.select<any[]>(
      'SELECT * FROM course_assets WHERE course_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC'
    );
    return rows.map(mapRow);
  }
  const rows = await db.select<any[]>(
    'SELECT * FROM course_assets WHERE course_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    [courseId]
  );
  return rows.map(mapRow);
}

function mapRow(row: any): CourseAsset {
  return {
    id: row.id,
    course_id: row.course_id ?? null,
    file_name: row.file_name,
    file_path: row.file_path,
    content_type: row.content_type ?? null,
    file_size: row.file_size ?? null,
    created_at: row.created_at,
    deleted_at: row.deleted_at ?? null,
  };
}

export async function createCourseAsset(input: {
  id?: string;
  course_id: string | null;
  file_name: string;
  file_path: string;
  content_type?: string | null;
  file_size?: number | null;
}): Promise<CourseAsset> {
  const id = input.id ?? generateId();
  const now = new Date().toISOString();
  await executeWithRetry(
    `INSERT INTO course_assets (id, course_id, file_name, file_path, content_type, file_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.course_id ?? null,
      input.file_name,
      input.file_path,
      input.content_type ?? null,
      input.file_size ?? null,
      now,
    ]
  );
  const rows = await getDatabase().then((db) =>
    db.select<any[]>('SELECT * FROM course_assets WHERE id = ?', [id])
  );
  if (!rows[0]) throw new Error('Failed to create course asset');
  return mapRow(rows[0]);
}

export async function deleteCourseAsset(id: string): Promise<void> {
  const now = new Date().toISOString();
  await executeWithRetry('UPDATE course_assets SET deleted_at = ? WHERE id = ?', [now, id]);
}
