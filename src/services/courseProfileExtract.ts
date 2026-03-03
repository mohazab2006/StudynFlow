/**
 * Rule-based extraction of course profile fields from plain text (e.g. from uploaded syllabus).
 * No AI; regex and keyword patterns only.
 */

export interface ExtractedProfile {
  professor_name: string | null;
  professor_email: string | null;
  ta_names_emails: string | null;
  office_hours: string | null;
  learning_objectives: string | null;
  textbook_requirements: string | null;
  technical_requirements: string | null;
  attendance_rules: string | null;
  exam_pass_requirement: string | null;
  submission_policies: string | null;
}

const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PROFESSOR = /(?:instructor|professor|lecturer|teacher)\s*[:\s]*([^\n@]+?)(?:\s+email|\s*@|$)/gi;
const OFFICE_HOURS = /office\s*hours?\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi;
const TEXTBOOK = /(?:textbook|required\s*reading|course\s*materials?)\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi;
const TECH = /(?:software|technical\s*requirements?|tools?|language)\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi;
const ATTENDANCE = /(?:attendance|participation)\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi;
const EXAM_PASS = /(?:exam\s*pass|pass\s*grade|must\s*pass\s*(?:the\s*)?(?:final\s*)?exam)\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi;
const SUBMISSION = /(?:submission|late\s*policy|assignments?)\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi;

function firstMatch(text: string, regex: RegExp): string | null {
  const m = regex.exec(text);
  regex.lastIndex = 0;
  return m ? m[1].trim() : null;
}

function firstMatchAll(text: string, regex: RegExp): string[] {
  const out: string[] = [];
  let m;
  while ((m = regex.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

export function extractProfileFromText(rawText: string): ExtractedProfile {
  const text = rawText.replace(/\r\n/g, '\n');
  const emails = [...text.matchAll(EMAIL)].map((m) => m[0]);
  const profMatch = firstMatch(text, PROFESSOR);
  const profEmail = emails[0] ?? null;
  const officeHours = firstMatch(text, OFFICE_HOURS);
  const textbook = firstMatch(text, TEXTBOOK);
  const tech = firstMatch(text, TECH);
  const attendance = firstMatch(text, ATTENDANCE);
  const examPass = firstMatch(text, EXAM_PASS);
  const submission = firstMatch(text, SUBMISSION);
  const objectives = firstMatch(text, /(?:learning\s*objectives?|course\s*objectives?)\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi);
  const taSection = firstMatch(text, /(?:TA|teaching\s*assistant)s?\s*[:\s]*([^\n]+?)(?=\n\n|\n[A-Z]|$)/gi);

  return {
    professor_name: profMatch || null,
    professor_email: profEmail || null,
    ta_names_emails: taSection || null,
    office_hours: officeHours || null,
    learning_objectives: objectives || null,
    textbook_requirements: textbook || null,
    technical_requirements: tech || null,
    attendance_rules: attendance || null,
    exam_pass_requirement: examPass || null,
    submission_policies: submission || null,
  };
}
