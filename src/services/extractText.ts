/**
 * Extract plain text from uploaded files: PDF (pdfjs-dist), image (Tesseract.js OCR), .txt direct.
 * Used by the Course Import Wizard only.
 */

export type ExtractResult = { text: string; error?: string };

export type ExtractProgressCallback = (message: string) => void;

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

export async function extractTextFromFile(
  file: File,
  onProgress?: ExtractProgressCallback,
  signal?: AbortSignal | null
): Promise<ExtractResult> {
  throwIfAborted(signal);
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();

  if (type === 'text/plain' || name.endsWith('.txt')) {
    try {
      onProgress?.('Reading text file…');
      const text = await file.text();
      return { text: text.trim() };
    } catch (e) {
      return { text: '', error: String((e as Error).message) };
    }
  }

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractTextFromPdf(file, onProgress, signal);
  }

  if (
    type.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
  ) {
    onProgress?.('Running OCR on image…');
    return extractTextFromImage(file, signal);
  }

  return { text: '', error: 'Unsupported file type. Use PDF, image, or .txt' };
}

let pdfWorkerSrc: string | null = null;

async function getPdfWorkerSrc(): Promise<string> {
  if (pdfWorkerSrc) return pdfWorkerSrc;
  try {
    // @ts-expect-error Vite ?url import
    const m = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    const url = (m as any).default;
    pdfWorkerSrc = url;
    return url;
  } catch {
    const cdn = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    pdfWorkerSrc = cdn;
    return cdn;
  }
}

async function extractTextFromPdf(
  file: File,
  onProgress?: ExtractProgressCallback,
  signal?: AbortSignal | null
): Promise<ExtractResult> {
  throwIfAborted(signal);
  onProgress?.('Loading PDF engine…');
  const pdfjsLib = await import('pdfjs-dist');
  throwIfAborted(signal);
  onProgress?.('Starting PDF worker…');
  const workerUrl = await getPdfWorkerSrc();
  const worker = new Worker(workerUrl, { type: 'module' });
  const pdfWorker = (pdfjsLib as any).PDFWorker?.fromPort?.({ port: worker }) ?? null;

  try {
    throwIfAborted(signal);
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const sizeStr = file.size >= 1024 * 1024 ? `${sizeMB} MB` : `${(file.size / 1024).toFixed(0)} KB`;
    onProgress?.(`Reading file into memory (${sizeStr})…`);
    const arrayBuffer = await file.arrayBuffer();
    throwIfAborted(signal);
    onProgress?.('Opening document… (1–2 min for large PDFs)');
    const doc = await pdfjsLib.getDocument(
      pdfWorker ? { data: arrayBuffer, worker: pdfWorker } : { data: arrayBuffer }
    ).promise;
    throwIfAborted(signal);
    const numPages = doc.numPages;
    const parts: string[] = [];
    for (let i = 1; i <= numPages; i++) {
      throwIfAborted(signal);
      onProgress?.(`Extracting page ${i} of ${numPages}…`);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => (item.str ?? ''))
        .join(' ');
      parts.push(pageText);
    }
    return { text: parts.join('\n\n').trim() };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { text: '', error: 'PDF extraction failed: ' + String((e as Error).message) };
  } finally {
    if (pdfWorker?.destroy) pdfWorker.destroy();
    else worker.terminate();
  }
}

async function extractTextFromImage(
  file: File,
  signal?: AbortSignal | null
): Promise<ExtractResult> {
  throwIfAborted(signal);
  try {
    const Tesseract = await import('tesseract.js');
    throwIfAborted(signal);
    const result = await Tesseract.recognize(file, 'eng', {
      logger: () => {},
    });
    return { text: (result.data?.text ?? '').trim() };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { text: '', error: 'OCR failed: ' + String((e as Error).message) };
  }
}

export async function extractTextFromFiles(
  files: File[],
  options?: { onProgress?: ExtractProgressCallback; signal?: AbortSignal | null }
): Promise<{ combined: string; errors: string[] }> {
  const parts: string[] = [];
  const errors: string[] = [];
  const { onProgress, signal } = options ?? {};
  throwIfAborted(signal);
  for (let i = 0; i < files.length; i++) {
    throwIfAborted(signal);
    const file = files[i];
    onProgress?.(`Processing ${file.name} (${i + 1} of ${files.length})…`);
    const r = await extractTextFromFile(file, onProgress, signal);
    if (r.text) parts.push(r.text);
    if (r.error) errors.push(`${file.name}: ${r.error}`);
  }
  return {
    combined: parts.join('\n\n---\n\n'),
    errors,
  };
}
