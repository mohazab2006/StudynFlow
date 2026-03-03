import { useState, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  startOfWeek,
  endOfWeek,
  parseISO,
} from 'date-fns';
import { useTasks } from '../hooks/useTasks';
import type { TaskWithCourse } from '../lib/types';
import { Link } from 'react-router-dom';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCalendarDays(month: Date): Date[] {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const rangeStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: rangeStart, end: rangeEnd });
}

function tasksByDate(tasks: TaskWithCourse[]): Map<string, TaskWithCourse[]> {
  const map = new Map<string, TaskWithCourse[]>();
  for (const task of tasks) {
    if (!task.due_at) continue;
    const dateKey = format(parseISO(task.due_at), 'yyyy-MM-dd');
    const list = map.get(dateKey) ?? [];
    list.push(task);
    map.set(dateKey, list);
  }
  return map;
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const dueAfter = monthStart.toISOString();
  const dueBefore = new Date(monthEnd.getTime() + 1).toISOString();

  const { data: tasks = [], isLoading } = useTasks({
    dueAfter,
    dueBefore,
    includeCompleted: true,
  });

  const calendarDays = useMemo(() => getCalendarDays(currentMonth), [currentMonth]);
  const tasksByDay = useMemo(() => tasksByDate(tasks), [tasks]);

  const goPrev = () => setCurrentMonth((m) => subMonths(m, 1));
  const goNext = () => setCurrentMonth((m) => addMonths(m, 1));
  const goToday = () => setCurrentMonth(new Date());

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tasks by due date
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
            aria-label="Previous month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
            aria-label="Next month"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-xl font-semibold text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="bg-muted/50 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
            {calendarDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayTasks = tasksByDay.get(dateKey) ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);

              return (
                <div
                  key={dateKey}
                  className={`min-h-[100px] p-2 flex flex-col bg-background ${
                    !inMonth ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                        today
                          ? 'bg-primary text-primary-foreground font-semibold'
                          : 'text-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="flex-1 space-y-1 overflow-y-auto">
                    {isLoading ? (
                      <div className="text-xs text-muted-foreground">...</div>
                    ) : (
                      dayTasks.slice(0, 3).map((task) => (
                        <Link
                          key={task.id}
                          to={task.workspace === 'school' ? '/school' : '/life'}
                          className="block text-xs truncate rounded px-1.5 py-0.5 border border-border bg-muted/50 hover:bg-muted transition-colors"
                          title={task.title}
                        >
                          {task.title}
                        </Link>
                      ))
                    )}
                    {!isLoading && dayTasks.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{dayTasks.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
