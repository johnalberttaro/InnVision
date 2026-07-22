import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image, Animated,
} from 'react-native';
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
    borderRadius: radius.xl,
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