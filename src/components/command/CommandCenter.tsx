import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseCommand, type CommandIntent } from '../../services/commandParser';
import { useCreateTask } from '../../hooks/useTasks';
import { useCourses } from '../../hooks/useCourses';
import { useTasks } from '../../hooks/useTasks';
import {
  computeNeededFinal,
  computeProjectedOverall,
} from '../../services/gradeMath';

interface CommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
  pageContext?: { courseCode?: string };
}

export default function CommandCenter({ isOpen, onClose, pageContext }: CommandCenterProps) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ intent: CommandIntent; message: string; confirmAction?: () => void } | null>(null);
  const navigate = useNavigate();
  const createTask = useCreateTask();
  const { data: courses = [] } = useCourses();
  const { data: allSchoolTasks = [] } = useTasks({ workspace: 'school', includeCompleted: true });

  const runQuery = useCallback(
    (intent: CommandIntent) => {
      if (intent.type === 'query_focus') {
        setResult({
          intent,
          message: 'Open the Home page to see your Focus widget (top tasks by due date and weight).',
        });
        return;
      }
      if (intent.type === 'query_needed_final') {
        const course = intent.courseCode
          ? courses.find((c) => c.code.toUpperCase() === intent.courseCode?.toUpperCase())
          : courses[0];
        if (!course) {
          setResult({ intent, message: 'No course found. Add a course or specify course code (e.g. COMP2401).' });
          return;
        }
        const courseTasks = allSchoolTasks.filter((t) => t.course_id === course.id);
        const finalTask = courseTasks.find((t) => (t.type || '').toLowerCase() === 'final');
        if (!finalTask?.grade?.weight_percent) {
          setResult({ intent, message: `${course.code}: No final exam with weight found. Add a Final task with weight.` });
          return;
        }
        const nonFinal = courseTasks.filter((t) => t.id !== finalTask.id);
        const known = computeProjectedOverall(nonFinal);
        const target = intent.targetPercent ?? course.target_grade_default ?? 90;
        const needed = computeNeededFinal({
          target,
          knownContribution: known,
          finalWeightPercent: Number(finalTask.grade.weight_percent),
        });
        const msg =
          needed === null
            ? `${course.code}: Cannot compute (check weights).`
            : `To get ${target}% in ${course.code}, you need ${needed.toFixed(1)}% on the final (weight ${finalTask.grade.weight_percent}%).`;
        setResult({ intent, message: msg });
        return;
      }
      if (intent.type === 'query_drop_lowest') {
        const course = courses.find((c) => c.code.toUpperCase() === intent.courseCode);
        if (!course) {
          setResult({ intent, message: `Course ${intent.courseCode} not found.` });
          return;
        }
        setResult({
          intent,
          message: `Open ${course.code} to add or edit "Drop lowest" rules in the Course rules section. No data will be changed here.`,
          confirmAction: () => {
            navigate('/school');
            onClose();
            setResult(null);
            setInput('');
          },
        });
        return;
      }
      if (intent.type === 'add_task') {
        const courseId = intent.courseCode
          ? courses.find((c) => c.code.toUpperCase() === intent.courseCode?.toUpperCase())?.id
          : null;
        const preview = [
          `Create task: "${intent.title}"`,
          intent.dueAt ? `Due: ${new Date(intent.dueAt).toLocaleString()}` : null,
          intent.courseCode ? `Course: ${intent.courseCode}` : 'No course',
          intent.isRecurring ? 'Recurring (create in Life to set schedule)' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        setResult({
          intent,
          message: preview,
          confirmAction: async () => {
            try {
              await createTask.mutateAsync({
                title: intent.title,
                due_at: intent.dueAt ?? undefined,
                course_id: courseId ?? undefined,
                workspace: courseId ? 'school' : 'life',
                status: 'todo',
              });
              setResult({ intent, message: 'Task created.' });
              setInput('');
              setTimeout(() => onClose(), 800);
            } catch (e) {
              setResult({ intent, message: 'Failed: ' + String((e as Error).message) });
            }
          },
        });
        return;
      }
      if (intent.type === 'ambiguous') {
        setResult({ intent, message: intent.message });
        return;
      }
      setResult({ intent, message: 'Try "Add assignment in COMP2401 due Friday 11:59" or "What do I need on the final?"' });
    },
    [courses, allSchoolTasks, createTask, navigate, onClose]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const intent = parseCommand(input, pageContext);
    runQuery(intent);
  };

  useEffect(() => {
    if (!isOpen) {
      setInput('');
      setResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 px-4" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-xl shadow-xl w-full max-w-xl overflow-hidden"
        role="dialog"
        aria-label="Command Center"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="text-muted-foreground">⌘K</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add task, ask 'what should I focus?', 'what do I need on final?', 'drop lowest COMP2401'..."
              className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
              autoFocus
            />
          </div>
        </form>
        {result && (
          <div className="p-4 border-t border-border">
            <p className="text-sm text-foreground whitespace-pre-wrap">{result.message}</p>
            {result.confirmAction && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={result.confirmAction}
                  className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          Examples: Add assignment in COMP2401 due Friday 11:59 · What do I need on the final? · Drop lowest quiz in COMP2401
        </div>
      </div>
    </div>
  );
}
