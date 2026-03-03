import { useMemo, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTasks } from '../hooks/useTasks';
import { useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse } from '../hooks/useCourses';
import { courseSchema } from '../lib/validation';
import SchoolTaskModal from '../components/tasks/SchoolTaskModal';
import ColorPicker from '../components/ui/ColorPicker';
import SchoolTasksTable from '../components/school/SchoolTasksTable';
import type { CreateCourseInput, Course, TaskWithCourse } from '../lib/types';
import TaskTypesModal from '../components/school/TaskTypesModal';
import { useCourseAssets, useDeleteCourseAsset } from '../hooks/useCourseAssets';
import CourseAssetsPanel from '../components/copilot/CourseAssetsPanel';
import StudyPlanSection from '../components/copilot/StudyPlanSection';
import AvailabilityBlocksSection from '../components/copilot/AvailabilityBlocksSection';
import { AssetType } from '../lib/types';
import {
  buildGradeWarnings,
  computeCurrentSoFar,
  computeNeededFinal,
  computeProjectedOverall,
  computeWeightStats,
  simulateOverallIfFinal,
  getGradeRisks,
} from '../services/gradeMath';
import { useUpsertTaskGrade } from '../hooks/useGrades';
import { useCourseRules, useUpdateCourseRule, useCreateCourseRule } from '../hooks/useCourseRules';
import { getExcludedTaskIdsByRules, getExclusionReason } from '../services/courseRules';
import { useCourseProfile, useUpsertCourseProfile } from '../hooks/useCourseProfile';
import { extractProfileFromText } from '../services/courseProfileExtract';

export default function SchoolPage() {
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'unchecked' | 'checked' | 'all'>('unchecked');
  const [isTypesOpen, setIsTypesOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>(''); // empty = all types
  const [gradeFilter, setGradeFilter] = useState<
    'all' | 'graded' | 'ungraded' | 'missingGrade' | 'missingWeight' | 'excluded'
  >('all');
  const [minWeightFilter, setMinWeightFilter] = useState<string>(''); // % (optional)
  const [gradebookSort, setGradebookSort] = useState<'due' | 'weight' | 'type'>('due');
  const [whatIfFinalPercent, setWhatIfFinalPercent] = useState<string>('');
  
  const { data: allTasks = [], isLoading: tasksLoading } = useTasks({
    // IMPORTANT: completion status must never affect grade calculations.
    // Always fetch all school tasks; filter status client-side for display only.
    includeCompleted: true,
    workspace: 'school',
    ...(typeFilter ? { types: [typeFilter] } : {}),
  });
  const { data: courses = [], isLoading: coursesLoading } = useCourses();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const upsertGrade = useUpsertTaskGrade();
  const { data: courseAssets = [] } = useCourseAssets(selectedCourseId);
  const { data: unassignedAssets = [] } = useCourseAssets(null);
  const deleteCourseAsset = useDeleteCourseAsset();
  const { data: courseRules = [] } = useCourseRules(selectedCourseId);
  const updateCourseRule = useUpdateCourseRule(selectedCourseId);
  const createCourseRule = useCreateCourseRule(selectedCourseId);
  const { data: courseProfile } = useCourseProfile(selectedCourseId);
  const upsertCourseProfile = useUpsertCourseProfile(selectedCourseId);
  const [profilePaste, setProfilePaste] = useState('');
  const [lectureViewAssetId, setLectureViewAssetId] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<CreateCourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: { code: '', name: '', term: '', target_grade_default: 90, color: '#6B7280' },
  });
  
  const selectedColor = watch('color');

  useEffect(() => {
    if (selectedCourseId && !courses.some((c) => c.id === selectedCourseId)) {
      setSelectedCourseId(null);
    }
  }, [courses, selectedCourseId]);

  useEffect(() => {
    if (editingCourse) {
      reset({
        code: editingCourse.code,
        name: editingCourse.name,
        term: editingCourse.term,
        target_grade_default: editingCourse.target_grade_default,
        color: editingCourse.color || '#6B7280',
      });
    }
  }, [editingCourse, reset]);

  const onSubmitCourse = async (data: CreateCourseInput) => {
    try {
      if (editingCourse) {
        await updateCourse.mutateAsync({ id: editingCourse.id, ...data });
        setEditingCourse(null);
      } else {
        await createCourse.mutateAsync(data);
      }
      reset();
      setIsCreatingCourse(false);
    } catch (error) {
      console.error('Failed to save course:', error);
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!confirm('Delete this course?')) return;
    try {
      await deleteCourse.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete course:', error);
    }
  };

  const selectedCourse = selectedCourseId ? courses.find((c) => c.id === selectedCourseId) ?? null : null;

  const baseSchoolTasks = useMemo(() => {
    const scoped = selectedCourseId ? allTasks.filter((t) => t.course_id === selectedCourseId) : allTasks;

    const minW = minWeightFilter.trim() ? Number(minWeightFilter) : null;
    const filteredByGrade = scoped.filter((t) => {
      const counts = t.grade?.counts ?? true;
      const isGraded = t.grade?.is_graded ?? false;
      const w = t.grade?.weight_percent ?? null;
      const g = t.grade?.grade_percent ?? null;

      if (gradeFilter === 'excluded') return counts === false;
      if (gradeFilter === 'graded') return counts === true && isGraded === true;
      if (gradeFilter === 'ungraded') return counts === true && isGraded === false;
      if (gradeFilter === 'missingGrade') return counts === true && isGraded === true && (g === null || g === undefined);
      if (gradeFilter === 'missingWeight') return counts === true && (!w || Number(w) <= 0);

      return true;
    });

    if (minW !== null && Number.isFinite(minW)) {
      return filteredByGrade.filter((t) => {
        const w = t.grade?.weight_percent ?? null;
        return w !== null && Number(w) >= minW;
      });
    }
    return filteredByGrade;
  }, [allTasks, selectedCourseId, gradeFilter, minWeightFilter]);

  const schoolTasks = useMemo(() => {
    if (statusFilter === 'all') return baseSchoolTasks;
    if (statusFilter === 'checked') return baseSchoolTasks.filter((t) => t.status === 'done');
    return baseSchoolTasks.filter((t) => t.status !== 'done');
  }, [baseSchoolTasks, statusFilter]);

  const courseTasksAll: TaskWithCourse[] = useMemo(() => {
    if (!selectedCourseId) return [];
    return allTasks.filter((t) => t.course_id === selectedCourseId);
  }, [allTasks, selectedCourseId]);

  const finalTask = useMemo(() => {
    if (!selectedCourseId) return null;
    const finals = courseTasksAll
      .filter((t) => (t.type || '').toLowerCase() === 'final')
      .sort((a, b) => {
        const ad = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
        return ad - bd;
      });
    return finals[0] ?? null;
  }, [courseTasksAll, selectedCourseId]);

  const excludedByRules = useMemo(
    () => (selectedCourseId && courseRules.length > 0 ? getExcludedTaskIdsByRules(courseTasksAll, courseRules) : new Set<string>()),
    [courseTasksAll, courseRules, selectedCourseId]
  );
  const gradeMathOptions = useMemo(
    () => (excludedByRules.size > 0 ? { excludedTaskIds: excludedByRules } : undefined),
    [excludedByRules]
  );

  const gradeStats = useMemo(
    () => (selectedCourseId ? computeWeightStats(courseTasksAll, gradeMathOptions) : null),
    [courseTasksAll, selectedCourseId, gradeMathOptions]
  );
  const currentSoFar = useMemo(
    () => (selectedCourseId ? computeCurrentSoFar(courseTasksAll, gradeMathOptions) : null),
    [courseTasksAll, selectedCourseId, gradeMathOptions]
  );
  const projectedOverall = useMemo(
    () => (selectedCourseId ? computeProjectedOverall(courseTasksAll, gradeMathOptions) : 0),
    [courseTasksAll, selectedCourseId, gradeMathOptions]
  );

  const neededOnFinal = useMemo(() => {
    if (!selectedCourseId || !selectedCourse || !finalTask) return null;
    const wFinal = finalTask.grade?.weight_percent ?? null;
    if (wFinal === null || Number(wFinal) <= 0) return null;
    const nonFinal = courseTasksAll.filter((t) => t.id !== finalTask.id);
    const known = computeProjectedOverall(nonFinal, gradeMathOptions);
    return computeNeededFinal({
      target: selectedCourse.target_grade_default ?? 90,
      knownContribution: known,
      finalWeightPercent: Number(wFinal),
    });
  }, [selectedCourseId, selectedCourse, finalTask, courseTasksAll, gradeMathOptions]);

  const warnings = useMemo(() => {
    if (!selectedCourseId) return [];
    const baseWarnings = buildGradeWarnings({
      tasks: courseTasksAll,
      finalTask,
      excludedTaskIds: excludedByRules.size > 0 ? excludedByRules : undefined,
    });
    // Add warning if any items are excluded
    const excludedCount = courseTasksAll.filter((t) => (t.grade?.counts ?? true) === false).length;
    if (excludedCount > 0) {
      baseWarnings.push({
        kind: 'total_weight_over_100' as any, // reuse type for simplicity
        message: `${excludedCount} item${excludedCount > 1 ? 's are' : ' is'} excluded from grading.`,
        totalWeight: excludedCount,
      });
    }
    return baseWarnings;
  }, [courseTasksAll, finalTask, selectedCourseId]);

  const gradeRisks = useMemo(
    () => (selectedCourseId ? getGradeRisks(courseTasksAll, finalTask, gradeMathOptions) : []),
    [courseTasksAll, finalTask, gradeMathOptions, selectedCourseId]
  );

  const gradebookTasks = useMemo(() => {
    if (!selectedCourseId) return [];
    // Show everything for the course; filtering is controlled by gradeFilter/minWeightFilter above.
    const minW = minWeightFilter.trim() ? Number(minWeightFilter) : null;
    const filtered = courseTasksAll.filter((t) => {
      const counts = t.grade?.counts ?? true;
      const isGraded = t.grade?.is_graded ?? false;
      const w = t.grade?.weight_percent ?? null;
      const g = t.grade?.grade_percent ?? null;

      if (gradeFilter === 'excluded') return counts === false;
      if (gradeFilter === 'graded') return counts === true && isGraded === true;
      if (gradeFilter === 'ungraded') return counts === true && isGraded === false;
      if (gradeFilter === 'missingGrade') return counts === true && isGraded === true && (g === null || g === undefined);
      if (gradeFilter === 'missingWeight') return counts === true && (!w || Number(w) <= 0);
      return true;
    });

    const filtered2 =
      minW !== null && Number.isFinite(minW)
        ? filtered.filter((t) => {
            const w = t.grade?.weight_percent ?? null;
            return w !== null && Number(w) >= minW;
          })
        : filtered;

    const byDue = (a: TaskWithCourse, b: TaskWithCourse) => {
      const ad = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.title.localeCompare(b.title);
    };
    const byWeight = (a: TaskWithCourse, b: TaskWithCourse) => {
      const aw = Number(a.grade?.weight_percent ?? -1);
      const bw = Number(b.grade?.weight_percent ?? -1);
      if (aw !== bw) return bw - aw;
      return byDue(a, b);
    };
    const byType = (a: TaskWithCourse, b: TaskWithCourse) => {
      const at = String(a.type ?? '');
      const bt = String(b.type ?? '');
      const cmp = at.localeCompare(bt);
      if (cmp !== 0) return cmp;
      return byDue(a, b);
    };

    const sorted = [...filtered2].sort(
      gradebookSort === 'weight' ? byWeight : gradebookSort === 'type' ? byType : byDue
    );
    return sorted;
  }, [courseTasksAll, gradeFilter, gradebookSort, minWeightFilter, selectedCourseId]);

  const isLoading = tasksLoading || coursesLoading;
  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold">School</h1>
      </div>

      {/* Courses Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Courses</h2>
          <button
            onClick={() => setIsCreatingCourse(true)}
            className="px-3 py-1.5 text-sm bg-muted hover:bg-accent rounded-md"
          >
            + New Course
          </button>
        </div>

        {courses.length === 0 ? (
          <div className="text-muted-foreground text-sm">No courses yet. Create one to get started!</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {courses.map((course) => (
              <div
                key={course.id}
                onClick={() => setSelectedCourseId(selectedCourseId === course.id ? null : course.id)}
                className={`p-5 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedCourseId === course.id
                    ? 'bg-muted'
                    : 'hover:bg-muted'
                }`}
                style={{ 
                  borderColor: course.color || '#6B7280',
                  backgroundColor: selectedCourseId === course.id 
                    ? `${course.color}15` 
                    : 'transparent'
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{course.code}</h3>
                    <p className="text-sm text-muted-foreground">{course.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{course.term}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCourse(course);
                        setIsCreatingCourse(false);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Edit course"
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCourse(course.id);
                      }}
                      className="text-muted-foreground hover:text-red-500"
                      title="Delete course"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(isCreatingCourse || editingCourse) && (
          <div className="mt-4 p-4 bg-muted rounded-lg border border-border">
            <h3 className="font-semibold mb-3">{editingCourse ? 'Edit Course' : 'New Course'}</h3>
            <form onSubmit={handleSubmit(onSubmitCourse)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    {...register('code')}
                    placeholder="Course Code (e.g., COMP2401)"
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
                  />
                  {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code.message}</p>}
                </div>
                <div>
                  <input
                    {...register('term')}
                    placeholder="Term (e.g., Winter 2026)"
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
                  />
                  {errors.term && <p className="text-xs text-red-500 mt-1">{errors.term.message}</p>}
                </div>
              </div>
              <input
                {...register('name')}
                placeholder="Course Name"
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Target Grade (%)</label>
                  <input
                    {...register('target_grade_default', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="90"
                    className="w-full px-3 py-2 bg-background border border-border rounded text-sm"
                  />
                  {errors.target_grade_default && (
                    <p className="text-xs text-red-500 mt-1">{errors.target_grade_default.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Color</label>
                  <ColorPicker 
                    value={selectedColor || '#6B7280'} 
                    onChange={(color) => setValue('color', color)} 
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCourse(false);
                    setEditingCourse(null);
                    reset();
                  }}
                  className="px-3 py-1.5 text-sm bg-secondary rounded"
                >
                  Cancel
                </button>
                <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">
                  {editingCourse ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Course Grade Dashboard */}
      {selectedCourse ? (
        <div className="mb-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">Course dashboard</div>
              <div className="text-2xl font-semibold">{selectedCourse.code}</div>
              <div className="text-sm text-muted-foreground">{selectedCourse.name}</div>
            </div>
            <div className="text-sm text-muted-foreground">
              Target: <span className="font-medium text-foreground">{selectedCourse.target_grade_default ?? 90}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-muted/20 p-5">
              <div className="text-sm text-muted-foreground mb-2">Current (so far)</div>
              <div className="text-3xl font-semibold tabular-nums">
                {currentSoFar === null ? 'N/A' : `${currentSoFar.toFixed(1)}%`}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-5">
              <div className="text-sm text-muted-foreground mb-2">Projected overall</div>
              <div className="text-3xl font-semibold tabular-nums">{projectedOverall.toFixed(1)}%</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-5">
              <div className="text-sm text-muted-foreground mb-2">Completed weight</div>
              <div className="text-3xl font-semibold tabular-nums">
                {gradeStats ? `${gradeStats.completedWeight.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-5">
              <div className="text-sm text-muted-foreground mb-2">Needed on final</div>
              <div className="text-3xl font-semibold tabular-nums">
                {!finalTask
                  ? 'N/A'
                  : (finalTask.grade?.is_graded ?? false)
                    ? 'Final graded'
                    : neededOnFinal === null
                      ? 'Missing'
                      : neededOnFinal <= 0
                        ? '0.0%'
                        : `${neededOnFinal.toFixed(1)}%`}
              </div>
              {finalTask ? (
                <div className="text-sm text-muted-foreground mt-2">
                  Final weight: {finalTask.grade?.weight_percent ?? '—'}%
                </div>
              ) : null}
            </div>
          </div>

          {/* What-if & Risk */}
          {selectedCourse && finalTask && (
            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-sm font-semibold mb-2">Strategy (hypothetical)</div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs text-muted-foreground">If I get</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={whatIfFinalPercent}
                  onChange={(e) => setWhatIfFinalPercent(e.target.value)}
                  placeholder="75"
                  className="w-14 px-2 py-1 text-sm border border-border rounded bg-background"
                />
                <span className="text-xs text-muted-foreground">% on the final → overall</span>
                {whatIfFinalPercent.trim() !== '' && (() => {
                  const val = parseFloat(whatIfFinalPercent);
                  const sim = Number.isFinite(val)
                    ? simulateOverallIfFinal(courseTasksAll, finalTask, val, gradeMathOptions)
                    : null;
                  return sim !== null ? (
                    <span className="text-sm font-medium tabular-nums">{sim.toFixed(1)}%</span>
                  ) : null;
                })()}
              </div>
              {gradeRisks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Risks</div>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {gradeRisks.map((r, i) => (
                      <li key={i}>• {r.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Course outline (prof, TAs, requirements – from Import Outline or paste) */}
          <div className="mt-3 rounded-lg border border-border bg-muted/20 p-4">
            <div className="text-sm font-semibold mb-2">Course outline</div>
            {courseProfile && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
                {courseProfile.professor_name && (
                  <div><span className="text-muted-foreground">Professor:</span> {courseProfile.professor_name}</div>
                )}
                {courseProfile.professor_email && (
                  <div><span className="text-muted-foreground">Email:</span> <a href={`mailto:${courseProfile.professor_email}`} className="text-primary underline">{courseProfile.professor_email}</a></div>
                )}
                {courseProfile.ta_names_emails && (
                  <div className="md:col-span-2"><span className="text-muted-foreground">TAs:</span> {courseProfile.ta_names_emails}</div>
                )}
                {courseProfile.office_hours && (
                  <div><span className="text-muted-foreground">Office hours:</span> {courseProfile.office_hours}</div>
                )}
                {courseProfile.textbook_requirements && (
                  <div className="md:col-span-2"><span className="text-muted-foreground">Textbook / materials:</span> {courseProfile.textbook_requirements}</div>
                )}
                {courseProfile.technical_requirements && (
                  <div className="md:col-span-2"><span className="text-muted-foreground">Technical:</span> {courseProfile.technical_requirements}</div>
                )}
                {courseProfile.attendance_rules && (
                  <div className="md:col-span-2"><span className="text-muted-foreground">Attendance:</span> {courseProfile.attendance_rules}</div>
                )}
                {courseProfile.submission_policies && (
                  <div className="md:col-span-2"><span className="text-muted-foreground">Submission / late policy:</span> {courseProfile.submission_policies}</div>
                )}
                {courseProfile.exam_pass_requirement && (
                  <div><span className="text-muted-foreground">Exam pass:</span> {courseProfile.exam_pass_requirement}</div>
                )}
                {courseProfile.learning_objectives && (
                  <div className="md:col-span-2"><span className="text-muted-foreground">Learning objectives:</span> {courseProfile.learning_objectives}</div>
                )}
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Extract outline from pasted syllabus (prof, TAs, policies)</summary>
              <textarea
                value={profilePaste}
                onChange={(e) => setProfilePaste(e.target.value)}
                placeholder="Paste syllabus or outline text..."
                className="mt-2 w-full h-24 px-2 py-1 border border-border rounded bg-background text-sm resize-y"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!selectedCourseId || !profilePaste.trim()) return;
                  const extracted = extractProfileFromText(profilePaste);
                  await upsertCourseProfile.mutateAsync({ course_id: selectedCourseId, ...extracted });
                  setProfilePaste('');
                }}
                disabled={!selectedCourseId || !profilePaste.trim()}
                className="mt-2 px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50"
              >
                Extract & save
              </button>
            </details>
          </div>

          {warnings.length > 0 ? (
            <div className="mt-3 rounded-lg border border-border bg-muted p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <span>⚠</span>
                <span>Warnings</span>
              </div>
              <div className="space-y-2">
                {warnings.slice(0, 6).map((w, idx) => (
                  <div key={idx} className="text-sm text-muted-foreground">
                    • {w.message}
                  </div>
                ))}
                {warnings.length > 6 ? (
                  <div className="text-xs text-muted-foreground">+ {warnings.length - 6} more…</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Course rules (drop lowest, etc.) */}
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-sm font-semibold mb-2">Course rules</div>
            <p className="text-xs text-muted-foreground mb-3">
              When enabled, rules apply during grade calculation. Excluded tasks are not deleted; manual &quot;Include&quot; still overrides.
            </p>
            {courseRules.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No rules. Add one (e.g. Drop lowest 1 of 5 quizzes) to apply during grading.
              </div>
            ) : (
              <ul className="space-y-2">
                {courseRules.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={() => updateCourseRule.mutate({ id: r.id, patch: { enabled: !r.enabled } })}
                      className="rounded border-border"
                    />
                    <span>
                      {r.type === 'DROP_LOWEST' ? `Drop lowest: best ${r.keep} of ${r.total} ${r.target}s` : r.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <select
                id="rule-type"
                className="px-2 py-1 text-sm border border-border rounded bg-background"
                defaultValue="Quiz"
              >
                {['Quiz', 'Lab', 'Assignment', 'Tutorial', 'Reading', 'Exam', 'Midterm'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <label htmlFor="rule-keep" className="sr-only">Keep</label>
              <input
                id="rule-keep"
                type="number"
                min={1}
                placeholder="Keep"
                className="w-14 px-2 py-1 text-sm border border-border rounded bg-background"
              />
              <span className="text-sm self-center">of</span>
              <label htmlFor="rule-total" className="sr-only">Total</label>
              <input
                id="rule-total"
                type="number"
                min={1}
                placeholder="Total"
                className="w-14 px-2 py-1 text-sm border border-border rounded bg-background"
              />
              <button
                type="button"
                onClick={() => {
                  const typeEl = document.getElementById('rule-type') as HTMLSelectElement;
                  const keepEl = document.getElementById('rule-keep') as HTMLInputElement;
                  const totalEl = document.getElementById('rule-total') as HTMLInputElement;
                  const keep = parseInt(keepEl?.value || '1', 10);
                  const total = parseInt(totalEl?.value || '1', 10);
                  if (typeEl && Number.isFinite(keep) && Number.isFinite(total) && keep <= total && selectedCourseId) {
                    createCourseRule.mutate({ type: 'DROP_LOWEST', target: typeEl.value, keep, total });
                    if (keepEl) keepEl.value = '';
                    if (totalEl) totalEl.value = '';
                  }
                }}
                className="px-2 py-1 text-sm border border-border rounded hover:bg-muted"
              >
                Add rule
              </button>
            </div>
          </div>

          {/* Gradebook */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Gradebook</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">Sort</div>
                <select
                  value={gradebookSort}
                  onChange={(e) => setGradebookSort(e.target.value as any)}
                  className="px-2 py-1 text-xs rounded-md border border-border bg-muted/40"
                  title="Sort gradebook"
                >
                  <option value="due">Due date</option>
                  <option value="weight">Weight</option>
                  <option value="type">Type</option>
                </select>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1.4fr_120px_160px_110px_110px_130px_170px_80px] bg-muted text-xs font-medium text-muted-foreground">
                {['Task', 'Type', 'Due', 'Weight', 'Grade', 'Contribution', 'Flags', 'Include'].map((c) => (
                  <div key={c} className="px-3 py-2 border-r border-border last:border-r-0">
                    {c}
                  </div>
                ))}
              </div>

              <div className="divide-y divide-border">
                {gradebookTasks.map((t) => {
                  const counts = t.grade?.counts ?? true;
                  const isGraded = t.grade?.is_graded ?? false;
                  const w = t.grade?.weight_percent ?? null;
                  const g = t.grade?.grade_percent ?? null;
                  const excludedByRule = excludedByRules.has(t.id);
                  const exclusionReason = excludedByRule ? getExclusionReason(t.id, courseTasksAll, courseRules) : null;
                  const contribution =
                    !excludedByRule &&
                    counts &&
                    isGraded &&
                    w !== null &&
                    Number(w) > 0 &&
                    g !== null &&
                    g !== undefined
                      ? (Number(g) * Number(w)) / 100
                      : null;

                  const handleToggleCounts = async () => {
                    if (!t.grade) {
                      // If no grade record exists, create one with counts=false
                      await upsertGrade.mutateAsync({
                        task_id: t.id,
                        weight_percent: null,
                        grade_percent: null,
                        is_graded: false,
                        counts: !counts,
                      });
                    } else {
                      // Update existing grade record
                      await upsertGrade.mutateAsync({
                        task_id: t.id,
                        weight_percent: w !== null && w !== undefined ? Number(w) : null,
                        grade_percent: g !== null && g !== undefined ? Number(g) : null,
                        is_graded: isGraded,
                        counts: !counts,
                      });
                    }
                  };

                  return (
                    <div
                      key={t.id}
                      className={`grid grid-cols-[1.4fr_120px_160px_110px_110px_130px_170px_80px] text-sm ${
                        counts && !excludedByRule ? 'hover:bg-muted/60' : 'bg-muted/10'
                      }`}
                      title={exclusionReason ?? (!counts ? 'Excluded from grading' : undefined)}
                    >
                      <div className="px-3 py-2 border-r border-border min-w-0">
                        <div className="truncate" title={t.title}>{t.title}</div>
                        {exclusionReason ? (
                          <div className="text-xs text-muted-foreground truncate" title={exclusionReason}>
                            {exclusionReason}
                          </div>
                        ) : null}
                      </div>
                      <div className="px-3 py-2 border-r border-border text-muted-foreground truncate">
                        {t.type || '—'}
                      </div>
                      <div className="px-3 py-2 border-r border-border text-muted-foreground truncate">
                        {t.due_at ? new Date(t.due_at).toLocaleString() : '—'}
                      </div>
                      <div className="px-3 py-2 border-r border-border text-muted-foreground tabular-nums">
                        {w === null || w === undefined ? '—' : `${Number(w).toFixed(1)}%`}
                      </div>
                      <div className="px-3 py-2 border-r border-border text-muted-foreground tabular-nums">
                        {isGraded ? (g === null || g === undefined ? '—' : `${Number(g).toFixed(1)}%`) : '—'}
                      </div>
                      <div className="px-3 py-2 border-r border-border text-muted-foreground tabular-nums">
                        {contribution === null ? '—' : `${contribution.toFixed(2)}%`}
                      </div>
                      <div className="px-3 py-2 border-r border-border text-muted-foreground text-xs">
                        {excludedByRule ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded border border-border bg-muted" title={exclusionReason ?? ''}>
                            Excluded by rule
                          </span>
                        ) : !counts ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded border border-border bg-muted">
                            Excluded
                          </span>
                        ) : isGraded ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded border border-border bg-muted">
                            Graded
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded border border-border bg-muted">
                            Ungraded
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={handleToggleCounts}
                          className={`w-8 h-4 rounded-full transition-colors ${
                            counts ? 'bg-primary' : 'bg-muted-foreground/30'
                          } relative`}
                          title={counts ? 'Exclude from grading' : 'Include in grading'}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-background transition-transform ${
                              counts ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {gradebookTasks.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No items match your filters.</div>
                ) : null}
              </div>
            </div>

            <div className="text-xs text-muted-foreground mt-2">
              Note: task completion (todo/doing/done) never affects grade calculations.
            </div>

            <div className="mt-6">
              <CourseAssetsPanel
                courseId={selectedCourseId}
                courseCode={selectedCourse?.code}
                viewAssetId={lectureViewAssetId}
                onClearViewAssetId={() => setLectureViewAssetId(null)}
              />
            </div>
            {courseAssets.some((a) => a.asset_type === AssetType.LECTURE || a.asset_type === AssetType.TUTORIAL) && (
              <div className="mt-4">
                <div className="text-sm font-medium text-muted-foreground mb-2">Lectures & tutorials</div>
                <ul className="space-y-1 text-sm">
                  {courseAssets
                    .filter((a) => a.asset_type === AssetType.LECTURE || a.asset_type === AssetType.TUTORIAL)
                    .map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setLectureViewAssetId(a.id)}
                          className="text-primary hover:underline truncate block text-left w-full"
                        >
                          {a.file_name}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <StudyPlanSection courseId={selectedCourseId} />
            <div className="mt-4">
              <AvailabilityBlocksSection />
            </div>
          </div>
        </div>
      ) : null}

      {/* Tasks Section */}
      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">
              {selectedCourseId
                ? `Tasks - ${courses.find((c) => c.id === selectedCourseId)?.code ?? 'Course'}`
                : 'All School Tasks'}
            </h2>
            <div className="flex items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-muted/40"
              title="Filter by type"
            >
              <option value="">All Types</option>
              {Array.from(new Set(allTasks.map((t) => t.type).filter(Boolean) as string[])).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value as any)}
              className="px-3 py-1.5 text-sm rounded-md border border-border bg-muted/40"
              title="Filter by grading state"
            >
              <option value="all">All grades</option>
              <option value="graded">Graded</option>
              <option value="ungraded">Ungraded</option>
              <option value="missingGrade">Missing grade</option>
              <option value="missingWeight">Missing weight</option>
              <option value="excluded">Excluded</option>
            </select>

            <input
              value={minWeightFilter}
              onChange={(e) => setMinWeightFilter(e.target.value)}
              inputMode="decimal"
              placeholder="Weight ≥"
              className="w-24 px-3 py-1.5 text-sm rounded-md border border-border bg-muted/40"
              title="Minimum weight (%)"
            />

            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setStatusFilter('unchecked')}
                className={`px-3 py-1.5 text-sm ${
                  statusFilter === 'unchecked' ? 'bg-muted' : 'bg-background hover:bg-muted'
                }`}
              >
                Unchecked
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('checked')}
                className={`px-3 py-1.5 text-sm border-l border-border ${
                  statusFilter === 'checked' ? 'bg-muted' : 'bg-background hover:bg-muted'
                }`}
              >
                Checked
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-sm border-l border-border ${
                  statusFilter === 'all' ? 'bg-muted' : 'bg-background hover:bg-muted'
                }`}
              >
                All
              </button>
            </div>

            <button
              onClick={() => setIsCreatingTask(true)}
              className="px-3 py-1.5 text-sm bg-muted hover:bg-accent rounded-md"
            >
              + New Task
            </button>

            <button
              type="button"
              onClick={() => setIsTypesOpen(true)}
              className="px-3 py-1.5 text-sm border border-border bg-muted/40 hover:bg-muted rounded-md"
              title="Manage task types"
            >
              Types
            </button>
          </div>
          </div>
          {!selectedCourseId && unassignedAssets.length > 0 && (
            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-sm font-medium text-muted-foreground mb-2">Unassigned assets (imported files)</div>
              <ul className="space-y-1 text-sm">
                {unassignedAssets.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="truncate text-foreground" title={a.file_name}>{a.file_name}</span>
                    <button
                      type="button"
                      onClick={() => { if (confirm('Remove this asset?')) deleteCourseAsset.mutate(a.id); }}
                      className="text-muted-foreground hover:text-red-500 shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <SchoolTasksTable tasks={schoolTasks} />
      </div>
      
      <SchoolTaskModal
        isOpen={isCreatingTask}
        onClose={() => setIsCreatingTask(false)}
      />

      <TaskTypesModal isOpen={isTypesOpen} onClose={() => setIsTypesOpen(false)} />
    </div>
  );
}

