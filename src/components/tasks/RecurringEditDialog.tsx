interface RecurringEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEditInstance: () => void;
  onEditSeries: () => void;
  taskTitle: string;
}

export default function RecurringEditDialog({
  isOpen,
  onClose,
  onEditInstance,
  onEditSeries,
  taskTitle,
}: RecurringEditDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg w-full max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">Edit Recurring Task</h3>
        <p className="text-sm text-muted-foreground mb-6">
          This task is part of a recurring series: <strong>{taskTitle}</strong>
        </p>
        <div className="space-y-3">
          <button
            onClick={() => {
              onEditInstance();
              onClose();
            }}
            className="w-full px-4 py-3 bg-secondary rounded-lg text-left hover:bg-secondary/80 transition-colors"
          >
            <div className="font-medium">Edit this occurrence only</div>
            <div className="text-sm text-muted-foreground mt-1">
              Changes will only affect this specific task
            </div>
          </button>
          <button
            onClick={() => {
              onEditSeries();
              onClose();
            }}
            className="w-full px-4 py-3 bg-secondary rounded-lg text-left hover:bg-secondary/80 transition-colors"
          >
            <div className="font-medium">Edit entire series</div>
            <div className="text-sm text-muted-foreground mt-1">
              Changes will affect all future occurrences (past and overridden instances won't change)
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

















