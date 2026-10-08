/** Session restoration and navigation policies, independent of the scene renderer. */
export const RETURN_STATE_KEY = 'arcade:return-state:v1';
export const RETURN_STATE_MAX_AGE_MS = 60 * 60 * 1000;

/** Keep Guide destinations absolute, public HTTPS links without credentials. */
export function getSafeGuideUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Validate legacy cabinet-index state; cabinetCount can bound it to the current catalog. */
export function validateReturnState(state, { now = Date.now(), cabinetCount = Infinity } = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  if (!Number.isInteger(state.cabinetIndex) || state.cabinetIndex < 0) return null;
  if (!(cabinetCount === Infinity || (Number.isInteger(cabinetCount) && cabinetCount >= 0))) return null;
  if (state.cabinetIndex >= cabinetCount) return null;
  if (!Number.isFinite(now) || !Number.isFinite(state.savedAt)) return null;
  const age = now - state.savedAt;
  if (age < 0 || age > RETURN_STATE_MAX_AGE_MS) return null;
  return { cabinetIndex: state.cabinetIndex, savedAt: state.savedAt };
}

export function readReturnState(storage, options = {}) {
  try {
    const raw = storage.getItem(RETURN_STATE_KEY);
    return raw ? validateReturnState(JSON.parse(raw), options) : null;
  } catch {
    return null;
  }
}

export function writeReturnState(storage, cabinetIndex, options = {}) {
  const now = options.now ?? Date.now();
  const state = validateReturnState({ cabinetIndex, savedAt: now }, { ...options, now });
  if (!state) return false;
  try {
    storage.setItem(RETURN_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    // Storage can be unavailable in private mode or at quota; navigation still works.
    return false;
  }
}

export function clearReturnState(storage) {
  try {
    storage.removeItem(RETURN_STATE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Stop and dispose the active scene before a same-tab game, guide, or Home visit. */
export async function navigateAfterDispose(destination, { dispose, navigate } = {}) {
  if (typeof destination !== 'string' || !destination.trim()) {
    throw new TypeError('A navigation destination is required.');
  }
  if (typeof dispose !== 'function' || typeof navigate !== 'function') {
    throw new TypeError('Navigation requires dispose and navigate callbacks.');
  }
  await dispose();
  return navigate(destination);
}
