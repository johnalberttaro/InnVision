import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
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
 * MIGRATED TO SUPABASE. The preference now lives in profiles.dark_mode
 * instead of Firestore's guests/{uid}.darkMode — that Firestore path was
 * keyed by a Firebase uid that no longer exists anywhere in the new
 * Supabase-based identity system, so this had been silently
 * non-functional (toggling worked in-session, but never actually
 * persisted anywhere real) since the rest of the app moved over.
 *
 * One real difference from the Firestore version: Supabase Realtime's
 * postgres_changes only pushes FUTURE changes, not the row's current
 * value at subscribe time, the way Firestore's onSnapshot does. So step
 * 2 below is now two parts — an explicit initial SELECT once userId is
 * known, then a realtime subscription for changes after that (e.g. the
 * user toggling dark mode on a different device mid-session).
 *
 * PERSISTENCE STRATEGY:
 *   1. On app boot, read the cached preference from AsyncStorage
 *      immediately — this is what makes the correct theme show up
 *      instantly on launch, before Supabase has even responded.
 *   2. Once a user is logged in (userId becomes available), fetch
 *      profiles.dark_mode once, then subscribe to further live changes.
 *      If it differs from the cached value (e.g. the user changed it on
 *      another device), the live Supabase value wins and the cache is
 *      updated to match.
 *   3. Toggling calls setDarkMode(), which updates local state
 *      immediately (instant UI change, no waiting on the network),
 *      writes to AsyncStorage, and — if logged in — writes to Supabase
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

  // 2. Fetch the current preference once logged in, then subscribe to
  // further live changes — keeps the preference in sync across
  // devices/sessions for this account.
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const loadInitial = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('dark_mode')
        .eq('id', userId)
        .single();
      if (!cancelled && !error && data && typeof data.dark_mode === 'boolean') {
        setIsDark(data.dark_mode);
        AsyncStorage.setItem(CACHE_KEY, String(data.dark_mode)).catch(() => {});
      } else if (error) {
        console.warn('Theme preference fetch failed:', error);
      }
    };
    loadInitial();

    const channel = supabase
      .channel(`theme-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          if (typeof payload.new?.dark_mode === 'boolean') {
            setIsDark(payload.new.dark_mode);
            AsyncStorage.setItem(CACHE_KEY, String(payload.new.dark_mode)).catch(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // 3. Toggle — instant local update, then persist to cache + Supabase.
  const setDarkMode = useCallback(async (nextValue) => {
    setIsDark(nextValue); // instant, drives the re-render across the app
    try {
      await AsyncStorage.setItem(CACHE_KEY, String(nextValue));
    } catch (err) {
      console.warn('Failed to cache theme preference:', err);
    }
    if (userId) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ dark_mode: nextValue })
          .eq('id', userId);
        if (error) throw error;
      } catch (err) {
        console.warn('Failed to save theme preference to Supabase:', err);
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