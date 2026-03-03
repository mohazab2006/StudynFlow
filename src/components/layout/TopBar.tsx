import { useState } from 'react';
import { useCreateTask } from '../../hooks/useTasks';
import ImportOutlineWizard from '../import/ImportOutlineWizard';

interface TopBarProps {
  onOpenCommand?: () => void;
}

export default function TopBar({ onOpenCommand }: TopBarProps) {
  const [quickAddValue, setQuickAddValue] = useState('');
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const createTask = useCreateTask();

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddValue.trim()) return;

    try {
      await createTask.mutateAsync({
        title: quickAddValue.trim(),
        status: 'todo',
      });
      setQuickAddValue('');
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  return (
    <>
      <header className="border-b border-border bg-background px-8 pt-4 pb-5">
        <div className="rounded-xl border border-border bg-muted/40 shadow-sm flex items-stretch gap-0 overflow-hidden">
          <form onSubmit={handleQuickAdd} className="flex-1 flex min-w-0">
            <input
              type="text"
              value={quickAddValue}
              onChange={(e) => setQuickAddValue(e.target.value)}
              placeholder="Add a task..."
              className="flex-1 min-w-0 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-0 border-0"
            />
          </form>
          <div className="flex items-center gap-2 border-l border-border px-2 py-1.5">
            <button
              type="button"
              onClick={onOpenCommand}
              className="rounded-lg border border-border bg-muted hover:bg-muted/80 px-3 py-2 text-sm font-medium text-muted-foreground whitespace-nowrap transition-colors"
              title="Command Center (Ctrl+K)"
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

