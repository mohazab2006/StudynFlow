import { getDatabase, executeWithRetry } from './client';
import type { CourseProfile } from '../lib/types';

function mapRow(row: any): CourseProfile {
  return {
    course_id: row.course_id,
    professor_name: row.professor_name ?? null,
    professor_email: row.professor_email ?? null,
    ta_names_emails: row.ta_names_emails ?? null,
    office_hours: row.office_hours ?? null,
    learning_objectives: row.learning_objectives ?? null,
    textbook_requirements: row.textbook_requirements ?? null,
    technical_requirements: row.technical_requirements ?? null,
    attendance_rules: row.attendance_rules ?? null,
    exam_pass_requirement: row.exam_pass_requirement ?? null,
    submission_policies: row.submission_policies ?? null,
    raw_extract: row.raw_extract ?? null,
    updated_at: row.updated_at,
  };
}

export async function getCourseProfile(courseId: string): Promise<CourseProfile | null> {
  const db = await getDatabase();
  const rows = await db.select<any[]>(
    'SELECT * FROM course_profiles WHERE course_id = ?',
    [courseId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function upsertCourseProfile(input: Partial<CourseProfile> & { course_id: string }): Promise<CourseProfile> {
  const now = new Date().toISOString();
  const db = await getDatabase();
  await executeWithRetry(
    `INSERT INTO course_profiles (
      course_id, professor_name, professor_email, ta_names_emails, office_hours,
      learning_objectives, textbook_requirements, technical_requirements,
      attendance_rules, exam_pass_requirement, submission_policies, raw_extract, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(course_id) DO UPDATE SET
      professor_name = COALESCE(excluded.professor_name, professor_name),
      professor_email = COALESCE(excluded.professor_email, professor_email),
      ta_names_emails = COALESCE(excluded.ta_names_emails, ta_names_emails),
      office_hours = COALESCE(excluded.office_hours, office_hours),
      learning_objectives = COALESCE(excluded.learning_objectives, learning_objectives),
      textbook_requirements = COALESCE(excluded.textbook_requirements, textbook_requirements),
      technical_requirements = COALESCE(excluded.technical_requirements, technical_requirements),
      attendance_rules = COALESCE(excluded.attendance_rules, attendance_rules),
      exam_pass_requirement = COALESCE(excluded.exam_pass_requirement, exam_pass_requirement),
      submission_policies = COALESCE(excluded.submission_policies, submission_policies),
      raw_extract = COALESCE(excluded.raw_extract, raw_extract),
      updated_at = excluded.updated_at`,
    [
      input.course_id,
      input.professor_name ?? null,
      input.professor_email ?? null,
      input.ta_names_emails ?? null,
      input.office_hours ?? null,
      input.learning_objectives ?? null,
      input.textbook_requirements ?? null,
      input.technical_requirements ?? null,
      input.attendance_rules ?? null,
      input.exam_pass_requirement ?? null,
      input.submission_policies ?? null,
      input.raw_extract ?? null,
      now,
    ]
  );
  const saved = await getCourseProfile(input.course_id);
  if (!saved) throw new Error('Failed to save course profile');
  return saved;
}
