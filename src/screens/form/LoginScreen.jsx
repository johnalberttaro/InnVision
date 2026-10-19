import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import { fetchAccountRole, LOOKUP_FAILED_MESSAGE } from '../../utils/accountRole';
import AuthLayout, { AuthField, AuthButton, AuthError, AuthSwitch, AUTH } from '../../components/shared/AuthLayout';

// Login page — guests and staff sign in here. Look comes from
// components/shared/AuthLayout.jsx (shared with Register).

// Kept in sync with App.jsx's DEACTIVATED_MESSAGE.
const DEACTIVATED_MESSAGE =
  'This account has been deactivated. Please contact the administrator if you think this is a mistake.';

export default function LoginScreen({ onLogin, onForgotPress, onRegisterPress, onBack, notice, onNoticeShown }) {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  // A message handed over by App.jsx (e.g. a deactivated account that
  // still had a saved session) — shown once, like any other login error.
  useEffect(() => {
    if (notice) {
      setError(notice);
      onNoticeShown && onNoticeShown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  // Lets the Email field's Return key hand focus straight to Password
  // (see onSubmitEditing below) instead of just dismissing the keyboard.
  const passwordInputRef = useRef(null);

  const handleLogin = async () => {
    // Guards against a double-fire now that there are two ways in:
    // clicking Log In (already disabled while loading) and pressing
    // Enter in the Password field (submitEditing has no disabled prop
    // of its own to lean on).
    if (loading) return;
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      const user = data.user;

      // profiles.role is a real Postgres enum (admin | frontdesk | guest),
      // auto-created and defaulted to 'guest' by the on_auth_user_created
      // trigger — no more resolveUserRole() guessing across differently-
      // shaped legacy fields (role / isAdmin / accessLevel / etc.) the way
      // the old Firestore "guests" docs needed.
      // App.jsx's auth listener sees the same SIGNED_IN and does any
      // sign-out (deactivated account / role couldn't be read), keeping
      // this screen showing — only one place signs out, so the two can't race.
      let account;
      try {
        account = await fetchAccountRole(user.id); // retried a few times
      } catch (roleLookupError) {
        // Never guess "guest" — that sent staff to the guest pages.
        console.warn('Role lookup failed:', roleLookupError?.message || roleLookupError);
        setError(LOOKUP_FAILED_MESSAGE);
        return;
      }
      // Deactivated staff ("Remove" in the admin account screens):
      // don't let them in, and say why.
      if (!account.active) {
        setError(DEACTIVATED_MESSAGE);
        return;
      }

      onLogin && onLogin(user, account.role);
    } catch (e) {
      // Supabase Auth errors don't carry Firebase-style `auth/xxx` codes —
      // match on message content instead. `status` is also available if
      // you'd rather branch on HTTP status (400/422/429).
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('invalid login credentials')) {
        setError('Incorrect email or password.');
      } else if (msg.includes('email not confirmed')) {
        setError('Please confirm your email address before logging in.');
      } else if (msg.includes('email') && msg.includes('valid')) {
        setError('Please enter a valid email address.');
      } else if (e.status === 429 || msg.includes('rate limit')) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <AuthLayout
        title="Welcome back"
        subtitle="Sign in to book a stay and manage your reservations. Staff use the same login."
        onBack={onBack}
        sideHeadline="Your stay at the CCTC training hotel starts here."
        sideLead="Book rooms and event spaces, track your reservations, and pay online or at the hotel."
        sidePoints={[
          { icon: 'bed-outline', text: 'Rooms, conference and event spaces' },
          { icon: 'calendar-outline', text: 'See every booking in one place' },
          { icon: 'card-outline', text: 'Pay online or at the front desk' },
        ]}
      >
        <AuthError text={error} />

        <AuthField
          label="Email"
          icon="mail-outline"
          placeholder="you@example.com"
          value={email}
          onChangeText={(v) => { setEmail(v); setError(''); }}
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordInputRef.current?.focus()}
        />

        <AuthField
          label="Password"
          icon="lock-closed-outline"
          placeholder="Enter your password"
          value={password}
          onChangeText={(v) => { setPassword(v); setError(''); }}
          secure
          autoComplete="password"
          inputRef={passwordInputRef}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity style={styles.forgot} onPress={onForgotPress} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <AuthButton label="Log in" icon="arrow-forward" onPress={handleLogin} loading={loading} />

        <AuthSwitch prompt="New to InnVision?" action="Create an account" onPress={onRegisterPress} />
      </AuthLayout>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AUTH.page },
  forgot: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 14, paddingVertical: 4 },
  forgotText: { fontFamily: 'Inter_600SemiBold', fontSize: 13.5, color: '#8A6A22' },
});
