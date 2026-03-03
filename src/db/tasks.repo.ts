import { getDatabase, executeWithRetry } from './client';
import { generateId } from '../lib/utils';
import type { Task, TaskWithCourse, CreateTaskInput, UpdateTaskInput } from '../lib/types';

export interface TaskFilters {
  courseIds?: string[];
  types?: string[];
  status?: string;
  workspace?: 'school' | 'life';
  dueRange?: 'overdue' | 'today' | '7days' | 'custom';
  dueBefore?: string;
  dueAfter?: string;
  tags?: string[];
  source?: string;
  includeCompleted?: boolean;
}

export async function getAllTasks(filters?: TaskFilters): Promise<TaskWithCourse[]> {
  const db = await getDatabase();
  
  // IMPORTANT: do NOT select `t.*, c.*` because column names collide (id, created_at, etc.)
  // and the course columns can overwrite task columns in the returned row object.
  let query = `
    SELECT
      t.id as task_id,
      t.title as task_title,
      t.description as task_description,
      t.due_at as task_due_at,
      t.type as task_type,
      t.course_id as task_course_id,
      t.life_category_id as task_life_category_id,
      t.workspace as task_workspace,
      t.status as task_status,
      t.priority_manual as task_priority_manual,
      t.effort_estimate_minutes as task_effort_estimate_minutes,
      t.tags as task_tags,
      t.source as task_source,
      t.created_at as task_created_at,
      t.updated_at as task_updated_at,
      t.deleted_at as task_deleted_at,
      t.isRecurringTemplate as task_isRecurringTemplate,
      t.recurrenceRuleJson as task_recurrenceRuleJson,
      t.recurringSeriesId as task_recurringSeriesId,
      t.parentTemplateId as task_parentTemplateId,
      t.occurrenceDate as task_occurrenceDate,
      t.isOccurrenceOverride as task_isOccurrenceOverride,

      tg.task_id as grade_task_id,
      tg.grade_percent as grade_percent,
      tg.weight_percent as grade_weight_percent,
      tg.is_graded as grade_is_graded,
      tg.counts as grade_counts,
      tg.created_at as grade_created_at,
      tg.updated_at as grade_updated_at,

      c.id as course_id,
      c.code as course_code,
      c.name as course_name,
      c.term as course_term,
      c.target_grade_default as course_target_grade_default,
      c.color as course_color,
      c.created_at as course_created_at,
      c.updated_at as course_updated_at,
      c.deleted_at as course_deleted_at
      ,
      lc.id as life_category_id,
      lc.name as life_category_name,
      lc.color as life_category_color,
      lc.created_at as life_category_created_at,
      lc.updated_at as life_category_updated_at,
      lc.deleted_at as life_category_deleted_at
    FROM tasks t
    LEFT JOIN task_grades tg ON tg.task_id = t.id
    LEFT JOIN courses c ON t.course_id = c.id AND c.deleted_at IS NULL
    LEFT JOIN life_categories lc ON t.life_category_id = lc.id AND lc.deleted_at IS NULL
    WHERE t.deleted_at IS NULL
  `;
  
  const params: any[] = [];

  if (!filters?.includeCompleted) {
    query += ` AND t.status != 'done'`;
  }
  
  // Always hide old completed life tasks (more than 7 days past due date)
  // This keeps the list clean while still showing recently completed tasks
  if (filters?.workspace === 'life') {
    query += ` AND (t.status != 'done' OR (t.status = 'done' AND (t.due_at IS NULL OR datetime(t.due_at) >= datetime('now', '-7 days'))))`;
  }
  
  // Hide future recurring instances - only show instances on or before their due date
  // This ensures recurring tasks only appear when their date arrives (at 12am, not at the specific time)
  // Templates and non-recurring tasks are always shown
  query += ` AND (
    t.isRecurringTemplate = 1 
    OR t.parentTemplateId IS NULL 
    OR t.due_at IS NULL 
    OR date(t.due_at) <= date('now')
  )`;

  if (filters?.courseIds && filters.courseIds.length > 0) {
    const placeholders = filters.courseIds.map(() => '?').join(',');
    query += ` AND t.course_id IN (${placeholders})`;
    params.push(...filters.courseIds);
  }

  if (filters?.types && filters.types.length > 0) {
    const placeholders = filters.types.map(() => '?').join(',');
    query += ` AND t.type IN (${placeholders})`;
    params.push(...filters.types);
  }

  if (filters?.status) {
    query += ` AND t.status = ?`;
    params.push(filters.status);
  }

  if (filters?.workspace) {
    query += ` AND t.workspace = ?`;
    params.push(filters.workspace);
  }

  if (filters?.dueRange) {
    switch (filters.dueRange) {
      case 'overdue':
        query += ` AND t.due_at < datetime('now') AND date(t.due_at) != date('now')`;
        break;
      case 'today':
        query += ` AND date(t.due_at) = date('now')`;
        break;
      case '7days':
        // "Next 7 days" should NOT overlap with "Today".
        // Use calendar-day boundaries: tomorrow (start of day) through 7 days after tomorrow.
        query += ` AND t.due_at >= datetime('now', 'start of day', '+1 day')`;
        query += ` AND t.due_at < datetime('now', 'start of day', '+8 day')`;
        break;
    }
  }

  if (filters?.dueBefore) {
    query += ` AND t.due_at <= ?`;
    params.push(filters.dueBefore);
  }

  if (filters?.dueAfter) {
    query += ` AND t.due_at >= ?`;
    params.push(filters.dueAfter);
  }

  if (filters?.source) {
    query += ` AND t.source = ?`;
    params.push(filters.source);
  }

  if (filters?.tags && filters.tags.length > 0) {
    // Simple tag matching (comma-separated string)
    const tagConditions = filters.tags.map(() => `t.tags LIKE ?`).join(' OR ');
    query += ` AND (${tagConditions})`;
    params.push(...filters.tags.map(tag => `%${tag}%`));
  }

  query += ` ORDER BY t.due_at ASC, t.created_at DESC`;

  const rows = await db.select<any[]>(query, params);

  // Group by task (in case of joins)
  const tasksMap = new Map<string, TaskWithCourse>();
  
  for (const row of rows) {
    if (!tasksMap.has(row.task_id)) {
      const task: TaskWithCourse = {
        id: row.task_id,
        title: row.task_title,
        description: row.task_description,
        due_at: row.task_due_at,
        type: row.task_type,
        course_id: row.task_course_id,
        life_category_id: row.task_life_category_id,
        workspace: row.task_workspace,
        status: row.task_status,
        priority_manual: row.task_priority_manual,
        effort_estimate_minutes: row.task_effort_estimate_minutes,
        tags: row.task_tags,
        source: row.task_source,
        created_at: row.task_created_at,
        updated_at: row.task_updated_at,
        deleted_at: row.task_deleted_at,
        isRecurringTemplate: Boolean(row.task_isRecurringTemplate),
        recurrenceRuleJson: row.task_recurrenceRuleJson || null,
        recurringSeriesId: row.task_recurringSeriesId || null,
        parentTemplateId: row.task_parentTemplateId || null,
        occurrenceDate: row.task_occurrenceDate || null,
        isOccurrenceOverride: Boolean(row.task_isOccurrenceOverride),
      };

      if (row.course_id) {
        task.course = {
          id: row.course_id,
          code: row.course_code,
          name: row.course_name,
          term: row.course_term,
          target_grade_default: row.course_target_grade_default,
          color: row.course_color || '#6B7280',
          created_at: row.course_created_at,
          updated_at: row.course_updated_at,
          deleted_at: row.course_deleted_at,
        };
      }

      if (row.life_category_id) {
        task.lifeCategory = {
          id: row.life_category_id,
          name: row.life_category_name,
          color: row.life_category_color || '#6B7280',
          created_at: row.life_category_created_at,
          updated_at: row.life_category_updated_at,
          deleted_at: row.life_category_deleted_at,
        };
      }

      if (row.grade_task_id) {
        task.grade = {
          task_id: row.grade_task_id,
          grade_percent: row.grade_percent === null || row.grade_percent === undefined ? null : Number(row.grade_percent),
          weight_percent:
            row.grade_weight_percent === null || row.grade_weight_percent === undefined
              ? null
              : Number(row.grade_weight_percent),
          is_graded: Boolean(row.grade_is_graded),
          counts: Boolean(row.grade_counts),
          created_at: row.grade_created_at,
          updated_at: row.grade_updated_at,
        };
      }

      tasksMap.set(row.task_id, task);
    }
  }

  return Array.from(tasksMap.values());
}

export async function getTaskById(id: string): Promise<Task | null> {
  const db = await getDatabase();
  const rows = await db.select<any[]>(
    'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!rows[0]) return null;

  const row = rows[0];
  // Convert SQLite integer booleans to JavaScript booleans
  return {
    ...row,
    isRecurringTemplate: Boolean(row.isRecurringTemplate),
    isOccurrenceOverride: Boolean(row.isOccurrenceOverride),
  } as Task;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const id = generateId();
  const now = new Date().toISOString();
  const seriesId = input.recurringSeriesId || (input.isRecurringTemplate ? id : null);

  await executeWithRetry(
    `INSERT INTO tasks (
      id, title, description, due_at, type, course_id, life_category_id, workspace, status,
      priority_manual, effort_estimate_minutes, tags, source,
      isRecurringTemplate, recurrenceRuleJson, recurringSeriesId, parentTemplateId, occurrenceDate, isOccurrenceOverride,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title,
      input.description || null,
      input.due_at || null,
      input.type || 'Other',
      input.course_id || null,
      input.life_category_id || null,
      input.workspace ?? (input.course_id ? 'school' : 'life'),
      input.status || 'todo',
      input.priority_manual || null,
      input.effort_estimate_minutes || null,
      input.tags || null,
      input.source ?? 'manual',
      input.isRecurringTemplate ? 1 : 0,
      input.recurrenceRuleJson || null,
      seriesId,
      input.parentTemplateId || null,
      input.occurrenceDate || null,
      input.isOccurrenceOverride ? 1 : 0,
      now,
      now,
    ]
  );

  const task = await getTaskById(id);
  if (!task) throw new Error('Failed to create task');
  return task;
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const now = new Date().toISOString();

  // Get current task first
  const currentTask = await getTaskById(input.id);
  if (!currentTask) throw new Error('Task not found');

  // Build update with current values as fallback
  const title = input.title !== undefined ? input.title : currentTask.title;
  const description = input.description !== undefined ? (input.description || null) : currentTask.description;
  const due_at = input.due_at !== undefined ? (input.due_at || null) : currentTask.due_at;
  const type = input.type !== undefined ? (input.type || 'Other') : currentTask.type;
  const course_id = input.course_id !== undefined ? (input.course_id || null) : currentTask.course_id;
  const life_category_id =
    input.life_category_id !== undefined
      ? (input.life_category_id || null)
      : ((currentTask as any).life_category_id ?? null);
  const workspace =
    (input as any).workspace !== undefined
      ? ((input as any).workspace || null)
      : ((currentTask as any).workspace ?? null);
  const status = input.status !== undefined ? input.status : currentTask.status;
  const priority_manual = input.priority_manual !== undefined ? (input.priority_manual || null) : currentTask.priority_manual;
  const effort_estimate_minutes = input.effort_estimate_minutes !== undefined ? (input.effort_estimate_minutes || null) : currentTask.effort_estimate_minutes;
  const tags = input.tags !== undefined ? (input.tags || null) : currentTask.tags;

  // Handle recurring fields if provided
  const isRecurringTemplate = input.isRecurringTemplate !== undefined 
    ? (input.isRecurringTemplate ? 1 : 0)
    : (currentTask.isRecurringTemplate ? 1 : 0);
  const recurrenceRuleJson = input.recurrenceRuleJson !== undefined 
    ? input.recurrenceRuleJson 
    : currentTask.recurrenceRuleJson;
  const recurringSeriesId = input.recurringSeriesId !== undefined 
    ? input.recurringSeriesId 
    : currentTask.recurringSeriesId;
  const parentTemplateId = input.parentTemplateId !== undefined 
    ? input.parentTemplateId 
    : currentTask.parentTemplateId;
  const occurrenceDate = input.occurrenceDate !== undefined 
    ? input.occurrenceDate 
    : currentTask.occurrenceDate;
  const isOccurrenceOverride = input.isOccurrenceOverride !== undefined 
    ? (input.isOccurrenceOverride ? 1 : 0)
    : (currentTask.isOccurrenceOverride ? 1 : 0);

  try {
    await executeWithRetry(
      `UPDATE tasks SET 
        title = ?,
        description = ?,
        due_at = ?,
        type = ?,
        course_id = ?,
        life_category_id = ?,
        workspace = ?,
        status = ?,
        priority_manual = ?,
        effort_estimate_minutes = ?,
        tags = ?,
        isRecurringTemplate = ?,
        recurrenceRuleJson = ?,
        recurringSeriesId = ?,
        parentTemplateId = ?,
        occurrenceDate = ?,
        isOccurrenceOverride = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        title,
        description,
        due_at,
        type,
        course_id,
        life_category_id,
        workspace,
        status,
        priority_manual,
        effort_estimate_minutes,
        tags,
        isRecurringTemplate,
        recurrenceRuleJson,
        recurringSeriesId,
        parentTemplateId,
        occurrenceDate,
        isOccurrenceOverride,
        now,
        input.id,
      ]
    );
  } catch (error) {
    console.error('Update task error:', error);
    throw new Error(`Failed to update task: ${error}`);
  }

  const task = await getTaskById(input.id);
  if (!task) throw new Error('Failed to update task');
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  const now = new Date().toISOString();
  await executeWithRetry('UPDATE tasks SET deleted_at = ? WHERE id = ?', [now, id]);
}

/**
 * Get all recurring task templates (life tasks only)
 */
export async function getRecurringTemplates(): Promise<TaskWithCourse[]> {
  const db = await getDatabase();
  
  const rows = await db.select<any[]>(`
    SELECT
      t.id as task_id,
      t.title as task_title,
      t.description as task_description,
      t.due_at as task_due_at,
      t.type as task_type,
      t.life_category_id as task_life_category_id,
      t.workspace as task_workspace,
      t.status as task_status,
      t.tags as task_tags,
      t.recurrenceRuleJson as task_recurrenceRuleJson,
      t.recurringSeriesId as task_recurringSeriesId,
      t.created_at as task_created_at,
      t.updated_at as task_updated_at,
      t.deleted_at as task_deleted_at,
      t.isRecurringTemplate as task_isRecurringTemplate,
      
      lc.id as life_category_id,
      lc.name as life_category_name,
      lc.color as life_category_color,
      lc.created_at as life_category_created_at,
      lc.updated_at as life_category_updated_at,
      lc.deleted_at as life_category_deleted_at
    FROM tasks t
    LEFT JOIN life_categories lc ON t.life_category_id = lc.id AND lc.deleted_at IS NULL
    WHERE t.isRecurringTemplate = 1
      AND t.workspace = 'life'
      AND t.deleted_at IS NULL
    ORDER BY t.title ASC
  `);

  return rows.map((row) => {
    const task: TaskWithCourse = {
      id: row.task_id,
      title: row.task_title,
      description: row.task_description,
      due_at: row.task_due_at,
      type: row.task_type,
      course_id: null,
      life_category_id: row.task_life_category_id,
      workspace: row.task_workspace,
      status: row.task_status,
      priority_manual: null,
      effort_estimate_minutes: null,
      tags: row.task_tags,
      source: 'manual',
      created_at: row.task_created_at,
      updated_at: row.task_updated_at,
      deleted_at: row.task_deleted_at,
      isRecurringTemplate: Boolean(row.task_isRecurringTemplate),
      recurrenceRuleJson: row.task_recurrenceRuleJson || null,
      recurringSeriesId: row.task_recurringSeriesId || null,
      parentTemplateId: null,
      occurrenceDate: null,
      isOccurrenceOverride: false,
    };

    if (row.life_category_id) {
      task.lifeCategory = {
        id: row.life_category_id,
        name: row.life_category_name,
        color: row.life_category_color || '#6B7280',
        created_at: row.life_category_created_at,
        updated_at: row.life_category_updated_at,
        deleted_at: row.life_category_deleted_at,
      };
    }

    return task;
  });
}

/**
 * Delete a recurring instance and all future instances in the same series
 */
export async function deleteRecurringInstanceAndFuture(instanceId: string): Promise<void> {
  const now = new Date().toISOString();
  
  // Get the instance to find its occurrence date and series
  const instance = await getTaskById(instanceId);
  if (!instance || !instance.parentTemplateId || !instance.occurrenceDate) {
    throw new Error('Task is not a recurring instance');
  }
  
  const occurrenceDate = instance.occurrenceDate;
  const seriesId = instance.recurringSeriesId;
  
  // Delete this instance
  await executeWithRetry('UPDATE tasks SET deleted_at = ? WHERE id = ?', [now, instanceId]);
  
  // Delete all future instances in the same series (same or later occurrence date)
  await executeWithRetry(
    `UPDATE tasks SET deleted_at = ? 
     WHERE recurringSeriesId = ? 
     AND occurrenceDate >= ? 
     AND deleted_at IS NULL
     AND id != ?`,
    [now, seriesId, occurrenceDate, instanceId]
  );
}

