// @ts-check

// Small per-device preferences. Every access is guarded: storage can be unavailable (private browsing) or full.

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function readPref(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function writePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted; the app keeps working for this session.
  }
}

/** @param {string} key */
export function removePref(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing could have been saved anyway.
  }
}
