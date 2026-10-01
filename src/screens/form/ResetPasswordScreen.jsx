import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

/**
 * ResetPasswordScreen — the landing screen for the link Forgotpasswordscreen.jsx
 * sends via supabase.auth.resetPasswordForEmail(). This is the piece that was
 * previously missing entirely: the email went out, but there was nowhere to
 * land and actually set a new password.
 *
 * App.jsx decides WHEN to show this screen — it watches for Supabase's own
 * 'PASSWORD_RECOVERY' auth event (fired automatically on web when the page
 * loads with a recovery token in the URL, via supabase.js's
 * `detectSessionInUrl: Platform.OS === 'web'`) and routes here instead of
 * wherever that session's role would normally land. That recovery token
 * already creates a real (if narrowly-scoped) Supabase session, which is
 * exactly what lets the plain supabase.auth.updateUser({ password }) call
 * below succeed with no "current password" needed — the same primitive
 * MyProfileScreen.jsx/Profilescreen.jsx use for an already-logged-in
 * password change, just reached through a recovery link instead.
 *
 * This screen double-checks for itself (via getSession() on mount) that a
 * session actually exists before showing the form, rather than trusting
 * App.jsx's routing blindly — covers a stale/already-used link landing here
 * some other way (e.g. a bookmarked or revisited URL) with a clear
 * "link expired" state instead of a form that's guaranteed to fail.
 *
 * onGoToLogin / onRequestNewLink are both App.jsx's job: either way, the
 * one-time recovery session shouldn't linger as a "signed in" state, so both
 * sign out first. onGoToLogin is used both after a successful reset AND as
 * the mid-form "back out" option; onRequestNewLink is only for the
 * expired/invalid case, sending the guest back to Forgotpasswordscreen.jsx
 * to request a fresh link.
 */
export default function ResetPasswordScreen({ onGoToLogin, onRequestNewLink }) {
  // 'checking' | 'ready' | 'invalid' | 'success'
  const [status, setStatus] = useState('checking');

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors]             = useState({});
  const [touched, setTouched]           = useState({});
  const [showPass, setShowPass]         = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [globalError, setGlobalError]   = useState('');

  // Smooth entrance, same as Login/Register/ForgotPassword.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setStatus(data?.session ? 'ready' : 'invalid');
    }).catch(() => {
      if (mounted) setStatus('invalid');
    });
    return () => { mounted = false; };
  }, []);

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field])  setErrors(prev => ({ ...prev, [field]: null }));
    if (globalError)    setGlobalError('');
  };

  const blur = field => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setFocusedField(null);
  };

  const validate = () => {
    const e = {};
    if (!form.password)                e.password = 'Password is required.';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!form.confirmPassword)         e.confirmPassword = 'Please confirm your password.';
    else if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match.';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      setTouched({ password: true, confirmPassword: true });
      return;
    }

    setLoading(true);
    setGlobalError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: form.password });
      if (updateError) throw updateError;
      setStatus('success');
    } catch (err) {
      console.error('Password reset error:', err.message);
      // Same message-sniffing approach as Registerscreen.jsx — Supabase
      // Auth errors here don't carry stable error codes to match on.
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('different') || (msg.includes('same') && msg.includes('password'))) {
        setGlobalError('New password must be different from your old password.');
      } else if (msg.includes('password') && (msg.includes('weak') || msg.includes('least'))) {
        setGlobalError('Password is too weak. Use at least 8 characters.');
      } else if (msg.includes('network')) {
        setGlobalError('Network error. Please check your internet connection.');
      } else if (msg.includes('session') || msg.includes('expired') || msg.includes('invalid') || msg.includes('token')) {
        // The recovery session itself died mid-form (e.g. it timed out) —
        // same dead end as never having had one, so show the same state.
        setStatus('invalid');
      } else {
        setGlobalError(`Error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const isValid = field => touched[field] && !errors[field] && form[field];
  const inputStyle = () => [styles.input];
  const wrapStyle = field => [
    styles.inputWrap,
    focusedField === field && styles.inputWrapFocused,
    touched[field] && errors[field] && styles.inputWrapError,
    isValid(field) && styles.inputWrapValid,
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            <View style={styles.logoBadge}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            {status === 'checking' && (
              <View style={styles.statusBox}>
                <Text style={styles.title}>Checking your link…</Text>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}

            {status === 'invalid' && (
              <View style={styles.statusBox}>
                <Ionicons name="alert-circle-outline" size={56} color={colors.danger} />
                <Text style={styles.title}>Link Expired</Text>
                <Text style={styles.subtitle}>
                  This password reset link is invalid or has already been used.
                  Request a new one to continue.
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={onRequestNewLink} activeOpacity={0.85}>
                  <Text style={styles.primaryButtonText}>Request a New Link</Text>
                </TouchableOpacity>
              </View>
            )}

            {status === 'success' && (
              <View style={styles.statusBox}>
                <Ionicons name="checkmark-circle-outline" size={56} color={colors.primary} />
                <Text style={styles.title}>Password Updated</Text>
                <Text style={styles.subtitle}>
                  Your password has been changed. Please log in with your new password.
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={onGoToLogin} activeOpacity={0.85}>
                  <Text style={styles.primaryButtonText}>Continue to Log In</Text>
                </TouchableOpacity>
              </View>
            )}

            {status === 'ready' && (
              <>
                <Text style={styles.title}>Set New Password</Text>
                <Text style={styles.subtitle}>Choose a new password for your account.</Text>

                {!!globalError && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                    <Text style={styles.errorBannerText}>{globalError}</Text>
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>New Password <Text style={styles.required}>*</Text></Text>
                  <View style={wrapStyle('password')}>
                    <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'password' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={inputStyle('password')}
                      placeholder="Create a new password"
                      placeholderTextColor={colors.disabled}
                      value={form.password}
                      onChangeText={v => update('password', v)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => blur('password')}
                      secureTextEntry={!showPass}
                    />
                    <TouchableOpacity onPress={() => setShowPass(p => !p)} style={styles.eyeBtn}>
                      <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {touched.password && errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm New Password <Text style={styles.required}>*</Text></Text>
                  <View style={wrapStyle('confirmPassword')}>
                    <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'confirmPassword' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={inputStyle('confirmPassword')}
                      placeholder="Re-enter your new password"
                      placeholderTextColor={colors.disabled}
                      value={form.confirmPassword}
                      onChangeText={v => update('confirmPassword', v)}
                      onFocus={() => setFocusedField('confirmPassword')}
                      onBlur={() => blur('confirmPassword')}
                      secureTextEntry={!showConfirm}
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={styles.eyeBtn}>
                      <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  {touched.confirmPassword && errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.submitText}>Update Password</Text>
                  }
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.secondaryButton} onPress={onGoToLogin} activeOpacity={0.85}>
                  <Text style={styles.secondaryButtonText}>Back to Log In</Text>
                </TouchableOpacity>
              </>
            )}

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.cardAlt },
  flex:   { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 20px 50px rgba(0,0,0,0.16)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
        elevation: 8,
      },
    }),
  },

  logoBadge: { width: 80, height: 80, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, overflow: 'hidden' },
  logoImage: { width: 56, height: 56 },

  title:    { fontFamily: fonts.headingExtraBold, fontSize: 24, color: colors.primary, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl, textAlign: 'center', lineHeight: 21 },

  statusBox: { width: '100%', alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },

  errorBanner:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md, width: '100%', gap: spacing.xs },
  errorBannerText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, flex: 1 },

  fieldGroup:       { width: '100%', marginBottom: spacing.md },
  label:            { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, marginBottom: spacing.xs },
  required:         { color: colors.danger },
  inputWrap:        { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.sm, gap: spacing.xs },
  inputWrapFocused: { borderColor: colors.primary, backgroundColor: colors.card },
  inputWrapError:   { borderColor: colors.danger,  backgroundColor: colors.dangerBg },
  inputWrapValid:   { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  inputIcon:        { flexShrink: 0 },
  input:            { flex: 1, height: 46, fontFamily: fonts.body, fontSize: 14, color: colors.text, outlineStyle: 'none' },
  eyeBtn:           { paddingLeft: spacing.xs, paddingVertical: spacing.xs },
  errorText:        { fontSize: 11, fontFamily: fonts.body, color: colors.danger, marginTop: 3 },

  submitBtn:      { width: '100%', height: 48, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  submitText:     { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.white, letterSpacing: 0.2 },
  buttonDisabled: { opacity: 0.7 },

  primaryButton:     { width: '100%', height: 48, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  primaryButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.white, letterSpacing: 0.2 },

  divider: { width: '100%', height: 0.5, backgroundColor: colors.border, marginVertical: spacing.lg },

  secondaryButton:     { width: '100%', height: 48, borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.accent, letterSpacing: 0.2 },
});