import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { lightColors, darkColors, spacing, radius, fonts } from '../utils/theme';

/**
 * Centralized theme system for the entire user-facing app.
 *
 * WHY THIS EXISTS:
 * Colors used to be a static import (`import { colors } from utils/theme`)
 * baked into each screen's StyleSheet.create() at module-load time. That
 * can't react to a runtime toggle — a plain JS import never re-runs. This
 * context is the fix: any screen that wants dark mode support calls
 * useTheme() INSIDE its component body (not at module scope), which
 * returns the current palette and re-renders that screen automatically
 * whenever the theme changes anywhere in the app.
 *
 * PERSISTENCE STRATEGY:
 *   1. On app boot, read the cached preference from AsyncStorage
 *      immediately — this is what makes the correct theme show up
 *      instantly on launch, before Firestore has even responded.
 *   2. Once a user is logged in (userId becomes available), subscribe
 *      live to guests/{uid}.darkMode in Firestore. If it differs from the
 *      cached value (e.g. the user changed it on another device), the
 *      live Firestore value wins and the cache is updated to match.
 *   3. Toggling calls setDarkMode(), which updates local state
 *      immediately (instant UI change, no waiting on the network),
 *      writes to AsyncStorage, and — if logged in — writes to Firestore
 *      so the preference follows the user across devices and app
 *      restarts.
 *
 * HOW A SCREEN ADOPTS DARK MODE:
 *   const { colors, spacing, radius, fonts } = useTheme();
 *   const styles = getStyles(colors); // call this INSIDE the component,
 *                                      // not at module scope, so it
 *                                      // recomputes when colors change.
 *
 * Any screen still doing `import { colors } from 'utils/theme'` at the
 * top of the file will keep rendering in light mode regardless of this
 * provider — that's expected until that screen is individually migrated.
 */

const CACHE_KEY = 'innvision:darkModePreference';

const ThemeContext = createContext({
  isDark: false,
  colors: lightColors,
  spacing,
  radius,
  fonts,
  themeLoading: true,
  setDarkMode: () => {},
});

export function ThemeProvider({ userId, children }) {
  const [isDark, setIsDark] = useState(false);
  const [themeLoading, setThemeLoading] = useState(true);

  // 1. Instant local cache read on boot, so the correct theme paints
  // before any network round-trip.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (!cancelled && cached !== null) {
          setIsDark(cached === 'true');
        }
      } catch (err) {
        console.warn('Failed to read cached theme preference:', err);
      } finally {
        if (!cancelled) setThemeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2. Live Firestore subscription once logged in — keeps the preference
  // in sync across devices/sessions for this account.
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'guests', userId),
      (snapshot) => {
        const data = snapshot.data();
        if (data && typeof data.darkMode === 'boolean') {
          setIsDark(data.darkMode);
          AsyncStorage.setItem(CACHE_KEY, String(data.darkMode)).catch(() => {});
        }
      },
      (err) => console.warn('Theme preference subscription failed:', err)
    );

    return unsubscribe;
  }, [userId]);

  // 3. Toggle — instant local update, then persist to cache + Firestore.
  const setDarkMode = useCallback(async (nextValue) => {
    setIsDark(nextValue); // instant, drives the re-render across the app
    try {
      await AsyncStorage.setItem(CACHE_KEY, String(nextValue));
    } catch (err) {
      console.warn('Failed to cache theme preference:', err);
    }
    if (userId) {
      try {
        await setDoc(
          doc(db, 'guests', userId),
          { darkMode: nextValue, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        console.warn('Failed to save theme preference to Firestore:', err);
      }
    }
  }, [userId]);

  const value = useMemo(() => ({
    isDark,
    colors: isDark ? darkColors : lightColors,
    spacing,
    radius,
    fonts,
    themeLoading,
    setDarkMode,
  }), [isDark, themeLoading, setDarkMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}