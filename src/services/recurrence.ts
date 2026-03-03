import type { RecurrenceRule } from '../lib/types';
import { generateId } from '../lib/utils';
import { getDatabase, executeWithRetry } from '../db/client';

const WEEKDAY_MAP: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 0,
};

let ensureRecurringInstancesPromise: Promise<void> | null = null;

/**
 * Expand a recurrence rule to generate occurrence dates within a date range
 * @param rule - The recurrence rule
 * @param fromDate - Start date (usually template's due_at or today)
 * @param toDate - End date (horizon)
 * @param templateStartDate - The original template start date (for MONTHLY day-of-month)
 */
export function expandRuleToDates(
  rule: RecurrenceRule,
  fromDate: Date,
  toDate: Date,
  templateStartDate?: Date
): Date[] {
  const dates: Date[] = [];
  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  const templateDayOfMonth = templateStartDate ? templateStartDate.getDate() : fromDate.getDate();

  let occurrenceCount = 0;
  let daysSinceStart = 0;

  while (current <= end) {
    // Check end conditions
    if (rule.endType === 'COUNT' && rule.count !== undefined) {
      if (occurrenceCount >= rule.count) break;
    }
    if (rule.endType === 'UNTIL' && rule.untilDate) {
      const until = new Date(rule.untilDate);
      until.setHours(23, 59, 59, 999);
      if (current > until) break;
    }

    let shouldInclude = false;

    switch (rule.frequency) {
      case 'DAILY':
        // For daily, include every Nth day based on interval
        if (daysSinceStart % rule.interval === 0) {
          shouldInclude = true;
        }
        break;

      case 'WEEKLY':
        // For weekly, check if current day matches one of the weekdays
        if (rule.byWeekday && rule.byWeekday.length > 0) {
          const dayOfWeek = current.getDay();
          const matchesWeekday = rule.byWeekday.some((day) => WEEKDAY_MAP[day] === dayOfWeek);
          
          if (matchesWeekday) {
            // Check if we're on the right interval (every Nth week)
            const weeksSinceStart = Math.floor(daysSinceStart / 7);
            if (weeksSinceStart % rule.interval === 0) {
              shouldInclude = true;
            }
          }
        } else {
          // No weekday specified, include every Nth week from start
          const weeksSinceStart = Math.floor(daysSinceStart / 7);
          if (weeksSinceStart % rule.interval === 0 && daysSinceStart % 7 === 0) {
            shouldInclude = true;
          }
        }
        break;

      case 'MONTHLY':
        // Monthly: repeat on same day-of-month as template
        if (current.getDate() === templateDayOfMonth) {
          // Check if we're on the right interval (every Nth month)
          const monthDiff = (current.getFullYear() - fromDate.getFullYear()) * 12 + 
                           (current.getMonth() - fromDate.getMonth());
          if (monthDiff >= 0 && monthDiff % rule.interval === 0) {
            shouldInclude = true;
          }
        }
        break;
    }

    if (shouldInclude) {
      dates.push(new Date(current));
      occurrenceCount++;
    }

    // Advance date by one day
    current.setDate(current.getDate() + 1);
    daysSinceStart++;
  }

  return dates;
}

/**
 * Ensure recurring task instances exist for the next horizonDays
 * Increased default to 90 days to ensure enough instances are generated
 */
export async function ensureRecurringInstances(horizonDays: number = 90): Promise<void> {
  // This function is invoked from multiple places (App, Today, Upcoming, after edits).
  // Prevent parallel runs from racing and creating duplicate rows.
  if (ensureRecurringInstancesPromise) return ensureRecurringInstancesPromise;

  ensureRecurringInstancesPromise = (async () => {
    const db = await getDatabase();
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + horizonDays);

    // Get all recurring templates (life tasks only)
    const templates = await db.select<Array<{
      id: string;
      title: string;
      description: string | null;
      due_at: string | null;
      type: string;
      life_category_id: string | null;
      workspace: string;
      status: string;
      tags: string | null;
      recurrenceRuleJson: string | null;
      recurringSeriesId: string | null;
    }>>(`
      SELECT
        id,
        title,
        description,
        due_at,
        type,
        life_category_id,
        workspace,
        status,
        tags,
        recurrenceRuleJson,
        recurringSeriesId
      FROM tasks
      WHERE deleted_at IS NULL
        AND isRecurringTemplate = 1
        AND workspace = 'life'
    `);

    for (const template of templates) {
      if (!template.recurrenceRuleJson) continue;

      let rule: RecurrenceRule;
      try {
        rule = JSON.parse(template.recurrenceRuleJson);
      } catch {
        console.error(`Invalid recurrence rule for template ${template.id}`);
        continue;
      }

      // Ensure COUNT is not accidentally set if endType is not COUNT
      if (rule.endType !== 'COUNT') {
        rule.count = undefined;
      }

      // Determine start date: use template's due_at if available, otherwise today
      let startDate = now;
      let templateStartDate = now;
      if (template.due_at) {
        const templateDue = new Date(template.due_at);
        templateStartDate = new Date(templateDue);
        // Always start from the template's due date (the start date the user specified)
        // This ensures instances only appear on their scheduled dates
        startDate = new Date(templateDue);
        startDate.setHours(0, 0, 0, 0);
      } else {
        // No start date specified, use today
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
      }

      // Don't generate instances in the past - only from start date forward
      // But if start date is in the past, start from today to avoid generating old instances
      const effectiveStartDate = startDate < now ? new Date(now) : startDate;
      effectiveStartDate.setHours(0, 0, 0, 0);

      // Generate occurrence dates
      const occurrenceDates = expandRuleToDates(rule, effectiveStartDate, horizon, templateStartDate);

      // For each occurrence date, check if instance exists
      for (const occurrenceDate of occurrenceDates) {
        // Format date as YYYY-MM-DD
        const dateStr = occurrenceDate.toISOString().split('T')[0];

        // Check if instance already exists (and dedupe if we find multiple)
        const existingRows = await db.select<Array<{ id: string; created_at: string }>>(`
          SELECT id, created_at
          FROM tasks
          WHERE parentTemplateId = ?
            AND occurrenceDate = ?
            AND deleted_at IS NULL
          ORDER BY datetime(created_at) ASC
        `, [template.id, dateStr]);

        if (existingRows.length > 0) {
          // If duplicates exist already, keep the oldest and soft-delete the rest.
          if (existingRows.length > 1) {
            const keepId = existingRows[0]!.id;
            const toDelete = existingRows.slice(1).map((r) => r.id).filter((id) => id !== keepId);
            if (toDelete.length > 0) {
              const placeholders = toDelete.map(() => '?').join(', ');
              const ts = new Date().toISOString();
              await executeWithRetry(
                `UPDATE tasks
                 SET deleted_at = ?, updated_at = ?
                 WHERE deleted_at IS NULL AND id IN (${placeholders})`,
                [ts, ts, ...toDelete]
              );
            }
          }
          // At least one valid instance exists; don't create a new one.
          continue;
        }

        // Create new instance
        const dueAt = new Date(occurrenceDate);
        if (rule.timeOfDay) {
          const [hours, minutes] = rule.timeOfDay.split(':').map(Number);
          dueAt.setHours(hours, minutes, 0, 0);
        } else {
          // Use template's time if no timeOfDay specified
          if (template.due_at) {
            const templateDate = new Date(template.due_at);
            dueAt.setHours(
              templateDate.getHours(),
              templateDate.getMinutes(),
              templateDate.getSeconds(),
              templateDate.getMilliseconds()
            );
          }
        }

        // Create instance directly in database
        const instanceId = generateId();
        const ts = new Date().toISOString();
        const seriesId = template.recurringSeriesId || template.id;

        // Use INSERT OR IGNORE as an extra safety net with the UNIQUE index.
        await executeWithRetry(
          `INSERT OR IGNORE INTO tasks (
            id, title, description, due_at, type, life_category_id, workspace, status,
            tags, source, parentTemplateId, recurringSeriesId, occurrenceDate,
            isRecurringTemplate, isOccurrenceOverride, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          [
            instanceId,
            template.title,
            template.description || null,
            dueAt.toISOString(),
            template.type,
            template.life_category_id || null,
            'life',
            'todo',
            template.tags || null,
            'manual',
            template.id,
            seriesId,
            dateStr,
            ts,
            ts,
          ]
        );
      }
    }
  })()
    .finally(() => {
      ensureRecurringInstancesPromise = null;
    });

  return ensureRecurringInstancesPromise;
}

