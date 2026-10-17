// accountRole.js — reads a signed-in account's role and status.
//
// Used by App.jsx (restoring a saved login) and LoginScreen.jsx (a fresh
// login) to decide which portal to open.
//
// Before: if this lookup failed for ANY reason (slow first request right
// after the dev server starts, a dropped connection, a session that hadn't
// finished restoring), both places quietly treated the person as a guest —
// so Front Desk / Admin / Housekeeping / Maintenance staff could land on
// the guest pages. Now the lookup is retried, and a lookup that still
// fails is reported as an error (the caller sends the person back to the
// login screen with LOOKUP_FAILED_MESSAGE) instead of guessing "guest".

import { supabase } from '../services/supabase';

export const LOOKUP_FAILED_MESSAGE =
  "We couldn't load your account details just now. Please check your internet connection and log in again.";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns { role, active } for the account, or throws if it can't be read
 * after a few tries. An account with no profile row yet (brand-new guest
 * sign-up) comes back as { role: 'guest', active: true }.
 */
export async function fetchAccountRole(userId, { attempts = 3 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', userId)
      .maybeSingle();
    if (!error) {
      return {
        role: data?.role || 'guest',
        active: data?.active !== false,
      };
    }
    lastError = error;
    if (attempt < attempts - 1) await wait(600 * (attempt + 1));
  }
  throw lastError || new Error('Role lookup failed');
}

// Which screen each role opens on.
export function screenForRole(role) {
  switch (role) {
    case 'admin': return 'admin';
    case 'frontdesk': return 'frontdesk';
    case 'housekeeping': return 'housekeeping';
    case 'maintenance': return 'maintenance';
    default: return 'home';
  }
}
