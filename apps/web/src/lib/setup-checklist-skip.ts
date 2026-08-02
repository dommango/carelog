/**
 * "Skip for now" state for the finish-setting-up prompt.
 *
 * Stored per device in localStorage rather than on the care circle: skipping is
 * a personal preference about one person's screen, not a fact about the
 * patient, and it must not need a round trip to take effect.
 *
 * We store *how far along setup was* when it was skipped rather than a plain
 * flag. Finishing another step brings the prompt back once, so skipping can
 * never strand someone with no way to see the remaining steps — which a
 * one-way boolean would.
 */
export const SETUP_SKIP_KEY = 'carelog:setup-checklist-skipped-at';

/** Parses the stored value, treating anything unexpected as "never skipped". */
export function parseSkippedAt(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Hidden only while setup has not moved on since the skip. `completeCount` is
 * the checklist's server-derived progress, so this stays correct across
 * devices even though the skip itself is local.
 */
export function isSkipped(raw: string | null, completeCount: number): boolean {
  const skippedAt = parseSkippedAt(raw);
  if (skippedAt === null) return false;
  return completeCount <= skippedAt;
}

/*
 * Browser plumbing for the value above. Exposed as a `useSyncExternalStore`
 * source so the component reads it without a hydration mismatch and without
 * setting state from an effect: the server snapshot is always "never skipped",
 * and React reconciles the real value right after hydration.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Holds the skip for this session when localStorage is unavailable. */
let memorySkip: string | null = null;

/** Snapshot is a primitive, so re-reading storage each render stays stable. */
export function getSkipSnapshot(): string | null {
  try {
    return window.localStorage.getItem(SETUP_SKIP_KEY);
  } catch {
    // Private mode or blocked storage: fall back to this session only.
    return memorySkip;
  }
}

export function getSkipServerSnapshot(): string | null {
  return null;
}

export function subscribeToSkip(listener: Listener): () => void {
  listeners.add(listener);
  // Keeps other tabs in step when someone skips on one of them.
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETUP_SKIP_KEY) listener();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function recordSkip(completeCount: number): void {
  const value = String(completeCount);
  memorySkip = value;
  try {
    window.localStorage.setItem(SETUP_SKIP_KEY, value);
  } catch {
    // Can't persist it; memorySkip still hides it for this session.
  }
  listeners.forEach((listener) => listener());
}
