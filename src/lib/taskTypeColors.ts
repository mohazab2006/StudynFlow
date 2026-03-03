import type { TaskTypeOption } from './types';

export function buildTaskTypeColorMap(types: TaskTypeOption[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of types) map[t.name] = t.color;
  return map;
}


























