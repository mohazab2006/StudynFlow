import { useMemo, useState } from 'react';
import { useTasks, useRecurringTemplates, useDeleteTask } from '../hooks/useTasks';
import TaskList from '../components/tasks/TaskList';
import LifeTaskModal from '../components/tasks/LifeTaskModal';
import { useLifeCategories } from '../hooks/useLifeCategories';
import LifeCategoriesModal from '../components/life/LifeCategoriesModal';
import { formatRecurrenceRule } from '../lib/recurrenceFormat';
import type { RecurrenceRule } from '../lib/types';
import type { TaskWithCourse } from '../lib/types';

export default function LifePage() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskWithCourse | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'unchecked' | 'checked' | 'all'>('unchecked');
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);

  const { data: allTasks = [], isLoading } = useTasks({
    includeCompleted: statusFilter !== 'unchecked',
    ...(statusFilter === 'checked' ? { status: 'done' } : {}),
    workspace: 'life',
  });
  const { data: categories = [] } = useLifeCategories();
  const { data: recurringTemplates = [] } = useRecurringTemplates();
  const deleteTask = useDeleteTask();

  // Main list: only one-off life tasks + recurring instances (no templates). Instances only appear on/before their due date (already enforced by API).
  const lifeTasksExcludingTemplates = useMemo(
    () => allTasks.filter((t) => !t.isRecurringTemplate),
    [allTasks]
  );
  const filteredTasks = useMemo(() => {
    const byCategory = selectedCategoryId
      ? lifeTasksExcludingTemplates.filter((t) => (t as any).life_category_id === selectedCategoryId)
      : lifeTasksExcludingTemplates;
    if (statusFilter === 'all') return byCategory;
    if (statusFilter === 'checked') return byCategory.filter((t) => t.status === 'done');
    return byCategory.filter((t) => t.status !== 'done');
  }, [lifeTasksExcludingTemplates, selectedCategoryId, statusFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Life</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedCategoryId ?? ''}
            onChange={(e) => setSelectedCategoryId(e.target.value || null)}
            className="px-3 py-2 rounded-md border border-border bg-muted/40 text-sm"
            title="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

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
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            New Life Task
          </button>

          <button
            type="button"
            onClick={() => setIsCategoriesOpen(true)}
            className="px-3 py-2 rounded-md border border-border bg-muted/40 hover:bg-muted text-sm"
            title="Manage categories"
          >
            Categories
          </button>
        </div>
      </div>

      {/* Recurring tasks: always visible so you can edit or delete the schedule */}
      {recurringTemplates.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Recurring tasks</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Edit or delete the schedule. Unchecked occurrences only appear in the list below on the day they’re due.
          </p>
          <div className="border border-border rounded-lg divide-y divide-border">
            {recurringTemplates.map((template) => {
              let rule: RecurrenceRule | null = null;
              try {
                if (template.recurrenceRuleJson) {
                  rule = JSON.parse(template.recurrenceRuleJson);
                }
              } catch {
                // ignore
              }
              return (
                <div
                  key={template.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{template.title}</div>
                    {rule && (
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {formatRecurrenceRule(rule, template.due_at)}
                      </div>
                    )}
                    {template.lifeCategory && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="inline-block w-2 h-2 rounded-sm"
                          style={{ backgroundColor: template.lifeCategory.color || '#6B7280' }}
                        />
                        <span className="text-xs text-muted-foreground">{template.lifeCategory.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTemplate(template);
                      }}
                      className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete recurring task "${template.title}"? This removes the schedule; existing instances may remain.`)) {
                          try {
                            await deleteTask.mutateAsync(template.id);
                          } catch (err) {
                            console.error('Delete failed:', err);
                          }
                        }
                      }}
                      className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-red-500/20 text-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main list: one-off tasks + recurring instances (only on day of) */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Tasks</h2>
        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <TaskList tasks={filteredTasks} />
        )}
      </div>

      <LifeTaskModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
      />

      <LifeTaskModal
        task={editingTemplate ?? undefined}
        isOpen={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
      />

      <LifeCategoriesModal isOpen={isCategoriesOpen} onClose={() => setIsCategoriesOpen(false)} />
    </div>
  );
}

