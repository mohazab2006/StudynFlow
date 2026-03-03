interface RecurringDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteInstance: () => void;
  onDeleteInstanceAndFuture: () => void;
  taskTitle: string;
  taskDate: string | null;
}

export default function RecurringDeleteDialog({
  isOpen,
  onClose,
  onDeleteInstance,
  onDeleteInstanceAndFuture,
  taskTitle,
  taskDate,
}: RecurringDeleteDialogProps) {
  if (!isOpen) return null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-2">Delete Recurring Task</h3>
        <p className="text-sm text-muted-foreground mb-6">
          <strong>{taskTitle}</strong>
          {taskDate && <><br />{formatDate(taskDate)}</>}
        </p>
        <div className="space-y-3">
          <button
            onClick={() => {
              onDeleteInstance();
              onClose();
            }}
            className="w-full px-4 py-3 bg-secondary rounded-lg text-left hover:bg-secondary/80 transition-colors"
          >
            <div className="font-medium">Delete this occurrence only</div>
            <div className="text-sm text-muted-foreground mt-1">
              Only this specific task will be deleted
            </div>
          </button>
          <button
            onClick={() => {
              onDeleteInstanceAndFuture();
              onClose();
            }}
            className="w-full px-4 py-3 bg-secondary rounded-lg text-left hover:bg-secondary/80 transition-colors"
          >
            <div className="font-medium">Delete this and all future occurrences</div>
            <div className="text-sm text-muted-foreground mt-1">
              This task and all future instances will be deleted
            </div>
          </button>
        </div>
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-secondary rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

















