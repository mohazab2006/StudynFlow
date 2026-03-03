import { useState } from 'react';
import { useCreateTask } from '../../hooks/useTasks';
import { useCourses } from '../../hooks/useCourses';
import { useUpsertTaskGrade } from '../../hooks/useGrades';
import ImportOutlineWizard from '../import/ImportOutlineWizard';
import { getVoiceSettings } from '../../services/voiceSettings';
import { getAISettings, hasAIConfigured } from '../../services/aiSettings';
import { parseQuickAdd } from '../../services/ai';
import { parseCommand } from '../../services/commandParser';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { TaskSource } from '../../lib/types';

interface TopBarProps {
  onOpenCommand?: () => void;
}

const LOOKS_LIKE_NL = /%|weight|assignment|quiz|lab|exam|midterm|final|in\s+[A-Z]{2,4}\d{4}/i;

export default function TopBar({ onOpenCommand }: TopBarProps) {
  const [quickAddValue, setQuickAddValue] = useState('');
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const createTask = useCreateTask();
  const upsertGrade = useUpsertTaskGrade();
  const { data: courses = [] } = useCourses();
  const voiceSettings = getVoiceSettings();
  const aiConfigured = hasAIConfigured();
  const {
    isSupported: voiceSupported,
    isListening,
    transcript: liveTranscript,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    language: voiceSettings.language,
    onResult(transcript, isFinal) {
      if (isFinal && transcript.trim()) setQuickAddValue(transcript.trim());
    },
  });
  const showVoice = voiceSettings.enabled && voiceSupported;
  const displayValue = isListening ? (liveTranscript || quickAddValue) : quickAddValue;
  const courseCodes = courses.map((c) => c.code);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = quickAddValue.trim();
    if (!raw || quickAddBusy) return;

    setQuickAddBusy(true);
    try {
      const useAI = aiConfigured && LOOKS_LIKE_NL.test(raw);
      if (useAI) {
        try {
          const { tasks } = await parseQuickAdd(raw, { courseCodes });
          if (tasks.length > 0 && (tasks.length > 1 || tasks[0].courseCode || tasks[0].weightPercent != null || tasks[0].type)) {
            for (const t of tasks) {
              const courseId = t.courseCode
                ? courses.find((c) => c.code.toUpperCase() === t.courseCode)?.id
                : null;
              const task = await createTask.mutateAsync({
                title: t.title,
                due_at: t.dueAt ?? undefined,
                course_id: courseId ?? undefined,
                workspace: courseId ? 'school' : 'life',
                status: 'todo',
                type: (t.type as any) ?? 'Other',
                source: TaskSource.AI_GENERATED,
              });
              if (task && courseId && (t.weightPercent != null || t.type)) {
                await upsertGrade.mutateAsync({
                  task_id: task.id,
                  grade_percent: null,
                  weight_percent: t.weightPercent ?? null,
                  is_graded: false,
                  counts: true,
                });
              }
            }
            setQuickAddValue('');
            return;
          }
        } catch (err) {
          console.warn('AI quick add failed, falling back:', err);
        }
      }

      const intent = parseCommand(raw);
      if (intent.type === 'add_task') {
        const courseId = intent.courseCode
          ? courses.find((c) => c.code.toUpperCase() === intent.courseCode)?.id
          : null;
        const task = await createTask.mutateAsync({
          title: intent.title,
          due_at: intent.dueAt ?? undefined,
          course_id: courseId ?? undefined,
          workspace: courseId ? 'school' : 'life',
          status: 'todo',
          type: (intent.taskType as any) ?? 'Other',
        });
        if (task && courseId && (intent.weightPercent != null || intent.taskType)) {
          await upsertGrade.mutateAsync({
            task_id: task.id,
            grade_percent: null,
            weight_percent: intent.weightPercent ?? null,
            is_graded: false,
            counts: true,
          });
        }
        setQuickAddValue('');
        return;
      }

      await createTask.mutateAsync({
        title: raw,
        status: 'todo',
      });
      setQuickAddValue('');
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setQuickAddBusy(false);
    }
  };

  return (
    <>
      <header className="border-b border-border bg-background px-8 pt-4 pb-5">
        <div className="rounded-xl border border-border bg-muted/40 shadow-sm flex items-stretch gap-0 overflow-hidden">
          <form onSubmit={handleQuickAdd} className="flex-1 flex min-w-0 items-center">
            <input
              type="text"
              value={displayValue}
              onChange={(e) => !isListening && setQuickAddValue(e.target.value)}
              placeholder={aiConfigured ? 'Add a task or e.g. "comp2401 assignment weight 8%"' : 'Add a task...'}
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-0 border-0"
              readOnly={isListening}
            />
            {showVoice && (
              <div className="pr-2 flex items-center">
                {isListening ? (
                  <button
                    type="button"
                    onClick={stopListening}
                    className="p-2 rounded-lg bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
                    title="Stop listening"
                    aria-label="Stop listening"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startListening}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Voice input"
                    aria-label="Voice input"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z M12 14v6" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </form>
          <div className="flex items-center gap-2 border-l border-border px-2 py-1.5">
            <button
              type="button"
              onClick={onOpenCommand}
              className="rounded-lg border border-border bg-muted hover:bg-muted/80 px-3 py-2 text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors"
              title="Command Center (Ctrl+K). Voice: Ctrl+Shift+V"
            >
              ⌘K
            </button>
            <button
              type="button"
              onClick={() => setImportWizardOpen(true)}
              className="rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors"
              title="Import course outline or calendar"
            >
              Import Outline
            </button>
          </div>
        </div>
      </header>
      <ImportOutlineWizard
        isOpen={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
      />
    </>
  );
}

