import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
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
      // Step 1: Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password
      );
      const user = userCredential.user;

      // Step 2: Set display name in Firebase Auth
      await updateProfile(user, {
        displayName: `${form.firstName.trim()} ${form.lastName.trim()}`,
      });

      // Step 3: Save profile to Firestore (wrapped separately so auth still works if Firestore fails)
      try {
        await setDoc(doc(db, 'guests', user.uid), {
          firstName:   form.firstName.trim(),
          lastName:    form.lastName.trim(),
          email:       form.email.trim(),
          phone:       form.phone.trim(),
          displayName: `${form.firstName.trim()} ${form.lastName.trim()}`,
          createdAt:   serverTimestamp(),
        });
      } catch (firestoreErr) {
        // Firestore save failed but auth succeeded — log it, don't block the user
        console.warn('Firestore write failed (check rules):', firestoreErr.message);
      }

      // Success — pass user up to App.jsx
      onRegister && onRegister(user);

    } catch (err) {
      // Show the raw Firebase error code in dev so you know what's happening
      console.error('Registration error:', err.code, err.message);

      switch (err.code) {
        case 'auth/email-already-in-use':
          setGlobalError('This email is already registered. Please log in instead.');
          break;
        case 'auth/invalid-email':
          setGlobalError('Please enter a valid email address.');
          break;
        case 'auth/weak-password':
          setGlobalError('Password is too weak. Use at least 8 characters.');
          break;
        case 'auth/network-request-failed':
          setGlobalError('Network error. Please check your internet connection.');
          break;
        case 'auth/operation-not-allowed':
          setGlobalError('Email/password sign-up is not enabled. Please contact support.');
          break;
        default:
          // Show the actual Firebase error message in the banner for easier debugging
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
          <View style={styles.card}>

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

  inputWrap:        { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.sm },
  inputWrapFocused: { borderColor: colors.text, backgroundColor: colors.card },
  inputWrapError:   { borderColor: colors.danger,  backgroundColor: colors.dangerBg },
  inputWrapValid:   { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  input:            { flex: 1, height: 44, fontFamily: fonts.body, fontSize: 14, color: colors.text, outlineStyle: 'none' },
  checkIcon:    { fontSize: 13, color: colors.primary, fontFamily: fonts.bodySemiBold, marginLeft: spacing.xs },
  eyeBtn:       { paddingLeft: spacing.sm, paddingVertical: spacing.xs },
  errorText:    { fontSize: 11, fontFamily: fonts.body, color: colors.danger, marginTop: 3 },

  submitBtn:      { width: '100%', height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  submitText:     { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.white, letterSpacing: 0.2 },
  buttonDisabled: { opacity: 0.7 },

  divider: { width: '100%', height: 0.5, backgroundColor: colors.border, marginVertical: spacing.lg },

  loginButton:     { width: '100%', height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center' },
  loginButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.accent, letterSpacing: 0.2 },
});