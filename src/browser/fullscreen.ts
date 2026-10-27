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

function legacyTransition(action: () => Promise<void> | void, expectedActive: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      for (const [type, listener] of listeners) document.removeEventListener(type, listener, true);
    };
    const failed = (error: unknown) => { cleanup(); reject(error); };
    const changed = () => { if (fullscreenState().active === expectedActive) { cleanup(); resolve(); } };
    const error = () => failed(new Error('WebKit fullscreenerror: fullscreen transition rejected'));
    const listeners: readonly [string, EventListener][] = [['fullscreenchange', changed], ['webkitfullscreenchange', changed],
      ['fullscreenerror', error], ['webkitfullscreenerror', error]];
    const timer = setTimeout(() => failed(new Error('Fullscreen transition timed out')), 4000);
    for (const [type, listener] of listeners) document.addEventListener(type, listener, true);
    try {
      const pending = action();
      if (pending) void pending.then(changed, failed);
      changed();
    } catch (error) { failed(error); }
  });
}

export async function toggleFullscreen(): Promise<'changed' | 'unsupported' | 'failed'> {
  lastError = null;
  const state = fullscreenState();
  if (!state.standard && !state.prefixed) return 'unsupported';
  try {
    if (state.standard) {
      if (state.active) await document.exitFullscreen();
      else await root.requestFullscreen();
    } else {
      const action = state.active ? legacyDocument.webkitExitFullscreen!.bind(document) : root.webkitRequestFullscreen!.bind(root);
      await legacyTransition(action, !state.active);
    }
    return 'changed';
  } catch (error) {
    lastError = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : String(error).slice(0, 300);
    return 'failed';
  }
}
