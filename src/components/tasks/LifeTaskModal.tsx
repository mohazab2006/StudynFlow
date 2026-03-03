import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { TaskWithCourse, RecurrenceRule } from '../../lib/types';
import { useCreateTask, useUpdateTask, useDeleteTask } from '../../hooks/useTasks';
import { useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask } from '../../hooks/useSubtasks';
import { useLifeCategories } from '../../hooks/useLifeCategories';
import { useCreateLifeCategory } from '../../hooks/useLifeCategories';
import { ensureRecurringInstances } from '../../services/recurrence';
import { generateId } from '../../lib/utils';
import RecurringEditDialog from './RecurringEditDialog';
import RecurringDeleteDialog from './RecurringDeleteDialog';
import { useDeleteRecurringInstanceAndFuture } from '../../hooks/useTasks';

interface LifeTaskModalProps {
  task?: TaskWithCourse;
  isOpen: boolean;
  onClose: () => void;
}

export default function LifeTaskModal({ task, isOpen, onClose }: LifeTaskModalProps) {
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<Partial<RecurrenceRule>>({
    frequency: 'DAILY',
    interval: 1,
    endType: 'NEVER',
  });
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([]);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editMode, setEditMode] = useState<'instance' | 'series' | null>(null);
  const [pendingFormData, setPendingFormData] = useState<any>(null);
  const isEditing = !!task;
  const isInstance = task && task.parentTemplateId;

  const { data: subtasks = [] } = useSubtasks(task?.id || '');
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const deleteRecurringAndFuture = useDeleteRecurringInstanceAndFuture();
  const createSubtask = useCreateSubtask();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();
  const { data: lifeCategories = [] } = useLifeCategories();
  const createLifeCategory = useCreateLifeCategory();

  const emptyDefaults = {
    title: '',
    description: '',
    due_at: '',
    life_category_id: '',
    life_category_name: '',
  };

  // Initialize recurrence state from task
  useEffect(() => {
    if (task) {
      if (task.isRecurringTemplate && task.recurrenceRuleJson) {
        try {
          const rule = JSON.parse(task.recurrenceRuleJson);
          setIsRecurring(true);
          setRecurrenceRule(rule);
          setSelectedWeekdays(rule.byWeekday || []);
        } catch {
          // Invalid rule, ignore
        }
      } else {
        setIsRecurring(false);
      }
    } else {
      setIsRecurring(false);
      setRecurrenceRule({ frequency: 'DAILY', interval: 1, endType: 'NEVER' });
      setSelectedWeekdays([]);
    }
  }, [task]);

  const { register, handleSubmit, reset, setValue, watch } = useForm({
    mode: 'onSubmit',
    defaultValues: task
      ? {
          title: task.title,
          description: task.description || '',
          due_at: task.due_at || '',
          life_category_id: (task as any).life_category_id || '',
          life_category_name: task.lifeCategory?.name || '',
        }
      : emptyDefaults,
  });

  useEffect(() => {
    // When opening, always reset the form so "New Task" is a fresh blank form.
    if (!isOpen) {
      setCategoryDropdownOpen(false);
      setNewCategoryName('');
      return;
    }
    setNewSubtaskText('');
    setCategoryDropdownOpen(false);
    setNewCategoryName('');
    if (task) {
      // datetime-local needs YYYY-MM-DDTHH:mm in local time
      let dueAtForm = task.due_at || '';
      if (task.due_at) {
        try {
          const d = new Date(task.due_at);
          if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const h = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            dueAtForm = `${y}-${m}-${day}T${h}:${min}`;
          }
        } catch {
          // keep task.due_at as-is
        }
      }
      reset({
        title: task.title,
        description: task.description || '',
        due_at: dueAtForm,
        life_category_id: (task as any).life_category_id || '',
        life_category_name: task.lifeCategory?.name || '',
      });
    } else {
      reset(emptyDefaults);
    }
  }, [isOpen, task, reset]);

  const handleEditSubmit = async (data: any, mode: 'instance' | 'series') => {
    try {
      if (mode === 'instance') {
        // Edit this occurrence only - mark as override
        await updateTask.mutateAsync({
          id: task!.id,
          ...data,
          due_at: data.due_at || null,
          life_category_id: data.life_category_id || null,
          isOccurrenceOverride: true,
        });
      } else {
        // Edit entire series - update template and regenerate
        if (!task!.parentTemplateId) return;

        // Get template
        const templateId = task!.parentTemplateId;
        // Update template with new data
        await updateTask.mutateAsync({
          id: templateId,
          ...data,
          due_at: data.due_at || null,
          life_category_id: data.life_category_id || null,
        });

        // Regenerate future instances (past and overridden won't change)
        await ensureRecurringInstances(45);
      }
      onClose();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      if (isEditing) {
        if (isInstance && !editMode) {
          // Show dialog to choose instance vs series
          setPendingFormData(data);
          setShowRecurringDialog(true);
          return;
        }

        if (editMode === 'instance') {
          await handleEditSubmit(data, 'instance');
        } else if (editMode === 'series') {
          await handleEditSubmit(data, 'series');
        } else if (task.isRecurringTemplate) {
          // Editing a recurring template: update title, description, due, category, and recurrence rule
          let timeOfDay: string | undefined;
          if (data.due_at) {
            const date = new Date(data.due_at);
            timeOfDay = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          }
          const rule: RecurrenceRule = {
            frequency: recurrenceRule.frequency || 'DAILY',
            interval: recurrenceRule.interval || 1,
            byWeekday: recurrenceRule.frequency === 'WEEKLY' ? selectedWeekdays : undefined,
            timeOfDay: timeOfDay,
            endType: recurrenceRule.endType || 'NEVER',
            untilDate: recurrenceRule.endType === 'UNTIL' ? recurrenceRule.untilDate : undefined,
            count: recurrenceRule.endType === 'COUNT' ? recurrenceRule.count : undefined,
          };
          if (rule.endType !== 'COUNT') rule.count = undefined;

          await updateTask.mutateAsync({
            id: task.id,
            title: data.title,
            description: data.description || null,
            due_at: data.due_at || null,
            life_category_id: data.life_category_id || null,
            recurrenceRuleJson: JSON.stringify(rule),
          });
          await ensureRecurringInstances(90);
          onClose();
        } else {
          // Normal edit (not a recurring instance)
          await updateTask.mutateAsync({
            id: task.id,
            ...data,
            due_at: data.due_at || null,
            life_category_id: data.life_category_id || null,
          });
          onClose();
        }
      } else {
        // Creating new task
        if (isRecurring) {
          // Extract time from start date/time for recurrence rule
          let timeOfDay: string | undefined;
          if (data.due_at) {
            const date = new Date(data.due_at);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            timeOfDay = `${hours}:${minutes}`;
          }

          // Create recurring template
          // Ensure COUNT is only set if endType is COUNT
          const rule: RecurrenceRule = {
            frequency: recurrenceRule.frequency || 'DAILY',
            interval: recurrenceRule.interval || 1,
            byWeekday: recurrenceRule.frequency === 'WEEKLY' ? selectedWeekdays : undefined,
            timeOfDay: timeOfDay,
            endType: recurrenceRule.endType || 'NEVER',
            untilDate: recurrenceRule.endType === 'UNTIL' ? recurrenceRule.untilDate : undefined,
            count: recurrenceRule.endType === 'COUNT' ? recurrenceRule.count : undefined,
          };
          
          // Safety check: clear COUNT if endType is not COUNT
          if (rule.endType !== 'COUNT') {
            rule.count = undefined;
          }

          const seriesId = generateId();
          await createTask.mutateAsync({
            ...data,
            due_at: data.due_at || null, // This is the start date/time for the template
            status: 'todo',
            type: 'Other',
            life_category_id: data.life_category_id || null,
            workspace: 'life',
            isRecurringTemplate: true,
            recurrenceRuleJson: JSON.stringify(rule),
            recurringSeriesId: seriesId,
          });

          // Generate initial instances
          await ensureRecurringInstances(90);
        } else {
          // Create normal task
          await createTask.mutateAsync({
            ...data,
            due_at: data.due_at || null,
            status: 'todo',
            type: 'Other',
            life_category_id: data.life_category_id || null,
            workspace: 'life',
          });
        }
      }
      onClose();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    
    // If it's a recurring instance, show the delete dialog
    if (isInstance) {
      setShowDeleteDialog(true);
      return;
    }
    
    // For non-recurring tasks or templates, use normal delete
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask.mutateAsync(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleDeleteInstance = async () => {
    if (!task) return;
    try {
      await deleteTask.mutateAsync(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete instance:', error);
    }
  };

  const handleDeleteInstanceAndFuture = async () => {
    if (!task) return;
    try {
      await deleteRecurringAndFuture.mutateAsync(task.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete instance and future:', error);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              {isEditing ? 'Edit Task' : 'New Task'}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      {(() => {
                        const selectedCategory = lifeCategories.find((c) => c.id === watch('life_category_id'));
                        if (selectedCategory) {
                          return (
                            <>
                              <span
                                className="w-3 h-3 rounded-sm"
                                style={{ backgroundColor: selectedCategory.color }}
                              />
                              <span>{selectedCategory.name}</span>
                            </>
                          );
                        }
                        return <span className="text-muted-foreground">Select a category...</span>;
                      })()}
                    </span>
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {categoryDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setCategoryDropdownOpen(false)}
                      />
                      <div className="absolute z-20 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {lifeCategories.map((c) => {
                          const isSelected = watch('life_category_id') === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setValue('life_category_id', c.id, { shouldDirty: true });
                                setValue('life_category_name', c.name, { shouldDirty: true });
                                setCategoryDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors ${
                                isSelected ? 'bg-muted/60' : ''
                              }`}
                            >
                              <span
                                className="w-3 h-3 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: c.color }}
                              />
                              <span>{c.name}</span>
                            </button>
                          );
                        })}
                        <div className="border-t border-border p-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder="New category name..."
                              className="flex-1 px-2 py-1.5 text-sm bg-muted border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const value = newCategoryName.trim();
                                  if (value) {
                                    const created = await createLifeCategory.mutateAsync({ name: value });
                                    setValue('life_category_id', created.id, { shouldDirty: true });
                                    setValue('life_category_name', created.name, { shouldDirty: true });
                                    setNewCategoryName('');
                                    setCategoryDropdownOpen(false);
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const value = newCategoryName.trim();
                                if (value) {
                                  const created = await createLifeCategory.mutateAsync({ name: value });
                                  setValue('life_category_id', created.id, { shouldDirty: true });
                                  setValue('life_category_name', created.name, { shouldDirty: true });
                                  setNewCategoryName('');
                                  setCategoryDropdownOpen(false);
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
                {/* Hidden fields to register with react-hook-form */}
                <input type="hidden" {...register('life_category_id')} />
                <input type="hidden" {...register('life_category_name')} />
              </div>

              {!isRecurring && (
                <div>
                  <label className="block text-sm font-medium mb-1">Due Date</label>
                  <input
                    {...register('due_at')}
                    type="datetime-local"
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
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

            {/* Recurring: when creating, always show toggle; when editing a template, show schedule. Schedule fields when (creating and toggled) or editing template. */}
            {(!isEditing || task?.isRecurringTemplate) && (
              <div className="border-t border-border pt-4">
                {!isEditing && (
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setIsRecurring(!isRecurring)}
                      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 transition-colors ${
                        isRecurring
                          ? 'border-foreground bg-muted text-foreground font-semibold'
                          : 'border-border bg-muted hover:bg-muted/80'
                      }`}
                    >
                      <svg
                        className={`w-5 h-5 ${isRecurring ? 'text-foreground' : 'text-muted-foreground'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      <span className="text-base font-medium">Recurring</span>
                    </button>
                  </div>
                )}

                {(isRecurring || task?.isRecurringTemplate) && (
                <div className="space-y-4 pl-6">
                    <div>
                      <label className="block text-sm font-medium mb-1">Start Date & Time</label>
                      <input
                        {...register('due_at')}
                        type="datetime-local"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Frequency</label>
                        <select
                          value={recurrenceRule.frequency || 'DAILY'}
                          onChange={(e) => {
                            const freq = e.target.value as 'DAILY' | 'WEEKLY' | 'MONTHLY';
                            setRecurrenceRule({ ...recurrenceRule, frequency: freq });
                            if (freq !== 'WEEKLY') {
                              setSelectedWeekdays([]);
                            }
                          }}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="DAILY">Daily</option>
                          <option value="WEEKLY">Weekly</option>
                          <option value="MONTHLY">Monthly</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Interval</label>
                        <input
                          type="number"
                          min="1"
                          value={recurrenceRule.interval || 1}
                          onChange={(e) =>
                            setRecurrenceRule({ ...recurrenceRule, interval: parseInt(e.target.value) || 1 })
                          }
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {recurrenceRule.frequency === 'WEEKLY' && (
                      <div>
                        <label className="block text-sm font-medium mb-2">Weekdays</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: 'MO', label: 'Mon' },
                            { value: 'TU', label: 'Tue' },
                            { value: 'WE', label: 'Wed' },
                            { value: 'TH', label: 'Thu' },
                            { value: 'FR', label: 'Fri' },
                            { value: 'SA', label: 'Sat' },
                            { value: 'SU', label: 'Sun' },
                          ].map((day) => (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => {
                                if (selectedWeekdays.includes(day.value)) {
                                  setSelectedWeekdays(selectedWeekdays.filter((d) => d !== day.value));
                                } else {
                                  setSelectedWeekdays([...selectedWeekdays, day.value]);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-sm border ${
                                selectedWeekdays.includes(day.value)
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-muted border-border hover:bg-muted/80'
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}


                    <div>
                      <label className="block text-sm font-medium mb-1">End</label>
                      <select
                        value={recurrenceRule.endType || 'NEVER'}
                        onChange={(e) => {
                          const endType = e.target.value as 'NEVER' | 'UNTIL' | 'COUNT';
                          setRecurrenceRule({ ...recurrenceRule, endType });
                        }}
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary mb-2"
                      >
                        <option value="NEVER">Never</option>
                        <option value="UNTIL">Until date</option>
                        <option value="COUNT">After N occurrences</option>
                      </select>

                      {recurrenceRule.endType === 'UNTIL' && (
                        <input
                          type="date"
                          value={recurrenceRule.untilDate || ''}
                          onChange={(e) => setRecurrenceRule({ ...recurrenceRule, untilDate: e.target.value })}
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      )}

                      {recurrenceRule.endType === 'COUNT' && (
                        <input
                          type="number"
                          min="1"
                          value={recurrenceRule.count || ''}
                          onChange={(e) =>
                            setRecurrenceRule({ ...recurrenceRule, count: parseInt(e.target.value) || undefined })
                          }
                          placeholder="Number of occurrences"
                          className="w-full px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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

      {showRecurringDialog && pendingFormData && (
        <RecurringEditDialog
          isOpen={showRecurringDialog}
          onClose={() => {
            setShowRecurringDialog(false);
            setEditMode(null);
            setPendingFormData(null);
          }}
          onEditInstance={() => {
            setEditMode('instance');
            handleEditSubmit(pendingFormData, 'instance');
          }}
          onEditSeries={() => {
            setEditMode('series');
            handleEditSubmit(pendingFormData, 'series');
          }}
          taskTitle={task?.title || ''}
        />
      )}

      {showDeleteDialog && task && (
        <RecurringDeleteDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          onDeleteInstance={handleDeleteInstance}
          onDeleteInstanceAndFuture={handleDeleteInstanceAndFuture}
          taskTitle={task.title}
          taskDate={task.due_at}
        />
      )}
    </div>
  );
}

