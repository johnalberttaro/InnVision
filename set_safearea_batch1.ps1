Set-Content -Path '.\src\screens\form\LoginScreen.jsx' -Encoding UTF8 -Value @'
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image, Animated,
} from 'react-native';
// DIAGNOSTIC, RESOLVED: SafeAreaView used to come from 'react-native' —
// that core version is deprecated (confirmed via a LogBox warning naming
// this exact file) and only insets correctly on iOS anyway. Moved to
// 'react-native-safe-area-context', same as everywhere else in the app.
// Works here because App.jsx already wraps the whole tree in
// SafeAreaProvider at the root — React Context reaches every screen.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

export default function LoginScreen({ onLogin, onForgotPress, onRegisterPress, onBack }) {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  // Smooth entrance whenever this screen mounts — e.g. navigating here
  // from Register/ForgotPassword feels like a continuation, not an
  // abrupt cut. Runs once on mount; each screen animates itself in
  // independently of whichever screen it's coming from.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
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
      let role = 'guest';
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profileError) throw profileError;
        if (profile?.role) role = profile.role;
      } catch (roleLookupError) {
        // If the role lookup itself fails (e.g. offline), fail safe to
        // 'guest' rather than blocking login entirely or risking a
        // false admin grant.
        console.warn('Role lookup failed, defaulting to guest:', roleLookupError);
      }

      onLogin && onLogin(user, role);
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
    <SafeAreaView style={styles.safe}>
      {/* Back button — top-left, returns to the Home screen. Sits outside
          the ScrollView/card so it stays fixed at the top regardless of
          scroll position or keyboard state. */}
      {!!onBack && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* Logo */}
            <View style={styles.logoBadge}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.title}>Account Login</Text>
            <Text style={styles.subtitle}>Hello Guests, Welcome Back!</Text>

            {/* Global error */}
            {!!error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email:</Text>
              <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
                <Ionicons name="mail-outline" size={18} color={emailFocused ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email..."
                  placeholderTextColor={colors.disabled}
                  value={email}
                  onChangeText={v => { setEmail(v); setError(''); }}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password:</Text>
              <View style={[styles.inputWrap, passFocused && styles.inputWrapFocused]}>
                <Ionicons name="lock-closed-outline" size={18} color={passFocused ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password..."
                  placeholderTextColor={colors.disabled}
                  value={password}
                  onChangeText={v => { setPassword(v); setError(''); }}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn} activeOpacity={0.7}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Log In Button */}
            <TouchableOpacity style={[styles.loginButton, loading && styles.buttonDisabled]} onPress={handleLogin} activeOpacity={0.85} disabled={loading}>
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.loginButtonText}>Log In</Text>
              }
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity style={styles.forgotWrapper} onPress={onForgotPress} activeOpacity={0.7}>
              <Text style={styles.forgotText}>Forget Password?</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Register */}
            <TouchableOpacity style={styles.registerButton} onPress={onRegisterPress} activeOpacity={0.85}>
              <Text style={styles.registerButtonText}>Register Account</Text>
            </TouchableOpacity>

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

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginLeft: spacing.md,
  },

  logoBadge: { width: 80, height: 80, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, overflow: 'hidden' },
  logoImage: { width: 56, height: 56 },

  title:    { fontFamily: fonts.headingExtraBold, fontSize: 24, color: colors.primary, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl, textAlign: 'center' },

  errorBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md, width: '100%', gap: spacing.xs },
  errorBannerText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, flex: 1 },

  fieldGroup:       { width: '100%', marginBottom: spacing.md },
  label:            { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, marginBottom: spacing.xs },
  inputWrap:        { flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md, gap: spacing.sm },
  inputWrapFocused: { borderColor: colors.primary, backgroundColor: colors.card },
  inputIcon:        { flexShrink: 0 },
  input:            { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, outlineStyle: 'none' },
  eyeBtn:           { paddingLeft: spacing.xs, paddingVertical: spacing.xs },

  loginButton:      { width: '100%', height: 48, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  loginButtonText:  { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.white, letterSpacing: 0.2 },
  buttonDisabled:   { opacity: 0.7 },

  forgotWrapper: { alignSelf: 'flex-end', marginTop: spacing.sm },
  forgotText:    { fontFamily: fonts.body, fontSize: 13, color: colors.primary, textDecorationLine: 'underline' },

  divider: { width: '100%', height: 0.5, backgroundColor: colors.border, marginVertical: spacing.lg },

  registerButton:     { width: '100%', height: 48, borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  registerButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.accent, letterSpacing: 0.2 },
});
'@

Set-Content -Path '.\src\screens\form\Forgotpasswordscreen.jsx' -Encoding UTF8 -Value @'
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image, Animated,
} from 'react-native';
// RESOLVED: SafeAreaView moved to 'react-native-safe-area-context' — see
// the same fix's full explanation in LoginScreen.jsx.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

// Where Supabase sends the user after they click the reset link in their
// email. MUST also be added to Supabase Dashboard → Authentication → URL
// Configuration → Redirect URLs, or the reset link will be rejected.
// TODO: replace with your actual deployed web URL / deep link scheme.
const PASSWORD_RESET_REDIRECT_URL = 'https://your-app-domain.example.com/reset-password';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordScreen({ onLoginPress }) {
  const [value, setValue]     = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const timerRef = useRef(null);

  // Smooth entrance whenever this screen mounts — e.g. coming here from
  // Login feels like a continuation, not an abrupt cut.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

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
      // Supabase already doesn't reveal whether the email exists — it
      // returns success either way for security, same end behavior the
      // old auth/user-not-found branch was manually faking.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(value.trim(), {
        redirectTo: PASSWORD_RESET_REDIRECT_URL,
      });
      if (resetError) throw resetError;
      setSent(true);
      startCooldown();
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('invalid') && msg.includes('email')) {
        setError('Please enter a valid email address.');
      } else if (e.status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
        setError('Too many attempts. Please wait a bit before trying again.');
      } else {
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
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* Logo */}
            <View style={styles.logoBadge}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
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

  fieldGroup:       { width: '100%', marginBottom: spacing.md },
  label:            { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, marginBottom: spacing.xs },
  inputWrap:        { flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md, gap: spacing.sm },
  inputWrapFocused: { borderColor: colors.primary, backgroundColor: colors.card },
  inputWrapError:   { borderColor: colors.danger,  backgroundColor: colors.dangerBg },
  inputIcon:        { flexShrink: 0 },
  input:            { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, outlineStyle: 'none' },
  hintText:         { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 },
  errorText:        { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: spacing.xs },

  primaryButton:     { width: '100%', height: 48, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
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

  secondaryButton:     { width: '100%', height: 48, borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.accent, letterSpacing: 0.2 },
});
'@

Set-Content -Path '.\src\components\home\HamburgerMenu.jsx' -Encoding UTF8 -Value @'
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Image } from 'react-native';
// RESOLVED: SafeAreaView moved to 'react-native-safe-area-context' — see
// the same fix's full explanation in LoginScreen.jsx. Still correctly
// receives insets here despite rendering inside a Modal — React Context
// (which SafeAreaProvider uses) propagates through Modal's children even
// though Modal renders to a separate native surface.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fonts } from '../../utils/theme';
import ConfirmDialog from '../shared/ConfirmDialog';

const logo = require('../../../assets/logo.png');

/**
 * HamburgerMenu — full-screen slide-up menu for narrow/mobile screens.
 *
 * Props:
 *  - visible:         boolean
 *  - onClose:         () => void
 *  - onProfilePress:  () => void  — navigate to ProfileScreen
 *  - onAboutPress:    () => void  — navigate to AboutScreen
 *  - onContactPress:  () => void  — navigate to ContactUsScreen
 *  - onFindBooking:   () => void  — navigate to BookingLookupScreen
 *  - onOrderFood:     () => void  — navigate to OrderFoodScreen (only shown when authenticated)
 *  - onLogout:        () => void  — sign out (only shown when authenticated)
 *  - isAuthenticated: boolean     — show Profile/Order Food/Sign Out items only when logged in
 */
export default function HamburgerMenu({
  visible,
  onClose,
  onProfilePress,
  onAboutPress,
  onContactPress,
  onFindBooking,
  onOrderFood,
  onReportIssue,
  onLogout,
  isAuthenticated,
}) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const menuItems = [
    {
      label: 'About',
      icon: 'information-circle-outline',
      onPress: () => {
        onClose();
        onAboutPress && onAboutPress();
      },
    },
    { label: 'Promos',     icon: 'pricetag-outline', onPress: onClose },
    {
      label: 'Contact Us',
      icon: 'call-outline',
      onPress: () => {
        onClose();
        onContactPress && onContactPress();
      },
    },
    {
      label: 'My Reservations',
      icon: 'calendar-outline',
      onPress: () => {
        onClose();
        onFindBooking && onFindBooking();
      },
    },
    ...(isAuthenticated
      ? [
          {
            label: 'Order Food',
            icon: 'restaurant-outline',
            onPress: () => {
              onClose();
              onOrderFood && onOrderFood();
            },
          },
          {
            label: 'Report an Issue',
            icon: 'build-outline',
            onPress: () => {
              onClose();
              onReportIssue && onReportIssue();
            },
          },
          {
            label: 'Profile',
            icon: 'person-circle-outline',
            onPress: () => {
              onClose();
              onProfilePress && onProfilePress();
            },
          },
        ]
      : []
    ),
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBadge}>
              <Image source={logo} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.title}>InnVision</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close menu">
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Menu Items */}
        <View style={styles.menuList}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.75}
            >
              <View style={styles.menuItemLeft}>
                <Ionicons
                  name={item.icon}
                  size={22}
                  color="rgba(255,255,255,0.85)"
                />
                <Text style={styles.menuItemText}>
                  {item.label}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color="rgba(255,255,255,0.4)"
              />
            </TouchableOpacity>
          ))}
        </View>

        {isAuthenticated && (
          <TouchableOpacity
            style={styles.signOutItem}
            onPress={() => setConfirmingLogout(true)}
            activeOpacity={0.75}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out-outline" size={20} color="#FF8A80" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.placeholderNote}>
          These sections are placeholders for the student prototype.
        </Text>
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmingLogout}
        title="Log Out?"
        message="Are you sure you want to log out?"
        confirmLabel="Yes"
        cancelLabel="No"
        destructive
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() => {
          setConfirmingLogout(false);
          onClose();
          onLogout && onLogout();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.heroBackground,
    paddingHorizontal: spacing.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.lg,
    marginBottom: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 22,
    height: 22,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingExtraBold,
    color: colors.white,
    letterSpacing: 0.3,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // Menu items
  menuList: {
    gap: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: fonts.headingSemiBold,
    color: colors.white,
  },

  // Sign out — visually separated from the main list, tinted to signal
  // it ends the session rather than navigating somewhere.
  signOutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  signOutText: {
    fontSize: 16,
    fontFamily: fonts.headingSemiBold,
    color: '#FF8A80',
  },

  // Footer note
  placeholderNote: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.5)',
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
'@

Set-Content -Path '.\src\screens\reportIssue\ReportIssueScreen.jsx' -Encoding UTF8 -Value @'
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
// RESOLVED: SafeAreaView moved to 'react-native-safe-area-context' — see
// the same fix's full explanation in LoginScreen.jsx.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTheme } from '../../context/ThemeContext';

const CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing',   icon: 'water-outline' },
  { key: 'electrical', label: 'Electrical', icon: 'flash-outline' },
  { key: 'hvac',        label: 'HVAC',       icon: 'thermometer-outline' },
  { key: 'furniture',  label: 'Furniture',  icon: 'bed-outline' },
  { key: 'other',      label: 'Other',      icon: 'build-outline' },
];

/**
 * ReportIssueScreen — lets a checked-in guest report a maintenance issue
 * themselves, instead of it always going through Front Desk verbally
 * (see MaintenanceRequest.jsx's "+ New Request" — that's the ONLY way a
 * maintenance_requests row got created before this screen; a guest had
 * no self-service path at all).
 *
 * Inserts directly into maintenance_requests with status: 'open' — same
 * starting state Front Desk's own "New Request" form creates, so it
 * lands in the exact same place on the Admin/Front Desk Maintenance
 * Requests board and gets assigned to maintenance staff the same way,
 * regardless of who reported it.
 *
 * DESIGN CHOICE: no priority picker, unlike the staff-facing form (which
 * has Low/Normal/Urgent). Guests default to 'normal' — assessing true
 * urgency (is this actually urgent, or does the guest just feel that
 * way?) is left to staff triage, not self-reported by the person with
 * the least context on hotel operations. Staff can still escalate it
 * from their own board after reviewing it.
 *
 * ELIGIBILITY: same rule as OrderFoodScreen.jsx — only a guest with a
 * status = 'checked-in' reservation can use this (that's the room the
 * issue is attributed to). A friendly message shows otherwise, same
 * pattern as that screen.
 */
export default function ReportIssueScreen({ user, onBackPress }) {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = getStyles(colors, spacing, radius, fonts);

  const [checkedInReservation, setCheckedInReservation] = useState(null);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('reservations')
        .select('id, status, selected_rooms, guest_details, guest_email')
        .eq('user_id', user.id)
        .eq('status', 'checked-in')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled) {
        if (fetchError) console.error('Failed to load checked-in reservation:', fetchError);
        else if (data && data.length > 0) setCheckedInReservation(data[0]);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const roomNumber = (() => {
    const rooms = checkedInReservation?.selected_rooms;
    if (Array.isArray(rooms) && rooms.length > 0) {
      return rooms[0]?.roomNumber || rooms[0]?.number || rooms[0]?.room || null;
    }
    return null;
  })();

  const handleSubmit = async () => {
    if (!category) {
      setError('Please select what kind of issue this is.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe the issue.');
      return;
    }
    if (!roomNumber) {
      setError('Could not determine your room. Please contact Front Desk directly.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const guestName = checkedInReservation?.guest_details
        ? `${checkedInReservation.guest_details.firstName || ''} ${checkedInReservation.guest_details.lastName || ''}`.trim()
        : (checkedInReservation?.guest_email || user?.email || 'Guest');

      const { error: insertError } = await supabase.from('maintenance_requests').insert({
        room_number: roomNumber,
        category,
        priority: 'normal',
        description: description.trim(),
        status: 'open',
        reported_by: user.id,
      });
      if (insertError) throw insertError;

      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit maintenance request:', err);
      setError('Something went wrong submitting your request. Please try again, or contact Front Desk directly.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!checkedInReservation) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <View style={styles.stateCard}>
            <Ionicons name="build-outline" size={44} color={colors.textMuted} />
            <Text style={styles.stateTitle}>Issue reporting isn't available yet</Text>
            <Text style={styles.stateMessage}>
              This becomes available once you've checked in. If you've just checked in, this may take a moment to update.
            </Text>
            {!!onBackPress && (
              <TouchableOpacity style={styles.stateSecondaryBtn} onPress={onBackPress} activeOpacity={0.85}>
                <Text style={styles.stateSecondaryBtnText}>Go back</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <View style={styles.stateCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            </View>
            <Text style={styles.stateTitle}>Issue reported</Text>
            <Text style={styles.stateMessage}>
              Thanks — our maintenance team has been notified about Room {roomNumber}. Front Desk will follow up if needed.
            </Text>
            {!!onBackPress && (
              <TouchableOpacity style={styles.statePrimaryBtn} onPress={onBackPress} activeOpacity={0.85}>
                <Text style={styles.statePrimaryBtnText}>Go back</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {!!onBackPress && (
          <TouchableOpacity onPress={onBackPress} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Report an Issue</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.roomLabel}>Room {roomNumber}</Text>
        <Text style={styles.subtitle}>Let us know what's wrong and our team will take care of it.</Text>

        <Text style={styles.fieldLabel}>What kind of issue is it?</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => { setCategory(c.key); setError(''); }}
                activeOpacity={0.8}
              >
                <Ionicons name={c.icon} size={15} color={active ? colors.onPrimary : colors.text} />
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Describe the issue</Text>
        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={(v) => { setDescription(v); if (error) setError(''); }}
          placeholder="e.g. The bathroom sink is leaking"
          placeholderTextColor={colors.disabled}
          multiline
          numberOfLines={5}
        />

        {!!error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={14} color="#B3261E" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <Ionicons name="send" size={15} color={colors.onPrimary} />
              <Text style={styles.submitBtnText}>Submit Report</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.text },

    content: { padding: spacing.lg, paddingBottom: spacing.xl },
    roomLabel: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
    subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },

    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    categoryChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    },
    categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    categoryChipText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    categoryChipTextActive: { color: colors.onPrimary },

    textArea: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      padding: spacing.md, fontSize: 13, fontFamily: fonts.body, color: colors.text,
      minHeight: 110, textAlignVertical: 'top', backgroundColor: colors.white,
    },

    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: '#FDECEA', borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.md,
    },
    errorText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

    submitBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.lg,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },

    // Matches ReviewPayScreen.jsx's booking-success card exactly (same
    // shadow, radius, icon size, button shape) so every guest-facing
    // confirmation in the app reads as the same design language.
    stateCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    successIconWrap: { marginBottom: spacing.md },
    stateTitle: {
      fontSize: 20,
      fontFamily: fonts.headingBold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    stateMessage: {
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: spacing.md,
    },
    statePrimaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      minWidth: 180,
      alignItems: 'center',
    },
    statePrimaryBtnText: { color: colors.onPrimary, fontFamily: fonts.bodySemiBold, fontSize: 14 },
    stateSecondaryBtn: {
      marginTop: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 180,
      alignItems: 'center',
    },
    stateSecondaryBtnText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  });
}
'@
Write-Host 'set_safearea_batch1: 4 file(s) written OK'
