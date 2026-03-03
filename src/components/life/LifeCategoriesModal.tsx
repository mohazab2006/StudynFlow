import { useMemo, useState } from 'react';
import ColorPicker from '../ui/ColorPicker';
import { useCreateLifeCategory, useDeleteLifeCategory, useLifeCategories, useUpdateLifeCategory } from '../../hooks/useLifeCategories';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function LifeCategoriesModal({ isOpen, onClose }: Props) {
  const { data: categories = [] } = useLifeCategories();
  const createCat = useCreateLifeCategory();
  const updateCat = useUpdateLifeCategory();
  const deleteCat = useDeleteLifeCategory();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Life Categories</div>
            <div className="text-xs text-muted-foreground">Used to group life tasks like Workout, Errands, etc.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories…"
            className="w-full px-3 py-2 bg-muted/40 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[44px_1fr_44px] bg-muted/40 text-xs text-muted-foreground">
              <div className="px-3 py-2">Color</div>
              <div className="px-3 py-2">Name</div>
              <div className="px-3 py-2 text-right"> </div>
            </div>

            <div className="divide-y divide-border">
              {filtered.map((c) => (
                <div key={c.id} className="grid grid-cols-[44px_1fr_44px] items-center">
                  <div className="px-3 py-2">
                    <button
                      type="button"
                      className="w-5 h-5 rounded-sm border border-border"
                      style={{ backgroundColor: c.color }}
                      title="Change color"
                      onClick={() => {
                        // quick convenience: prefill the add row with this value for easy update via blur below
                        setNewColor(c.color);
                        setNewName(c.name);
                      }}
                    />
                  </div>
                  <div className="px-3 py-2">
                    <input
                      defaultValue={c.name}
                      onBlur={(e) => {
                        const name = e.target.value.trim();
                        if (!name || name === c.name) return;
                        updateCat.mutate({ id: c.id, name });
                      }}
                      className="w-full bg-transparent text-sm px-2 py-1 rounded-md hover:bg-muted/40 focus:bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    />
                  </div>
                  <div className="px-3 py-2 flex justify-end">
                    <button
                      type="button"
                      className="w-8 h-8 rounded-md hover:bg-muted text-muted-foreground hover:text-red-500"
                      title="Delete category"
                      onClick={() => {
                        if (confirm(`Delete "${c.name}"? Tasks will be unlinked (not deleted).`)) {
                          deleteCat.mutate(c.id);
                        }
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              {filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No matching categories.</div>
              ) : null}
            </div>
          </div>

          <div className="border border-border rounded-lg p-4 bg-muted/30">
            <div className="text-sm font-medium mb-3">Add a category</div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Workout"
                className="flex-1 min-w-[220px] px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <button
                type="button"
                onClick={() => {
                  const name = newName.trim();
                  if (!name) return;
                  createCat.mutate({ name, color: newColor });
                  setNewName('');
                }}
                className="px-3 py-2 rounded-md bg-foreground text-background text-sm hover:opacity-90"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


























