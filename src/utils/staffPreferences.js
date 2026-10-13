import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * staffPreferences — tiny on/off preference store for the staff portals
 * (Admin, Front Desk), backed by AsyncStorage (localStorage on
 * web), so a choice made on the Settings page survives a reload. Saved per
 * device/browser, not per account.
 *
 * Keys in use:
 *  - 'showDateWeather' (default true)  DashboardNavbar's clock/weather cluster
 *  - 'confirmLogout'   (default true)  confirm dialog on the sidebar's power icon
 *
 * getPref() is synchronous (reads an in-memory cache); the cache is warmed
 * from storage as soon as this module loads, and every usePref() consumer
 * re-renders when a value changes or finishes loading.
 */
const PREFIX = 'innvision.pref.';
const KNOWN_KEYS = ['showDateWeather', 'confirmLogout'];

const cache = {};
const attempted = {};
const listeners = new Set();

function notify() {
  listeners.forEach((l) => l());
}

function load(key) {
  if (attempted[key]) return;
  attempted[key] = true;
  AsyncStorage.getItem(PREFIX + key)
    .then((v) => {
      if (v !== null && !(key in cache)) {
        cache[key] = v === '1';
        notify();
      }
    })
    .catch(() => {});
}

export function getPref(key, fallback) {
  load(key);
  return key in cache ? cache[key] : fallback;
}

export function setPref(key, value) {
  cache[key] = !!value;
  notify();
  AsyncStorage.setItem(PREFIX + key, value ? '1' : '0').catch(() => {});
}

export function usePref(key, fallback) {
  const [value, setValue] = useState(() => getPref(key, fallback));
  useEffect(() => {
    const listener = () => setValue(getPref(key, fallback));
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, [key, fallback]);
  return [value, (next) => setPref(key, next)];
}

KNOWN_KEYS.forEach(load);