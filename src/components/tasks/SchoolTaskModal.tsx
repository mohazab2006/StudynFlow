import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { TaskWithCourse } from '../../lib/types';
import { TaskType } from '../../lib/types';
import { useCreateTask, useUpdateTask, useDeleteTask } from '../../hooks/useTasks';
import { useCourses } from '../../hooks/useCourses';
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask } from '../../hooks/useSubtasks';
import { useTaskTypes } from '../../hooks/useTaskTypes';
import { useCreateTaskType } from '../../hooks/useTaskTypes';
import { useDeleteTaskGrade, useUpsertTaskGrade } from '../../hooks/useGrades';
import AssessmentScopeSection from '../copilot/AssessmentScopeSection';
import { hasAIConfigured } from '../../services/aiSettings';
import { suggestTaskEffort } from '../../services/ai';

interface SchoolTaskModalProps {
  task?: TaskWithCourse;
  isOpen: boolean;
  onClose: () => void;
}

export default function SchoolTaskModal({ task, isOpen, onClose }: SchoolTaskModalProps) {
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const isEditing = !!task;

  const { data: courses = [] } = useCourses();
  const { data: subtasks = [] } = useSubtasks(task?.id || '');
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createSubtask = useCreateSubtask();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();
  const { data: taskTypes = [] } = useTaskTypes();
  const createTaskType = useCreateTaskType();
  const upsertGrade = useUpsertTaskGrade();
  const deleteGrade = useDeleteTaskGrade();

  const emptyDefaults = {
    title: '',
    description: '',
    due_at: '',
    type: '',
    course_id: '',
    weight_percent: '',
    counts: true,
    is_graded: false,
    grade_percent: '',
    effort_estimate_minutes: '',
  };

  const { register, handleSubmit, reset, setValue, getValues, watch } = useForm({
    mode: 'onSubmit',
    defaultValues: task
      ? {
          title: task.title,
          description: task.description || '',
          due_at: task.due_at || '',
          type: task.type,
          course_id: task.course_id || '',
          weight_percent:
            task.grade?.weight_percent === null || task.grade?.weight_percent === undefined
              ? ''
              : String(task.grade.weight_percent),
          counts: task.grade?.counts ?? true,
          is_graded: task.grade?.is_graded ?? false,
          grade_percent:
            task.grade?.grade_percent === null || task.grade?.grade_percent === undefined
              ? ''
              : String(task.grade.grade_percent),
          effort_estimate_minutes:
            task.effort_estimate_minutes === null || task.effort_estimate_minutes === undefined
              ? ''
              : String(task.effort_estimate_minutes),
        }
      : emptyDefaults,
  });

  useEffect(() => {
    // When opening, always reset the form so "New Task" is a fresh blank form.
    if (!isOpen) {
      setTypeDropdownOpen(false);
      setNewTypeName('');
      return;
    }
    setNewSubtaskText('');
    setTypeDropdownOpen(false);
    setNewTypeName('');
    if (task) {
      reset({
        title: task.title,
        description: task.description || '',
        due_at: task.due_at || '',
        type: task.type,
        course_id: task.course_id || '',
        weight_percent:
          task.grade?.weight_percent === null || task.grade?.weight_percent === undefined
            ? ''
            : String(task.grade.weight_percent),
        counts: task.grade?.counts ?? true,
        is_graded: task.grade?.is_graded ?? false,
        grade_percent:
          task.grade?.grade_percent === null || task.grade?.grade_percent === undefined
            ? ''
            : String(task.grade.grade_percent),
        effort_estimate_minutes:
          task.effort_estimate_minutes === null || task.effort_estimate_minutes === undefined
            ? ''
            : String(task.effort_estimate_minutes),
      });
    } else {
      reset(emptyDefaults);
    }
  }, [isOpen, task, reset]);

  const onSubmit = async (data: any) => {
    try {
      const normalized = { ...data, type: (data.type || '').trim() || undefined };
      const course_id = data.course_id || null;

      const parsedWeight =
        data.weight_percent === '' || data.weight_percent === null || data.weight_percent === undefined
          ? null
          : Number(data.weight_percent);
      const counts = Boolean(data.counts);
      const is_graded = Boolean(data.is_graded);
      const parsedGrade =
        !is_graded
          ? null
          : data.grade_percent === '' || data.grade_percent === null || data.grade_percent === undefined
            ? null
            : Number(data.grade_percent);

      const effortMinutes =
        data.effort_estimate_minutes === '' || data.effort_estimate_minutes == null
          ? null
          : Number(data.effort_estimate_minutes);

      if (isEditing) {
        await updateTask.mutateAsync({
          id: task.id,
          ...normalized,
          course_id,
          due_at: data.due_at || null,
          effort_estimate_minutes: Number.isFinite(effortMinutes) ? effortMinutes : null,
        });

        if (course_id) {
          await upsertGrade.mutateAsync({
            task_id: task.id,
            weight_percent: parsedWeight,
            counts,
            is_graded,
            grade_percent: parsedGrade,
          });
        } else {
          // If a task is no longer linked to a course, remove grade metadata.
          await deleteGrade.mutateAsync(task.id);
        }
      } else {
        const created = await createTask.mutateAsync({
          ...normalized,
          course_id,
          due_at: data.due_at || null,
          status: 'todo',
          workspace: 'school',
          effort_estimate_minutes: Number.isFinite(effortMinutes) ? effortMinutes : null,
        });

        if (course_id) {
          await upsertGrade.mutateAsync({
            task_id: created.id,
            weight_percent: parsedWeight,
            counts,
            is_graded,
            grade_percent: parsedGrade,
          });
        }
      }
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const ensureTypeExists = async () => {
    const current = (getValues('type') || '').trim();
    if (!current) return;
    const exists = taskTypes.some((t) => t.name.toLowerCase() === current.toLowerCase());
    if (!exists) {
      const created = await createTaskType.mutateAsync({ name: current });
      // normalize to the stored casing
      setValue('type', created.name, { shouldDirty: true });
    } else {
      // normalize casing to the existing type name
      const found = taskTypes.find((t) => t.name.toLowerCase() === current.toLowerCase());
      if (found) setValue('type', found.name, { shouldDirty: true });
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm('Delete this task?')) return;
    try {
      await deleteTask.mutateAsync(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !newSubtaskText.trim()) return;
    try {
      await createSubtask.mutateAsync({
        task_id: task.id,
        text: newSubtaskText.trim(),
      });
      setNewSubtaskText('');
    } catch (error) {
      console.error('Failed to create subtask:', error);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, done: boolean) => {
    if (!task) return;
    try {
      await updateSubtask.mutateAsync({ id: subtaskId, done: !done });
    } catch (error) {
      console.error('Failed to update subtask:', error);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!task) return;
    try {
      await deleteSubtask.mutateAsync({ id: subtaskId, taskId: task.id });
    } catch (error) {
      console.error('Failed to delete subtask:', error);
    }
  };

  const [suggestingEffort, setSuggestingEffort] = useState(false);
  const handleSuggestEffort = async () => {
    const title = getValues('title')?.trim();
    if (!title) return;
    setSuggestingEffort(true);
    try {
      const { effortMinutes } = await suggestTaskEffort(title, watch('type') || undefined);
      setValue('effort_estimate_minutes', String(effortMinutes), { shouldDirty: true });
    } catch (e) {
      console.warn('Suggest effort failed:', e);
    } finally {
      setSuggestingEffort(false);
    }
  };

  if (!isOpen) return null;
  const aiConfigured = hasAIConfigured();

  const selectedCourseId = watch('course_id');
  const showGrading = !!selectedCourseId;
  const isGraded = watch('is_graded');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              {isEditing ? 'Edit School Task' : 'New School Task'}
            </h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                {...register('title')}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Course</label>
              <select
                {...register('course_id')}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      {(() => {
                        const selectedType = taskTypes.find((t) => t.name === watch('type'));
                        if (selectedType) {
                          return (
                            <>
                              <span
                                className="w-3 h-3 rounded-sm"
                                style={{ backgroundColor: selectedType.color }}
                              />
                              <span>{selectedType.name}</span>
                            </>
                          );
                        }
                        return <span className="text-muted-foreground">Select a type...</span>;
                      })()}
                    </span>
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform ${typeDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {typeDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setTypeDropdownOpen(false)}
                      />
                      <div className="absolute z-20 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {(taskTypes.length > 0 ? taskTypes : Object.values(TaskType).map((name) => ({ id: name, name, color: '#6B7280' }))).map((t) => {
                          const isSelected = watch('type') === t.name;
                          return (
                            <button
                              key={t.id || t.name}
                              type="button"
                              onClick={() => {
                                setValue('type', t.name, { shouldDirty: true });
                                setTypeDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors ${
                                isSelected ? 'bg-muted/60' : ''
                              }`}
                            >
                              <span
                                className="w-3 h-3 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: t.color }}
                              />
                              <span>{t.name}</span>
                            </button>
                          );
                        })}
                        <div className="border-t border-border p-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newTypeName}
                              onChange={(e) => setNewTypeName(e.target.value)}
                              placeholder="New type name..."
                              className="flex-1 px-2 py-1.5 text-sm bg-muted border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const value = newTypeName.trim();
                                  if (value) {
                                    setValue('type', value, { shouldDirty: true });
                                    await ensureTypeExists();
                                    setNewTypeName('');
                                    setTypeDropdownOpen(false);
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const value = newTypeName.trim();
                                if (value) {
                                  setValue('type', value, { shouldDirty: true });
                                  await ensureTypeExists();
                                  setNewTypeName('');
                                  setTypeDropdownOpen(false);
                                }
                              }}
                              className="px-3 py-1.5 text-sm bg-foreground text-background rounded hover:opacity-90"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Due Date</label>
                <input
                  {...register('due_at')}
                  type="datetime-local"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Effort (minutes)</label>
                <input
                  {...register('effort_estimate_minutes')}
                  type="number"
                  min={0}
                  step={15}
                  placeholder="e.g. 60"
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {aiConfigured && (
                <button
                  type="button"
                  onClick={handleSuggestEffort}
                  disabled={suggestingEffort || !getValues('title')?.trim()}
                  className="px-3 py-2 text-sm border border-border rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 whitespace-nowrap"
                >
                  {suggestingEffort ? '…' : 'Suggest effort (AI)'}
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                {...register('description')}
                rows={3}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Grading section (School tasks only, when linked to a course) */}
            {showGrading ? (
              <div className="border border-border rounded-lg p-4 bg-muted/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold">Grading</div>
                  <div className="text-xs text-muted-foreground">Done ≠ graded (status never affects grades)</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Weight (%)</label>
                    <input
                      {...register('weight_percent')}
                      inputMode="decimal"
                      placeholder="e.g. 5"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="text-xs text-muted-foreground mt-1">Percent of final grade.</div>
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 text-sm font-medium select-none">
                      <input type="checkbox" {...register('counts')} className="accent-foreground" />
                      Counts toward grade
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center">
                    <label className="inline-flex items-center gap-2 text-sm font-medium select-none">
                      <input type="checkbox" {...register('is_graded')} className="accent-foreground" />
                      Graded?
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Grade (%)</label>
                    <input
                      {...register('grade_percent')}
                      inputMode="decimal"
                      placeholder={isGraded ? 'e.g. 92 (bonus allowed >100)' : 'Enable “Graded?” first'}
                      disabled={!isGraded}
                      className={`w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                        isGraded ? 'bg-background' : 'bg-muted text-muted-foreground'
                      }`}
                    />
                    <div className="text-xs text-muted-foreground mt-1">Bonus supported (can exceed 100%).</div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground mt-3">
                  Tip: uncheck “Counts toward grade” to manually exclude (“drop”) an item.
                </div>
              </div>
            ) : null}

            {isEditing && (
              <div>
                <label className="block text-sm font-medium mb-2">Subtasks</label>
                <div className="space-y-2 mb-2">
                  {subtasks.map((subtask) => (
                    <div key={subtask.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                      <button
                        type="button"
                        onClick={() => handleToggleSubtask(subtask.id, subtask.done)}
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          subtask.done ? 'bg-foreground border-foreground' : 'border-muted-foreground/30'
                        }`}
                      >
                        {subtask.done && <span className="text-background text-xs">✓</span>}
                      </button>
                      <span className={subtask.done ? 'line-through text-muted-foreground' : ''}>
                        {subtask.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubtask(subtask.id)}
                        className="ml-auto text-muted-foreground hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Avoid nested <form> which breaks submit behavior */}
                <div className="flex gap-2">
                  <input
                    value={newSubtaskText}
                    onChange={(e) => setNewSubtaskText(e.target.value)}
                    placeholder="Add a subtask..."
                    className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtask(e as unknown as React.FormEvent);
                      }
                    }}
                  />
                  <button type="button" onClick={handleAddSubtask} className="px-4 py-2 bg-secondary rounded-lg text-sm">
                    Add
                  </button>
                </div>
              </div>
            )}

            {isEditing && task?.course_id && (
              <AssessmentScopeSection
                taskId={task.id}
                courseId={task.course_id}
                taskTitle={task.title}
              />
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div>
                {isEditing && (
                  <button type="button" onClick={handleDelete} className="px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary rounded-lg">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
                  {isEditing ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

