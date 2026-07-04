import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen({ onLoginPress }) {
  const [value, setValue]     = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendResetEmail = async () => {
    if (!value.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, value.trim());
      setSent(true);
      startCooldown();
    } catch (e) {
      switch (e.code) {
        case 'auth/user-not-found':
          // Don't reveal if email exists — show success anyway (security best practice)
          setSent(true);
          startCooldown();
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address.');
          break;
        case 'auth/too-many-requests':
          setError('Too many attempts. Please wait a bit before trying again.');
          break;
        default:
          setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => sendResetEmail();
  const handleResend = () => {
    if (cooldown > 0 || loading) return;
    sendResetEmail();
  };

  const handleUseDifferentEmail = () => {
    setSent(false);
    setError('');
    setValue('');
    setCooldown(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>

            {/* Logo */}
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>IV</Text>
            </View>

            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>
              Enter your email address{'\n'}to receive a password reset link.
            </Text>

            {!sent ? (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email Address:</Text>
                  <View style={[styles.inputWrap, focused && styles.inputWrapFocused, !!error && styles.inputWrapError]}>
                    <Ionicons name="mail-outline" size={18} color={focused ? colors.text : colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your email address..."
                      placeholderTextColor={colors.disabled}
                      value={value}
                      onChangeText={v => { setValue(v); if (error) setError(''); }}
                      onFocus={() => setFocused(true)}
                      onBlur={() => setFocused(false)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                    />
                  </View>
                  {!!error
                    ? <Text style={styles.errorText}>{error}</Text>
                    : <Text style={styles.hintText}>We'll send a reset link to your registered email address.</Text>
                  }
                </View>

                <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={handleSubmit} activeOpacity={0.85} disabled={loading}>
                  {loading
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle-outline" size={56} color={colors.primary} />
                <Text style={styles.successTitle}>Check your email!</Text>
                <Text style={styles.successText}>
                  If an account exists for{' '}
                  <Text style={styles.successHighlight}>{value}</Text>
                  , a password reset link has been sent.
                </Text>

                {/* Spam / junk folder callout */}
                <View style={styles.spamCallout}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spamCalloutTitle}>Don't see it in your inbox?</Text>
                    <Text style={styles.spamCalloutText}>
                      Check your Spam or Junk folder — the email can sometimes land there.
                      It may also take a few minutes to arrive.
                    </Text>
                  </View>
                </View>

                {/* Resend */}
                <View style={styles.resendRow}>
                  <Text style={styles.resendLabel}>Still nothing?</Text>
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={cooldown > 0 || loading}
                    activeOpacity={0.7}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={[styles.resendLink, cooldown > 0 && styles.resendLinkDisabled]}>
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={handleUseDifferentEmail} activeOpacity={0.7}>
                  <Text style={styles.useDifferentEmailText}>Use a different email address</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.divider} />

            <TouchableOpacity style={styles.secondaryButton} onPress={onLoginPress} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Back to Log In</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.cardAlt },
  flex:   { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card:   { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border, padding: spacing.xxl, width: '100%', maxWidth: 420, alignItems: 'center' },

  logoBadge: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  logoText:  { fontFamily: fonts.headingExtraBold, fontSize: 22, color: colors.white, letterSpacing: -0.5 },

  title:    { fontFamily: fonts.headingExtraBold, fontSize: 24, color: colors.primary, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl, textAlign: 'center', lineHeight: 21 },

  fieldGroup:       { width: '100%', marginBottom: spacing.md },
  label:            { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, marginBottom: spacing.xs },
  inputWrap:        { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md, gap: spacing.sm },
  inputWrapFocused: { borderColor: colors.text, backgroundColor: colors.card },
  inputWrapError:   { borderColor: colors.danger,  backgroundColor: colors.dangerBg },
  inputIcon:        { flexShrink: 0 },
  input:            { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, outlineStyle: 'none' },
  hintText:         { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 },
  errorText:        { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: spacing.xs },

  primaryButton:     { width: '100%', height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  primaryButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.white, letterSpacing: 0.2 },
  buttonDisabled:    { opacity: 0.7 },

  successBox:       { width: '100%', alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  successTitle:     { fontFamily: fonts.headingBold, fontSize: 18, color: colors.primary },
  successText:      { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  successHighlight: { fontFamily: fonts.bodySemiBold, color: colors.primary },

  spamCallout: {
    flexDirection: 'row', gap: spacing.sm, width: '100%',
    backgroundColor: colors.accentTint, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.accent,
    padding: spacing.md,
  },
  spamCalloutTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text, marginBottom: 2 },
  spamCalloutText:  { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  resendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  resendLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  resendLink: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primary, textDecorationLine: 'underline' },
  resendLinkDisabled: { color: colors.disabled, textDecorationLine: 'none' },

  useDifferentEmailText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline', marginTop: spacing.xs },

  divider: { width: '100%', height: 0.5, backgroundColor: colors.border, marginVertical: spacing.lg },

  secondaryButton:     { width: '100%', height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.accent, letterSpacing: 0.2 },
});