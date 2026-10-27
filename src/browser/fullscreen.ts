// Older iPadOS uses prefixed methods; their return value can be void.
const legacyDocument: Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void } = document;
const root: HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void } = document.documentElement;
let lastError: string | null = null;

export function fullscreenState() {
  return { active: Boolean(document.fullscreenElement ?? legacyDocument.webkitFullscreenElement),
    standard: typeof root.requestFullscreen === 'function' && typeof document.exitFullscreen === 'function',
    prefixed: typeof root.webkitRequestFullscreen === 'function' && typeof legacyDocument.webkitExitFullscreen === 'function',
    enabled: document.fullscreenEnabled ?? legacyDocument.webkitFullscreenEnabled ?? null, lastError };
}

export async function toggleFullscreen(): Promise<'changed' | 'unsupported' | 'failed'> {
  lastError = null;
  const state = fullscreenState();
  if (!state.standard && !state.prefixed) return 'unsupported';
  try {
    if (state.active) await (state.standard ? document.exitFullscreen : legacyDocument.webkitExitFullscreen)!.call(document);
    else await (state.standard ? root.requestFullscreen : root.webkitRequestFullscreen)!.call(root);
    return 'changed';
  } catch (error) {
    lastError = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : String(error).slice(0, 300);
    return 'failed';
  }
}
