import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

export default function RegisterScreen({ onRegister, onLoginPress }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [errors, setErrors]             = useState({});
  const [touched, setTouched]           = useState({});
  const [showPass, setShowPass]         = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [globalError, setGlobalError]   = useState('');

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
      // row automatically. No separate setDoc(doc(db,'guests',user.uid), ...)
      // step needed the way Firestore required — that manual write is gone.
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

  const isValid = field => touched[field] && !errors[field] && form[field];

  const inputStyle = field => [styles.input];

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

            {/* Logo */}
            <View style={styles.logoBadge}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.title}>Account Sign Up</Text>
            <Text style={styles.subtitle}>Create a new InnVision account</Text>

            {/* Global error banner */}
            {!!globalError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorBannerText}>{globalError}</Text>
              </View>
            )}

            {/* Name row */}
            <View style={styles.nameRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>First Name <Text style={styles.required}>*</Text></Text>
                <View style={wrapStyle('firstName')}>
                  <Ionicons name="person-outline" size={16} color={focusedField === 'firstName' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={inputStyle('firstName')}
                    placeholder="Enter your first name"
                    placeholderTextColor={colors.disabled}
                    value={form.firstName}
                    onChangeText={v => update('firstName', v)}
                    onFocus={() => setFocusedField('firstName')}
                    onBlur={() => blur('firstName')}
                    autoCapitalize="words"
                  />
                  {isValid('firstName') && <Text style={styles.checkIcon}>✓</Text>}
                </View>
                {touched.firstName && errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Last Name <Text style={styles.required}>*</Text></Text>
                <View style={wrapStyle('lastName')}>
                  <Ionicons name="person-outline" size={16} color={focusedField === 'lastName' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={inputStyle('lastName')}
                    placeholder="Enter your last name"
                    placeholderTextColor={colors.disabled}
                    value={form.lastName}
                    onChangeText={v => update('lastName', v)}
                    onFocus={() => setFocusedField('lastName')}
                    onBlur={() => blur('lastName')}
                    autoCapitalize="words"
                  />
                  {isValid('lastName') && <Text style={styles.checkIcon}>✓</Text>}
                </View>
                {touched.lastName && errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email Address <Text style={styles.required}>*</Text></Text>
              <View style={wrapStyle('email')}>
                <Ionicons name="mail-outline" size={18} color={focusedField === 'email' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={inputStyle('email')}
                  placeholder="Enter your email address"
                  placeholderTextColor={colors.disabled}
                  value={form.email}
                  onChangeText={v => update('email', v)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => blur('email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {isValid('email') && <Text style={styles.checkIcon}>✓</Text>}
              </View>
              {touched.email && errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            {/* Phone Number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone Number <Text style={styles.required}>*</Text></Text>
              <View style={wrapStyle('phone')}>
                <Ionicons name="call-outline" size={18} color={focusedField === 'phone' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={inputStyle('phone')}
                  placeholderTextColor={colors.disabled}
                  placeholder="e.g. +1 555 123 4567"
                  value={form.phone}
                  onChangeText={v => update('phone', v)}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => blur('phone')}
                  keyboardType="phone-pad"
                />
                {isValid('phone') && <Text style={styles.checkIcon}>✓</Text>}
              </View>
              {touched.phone && errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password <Text style={styles.required}>*</Text></Text>
              <View style={wrapStyle('password')}>
                <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'password' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={inputStyle('password')}
                  placeholder="Create a password"
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

            {/* Confirm Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password <Text style={styles.required}>*</Text></Text>
              <View style={wrapStyle('confirmPassword')}>
                <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'confirmPassword' ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={inputStyle('confirmPassword')}
                  placeholder="Re-enter your password"
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

            {/* Sign Up Button */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.submitText}>Sign Up</Text>
              }
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.loginButton} onPress={onLoginPress} activeOpacity={0.85}>
              <Text style={styles.loginButtonText}>Back to Log In</Text>
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

  logoBadge: { width: 80, height: 80, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, overflow: 'hidden' },
  logoImage: { width: 56, height: 56 },
  title:     { fontFamily: fonts.headingExtraBold, fontSize: 24, color: colors.primary, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle:  { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: spacing.xl, textAlign: 'center' },

  errorBanner:     { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md, width: '100%', gap: spacing.xs },
  errorBannerText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, flex: 1 },

  nameRow:    { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  fieldGroup: { width: '100%', marginBottom: spacing.md },
  label:      { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, marginBottom: spacing.xs },
  required:   { color: colors.danger },

  inputWrap:        { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.sm, gap: spacing.xs },
  inputWrapFocused: { borderColor: colors.primary, backgroundColor: colors.card },
  inputWrapError:   { borderColor: colors.danger,  backgroundColor: colors.dangerBg },
  inputWrapValid:   { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  inputIcon:    { flexShrink: 0 },
  input:            { flex: 1, height: 46, fontFamily: fonts.body, fontSize: 14, color: colors.text, outlineStyle: 'none' },
  checkIcon:    { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold, marginLeft: spacing.xs },
  eyeBtn:       { paddingLeft: spacing.xs, paddingVertical: spacing.xs },
  errorText:    { fontSize: 11, fontFamily: fonts.body, color: colors.danger, marginTop: 3 },

  submitBtn:      { width: '100%', height: 48, borderRadius: 999, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  submitText:     { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.white, letterSpacing: 0.2 },
  buttonDisabled: { opacity: 0.7 },

  divider: { width: '100%', height: 0.5, backgroundColor: colors.border, marginVertical: spacing.lg },

  loginButton:     { width: '100%', height: 48, borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  loginButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.accent, letterSpacing: 0.2 },
});