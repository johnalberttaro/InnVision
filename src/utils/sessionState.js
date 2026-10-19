// sessionState.js — remembers where you were in THIS browser tab, so a page
// reload (the browser reloading a tab you left in the background, pull to
// refresh, or the installed app being reopened) brings you back to the same
// screen instead of the Home page.
//
// Uses sessionStorage: it belongs to one tab only, is cleared when the tab
// is closed, and is never shared with other people or devices. On phones
// running the native app (Expo Go) there is no sessionStorage, so these
// helpers simply do nothing there.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const PREFIX = 'innvision:';

function storage() {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null; // blocked by the browser (private mode, site data off)
  }
}

export function readSession(key, fallback = null) {
  const s = storage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeSession(key, value) {
  const s = storage();
  if (!s) return;
  try {
    if (value === undefined || value === null) s.removeItem(PREFIX + key);
    else s.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // full or blocked — not important, just won't be remembered
  }
}

/** Forget everything saved for this tab (used on log out). */
export function clearSession() {
  const s = storage();
  if (!s) return;
  try {
    Object.keys(s).filter((k) => k.startsWith(PREFIX)).forEach((k) => s.removeItem(k));
  } catch {
    // ignore
  }
}

/** useState that survives a page reload in this tab. */
export function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() => readSession(key, initialValue));
  useEffect(() => { writeSession(key, value); }, [key, value]);
  return [value, setValue];
}

/**
 * Inner tab of a screen that is opened at a tab chosen by its parent
 * (e.g. Reservations opened at "Check-ins" from the dashboard). Survives a
 * page reload, and still follows the parent when it picks a different tab.
 */
export function useTabState(key, fromParent) {
  const [tab, setTab] = useState(() => {
    const saved = readSession(key);
    return saved && saved.from === fromParent && saved.tab ? saved.tab : fromParent;
  });
  const [lastParent, setLastParent] = useState(fromParent);
  if (lastParent !== fromParent) {
    // Parent asked for a different tab: follow it.
    setLastParent(fromParent);
    setTab(fromParent);
  }
  useEffect(() => { writeSession(key, { from: fromParent, tab }); }, [key, fromParent, tab]);
  return [tab, setTab];
}
