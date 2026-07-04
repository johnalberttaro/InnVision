import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

export default function LoginScreen({ onLogin, onForgotPress, onRegisterPress }) {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused]   = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // Same "guests" collection holds every account — most docs have no
      // `role` field at all (plain guests); the one admin account has
      // role: 'admin' set manually in Firebase Console. Default to
      // 'guest' whenever the field is missing, so existing guest
      // accounts keep working with zero changes needed on their docs.
      let role = 'guest';
      try {
        const guestDoc = await getDoc(doc(db, 'guests', user.uid));
        if (guestDoc.exists() && guestDoc.data().role === 'admin') {
          role = 'admin';
        }
      } catch (roleLookupError) {
        // If the role lookup itself fails (e.g. offline), fail safe to
        // 'guest' rather than blocking login entirely or risking a
        // false admin grant.
        console.warn('Role lookup failed, defaulting to guest:', roleLookupError);
      }

      onLogin && onLogin(user, role);
    } catch (e) {
      switch (e.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Incorrect email or password.');
          break;
        case 'auth/invalid-email':
          setError('Please enter a valid email address.');
          break;
        case 'auth/too-many-requests':
          setError('Too many attempts. Please try again later.');
          break;
        default:
          setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl, textAlign: 'center' },

  errorBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md, width: '100%', gap: spacing.xs },
  errorBannerText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, flex: 1 },

  fieldGroup:       { width: '100%', marginBottom: spacing.md },
  label:            { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, marginBottom: spacing.xs },
  inputWrap:        { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md },
  inputWrapFocused: { borderColor: colors.text, backgroundColor: colors.card },
  input:            { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, outlineStyle: 'none' },
  eyeBtn:           { paddingLeft: spacing.sm, paddingVertical: spacing.xs },

  loginButton:      { width: '100%', height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  loginButtonText:  { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.white, letterSpacing: 0.2 },
  buttonDisabled:   { opacity: 0.7 },

  forgotWrapper: { alignSelf: 'flex-end', marginTop: spacing.sm },
  forgotText:    { fontFamily: fonts.body, fontSize: 13, color: colors.primary, textDecorationLine: 'underline' },

  divider: { width: '100%', height: 0.5, backgroundColor: colors.border, marginVertical: spacing.lg },

  registerButton:     { width: '100%', height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  registerButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.accent, letterSpacing: 0.2 },
});