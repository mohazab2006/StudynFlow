import { useState, useCallback, useRef, useEffect } from 'react';
import { useCourses } from '../../hooks/useCourses';
import { useCreateTask } from '../../hooks/useTasks';
import { useUpsertTaskGrade } from '../../hooks/useGrades';
import { useTaskTypes } from '../../hooks/useTaskTypes';
import { useUpsertCourseProfile } from '../../hooks/useCourseProfile';
import { extractTextFromFiles } from '../../services/extractText';
import { parseOutlineText } from '../../services/outlineParser';
import { extractProfileFromText } from '../../services/courseProfileExtract';
import { extractTasksFromOutline } from '../../services/ai';
import { hasAIConfigured } from '../../services/aiSettings';
import { saveCourseAssetFile } from '../../services/courseAssetFs';
import * as courseAssetsRepo from '../../db/courseAssets.repo';
import type { ParsedOutlineRow } from '../../lib/types';
import { TaskSource } from '../../lib/types';

type Step = 'source' | 'parse' | 'review';

interface ImportOutlineWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ImportOutlineWizard({ isOpen, onClose, onSuccess }: ImportOutlineWizardProps) {
  const [step, setStep] = useState<Step>('source');
  const [courseId, setCourseId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [combinedText, setCombinedText] = useState('');
  const [extractErrors, setExtractErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedOutlineRow[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extractParseError, setExtractParseError] = useState<string | null>(null);
  const [useAIExtract, setUseAIExtract] = useState(false);
  const extractAbortRef = useRef<AbortController | null>(null);
  const [extractElapsedSec, setExtractElapsedSec] = useState(0);
  const extractStartRef = useRef<number>(0);
  const aiConfigured = hasAIConfigured();

  // Update elapsed time every second while extracting so user sees real progress
  useEffect(() => {
    if (!extracting) {
      setExtractElapsedSec(0);
      return;
    }
    extractStartRef.current = Date.now();
    setExtractElapsedSec(0);
    const tick = () => setExtractElapsedSec(Math.floor((Date.now() - extractStartRef.current) / 1000));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [extracting]);

  const { data: courses = [] } = useCourses();
  const createTask = useCreateTask();
  const upsertGrade = useUpsertTaskGrade();
  const { data: taskTypes = [] } = useTaskTypes();
  const upsertCourseProfile = useUpsertCourseProfile(null);

  const typeNames = taskTypes.map((t) => t.name);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    setFiles(Array.from(list));
  };

  const runExtractAndParse = useCallback(async () => {
    extractAbortRef.current?.abort();
    const controller = new AbortController();
    extractAbortRef.current = controller;
    setExtracting(true);
    setExtractProgress(null);
    setExtractErrors([]);
    setExtractParseError(null);
    try {
      let text = pastedText.trim();
      if (files.length > 0) {
        const { combined, errors } = await extractTextFromFiles(files, {
          onProgress: setExtractProgress,
          signal: controller.signal,
        });
        setExtractErrors(errors);
        text = text ? `${text}\n\n${combined}` : combined;
      }
      setCombinedText(text);
      if (text) {
        let parsed = parseOutlineText(text);
        if (useAIExtract && aiConfigured) {
          try {
            setExtractProgress('Using AI to extract tasks…');
            const aiRows = await extractTasksFromOutline(text, { signal: controller.signal });
            if (aiRows.length > 0) parsed = aiRows;
          } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') throw e;
            console.warn('AI extraction failed, using rule-based parse:', e);
          }
        }
        if (courseId && text.trim()) {
          try {
            const extracted = extractProfileFromText(text);
            await upsertCourseProfile.mutateAsync({ course_id: courseId, ...extracted });
          } catch (e) {
            console.warn('Profile extraction failed:', e);
          }
        }
        setRows(parsed);
        setStep('review');
      } else {
        setRows([]);
        setExtractParseError('No text to parse. Add pasted text or upload PDF/image/.txt files.');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // User cancelled; don't show error
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      setExtractParseError(message);
      setRows([]);
      console.error('Extract/parse failed:', e);
    } finally {
      setExtracting(false);
      setExtractProgress(null);
      extractAbortRef.current = null;
    }
  }, [files, pastedText, useAIExtract, aiConfigured]);

  const cancelExtractAndClose = useCallback(() => {
    extractAbortRef.current?.abort();
    resetWizard();
    onClose();
  }, [onClose]);

  const goToReview = () => {
    setExtractParseError(null);
    try {
      if (combinedText.trim()) {
        const parsed = parseOutlineText(combinedText);
        setRows(parsed);
      } else {
        setRows([]);
      }
      setStep('review');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setExtractParseError(message);
      console.error('Parse failed:', e);
    }
  };

  const updateRow = (id: string, patch: Partial<ParsedOutlineRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const setBulkType = (type: string) => {
    setRows((prev) => prev.map((r) => (r.include ? { ...r, type } : r)));
  };

  const setBulkWeight = (weight: number | null) => {
    setRows((prev) => prev.map((r) => (r.include ? { ...r, weight_percent: weight } : r)));
  };

  const toggleAllInclude = (include: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, include })));
  };

  const handleConfirm = async () => {
    const toCreate = rows.filter((r) => r.include);
    if (toCreate.length === 0) {
      alert('Select at least one task to create.');
      return;
    }
    setSaving(true);
    try {
      const finalCourseId = courseId;
      for (const row of toCreate) {
        const task = await createTask.mutateAsync({
          title: row.title,
          description: [row.notes, row.suggestion_note].filter(Boolean).join('\n') || undefined,
          due_at: row.due_at || undefined,
          type: typeNames.includes(row.type) ? (row.type as any) : 'Other',
          course_id: finalCourseId ?? undefined,
          status: 'todo',
          source: TaskSource.IMPORTED_OUTLINE,
          workspace: 'school',
        });
        await upsertGrade.mutateAsync({
          task_id: task.id,
          grade_percent: null,
          weight_percent: row.weight_percent,
          is_graded: false,
          counts: true,
        });
      }
      // Save uploaded files as course assets (Tauri only)
      for (const file of files) {
        try {
          const { generateId } = await import('../../lib/utils');
          const assetId = generateId();
          const bytes = new Uint8Array(await file.arrayBuffer());
          const relativePath = await saveCourseAssetFile(assetId, file.name, bytes);
          await courseAssetsRepo.createCourseAsset({
            id: assetId,
            course_id: finalCourseId,
            file_name: file.name,
            file_path: relativePath,
            content_type: file.type || null,
            file_size: file.size,
            asset_type: 'outline',
            source: null,
          });
        } catch (e) {
          console.warn('Could not save course asset file:', e);
        }
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Failed to create tasks: ' + String((e as Error).message));
    } finally {
      setSaving(false);
    }
  };

  const resetWizard = () => {
    setStep('source');
    setCourseId(null);
    setFiles([]);
    setPastedText('');
    setCombinedText('');
    setExtractErrors([]);
    setExtractParseError(null);
    setExtractProgress(null);
    setUseAIExtract(false);
    setRows([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-semibold">Import Outline</h2>
          <div className="flex items-center gap-2">
            {step !== 'source' && (
              <button
                type="button"
                onClick={() => (step === 'review' ? setStep('parse') : setStep('source'))}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={cancelExtractAndClose}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'source' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Course (optional)</label>
                <select
                  value={courseId ?? ''}
                  onChange={(e) => setCourseId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  <option value="">Unassigned (School inbox)</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} – {c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Leave unassigned to add tasks to the School inbox for later bulk assignment.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Upload files (PDF, image, or .txt)</label>
                <input
                  type="file"
                  accept=".pdf,.txt,image/*"
                  multiple
                  onChange={handleFileChange}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-3 file:rounded file:border file:border-border file:bg-muted"
                />
                {files.length > 0 && (
                  <ul className="mt-2 text-sm text-muted-foreground">
                    {files.map((f) => (
                      <li key={f.name}>{f.name}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Or paste outline/calendar text</label>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste course outline or calendar text here..."
                  className="w-full h-32 px-3 py-2 bg-background border border-border rounded-lg text-sm resize-y"
                />
              </div>
              {aiConfigured && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="use-ai-extract"
                    checked={useAIExtract}
                    onChange={(e) => setUseAIExtract(e.target.checked)}
                    className="rounded border-border"
                  />
                  <label htmlFor="use-ai-extract" className="text-sm text-foreground">
                    Use AI to extract tasks (better for messy syllabi)
                  </label>
                </div>
              )}
              <button
                type="button"
                onClick={runExtractAndParse}
                disabled={extracting || (files.length === 0 && !pastedText.trim())}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {extracting ? 'Extracting…' : 'Extract & Parse'}
              </button>
              {extracting && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span
                    className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
                    aria-hidden
                  />
                  <span>
                    {extractProgress ?? 'Starting…'}
                  </span>
                  <span className="tabular-nums text-muted-foreground/80">
                    {Math.floor(extractElapsedSec / 60)}:{String(extractElapsedSec % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
              {extracting && (
                <p className="text-xs text-muted-foreground">
                  The timer proves the app is working. First run loads the PDF engine; “Opening document” can take 1–2 min for large files.
                </p>
              )}
              {extractErrors.length > 0 && (
                <div className="text-sm text-destructive">
                  {extractErrors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
              {extractParseError && (
                <div className="text-sm text-destructive rounded-lg border border-border bg-muted p-3">
                  {extractParseError}
                </div>
              )}
            </div>
          )}

          {step === 'parse' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Parsed text (edit below if needed, then re-parse or go to Review).</p>
              <textarea
                value={combinedText}
                onChange={(e) => setCombinedText(e.target.value)}
                className="w-full h-48 px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono resize-y"
              />
              {extractParseError && (
                <div className="text-sm text-destructive rounded-lg border border-border bg-muted p-3">
                  {extractParseError}
                </div>
              )}
              <button
                type="button"
                onClick={goToReview}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
              >
                Parse & Review
              </button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Review and edit proposed tasks. Uncheck to exclude. Only checked rows will be created.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => toggleAllInclude(true)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-muted"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllInclude(false)}
                  className="px-2 py-1 text-xs border border-border rounded hover:bg-muted"
                >
                  Deselect all
                </button>
                <span className="text-xs text-muted-foreground self-center">Bulk type:</span>
                <select
                  onChange={(e) => e.target.value && setBulkType(e.target.value)}
                  className="px-2 py-1 text-xs border border-border rounded bg-background"
                >
                  <option value="">—</option>
                  {typeNames.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground self-center">Bulk weight %:</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder="—"
                  className="w-16 px-2 py-1 text-xs border border-border rounded bg-background"
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setBulkWeight(v === '' ? null : parseFloat(v));
                  }}
                />
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_100px_80px_140px_1fr_auto] gap-2 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>Include</div>
                  <div>Title</div>
                  <div>Type</div>
                  <div>Weight %</div>
                  <div>Due</div>
                  <div>Notes</div>
                  <div></div>
                </div>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[auto_1fr_100px_80px_140px_1fr_auto] gap-2 px-3 py-2 border-t border-border items-center text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => updateRow(r.id, { include: e.target.checked })}
                    />
                    <input
                      value={r.title}
                      onChange={(e) => updateRow(r.id, { title: e.target.value })}
                      className="bg-background border border-border rounded px-2 py-1 w-full"
                    />
                    <select
                      value={r.type}
                      onChange={(e) => updateRow(r.id, { type: e.target.value })}
                      className="bg-background border border-border rounded px-2 py-1"
                    >
                      {typeNames.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={r.weight_percent ?? ''}
                      onChange={(e) => updateRow(r.id, { weight_percent: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      className="bg-background border border-border rounded px-2 py-1 w-full"
                    />
                    <input
                      type="datetime-local"
                      value={r.due_at ? r.due_at.slice(0, 16) : ''}
                      onChange={(e) => updateRow(r.id, { due_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      className="bg-background border border-border rounded px-2 py-1 w-full"
                    />
                    <input
                      value={r.notes}
                      onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                      placeholder={r.suggestion_note || ''}
                      className="bg-background border border-border rounded px-2 py-1 w-full text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      className="text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">No tasks parsed. Go back and add text or files.</p>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setStep('parse')}
                  className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted"
                >
                  Back to text
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving || rows.filter((r) => r.include).length === 0}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create tasks'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
