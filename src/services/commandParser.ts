/**
 * Deterministic intent parsing for Command Center. No AI; keywords + date parsing only.
 */

export type CommandIntent =
  | { type: 'add_task'; title: string; courseCode?: string; dueAt?: string; isRecurring?: boolean; recurrenceHint?: string; weightPercent?: number; taskType?: string }
  | { type: 'query_focus'; }
  | { type: 'query_needed_final'; courseCode?: string; targetPercent?: number }
  | { type: 'query_drop_lowest'; courseCode: string; confirmRequired: true }
  | { type: 'ambiguous'; message: string }
  | { type: 'unknown'; raw: string };

const ADD_PATTERNS = [
  /^\s*add\s+(.+)/i,
  /^\s*create\s+(.+)/i,
  /^\s*new\s+task\s+(.+)/i,
];

// Reserved for future due-date parsing patterns
const DUE_PATTERNS_RESERVED = [
  /due\s+(?:next\s+)?(?:this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i,
  /due\s+(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)?/i,
  /due\s+(tomorrow|today)\s*(?:at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i,
  /due\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/,
  /(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:on\s+)?(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?/i,
];
void DUE_PATTERNS_RESERVED;

const COURSE_CODE = /(?:in\s+)?([A-Z]{2,4}\d{4})/i;
const RECURRING = /(?:recurring|weekly|daily|every\s+(?:mon|tue|wed|thu|fri|sat|sun))/i;
const WEIGHT_PERCENT = /(?:weight|worth|)\s*(\d+(?:\.\d+)?)\s*%?/i;
const TASK_TYPE_WORDS = ['assignment', 'quiz', 'lab', 'tutorial', 'reading', 'project', 'exam', 'midterm', 'final'];

function parseTime(s: string): string | null {
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = (m[3] || '').toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

function toISODate(dayOffset: number, timeStr?: string | null): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const t = timeStr || '23:59:00';
  return `${y}-${m}-${day}T${t}`;
}

function dayNameToOffset(name: string): number {
  const lower = name.toLowerCase();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = new Date().getDay();
  const target = days.indexOf(lower);
  if (target === -1) return 0;
  let diff = target - today;
  if (diff <= 0) diff += 7;
  return diff;
}

function parseDueFromRemainder(remainder: string): { dueAt?: string; cleanTitle: string } {
  let dueAt: string | undefined;
  let cleanTitle = remainder.trim();

  const tomorrowMatch = remainder.match(/tomorrow\s*(?:at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i);
  if (tomorrowMatch) {
    const timeStr = tomorrowMatch[1] ? parseTime(tomorrowMatch[1]) : null;
    dueAt = toISODate(1, timeStr);
    cleanTitle = remainder.replace(tomorrowMatch[0], '').replace(/\s+/g, ' ').trim();
    return { dueAt, cleanTitle };
  }

  const dayMatch = remainder.match(/(?:due\s+)?(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?(?:\s+(\d{1,2}(?::\d{2})?)\s*(?:am|pm)?)?/i);
  if (dayMatch) {
    const dayName = dayMatch[1];
    const timePart = dayMatch[2] || dayMatch[3];
    const timeStr = timePart ? parseTime(timePart) : null;
    const offset = dayNameToOffset(dayName);
    dueAt = toISODate(offset, timeStr);
    cleanTitle = remainder.replace(dayMatch[0], '').replace(/\s+due\s+.*$/i, '').replace(/\s+/g, ' ').trim();
    return { dueAt, cleanTitle };
  }

  const timeOnly = remainder.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:tomorrow|today)?/i);
  if (timeOnly) {
    const timeStr = parseTime(timeOnly[1]);
    const isTomorrow = /tomorrow/i.test(remainder);
    dueAt = toISODate(isTomorrow ? 1 : 0, timeStr);
    cleanTitle = remainder.replace(timeOnly[0], '').replace(/\s+/g, ' ').trim();
    return { dueAt, cleanTitle };
  }

  const slashDate = remainder.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:at\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/);
  if (slashDate) {
    const [, month, day, year, timePart] = slashDate;
    const y = year ? (year.length === 2 ? 2000 + parseInt(year, 10) : parseInt(year, 10)) : new Date().getFullYear();
    const m = parseInt(month!, 10) - 1;
    const d = parseInt(day!, 10);
    const t = timePart ? parseTime(timePart) : '23:59:00';
    const date = new Date(y, m, d);
    dueAt = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${t || '23:59:00'}`;
    cleanTitle = remainder.replace(slashDate[0], '').replace(/\s+/g, ' ').trim();
    return { dueAt, cleanTitle };
  }

  return { cleanTitle };
}

export function parseCommand(input: string, _pageContext?: { courseCode?: string }): CommandIntent {
  const raw = (input || '').trim();
  if (!raw) return { type: 'unknown', raw: '' };

  const lower = raw.toLowerCase();

  if (/what should i focus|focus today|what do i need to do|what('s| is) (my )?focus/i.test(lower)) {
    return { type: 'query_focus' };
  }

  if (/what do i need (?:on the )?final|needed on final|grade (?:i )?need (?:on )?final|final (?:grade )?needed/i.test(lower)) {
    const courseMatch = raw.match(/([A-Z]{2,4}\d{4})/i);
    const targetMatch = raw.match(/(\d{2,3})\s*%?/);
    return {
      type: 'query_needed_final',
      courseCode: courseMatch ? courseMatch[1].toUpperCase() : _pageContext?.courseCode,
      targetPercent: targetMatch ? parseInt(targetMatch[1], 10) : undefined,
    };
  }

  if (/drop lowest|drop.*quiz|drop.*lab/i.test(lower)) {
    const courseMatch = raw.match(/([A-Z]{2,4}\d{4})/i);
    if (!courseMatch) return { type: 'ambiguous', message: 'Which course? Please include course code (e.g. COMP2401).' };
    return { type: 'query_drop_lowest', courseCode: courseMatch[1].toUpperCase(), confirmRequired: true };
  }

  for (const pat of ADD_PATTERNS) {
    const m = raw.match(pat);
    if (m) {
      const remainder = m[1].trim();
      const courseMatch = remainder.match(COURSE_CODE);
      const courseCode = courseMatch ? courseMatch[1].toUpperCase() : _pageContext?.courseCode;
      const isRecurring = RECURRING.test(remainder);
      const { dueAt, cleanTitle } = parseDueFromRemainder(remainder);
      let title = cleanTitle.replace(COURSE_CODE, '').replace(RECURRING, '').replace(/\s+/g, ' ').trim();
      if (!title) title = remainder.split(/\s+due\s+/i)[0]?.trim() || remainder;

      let weightPercent: number | undefined;
      const weightMatch = remainder.match(WEIGHT_PERCENT);
      if (weightMatch) {
        const v = parseFloat(weightMatch[1]);
        if (Number.isFinite(v) && v > 0 && v <= 100) weightPercent = v;
      }

      let taskType: string | undefined;
      const lower = remainder.toLowerCase();
      for (const word of TASK_TYPE_WORDS) {
        if (new RegExp(`\\b${word}s?\\b`).test(lower)) {
          taskType = word.charAt(0).toUpperCase() + word.slice(1);
          break;
        }
      }

      return {
        type: 'add_task',
        title: title || remainder,
        courseCode,
        dueAt,
        isRecurring: isRecurring || undefined,
        recurrenceHint: isRecurring ? 'Weekly (adjust in Life)' : undefined,
        weightPercent,
        taskType,
      };
    }
  }

  return { type: 'unknown', raw };
}
