import { useMemo, useState } from 'react';
import type { TaskWithCourse } from '../../lib/types';
import { formatDueDate, isOverdue } from '../../lib/dates';
import { useUpdateTask } from '../../hooks/useTasks';
import SchoolTaskModal from '../tasks/SchoolTaskModal';
import { useTaskTypes } from '../../hooks/useTaskTypes';
import { buildTaskTypeColorMap } from '../../lib/taskTypeColors';

interface Props {
  tasks: TaskWithCourse[];
}

const columns = ['Status', 'Course', 'Name', 'Dates', 'Task', 'Weight', 'Grade', 'Notes'] as const;

const fallbackTypeColors: Record<string, string> = {
  Assignment: '#16A34A',
  Exam: '#DC2626',
  Quiz: '#EA580C',
  Midterm: '#9333EA',
  Final: '#DC2626',
  Lab: '#0D9488',
  Tutorial: '#CA8A04',
  Reading: '#2563EB',
  Project: '#DB2777',
  Other: '#6B7280',
};

export default function SchoolTasksTable({ tasks }: Props) {
  const updateTask = useUpdateTask();
  const [openTask, setOpenTask] = useState<TaskWithCourse | null>(null);
  const { data: taskTypes = [] } = useTaskTypes();
  const typeColorMap = taskTypes.length ? buildTaskTypeColorMap(taskTypes) : fallbackTypeColors;

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ad = a.due_at ?? '';
      const bd = b.due_at ?? '';
      if (ad === bd) return b.created_at.localeCompare(a.created_at);
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    });
  }, [tasks]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="grid grid-cols-[80px_140px_1.3fr_180px_140px_100px_100px_1fr] bg-muted text-xs font-medium text-muted-foreground">
        {columns.map((c) => (
          <div key={c} className="px-3 py-2 border-r border-border last:border-r-0">
            {c}
          </div>
        ))}
      </div>

      <div className="divide-y divide-border">
        {sorted.map((t) => {
          const isDone = t.status === 'done';
          const overdue = isOverdue(t.due_at);
          return (
            <div
              key={t.id}
              className="grid grid-cols-[80px_140px_1.3fr_180px_140px_100px_100px_1fr] text-sm hover:bg-muted/60"
            >
              <div className="px-3 py-2 border-r border-border flex items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTask.mutate({ id: t.id, status: isDone ? 'todo' : 'done' });
                  }}
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    isDone ? 'bg-foreground border-foreground' : 'border-muted-foreground/40'
                  }`}
                  title="Toggle complete"
                >
                  {isDone ? <span className="text-background text-xs">✓</span> : null}
                </button>
              </div>

              <div className="px-3 py-2 border-r border-border flex items-center">
                {t.course ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border border-border bg-muted text-foreground/90">
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ backgroundColor: t.course.color ?? '#6B7280' }}
                    />
                    {t.course.code}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs" title="Unassigned School Tasks inbox">Unassigned</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setOpenTask(t)}
                className="px-3 py-2 border-r border-border text-left truncate"
                title={t.title}
              >
                <span className={isDone ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
              </button>

              <div
                className={`px-3 py-2 border-r border-border ${
                  overdue && !isDone ? 'text-red-500 font-medium' : 'text-muted-foreground'
                }`}
              >
                {t.due_at ? formatDueDate(t.due_at) : '—'}
              </div>

              <div className="px-3 py-2 border-r border-border">
                {t.type ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border border-border bg-muted text-foreground/90">
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ backgroundColor: typeColorMap[t.type] ?? '#6B7280' }}
                    />
                    {t.type}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>

              <div className="px-3 py-2 border-r border-border text-muted-foreground tabular-nums text-xs">
                {t.grade?.weight_percent !== null && t.grade?.weight_percent !== undefined
                  ? `${Number(t.grade.weight_percent).toFixed(1)}%`
                  : '—'}
              </div>

              <div className="px-3 py-2 border-r border-border text-muted-foreground tabular-nums text-xs">
                {t.grade?.is_graded && t.grade?.grade_percent !== null && t.grade?.grade_percent !== undefined
                  ? `${Number(t.grade.grade_percent).toFixed(1)}%`
                  : '—'}
              </div>

              <div className="px-3 py-2 text-muted-foreground truncate" title={t.description ?? ''}>
                {t.description?.trim() ? t.description : '—'}
              </div>
            </div>
          );
        })}

        {sorted.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No tasks yet.</div>
        ) : null}
      </div>

      {openTask ? (
        <SchoolTaskModal isOpen={true} task={openTask} onClose={() => setOpenTask(null)} />
      ) : null}
    </div>
  );
}


