import { format } from 'date-fns';
import type { RecurrenceRule } from './types';

export function formatRecurrenceRule(rule: RecurrenceRule, templateDueAt?: string | null): string {
  const interval = rule.interval > 1 ? `every ${rule.interval} ` : '';

  const formatTimeOfDay = (timeOfDay: string) => {
    const [hh, mm] = timeOfDay.split(':').map((n) => Number(n));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    return format(d, 'h:mm a');
  };

  const timeLabel = (() => {
    if (rule.timeOfDay) {
      const t = formatTimeOfDay(rule.timeOfDay);
      if (t) return t;
    }
    if (templateDueAt) {
      const d = new Date(templateDueAt);
      if (!Number.isNaN(d.getTime())) return format(d, 'h:mm a');
    }
    return null;
  })();

  const timeSuffix = timeLabel ? ` at ${timeLabel}` : '';

  switch (rule.frequency) {
    case 'DAILY':
      return `${interval}Daily${timeSuffix}`;
    case 'WEEKLY':
      if (rule.byWeekday && rule.byWeekday.length > 0) {
        const dayNames: Record<string, string> = {
          MO: 'Mon',
          TU: 'Tue',
          WE: 'Wed',
          TH: 'Thu',
          FR: 'Fri',
          SA: 'Sat',
          SU: 'Sun',
        };
        const days = rule.byWeekday.map((d) => dayNames[d] || d).join(', ');
        return `${interval}Weekly on ${days}${timeSuffix}`;
      }
      return `${interval}Weekly${timeSuffix}`;
    case 'MONTHLY':
      return `${interval}Monthly${timeSuffix}`;
    default:
      return `Recurring${timeSuffix}`;
  }
}
