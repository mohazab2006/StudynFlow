/**
 * AI (LLM) settings for natural-language quick add and outline extraction.
 * Uses build-time VITE_OPENAI_API_KEY so the app can ship with one key for all users.
 * No per-user API key; optional localStorage overrides for enabled/baseUrl/model only.
 */

const KEY_ENABLED = 'studynflow_ai_enabled';
const KEY_BASE_URL = 'studynflow_ai_base_url';
const KEY_MODEL = 'studynflow_ai_model';

/** Build-time API key (set in .env as VITE_OPENAI_API_KEY). Not shown in UI. */
function getBuiltInApiKey(): string {
  try {
    const key = import.meta.env?.VITE_OPENAI_API_KEY;
    return typeof key === 'string' && key.trim() ? key.trim() : '';
  } catch {
    return '';
  }
}

export interface AISettings {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** True when the key comes from build env (not user input). */
  usesBuiltInKey: boolean;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export function getAISettings(): AISettings {
  const builtIn = getBuiltInApiKey();
  if (typeof window === 'undefined') {
    return {
      enabled: !!builtIn,
      apiKey: builtIn,
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      usesBuiltInKey: !!builtIn,
    };
  }
  try {
    const storedEnabled = localStorage.getItem(KEY_ENABLED);
    const enabled = builtIn ? (storedEnabled !== 'false') : (storedEnabled === 'true');
    return {
      enabled,
      apiKey: builtIn,
      baseUrl: localStorage.getItem(KEY_BASE_URL) ?? DEFAULT_BASE_URL,
      model: localStorage.getItem(KEY_MODEL) ?? DEFAULT_MODEL,
      usesBuiltInKey: !!builtIn,
    };
  } catch {
    return {
      enabled: !!builtIn,
      apiKey: builtIn,
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      usesBuiltInKey: !!builtIn,
    };
  }
}

export function setAIEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY_ENABLED, String(enabled));
  } catch {
    /* ignore */
  }
}

export function setAIBaseUrl(baseUrl: string): void {
  try {
    localStorage.setItem(KEY_BASE_URL, baseUrl || DEFAULT_BASE_URL);
  } catch {
    /* ignore */
  }
}

export function setAIModel(model: string): void {
  try {
    localStorage.setItem(KEY_MODEL, model || DEFAULT_MODEL);
  } catch {
    /* ignore */
  }
}

export function hasAIConfigured(): boolean {
  const s = getAISettings();
  return s.enabled && !!s.apiKey?.trim();
}
