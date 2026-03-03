/**
 * AI service: OpenAI-compatible chat and structured parsing for quick add & outline extraction.
 */

import { getAISettings } from './aiSettings';
import { generateId } from '../lib/utils';
import type { ParsedOutlineRow } from '../lib/types';

const TASK_TYPES = [
  'Assignment', 'Quiz', 'Lab', 'Tutorial', 'Reading', 'Project',
  'Exam', 'Midterm', 'Final', 'Other',
] as const;

export interface ParsedQuickAddTask {
  title: string;
  courseCode?: string;
  type?: string;
  weightPercent?: number;
  dueAt?: string;
}

export interface ParseQuickAddResult {
  tasks: ParsedQuickAddTask[];
  rawResponse?: string;
}

/** Call OpenAI-compatible chat API. */
export async function callChat(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const settings = getAISettings();
  if (!settings.apiKey?.trim()) {
    throw new Error('AI API key not set. Set VITE_OPENAI_API_KEY when building the app.');
  }
  const baseUrl = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      messages,
      max_tokens: 2048,
      temperature: 0.2,
    }),
    signal: options?.signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI request failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (content == null) throw new Error('Invalid AI response');
  return String(content).trim();
}

/** Parse natural-language quick add into one or more structured tasks. */
export async function parseQuickAdd(
  userInput: string,
  context: { courseCodes: string[] },
  options?: { signal?: AbortSignal }
): Promise<ParseQuickAddResult> {
  const systemPrompt = `You are a task parser for a student todo app. The user will type a single line like:
- "add comp2401 assignment weight 8%"
- "Add quizzes 1-10 each weight 5% in comp2404"
- "COMP2406 lab 3 due next Friday 10%"

Reply with ONLY a JSON object (no markdown, no code fence) in this exact shape:
{ "tasks": [ { "title": "string", "courseCode": "optional UPPERCASE e.g. COMP2401", "type": "Assignment|Quiz|Lab|Tutorial|Reading|Project|Exam|Midterm|Final|Other", "weightPercent": number or null, "dueAt": "ISO datetime or null" } ] }

Rules:
- One task per item. For "quizzes 1-10" output 10 tasks with titles "Quiz 1", "Quiz 2", ... and same weight/course.
- courseCode: extract if mentioned (e.g. COMP2401, comp2404). Use UPPERCASE.
- type: must be one of: Assignment, Quiz, Lab, Tutorial, Reading, Project, Exam, Midterm, Final, Other.
- weightPercent: number 0-100 or null.
- dueAt: ISO 8601 datetime string if a due date/time is mentioned, else null.
- If the input is just a plain task title with no course/weight, return one task with only title set.
- If you cannot parse, return { "tasks": [ { "title": "<exact user input>" } ] }.`;

  const userPrompt = `User input: "${userInput}"
Known course codes (for reference): ${context.courseCodes.join(', ') || 'none'}

Reply with JSON only.`;

  const raw = await callChat(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options
  );
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(jsonStr) as { tasks?: ParsedQuickAddTask[] };
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [{ title: userInput }];
    return {
      tasks: tasks.map((t) => ({
        title: String(t?.title ?? userInput).trim() || userInput,
        courseCode: t?.courseCode ? String(t.courseCode).toUpperCase() : undefined,
        type: t?.type && TASK_TYPES.includes(t.type as any) ? t.type : undefined,
        weightPercent: typeof t?.weightPercent === 'number' ? t.weightPercent : undefined,
        dueAt: t?.dueAt ? String(t.dueAt) : undefined,
      })),
      rawResponse: raw,
    };
  } catch {
    return { tasks: [{ title: userInput }], rawResponse: raw };
  }
}

/** Extract tasks from outline/syllabus text using AI. Returns ParsedOutlineRow-like list. */
export async function extractTasksFromOutline(
  text: string,
  options?: { signal?: AbortSignal }
): Promise<ParsedOutlineRow[]> {
  const systemPrompt = `You are a syllabus parser. Given course outline or syllabus text, extract every graded component: assignments, quizzes, labs, exams, midterms, finals, projects, readings, tutorials.
Reply with ONLY a JSON array (no markdown, no code fence). Each item:
{ "title": "string", "type": "Assignment|Quiz|Lab|Tutorial|Reading|Project|Exam|Midterm|Final|Other", "weight_percent": number or null, "due_at": "ISO datetime or null", "notes": "optional string" }

Rules:
- One object per graded item. For "10 quizzes 5% each" output 10 items with titles "Quiz 1", "Quiz 2", ... and weight_percent 5.
- type must be one of: Assignment, Quiz, Lab, Tutorial, Reading, Project, Exam, Midterm, Final, Other.
- weight_percent: number 0-100 if mentioned, else null.
- due_at: ISO string if date is given, else null.
- notes: vague info like "TBA", "see Brightspace", "best 10 of 11".`;

  const userPrompt = `Extract all graded components from this text:\n\n${text.slice(0, 12000)}`;

  const raw = await callChat(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options
  );
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 200).map((item: any) => ({
      id: generateId(),
      title: String(item?.title ?? 'Task').slice(0, 200),
      type: item?.type && TASK_TYPES.includes(item.type) ? item.type : 'Other',
      weight_percent: typeof item?.weight_percent === 'number' ? item.weight_percent : null,
      due_at: item?.due_at ? String(item.due_at) : null,
      notes: String(item?.notes ?? ''),
      suggestion_note: '',
      include: true,
    }));
  } catch {
    return [];
  }
}

export interface SuggestEffortResult {
  effortMinutes: number;
  difficultyLabel?: string;
}

/** Suggest effort (minutes) and optional difficulty for a task based on title and type. */
export async function suggestTaskEffort(
  taskTitle: string,
  taskType?: string,
  options?: { signal?: AbortSignal }
): Promise<SuggestEffortResult> {
  const systemPrompt = `You are a study-time estimator. Given a task title and type (e.g. Assignment, Quiz, Final), suggest how many minutes it typically takes to complete.
Reply with ONLY a JSON object: { "effortMinutes": number, "difficultyLabel": "easy" | "medium" | "hard" }

Rules:
- effortMinutes: 15 to 480 (1–8 hours). Be realistic for undergrad work.
- difficultyLabel: optional. Use for clarity.
- Short quizzes: 15–45 min. Assignments: 60–180. Labs: 60–120. Exams/Final prep: 120–480.`;

  const userPrompt = `Task: "${taskTitle}"${taskType ? ` (${taskType})` : ''}\n\nReply with JSON only.`;

  const raw = await callChat(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    options
  );
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(jsonStr) as { effortMinutes?: number; difficultyLabel?: string };
    const effort = typeof parsed?.effortMinutes === 'number'
      ? Math.max(15, Math.min(480, Math.round(parsed.effortMinutes)))
      : 60;
    return {
      effortMinutes: effort,
      difficultyLabel: parsed?.difficultyLabel ?? undefined,
    };
  } catch {
    return { effortMinutes: 60 };
  }
}
