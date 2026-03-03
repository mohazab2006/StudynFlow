/**
 * Save uploaded course outline/calendar files to app data dir (Tauri).
 * Used after user confirms import; files are never re-processed automatically.
 */

const ASSET_DIR = 'studynflow/course_assets';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function saveCourseAssetFile(
  assetId: string,
  fileName: string,
  fileBytes: Uint8Array
): Promise<string> {
  const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
  const { BaseDirectory } = await import('@tauri-apps/api/path');
  await mkdir(ASSET_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  const safeName = sanitizeFileName(fileName);
  const relativePath = `${ASSET_DIR}/${assetId}_${safeName}`;
  await writeFile(relativePath, fileBytes, { baseDir: BaseDirectory.AppData });
  return relativePath;
}
