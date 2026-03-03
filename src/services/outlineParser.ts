/**
 * Deterministic outline/calendar parser (regex + heuristics only, no AI).
 * Detects grading components, weights, quantities, explicit dates.
 * Vague timing and rules like "best 10 of 11" become notes/suggestion_note only.
 */

import type { ParsedOutlineRow } from '../lib/types';
import { generateId } from '../lib/utils';

const COMPONENT_PATTERNS: { regex: RegExp; type: string }[] = [
  { regex: /\b(?:final\s*exam|final\s*assessment)\b/i, type: 'Final' },
  { regex: /\bfinal(s)?\b/i, type: 'Final' },
  { regex: /\bmidterm(s)?\b/i, type: 'Midterm' },
  { regex: /\bexam(s)?\b/i, type: 'Exam' },
  { regex: /\bassignment(s)?\b/i, type: 'Assignment' },
  { regex: /\bquiz(zes)?\b/i, type: 'Quiz' },
  { regex: /\blab(s)?\b/i, type: 'Lab' },
  { regex: /\btutorial(s)?\b/i, type: 'Tutorial' },
  { regex: /\breading(s)?\b/i, type: 'Reading' },
  { regex: /\bproject(s)?\b/i, type: 'Project' },
  { regex: /\bparticipation\b/i, type: 'Other' },
  { regex: /\bhomework\b/i, type: 'Assignment' },
  { regex: /\bessay(s)?\b/i, type: 'Assignment' },
  { regex: /\breport(s)?\b/i, type: 'Assignment' },
];

const WEIGHT_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*%\s*(?:each|per\s*(?:assignment|quiz|lab|item))/gi,
  /each\s*(\d+(?:\.\d+)?)\s*%/gi,
  /(\d+(?:\.\d+)?)\s*%\s*(?:per\s*)?(?:assignment|quiz|lab|item)/gi,
  /(\d+(?:\.\d+)?)\s*%\s*(?:weight|of\s*grade|of\s*final)/gi,
  /(?:weight|worth|value)\s*[:\s]*(\d+(?:\.\d+)?)\s*%/gi,
  /(\d+(?:\.\d+)?)\s*%\s*(?!\s*(?:each|per))/gi,
  /(\d+(?:\.\d+)?)\s*percent/gi,
];

const QUANTITY_PATTERNS = [
  /(\d+)\s*(?:x|×|of)?\s*(assignment|quiz|lab|tutorial|reading|project|exam|midterm|final)s?/gi,
  /(assignment|quiz|lab|tutorial|reading|project|exam|midterm|final)s?\s*[:\s]*(\d+)/gi,
  /(\d+)\s*(assignment|quiz|lab|tutorial|reading|project|exam|midterm|final)s?/gi,
];

const BEST_OF_PATTERN = /best\s*(\d+)\s*of\s*(\d+)/i;
const VAGUE_TIMING = /(?:weekly|TBA|tba|to\s*be\s*announced|see\s*brightspace|see\s*canvas|see\s*LMS|dates?\s*TBD|announced\s*later)/gi;

// Explicit date patterns (ISO, "Jan 15", "January 15, 2025")
const MONTH_DAY = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\.?\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/gi;

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function parseExplicitDate(s: string): string | null {
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m}-${d}T12:00:00.000Z`;
  }
  const monthDay = MONTH_DAY.exec(s);
  if (monthDay) {
    const [, monthStr, day, year] = monthDay;
    const m = MONTH_MAP[monthStr!.toLowerCase().replace(/\./g, '')];
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    const d = parseInt(day!, 10);
    if (m !== undefined && d >= 1 && d <= 31) {
      const date = new Date(y, m, d);
      return date.toISOString();
    }
  }
  return null;
}

function extractWeightsFromText(text: string): number[] {
  const weights: number[] = [];
  for (const pat of WEIGHT_PATTERNS) {
    let m;
    const re = new RegExp(pat.source, pat.flags);
    while ((m = re.exec(text)) !== null) {
      const v = parseFloat(m[1]);
      if (Number.isFinite(v) && v > 0 && v <= 100) weights.push(v);
    }
  }
  return weights;
}

function extractBestOf(text: string): { best: number; of: number } | null {
  const m = text.match(BEST_OF_PATTERN);
  if (!m) return null;
  const best = parseInt(m[1], 10);
  const of = parseInt(m[2], 10);
  if (Number.isFinite(best) && Number.isFinite(of) && best <= of && of > 0) return { best, of };
  return null;
}

const TASK_TYPE_NAMES = [
  'Assignment', 'Quiz', 'Lab', 'Tutorial', 'Reading', 'Project',
  'Exam', 'Midterm', 'Final', 'Other',
] as const;

function inferTypeFromLine(line: string): string {
  const lower = line.toLowerCase();
  for (const { regex, type } of COMPONENT_PATTERNS) {
    if (regex.test(lower)) return type;
  }
  return 'Other';
}

function normalizeType(t: string): string {
  if (TASK_TYPE_NAMES.includes(t as any)) return t;
  const lower = t.toLowerCase();
  const map: Record<string, string> = {
    assignments: 'Assignment', assignment: 'Assignment',
    quizzes: 'Quiz', quiz: 'Quiz',
    labs: 'Lab', lab: 'Lab',
    tutorials: 'Tutorial', tutorial: 'Tutorial',
    readings: 'Reading', reading: 'Reading',
    projects: 'Project', project: 'Project',
    exams: 'Exam', exam: 'Exam',
    midterms: 'Midterm', midterm: 'Midterm',
    finals: 'Final', final: 'Final',
  };
  return map[lower] ?? 'Other';
}

/**
 * Parse raw outline/calendar text into proposed tasks (ParsedOutlineRow).
 * Rule-based only: grading components, weights, quantities, explicit dates.
 * Vague timing and "best N of M" become notes/suggestion_note; no auto-dropping of grades.
 */
export function parseOutlineText(rawText: string): ParsedOutlineRow[] {
  const rows: ParsedOutlineRow[] = [];
  const lines = rawText
    .split(/\n|\r\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const fullText = rawText;
  const bestOf = extractBestOf(fullText);
  const suggestionNote = bestOf ? `Best ${bestOf.best} of ${bestOf.of} (suggestion; all items created)` : '';

  // Find grading/assessment section (optional)
  let gradingStart = -1;
  const sectionMarkers = /(?:evaluation|grading|assessment|grade\s*breakdown|grade\s*distribution|weights?|marking)/i;
  for (let i = 0; i < lines.length; i++) {
    if (sectionMarkers.test(lines[i])) {
      gradingStart = i;
      break;
    }
  }
  const relevantLines = gradingStart >= 0 ? lines.slice(gradingStart) : lines;

  // Collect weight mentions in context
  const weightsInOrder: number[] = [];
  for (const line of relevantLines) {
    const w = extractWeightsFromText(line);
    weightsInOrder.push(...w);
  }

  // Quantity + type pairs: e.g. "10 Assignments 10% each"
  const seenTitles = new Set<string>();
  for (const line of relevantLines) {
    const quantityTypeMatches: { qty: number; type: string }[] = [];

    for (const pat of QUANTITY_PATTERNS) {
      const re = new RegExp(pat.source, pat.flags);
      let m;
      while ((m = re.exec(line)) !== null) {
        const g1 = (m[1] || '').trim();
        const g2 = (m[2] || '').trim();
        const isFirstNumeric = /^\d+$/.test(g1);
        const qty = isFirstNumeric ? parseInt(g1, 10) : parseInt(g2, 10);
        const typeStr = isFirstNumeric ? g2 : g1;
        if (!Number.isFinite(qty) || qty < 1 || !typeStr) continue;
        const inferred = typeStr in MONTH_MAP ? inferTypeFromLine(line) : inferTypeFromLine(typeStr || line);
        const mapped = normalizeType(inferred);
        quantityTypeMatches.push({ qty, type: mapped });
      }
    }

    const weightsHere = extractWeightsFromText(line);
    const weightEach = weightsHere.length > 0 ? weightsHere[0] : null;
    const weightTotal = weightsHere.length > 1 ? weightsHere[weightsHere.length - 1] : weightEach;

    if (quantityTypeMatches.length > 0) {
      for (const { qty, type } of quantityTypeMatches) {
        const perWeight = weightEach ?? (weightTotal != null && weightTotal > 0 ? weightTotal / qty : null);
        for (let i = 0; i < qty; i++) {
          const title = qty > 1 ? `${type} ${i + 1}` : type;
          const key = `${title}-${perWeight ?? ''}`;
          if (seenTitles.has(key)) continue;
          seenTitles.add(key);
          const dueAt = parseExplicitDate(line) ?? null;
          const vagueMatch = line.match(VAGUE_TIMING);
          const notes = vagueMatch ? vagueMatch.join('; ') : '';
          rows.push({
            id: generateId(),
            title,
            type,
            weight_percent: perWeight,
            due_at: dueAt,
            notes,
            suggestion_note: suggestionNote,
            include: true,
          });
        }
      }
      continue;
    }

    // Single-item lines: e.g. "Midterm 25%"
    const singleType = inferTypeFromLine(line);
    if (singleType !== 'Other' || /\d+\s*%/.test(line)) {
      const weights = extractWeightsFromText(line);
      const weight = weights[0] ?? null;
      const dueAt = parseExplicitDate(line) ?? null;
      const vagueMatch = line.match(VAGUE_TIMING);
      const notes = vagueMatch ? vagueMatch.join('; ') : '';
      const title = line.slice(0, 120).trim() || singleType;
      const key = `single-${title}-${weight ?? ''}`;
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        const mapped = normalizeType(singleType);
        rows.push({
          id: generateId(),
          title: title.length > 80 ? title.slice(0, 80) + '…' : title,
          type: mapped,
          weight_percent: weight,
          due_at: dueAt,
          notes,
          suggestion_note: suggestionNote,
          include: true,
        });
      }
    }
  }

  // If we found no structured rows, try to extract from full text as fallback
  if (rows.length === 0) {
    const weights = extractWeightsFromText(fullText);
    const typesFound = new Set<string>();
    for (const { regex, type } of COMPONENT_PATTERNS) {
      if (regex.test(fullText)) typesFound.add(type);
    }
    if (typesFound.size > 0 || weights.length > 0) {
      const defaultWeight = weights.length > 0 ? weights[0] : null;
      for (const type of typesFound) {
        rows.push({
          id: generateId(),
          title: type,
          type,
          weight_percent: defaultWeight,
          due_at: null,
          notes: '',
          suggestion_note: suggestionNote,
          include: true,
        });
      }
    }
  }

  return rows;
}
