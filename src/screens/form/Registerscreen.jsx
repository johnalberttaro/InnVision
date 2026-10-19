import React, { useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';
import AuthLayout, { AuthField, AuthButton, AuthError, AuthSwitch, AUTH } from '../../components/shared/AuthLayout';

// Registration page — guests create an account here. Look comes from
// components/shared/AuthLayout.jsx (shared with Login).

export default function RegisterScreen({ onRegister, onLoginPress }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [errors, setErrors]             = useState({});
  const [touched, setTouched]           = useState({});
  const [loading, setLoading]           = useState(false);
  const [globalError, setGlobalError]   = useState('');
  const { width } = useWindowDimensions();

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field])  setErrors(prev => ({ ...prev, [field]: null }));
    if (globalError)    setGlobalError('');
  };

  const blur = field => {
    setTouched(prev => ({ ...prev, [field]: true }));
    // Check this one field as soon as the person leaves it.
    const fieldError = validate()[field];
    setErrors(prev => ({ ...prev, [field]: fieldError || null }));
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim())  e.firstName = 'First name is required.';
    if (!form.lastName.trim())   e.lastName  = 'Last name is required.';
    if (!form.email.trim())      e.email     = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address.';

    if (!form.phone.trim()) {
      e.phone = 'Phone number is required.';
    } else {
      const cleaned = form.phone.trim();
      const digitsOnly = cleaned.replace(/[^\d]/g, '');
      if (!/^[\d\s\-().+]+$/.test(cleaned)) {
        e.phone = 'Phone number contains invalid characters.';
      } else if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        e.phone = 'Enter a valid phone number.';
      }
    }

    if (!form.password)          e.password  = 'Password is required.';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!form.confirmPassword)   e.confirmPassword = 'Please confirm your password.';
    else if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match.';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      setTouched({ firstName: true, lastName: true, email: true, phone: true, password: true, confirmPassword: true });
      return;
    }

    setLoading(true);
    setGlobalError('');

    try {
      // Create the Supabase Auth user. first_name/last_name/phone/display_name
      // go in as user metadata — the on_auth_user_created trigger (see
      // innvision_schema.sql) reads them and writes the matching `profiles`
      // row automatically.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            phone: form.phone.trim(),
            display_name: `${form.firstName.trim()} ${form.lastName.trim()}`,
          },
        },
      });
      if (signUpError) throw signUpError;

      // DIAGNOSTIC, RESOLVED: the auth trigger above only ever writes
      // `profiles` — it was wrongly assumed that made a separate `guests`
      // row unnecessary (an old comment here said as much), but `guests`
      // is its own table that Front Desk's Guest Profiles / Guest Records
      // screens actually read from. Without this insert, every
      // self-registered account got a profiles row but never showed up
      // as a guest anywhere in the app — confirmed by comparing
      // profiles(role='guest') against guests.user_id in Supabase: far
      // more of the former than the latter. guests_insert_own (RLS:
      // user_id = auth.uid()) already exists for exactly this and was
      // simply never called. Mirrors the same insert shape
      // GuestRecordsScreen.jsx/WalkInScreen.jsx already use for
      // staff-entered guests, with source/created_by marking this one as
      // self-service instead of staff-entered. Non-blocking on failure,
      // same reasoning as WalkInScreen.jsx's own guests insert: the auth
      // account and profile already exist at this point, so a hiccup
      // here shouldn't strand someone mid-signup over a secondary record
      // they can't do anything about.
      if (data.user) {
        try {
          const { error: guestInsertError } = await supabase.from('guests').insert({
            user_id: data.user.id,
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            source: 'App Sign-Up',
            created_by: 'self',
          });
          if (guestInsertError) throw guestInsertError;
        } catch (guestErr) {
          console.warn('Failed to create guest record (registration still proceeding):', guestErr);
        }
      }

      // NOTE: if email confirmation is enabled in Supabase Auth settings
      // (the default), `data.session` is null here — the user exists but
      // isn't logged in until they click the confirmation link. onRegister
      // below currently assumes an immediately-logged-in user, same as the
      // old Firebase behavior. Decide whether to keep confirmation required
      // (safer, standard) or disable it in Supabase for parity with the old
      // flow — this changes what onRegister should do next.
      onRegister && onRegister(data.user);

    } catch (err) {
      console.error('Registration error:', err.message);

      // Supabase Auth errors don't carry Firebase-style `auth/xxx` codes —
      // match on message content instead.
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('already registered')) {
        setGlobalError('This email is already registered. Please log in instead.');
      } else if (msg.includes('invalid') && msg.includes('email')) {
        setGlobalError('Please enter a valid email address.');
      } else if (msg.includes('password') && (msg.includes('weak') || msg.includes('least'))) {
        setGlobalError('Password is too weak. Use at least 8 characters.');
      } else if (msg.includes('network')) {
        setGlobalError('Network error. Please check your internet connection.');
      } else if (msg.includes('signups not allowed') || msg.includes('email logins are disabled')) {
        setGlobalError('Email/password sign-up is not enabled. Please contact support.');
      } else {
        // Show the actual Supabase error message in the banner for easier debugging
        setGlobalError(`Error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const isValid = field => !!(touched[field] && !errors[field] && form[field]);
  const err = field => (touched[field] ? errors[field] : null);
  const twoCol = width >= 520;
  const strength = scorePassword(form.password);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <AuthLayout
        title="Create your account"
        subtitle="It takes a minute. You'll use it to book rooms and spaces and to track your reservations."
        onBack={onLoginPress}
        sideHeadline="Book your stay with the CCTC training hotel."
        sideLead="Your account keeps your bookings, payments and receipts together, and gets you reminders before check-in and check-out."
        sidePoints={[
          { icon: 'flash-outline', text: 'Quick sign-up, no fees' },
          { icon: 'notifications-outline', text: 'Check-in and check-out reminders' },
          { icon: 'receipt-outline', text: 'Receipts saved in your account' },
        ]}
      >
        <AuthError text={globalError} />

        <View style={twoCol ? styles.row : null}>
          <AuthField
            style={twoCol ? styles.col : null}
            label="First name" required icon="person-outline" placeholder="Juan"
            value={form.firstName} onChangeText={v => update('firstName', v)} onBlur={() => blur('firstName')}
            autoCapitalize="words" autoComplete="given-name"
            error={err('firstName')} valid={isValid('firstName')}
          />
          <AuthField
            style={twoCol ? styles.col : null}
            label="Last name" required icon="person-outline" placeholder="Dela Cruz"
            value={form.lastName} onChangeText={v => update('lastName', v)} onBlur={() => blur('lastName')}
            autoCapitalize="words" autoComplete="family-name"
            error={err('lastName')} valid={isValid('lastName')}
          />
        </View>

        <AuthField
          label="Email" required icon="mail-outline" placeholder="you@example.com"
          value={form.email} onChangeText={v => update('email', v)} onBlur={() => blur('email')}
          keyboardType="email-address" autoComplete="email"
          error={err('email')} valid={isValid('email')}
        />

        <AuthField
          label="Phone number" required icon="call-outline" placeholder="e.g. 0917 123 4567"
          value={form.phone} onChangeText={v => update('phone', v)} onBlur={() => blur('phone')}
          keyboardType="phone-pad" autoComplete="tel"
          error={err('phone')} valid={isValid('phone')}
        />

        <AuthField
          label="Password" required icon="lock-closed-outline" placeholder="At least 8 characters"
          value={form.password} onChangeText={v => update('password', v)} onBlur={() => blur('password')}
          secure autoComplete="new-password"
          error={err('password')}
        />
        {!!form.password && (
          <View style={styles.strengthRow}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={[styles.strengthSeg, i <= strength.score && { backgroundColor: strength.color }]} />
            ))}
            <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          </View>
        )}

        <AuthField
          label="Confirm password" required icon="lock-closed-outline" placeholder="Re-enter your password"
          value={form.confirmPassword} onChangeText={v => update('confirmPassword', v)} onBlur={() => blur('confirmPassword')}
          secure autoComplete="new-password" returnKeyType="done" onSubmitEditing={handleSubmit}
          error={err('confirmPassword')} valid={isValid('confirmPassword')}
        />

        <AuthButton label="Create account" icon="arrow-forward" onPress={handleSubmit} loading={loading} />

        <Text style={styles.fine}>
          Payments in this app are simulated for training. No real money is charged.
        </Text>

        <AuthSwitch prompt="Already have an account?" action="Log in" onPress={onLoginPress} />
      </AuthLayout>
    </SafeAreaView>
  );
}

// Quick visual signal only (length + character variety).
function scorePassword(pw) {
  if (!pw) return { score: 0, label: '', color: AUTH.line };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: 'Weak', color: AUTH.danger };
  if (s <= 2) return { score: 2, label: 'Fair', color: '#C99400' };
  if (s <= 3) return { score: 3, label: 'Good', color: '#8A6A22' };
  return { score: 4, label: 'Strong', color: AUTH.success };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AUTH.page },
  row: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, minWidth: 0 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: 14 },
  strengthSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: AUTH.line },
  strengthLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, minWidth: 48, textAlign: 'right' },
  fine: { fontFamily: 'Inter_400Regular', fontSize: 12.5, lineHeight: 18, color: AUTH.inkMuted, textAlign: 'center', marginTop: 14 },
});
