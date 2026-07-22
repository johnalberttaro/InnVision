// src/services/supabase.js
// Replaces src/services/firebase.js. This is the ONE place that creates
// the Supabase client — everything else imports `supabase` from here,
// same pattern as the old `db`/`auth` exports from firebase.js.
//
// SETUP REQUIRED:
//   1. npm install @supabase/supabase-js @react-native-async-storage/async-storage
//   2. Create a `.env` file in your project root (see .env.example) with:
//        EXPO_PUBLIC_SUPABASE_URL=https://izmbcpqsbwtjyxjbkxwc.supabase.co
//        EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon public key from Project Settings > API>
//      Expo SDK 51+ reads EXPO_PUBLIC_* env vars natively — no extra config needed.
//      Restart `expo start` after adding/changing .env (env vars are read at build time).
//   3. Add `.env` to .gitignore if it isn't already — never commit the anon key
//      to a public repo, even though it's "public" it's still project-specific.

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud failure instead of a confusing "Failed to fetch" deep inside
  // some screen later — same spirit as Firebase throwing on a missing
  // config field.
  console.error(
    'Missing Supabase env vars. Did you create a .env file with ' +
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, and restart expo start?'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // AsyncStorage on native (iOS/Android via Expo Go); the browser's own
    // localStorage on web (Supabase's default when `storage` is undefined) —
    // mirrors how firebase.js never needed this distinction because
    // Firebase Auth handled persistence internally on every platform.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Second, session-isolated client — the direct equivalent of
// firebase.js's `secondaryAuth`. Used ONLY by FrontDeskAccountScreen.jsx
// when an admin creates a new staff account: supabase.auth.signUp() on
// the PRIMARY client would log the admin's own session out and into the
// brand-new account, same problem Firebase had. A distinct `storageKey`
// keeps this client's session completely separate from the primary
// client's, even though both point at the same Supabase project — so
// creating a new user here never touches the admin's own session.
export const secondarySupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    storageKey: 'sb-secondary-auth-token',
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export default supabase;