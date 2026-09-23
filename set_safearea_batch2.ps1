Set-Content -Path '.\src\screens\form\Registerscreen.jsx' -Encoding UTF8 -Value @'
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
'@

Set-Content -Path '.\src\screens\reservation\ReservationScreen.jsx' -Encoding UTF8 -Value @'
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Alert,
  Image,
  Platform,
  Animated,
  useWindowDimensions,
} from 'react-native';
// RESOLVED: SafeAreaView moved to 'react-native-safe-area-context' — the
// LogBox warning that flagged this exact file is what surfaced this whole
// migration (see the same fix's full explanation in LoginScreen.jsx).
// Still correctly receives insets here despite rendering inside a Modal
// (App.jsx renders ReservationScreen inside one) — React Context (which
// SafeAreaProvider uses) propagates through Modal's children even though
// Modal renders to a separate native surface.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RangeCalendar from '../../components/reservation/RangeCalendar';
import GuestRoomSelector from '../../components/reservation/GuestRoomSelector';
import DropdownTrigger from '../../components/reservation/DropdownTrigger';
import { useTheme } from '../../context/ThemeContext';
import { lightColors } from '../../utils/theme';
import { formatDate, isCheckOutValid, nightsBetween } from '../../utils/dateHelpers';

const logo = require('../../../assets/logo.png');

const initialRoom = () => ({ adults: 1, children: 0 });

const DESKTOP_BREAKPOINT = 900;
const CONTENT_MAX_WIDTH = 980;

const TRUST_POINTS = [
  { icon: 'shield-checkmark-outline', label: 'Best rate guaranteed', hint: 'Book direct, pay no more.' },
  { icon: 'checkmark-circle-outline', label: 'Instant confirmation', hint: 'No waiting on an email back.' },
  { icon: 'time-outline', label: 'Free cancellation', hint: 'Change your mind, change your dates.' },
];

/**
 * ReservationScreen — STAY DETAILS ONLY.
 *
 * ENHANCED: five concrete fixes/upgrades over the previous version:
 *  1. FIXED DARK-MODE BUG: the close button's icon/text used useTheme()'s
 *     `colors.primary`, which flips to a light cream color in dark mode —
 *     but the button's pill background (`colors.white`) is intentionally
 *     fixed white in both modes, so the flipped text became nearly
 *     unreadable against it. Now uses `lightColors.primary` directly (a
 *     fixed dark color) so it always contrasts against the fixed-white
 *     pill, regardless of the active theme.
 *  2. Emoji icons (📅 👤) replaced with real Ionicons (calendar-outline,
 *     people-outline) — every other screen in the app uses vector icons;
 *     this was the one remaining holdout.
 *  3. CTA button changed from a rounded rectangle to the full pill shape
 *     (borderRadius: 999) used everywhere else in the app now (Book Now,
 *     Sign In to Book Your Stay, the auth screens' buttons, etc.).
 *  4. Added the same fade+slide-in mount animation used on the auth
 *     screens, for consistency — this modal now eases in instead of
 *     appearing instantly.
 *  5. Trust points (Best rate guaranteed / Instant confirmation / Free
 *     cancellation) used to only render on the desktop brand panel —
 *     mobile users never saw that reassurance at all. Added a compact
 *     horizontal version above the CTA on mobile.
 *
 * DESKTOP PASS 2: the earlier fix (max-width + shadow) stopped the card
 * from stretching, but left a large flat void beside it — a centered
 * modal doesn't become a "page" just by capping its width. This pass
 * splits wide layouts into two panels: a brand/trust panel (left) and
 * the booking form (right), joined into a single card so the desktop
 * view reads as one considered layout, not a floating dialog. Mobile is
 * untouched — the brand panel only renders when isDesktop is true.
 *
 * CENTERING PASS: scrollContent now uses flexGrow so the content
 * container is at least as tall as the ScrollView, giving
 * justifyContent/alignItems real space to center the shell within on
 * both mobile and desktop. When the form is taller than the screen,
 * flexGrow doesn't clip anything — the ScrollView still scrolls
 * normally to reach the bottom CTA.
 */
export default function ReservationScreen({ user, onSearch, onClose }) {
  const [checkIn, setCheckIn]   = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const [dateError, setDateError] = useState('');
  const [rooms, setRooms]       = useState([initialRoom()]);
  const [showCalendar, setShowCalendar]           = useState(false);
  const [showGuestSelector, setShowGuestSelector] = useState(false);
  const [errors, setErrors]     = useState({});

  const { colors, spacing, radius, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const styles = useMemo(
    () => getStyles(colors, spacing, radius, fonts, isDesktop),
    [colors, spacing, radius, fonts, isDesktop]
  );

  // Smooth entrance, matching the same fade+slide-in pattern the auth
  // screens use — this modal now eases in instead of appearing instantly.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  const totals = useMemo(() => {
    const totalRooms    = rooms.length;
    const totalAdults   = rooms.reduce((sum, r) => sum + r.adults, 0);
    const totalChildren = rooms.reduce((sum, r) => sum + r.children, 0);
    return { totalRooms, totalAdults, totalChildren, totalGuests: totalAdults + totalChildren };
  }, [rooms]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);

  const handleSelectRange = (newCheckIn, newCheckOut) => {
    setCheckIn(newCheckIn);
    setCheckOut(newCheckOut);
    if (newCheckIn && newCheckOut && !isCheckOutValid(newCheckIn, newCheckOut)) {
      setDateError('Check-out cannot be earlier than or the same as check-in.');
    } else {
      setDateError('');
    }
  };

  const updateRoomAdults   = (i, v) => setRooms(p => p.map((r, idx) => idx === i ? { ...r, adults: v }   : r));
  const updateRoomChildren = (i, v) => setRooms(p => p.map((r, idx) => idx === i ? { ...r, children: v } : r));
  const addRoom    = () => setRooms(p => [...p, initialRoom()]);
  const removeRoom = (i) => setRooms(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p);

  const validate = () => {
    const e = {};
    if (!checkIn || !checkOut)
      e.dates = 'Check-in and check-out dates are required.';
    if (checkIn && checkOut && !isCheckOutValid(checkIn, checkOut))
      e.dates = 'Check-out cannot be earlier than or the same as check-in.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSearch = () => {
    if (!validate()) return;

    if (!user) {
      Alert.alert('Please log in', 'You need to be logged in to book a room.');
      return;
    }

    onSearch({ checkIn, checkOut, nights, rooms, totals });
  };

  const dateSummaryLabel = checkIn && checkOut
    ? `${formatDate(checkIn)}  –  ${formatDate(checkOut)}`
    : checkIn
      ? `${formatDate(checkIn)}  –  Check out`
      : 'Check in  |  Check out';

  const guestSummaryLabel =
    `${totals.totalRooms} Room${totals.totalRooms > 1 ? 's' : ''}, ` +
    `${totals.totalAdults} Adult${totals.totalAdults !== 1 ? 's' : ''}, ` +
    `${totals.totalChildren} Child${totals.totalChildren !== 1 ? 'ren' : ''}`;

  return (
    <SafeAreaView style={styles.screen}>

      {/* ── Header ───────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.logoBadge}>
            <Image source={logo} style={styles.logoImage} resizeMode="contain" />
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
            <Ionicons name="close-outline" size={20} color={lightColors.primary} />
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Content ──────────────────────────────────────────── */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.shell, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Brand / trust panel — desktop only. Fills the space that
              used to just be dark void, with real information instead
              of decoration. */}
          {isDesktop && (
            <View style={styles.brandPanel}>
              <View style={styles.brandPattern} pointerEvents="none" />
              <View style={styles.brandContent}>
                <Image source={logo} style={styles.brandLogo} resizeMode="contain" />
                <Text style={styles.brandHeading}>A stay, sorted.</Text>
                <Text style={styles.brandSubheading}>
                  Pick your dates, tell us who's coming, and we'll hold the room.
                </Text>

                <View style={styles.trustList}>
                  {TRUST_POINTS.map((point) => (
                    <View key={point.label} style={styles.trustRow}>
                      <View style={styles.trustIconWrap}>
                        <Ionicons name={point.icon} size={16} color={colors.white} />
                      </View>
                      <View style={styles.trustTextWrap}>
                        <Text style={styles.trustLabel}>{point.label}</Text>
                        <Text style={styles.trustHint}>{point.hint}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Form panel */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Book Your Stay</Text>
            <Text style={styles.cardSubtitle}>Select your dates and number of guests.</Text>

            <Text style={styles.sectionLabel}>Stay Details</Text>

            <View style={styles.fieldsRow}>
              {/* Stay Dates */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Stay Dates <Text style={styles.required}>*</Text>
                </Text>
                <DropdownTrigger
                  icon={<Ionicons name="calendar-outline" size={16} color={colors.textMuted} />}
                  isOpen={showCalendar}
                  onPress={() => setShowCalendar(true)}
                  error={errors.dates || dateError}
                >
                  <Text
                    style={checkIn ? styles.pillValue : styles.pillPlaceholder}
                    numberOfLines={1}
                  >
                    {dateSummaryLabel}
                  </Text>
                </DropdownTrigger>
                {(errors.dates || dateError)
                  ? <Text style={styles.errorText}>{errors.dates || dateError}</Text>
                  : null}
                {nights > 0 && !dateError
                  ? <Text style={styles.nightsHint}>{nights} night{nights > 1 ? 's' : ''}</Text>
                  : null}
              </View>

              {/* Guests & Rooms */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Guests & Rooms</Text>
                <DropdownTrigger
                  icon={<Ionicons name="people-outline" size={16} color={colors.textMuted} />}
                  isOpen={showGuestSelector}
                  onPress={() => setShowGuestSelector(true)}
                >
                  <Text style={styles.pillValue} numberOfLines={1}>
                    {guestSummaryLabel}
                  </Text>
                </DropdownTrigger>
              </View>
            </View>

            {/* Mobile trust row — the desktop brand panel already shows
                these; mobile never did, so this compact version gives
                mobile users the same reassurance in one line instead of
                the full sidebar treatment. */}
            {!isDesktop && (
              <View style={styles.mobileTrustRow}>
                {TRUST_POINTS.map((point) => (
                  <View key={point.label} style={styles.mobileTrustItem}>
                    <Ionicons name={point.icon} size={14} color={colors.accent} />
                    <Text style={styles.mobileTrustLabel} numberOfLines={2}>{point.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* CTA — same on every platform. In Expo Go / native
                (Platform.OS !== 'web') isDesktop is always false, so this
                is the only submit path; never hide it there. */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleSearch}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>Check Rates & Availability</Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>*Terms and conditions apply.</Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Calendar Modal ────────────────────────────────────── */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <RangeCalendar
              checkIn={checkIn}
              checkOut={checkOut}
              onSelectRange={handleSelectRange}
              onDone={() => setShowCalendar(false)}
            />
          </View>
        </View>
      </Modal>

      {/* ── Guest Selector Modal ──────────────────────────────── */}
      <Modal
        visible={showGuestSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGuestSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <GuestRoomSelector
              rooms={rooms}
              onChangeAdults={updateRoomAdults}
              onChangeChildren={updateRoomChildren}
              onAddRoom={addRoom}
              onRemoveRoom={removeRoom}
              onDone={() => setShowGuestSelector(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStyles(colors, spacing, radius, fonts, isDesktop) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.heroBackground,
    },

    /* Header */
    header: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    headerInner: {
      width: '100%',
      maxWidth: isDesktop ? CONTENT_MAX_WIDTH : undefined,
      marginHorizontal: isDesktop ? 'auto' : 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    logoBadge: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoImage: { width: 28, height: 28 },
    closeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      gap: spacing.xs,
      ...Platform.select({ web: { cursor: 'pointer', transitionDuration: '150ms' } }),
    },
    closeText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      color: lightColors.primary,
    },

    /* Scroll */
    scroll: { flex: 1 },
    scrollContent: {
      // flexGrow makes the content container at least as tall as the
      // ScrollView itself — that's what gives justifyContent/alignItems
      // real space to center the shell within, on both mobile and
      // desktop. When the form is taller than the screen, flexGrow
      // doesn't clip anything: the container just grows past 100% and
      // the ScrollView scrolls normally to reach the bottom CTA.
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
      paddingVertical: spacing.xl,
    },

    /* Shell — holds brand panel + card side by side on desktop */
    shell: {
      width: '100%',
      maxWidth: isDesktop ? CONTENT_MAX_WIDTH : undefined,
      flexDirection: isDesktop ? 'row' : 'column',
      borderRadius: radius.lg,
      overflow: 'hidden',
      ...Platform.select({
        web: { boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)' },
        default: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.25,
          shadowRadius: 20,
          elevation: 8,
        },
      }),
    },

    /* Brand panel (desktop only) */
    brandPanel: {
      width: 320,
      backgroundColor: colors.heroBackground,
      padding: spacing.xl,
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      borderRightWidth: 1,
      borderRightColor: 'rgba(255,255,255,0.08)',
    },
    brandPattern: {
      position: 'absolute',
      top: -60,
      right: -60,
      width: 260,
      height: 260,
      borderRadius: 260,
      borderWidth: 40,
      borderColor: 'rgba(255,255,255,0.04)',
    },
    brandContent: { position: 'relative' },
    brandLogo: {
      width: 36,
      height: 36,
      marginBottom: spacing.lg,
      tintColor: colors.white,
    },
    brandHeading: {
      fontFamily: fonts.headingExtraBold,
      fontSize: 26,
      color: colors.white,
      marginBottom: spacing.sm,
    },
    brandSubheading: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: 'rgba(255,255,255,0.65)',
      marginBottom: spacing.xl,
    },
    trustList: { gap: spacing.md },
    trustRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    trustIconWrap: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      backgroundColor: 'rgba(255,255,255,0.10)',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    trustTextWrap: { flex: 1 },
    trustLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      color: colors.white,
      marginBottom: 2,
    },
    trustHint: {
      fontFamily: fonts.body,
      fontSize: 11.5,
      lineHeight: 15,
      color: 'rgba(255,255,255,0.55)',
    },

    /* Form panel */
    card: {
      flex: isDesktop ? 1 : undefined,
      width: isDesktop ? undefined : '100%',
      backgroundColor: colors.card,
      borderWidth: isDesktop ? 0 : 0.5,
      borderColor: colors.border,
      borderRadius: isDesktop ? 0 : radius.lg,
      padding: isDesktop ? spacing.xl * 1.4 : spacing.xl,
    },
    cardTitle: {
      fontFamily: fonts.headingExtraBold,
      fontSize: isDesktop ? 24 : 22,
      color: colors.primary,
      textAlign: isDesktop ? 'left' : 'center',
      marginBottom: spacing.xs,
    },
    cardSubtitle: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: isDesktop ? 'left' : 'center',
      marginBottom: spacing.xl,
    },

    /* Section label */
    sectionLabel: {
      fontFamily: fonts.headingBold,
      fontSize: 12,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.md,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },

    /* Fields */
    fieldsRow: {
      flexDirection: isDesktop ? 'row' : 'column',
      alignItems: isDesktop ? 'flex-start' : 'stretch',
      gap: spacing.md,
    },
    fieldGroup: {
      flex: isDesktop ? 1 : undefined,
      marginBottom: isDesktop ? 0 : spacing.md,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    required: { color: colors.danger },
    errorText: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: colors.danger,
      marginTop: spacing.xs,
    },
    pillValue: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },
    pillPlaceholder: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textMuted,
    },
    nightsHint: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },

    /* Mobile trust row */
    mobileTrustRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    mobileTrustItem: { flex: 1, alignItems: 'center', gap: 4 },
    mobileTrustLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: 10.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 13,
    },

    /* CTA */
    ctaButton: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      height: 48,
      width: isDesktop ? 260 : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
      ...Platform.select({ web: { cursor: 'pointer', transitionDuration: '150ms' } }),
    },
    ctaText: {
      color: colors.onPrimary,
      fontSize: 15,
      fontFamily: fonts.headingSemiBold,
      letterSpacing: 0.3,
    },
    termsText: {
      fontFamily: fonts.body,
      fontSize: 10,
      color: colors.textMuted,
      textAlign: isDesktop ? 'left' : 'right',
      marginTop: spacing.sm,
    },

    /* Modals */
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlayDim,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalSheet: {
      maxHeight: '85%',
      maxWidth: isDesktop ? 480 : undefined,
      width: isDesktop ? '100%' : '100%',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      overflow: 'hidden',
      alignSelf: isDesktop ? 'center' : 'stretch',
    },
  });
}
'@

Set-Content -Path '.\src\components\roomRates\RateCard.jsx' -Encoding UTF8 -Value @'
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  FlatList,
  Image,
  Animated,
  useWindowDimensions,
} from 'react-native';
// RESOLVED: SafeAreaView moved to 'react-native-safe-area-context' — see
// the same fix's full explanation in LoginScreen.jsx. Still correctly
// receives insets here despite rendering inside a Modal — React Context
// (which SafeAreaProvider uses) propagates through Modal's children even
// though Modal renders to a separate native surface.
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';

const MAX_CARD_WIDTH = 720;

/**
 * RateCard — responsive room card + detail modal.
 *
 * Props:
 *  - rate: room rate object
 *  - onReserve: () => void
 *  - cardWidth: number (optional) — pass the pre-calculated column width
 *    from RoomSelectionScreen so the image fills exactly the card, not the
 *    full screen width. Falls back to (winWidth - padding) if omitted.
 */
export default function RateCard({ rate, onReserve, cardWidth: propCardWidth }) {
  // NOTE: also grab `height` here — we need it to give the modal a real
  // pixel height on native. See comment near modalContainer below.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab]       = useState('rates');
  const cardScale = useRef(new Animated.Value(1)).current;

  // Use the prop width (from 2-col grid) if provided, otherwise full width
  const cardWidth   = propCardWidth ?? Math.min(winWidth - spacing.lg * 2, MAX_CARD_WIDTH);
  // 16:9 image — but cap height so cards don't get too tall on wide screens
  const imageHeight = Math.min(Math.round(cardWidth * (9 / 16)), 220);

  const tabs = [
    { key: 'rates',      label: 'Rates' },
    { key: 'inclusions', label: 'Room & Inclusions' },
    { key: 'pictures',   label: 'Pictures' },
    { key: 'tnc',        label: 'Terms & Conditions' },
  ];

  const handleOpenModal = () => { setActiveTab('rates'); setModalVisible(true); };
  const pressIn  = () => Animated.spring(cardScale, { toValue: 0.985, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(cardScale, { toValue: 1,     useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  return (
    <>
      {/* ── Card ─────────────────────────────────────────────── */}
      <Animated.View style={[styles.cardWrapper, { transform: [{ scale: cardScale }] }]}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={handleOpenModal}
          onPressIn={pressIn}
          onPressOut={pressOut}
        >
          {/* Image carousel — uses the exact card width so nothing is clipped */}
          <ImageCarousel
            images={rate.images}
            width={cardWidth}
            height={imageHeight}
            label={rate.name}
          />

          <View style={styles.cardBody}>
            <Text style={styles.roomName}>{rate.name}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.fromLabel}>From </Text>
              <Text style={styles.price}>{formatCurrency(rate.price)}</Text>
              <Text style={styles.perNight}> / night </Text>
              <Text style={styles.strikePrice}>{formatCurrency(rate.originalPrice)}</Text>
            </View>
            <Text style={styles.taxNote}>*{rate.taxNote}</Text>

            <View style={styles.bottomRow}>
              <Text style={styles.note}>* {rate.note}</Text>
              <TouchableOpacity
                style={styles.reserveButton}
                activeOpacity={0.85}
                onPress={handleOpenModal}
              >
                <Text style={styles.reserveText}>RESERVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Modal ────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.backdrop}>
          {/*
            FIX (mobile bug): modalContainer must get a real `height`, not
            just `maxHeight`. `maxHeight` alone is only a clamp — Yoga still
            shrink-wraps the container around its children first, and a
            `flexGrow` child (tabContent) contributes ~0 to that shrink-wrap
            measurement. That circular dependency is exactly why the header
            and tab bar rendered but the ScrollView body (RATES / BOOK
            button) collapsed to 0 height and was untappable on native,
            while it happened to work on web (real CSS resolves this
            differently). Giving the container a concrete `height` breaks
            the circularity and lets `tabContent`'s `flexGrow: 1` actually
            fill real space.
          */}
          <SafeAreaView style={[styles.modalContainer, { height: Math.round(winHeight * 0.9) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{rate.name.toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>CLOSE ✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabBar}
              contentContainerStyle={styles.tabBarContent}
            >
              {tabs.map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                    {tab.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={styles.tabContentContainer}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === 'rates'      && <RatesTab      rate={rate} onReserve={() => { setModalVisible(false); onReserve && onReserve(rate); }} />}
              {activeTab === 'inclusions' && <InclusionsTab rate={rate} />}
              {activeTab === 'pictures'   && <PicturesTab   rate={rate} winWidth={winWidth} />}
              {activeTab === 'tnc'        && <TncTab        onBack={() => setActiveTab('rates')} />}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

/* ── Responsive Image Carousel ──────────────────────────────────────────── */
function ImageCarousel({ images, width, height, label }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const hasImages = Array.isArray(images) && images.length > 0;

  const goTo = (newIndex) => {
    const clamped = Math.max(0, Math.min(newIndex, images.length - 1));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  const onMomentumScrollEnd = (e) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  if (!hasImages) {
    return (
      <View style={[carouselStyles.slot, { width, height }]}>
        <Text style={carouselStyles.fallbackIcon}>🛏️</Text>
        <Text style={carouselStyles.fallbackText}>No image available</Text>
      </View>
    );
  }

  return (
    // overflow:hidden clips the FlatList but we keep arrows OUTSIDE the clip
    <View style={{ width, height, position: 'relative' }}>
      {/* Clipped image strip */}
      <View style={[carouselStyles.slot, { width, height, overflow: 'hidden' }]}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <Image
              source={item.source ? item.source : { uri: item.uri }}
              style={{ width, height }}
              resizeMode="cover"
            />
          )}
        />

        {/* Dot indicators */}
        {images.length > 1 && (
          <View style={carouselStyles.dotsRow}>
            {images.map((_, i) => (
              <View key={i} style={[carouselStyles.dot, i === index && carouselStyles.dotActive]} />
            ))}
          </View>
        )}

        {/* Image label overlay */}
        <View style={carouselStyles.labelOverlay}>
          <Text style={carouselStyles.labelText}>{images[index]?.label || label}</Text>
        </View>
      </View>

      {/* Arrows sit OUTSIDE the overflow:hidden clip so they are fully visible */}
      {images.length > 1 && (
        <>
          <TouchableOpacity
            style={[carouselStyles.arrow, carouselStyles.arrowLeft]}
            onPress={() => goTo(index - 1)}
            activeOpacity={0.7}
          >
            <Text style={carouselStyles.arrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[carouselStyles.arrow, carouselStyles.arrowRight]}
            onPress={() => goTo(index + 1)}
            activeOpacity={0.7}
          >
            <Text style={carouselStyles.arrowText}>›</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

/* ── Tab: Rates ─────────────────────────────────────────────────────────── */
function RatesTab({ rate, onReserve }) {
  return (
    <View style={tabStyles.container}>
      <Text style={tabStyles.sectionTitle}>BEST AVAILABLE RATE</Text>

      <View style={tabStyles.rateRow}>
        <View style={tabStyles.rateInfo}>
          <Text style={tabStyles.rateType}>Room only</Text>
          <Text style={tabStyles.ratePoints}>▶ CCTC</Text>
        </View>
        <View style={tabStyles.ratePrices}>
          <Text style={tabStyles.ratePriceMain}>{formatCurrency(rate.price)}</Text>
          <Text style={tabStyles.ratePriceStrike}>{formatCurrency(rate.originalPrice)}</Text>
        </View>
        <TouchableOpacity style={tabStyles.bookBtn} onPress={onReserve} activeOpacity={0.8}>
          <Text style={tabStyles.bookBtnText}>BOOK</Text>
        </TouchableOpacity>
      </View>

      {rate.bbPrice && (
        <View style={tabStyles.rateRow}>
          <View style={tabStyles.rateInfo}>
            <Text style={tabStyles.rateType}>Bed and breakfast</Text>
            <Text style={tabStyles.ratePoints}>▶ CCTC</Text>
          </View>
          <View style={tabStyles.ratePrices}>
            <Text style={tabStyles.ratePriceMain}>{formatCurrency(rate.bbPrice)}</Text>
            <Text style={tabStyles.ratePriceStrike}>{formatCurrency(rate.bbOriginalPrice)}</Text>
          </View>
          <TouchableOpacity style={tabStyles.bookBtn} onPress={onReserve} activeOpacity={0.8}>
            <Text style={tabStyles.bookBtnText}>BOOK</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={tabStyles.footNote}>*excl. of taxes and charges</Text>
      <Text style={[tabStyles.footNote, { fontFamily: fonts.bodySemiBold, marginTop: 4 }]}>
        * BOOK NOW 
      </Text>
    </View>
  );
}

/* ── Tab: Room & Inclusions ─────────────────────────────────────────────── */
function InclusionsTab({ rate }) {
  return (
    <View style={tabStyles.container}>
      {rate.description ? <Text style={tabStyles.roomDesc}>{rate.description}</Text> : null}
      <View style={tabStyles.detailGrid}>
        <DetailItem label="Room size"     value={rate.size} />
        <DetailItem label="Bed type"      value={rate.bed} />
        <DetailItem label="Max occupancy" value={rate.occupancy} />
        <DetailItem label="Floor"         value={rate.floor} />
      </View>
      <Text style={tabStyles.sectionTitle}>INCLUSIONS</Text>
      {(rate.inclusions || []).map((item, i) => (
        <View key={i} style={tabStyles.inclusionRow}>
          <Text style={tabStyles.inclusionBullet}>✓</Text>
          <Text style={tabStyles.inclusionText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailItem({ label, value }) {
  return (
    <View style={tabStyles.detailItem}>
      <Text style={tabStyles.detailLabel}>{label}</Text>
      <Text style={tabStyles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

/* ── Tab: Pictures ──────────────────────────────────────────────────────── */
function PicturesTab({ rate, winWidth }) {
  const hasImages = rate.images && rate.images.length > 0;
  const thumbSize = (winWidth - spacing.md * 2 - 16) / 3;

  if (hasImages) {
    const modalWidth = Math.min(winWidth, MAX_CARD_WIDTH);
    const modalImgH  = Math.round(modalWidth * (9 / 16));
    return (
      <View style={tabStyles.container}>
        <ImageCarousel images={rate.images} width={modalWidth} height={modalImgH} label={rate.name} />
        <View style={tabStyles.thumbRow}>
          {rate.images.map((img, i) => (
            <View key={i} style={[tabStyles.thumbSlot, { width: thumbSize }]}>
              <Image
                source={img.source ? img.source : { uri: img.uri }}
                style={[tabStyles.thumbImage, { width: thumbSize, height: thumbSize * (3 / 4) }]}
                resizeMode="cover"
              />
              <Text style={tabStyles.picLabel}>{img.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={tabStyles.container}>
      <View style={tabStyles.picturesGrid}>
        {['Bedroom view', 'Bathroom', 'City view'].map((lbl, i) => (
          <View key={i} style={[tabStyles.pictureSlot, { width: thumbSize, height: thumbSize * (3 / 4) }]}>
            <Text style={tabStyles.picIcon}>📷</Text>
            <Text style={tabStyles.picLabel}>{lbl}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Tab: Terms & Conditions ────────────────────────────────────────────── */
const TNC_ITEMS = [
  'Check-in time is at 2:00pm and check-out time is on or before 12:00 noon. Early check-in and late check-out may be arranged subject to room availability and appropriate charges.',
  'Request for extension of stay must be made at the Front Desk at least 24 hours prior to your check-out date, subject to room availability and payment of applicable charges.',
  'All changes in booking, such as but not limited to, change in name, date, no. of nights, type and number of rooms, and add-ons shall be allowed only until 2:00 pm of check-in date, free of charge.',
  'Cancellation of booking made more than 24 hours prior to the check-in date shall be free of charge. If cancellation is made within 24 hours prior to check-in date or guest is a no-show, the first night shall be charged.',
  'Room reservations for bookings made online which have not been prepaid before check-in shall be held only until 4:00 pm of the check-in date.',
  "To avail of Senior Citizen's or PWD discount, the qualified guest shall be personally present during check-in and shall present their ID.",
  'Smoking or using any type of e-cigarette is strictly prohibited inside the hotel premises. Violators will be penalized accordingly.',
  'Guests are not allowed to bring pets, appliances, dangerous chemicals, explosives, or firearms into the hotel.',
  'The Hotel shall not be responsible or liable for any loss or damage to your property during your stay.',
  'The Hotel reserves the right to refuse accommodation to individuals suspected of suffering from communicable illnesses.',
  'The Hotel reserves the right to terminate your booking if you violate any hotel policies or compromise the safety of staff and guests.',
  'Go Hotels is committed to protecting your privacy in accordance with the Data Privacy Act of 2012.',
];

function TncTab({ onBack }) {
  return (
    <View style={tabStyles.container}>
      <TouchableOpacity style={tabStyles.backBtn} onPress={onBack}>
        <Text style={tabStyles.backBtnText}>{'< Back to Rates'}</Text>
      </TouchableOpacity>
      <Text style={tabStyles.tncHeader}>
        The following are the highlighted Terms & Conditions of the Hotel.
      </Text>
      {TNC_ITEMS.map((item, i) => (
        <View key={i} style={tabStyles.tncRow}>
          <Text style={tabStyles.tncNum}>{i + 1}.</Text>
          <Text style={tabStyles.tncText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/* ── Carousel styles ────────────────────────────────────────────────────── */
const carouselStyles = StyleSheet.create({
  slot: {
    backgroundColor: colors.cardAlt,
    position: 'relative',
  },
  fallbackIcon: {
    fontSize: 40,
    textAlign: 'center',
    marginTop: 50,
  },
  fallbackText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  labelOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.38)',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  labelText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  // Arrows sit OUTSIDE overflow:hidden so they are never clipped
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowLeft:  { left: 6 },
  arrowRight: { right: 6 },
  arrowText: {
    color: '#fff',
    fontSize: 22,
    fontFamily: fonts.headingBold,
    lineHeight: 24,
  },
  dotsRow: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
  },
});

/* ── Card styles ────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardBody: {
    padding: spacing.md,
  },
  roomName: {
    fontSize: 15,
    fontFamily: fonts.headingBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  fromLabel:   { fontSize: 11, fontFamily: fonts.body,             color: colors.textMuted },
  price:       { fontSize: 15, fontFamily: fonts.headingExtraBold, color: colors.accent },
  perNight:    { fontSize: 10, fontFamily: fonts.body,             color: colors.textMuted },
  strikePrice: { fontSize: 10, fontFamily: fonts.body,             color: colors.priceStrike, textDecorationLine: 'line-through' },
  taxNote: {
    fontSize: 9,
    fontFamily: fonts.body,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  note: {
    fontSize: 9,
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
    flex: 1,
    marginRight: spacing.xs,
  },
  reserveButton: {
    backgroundColor: colors.step,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.md,
    shadowColor: colors.step,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  reserveText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: fonts.headingSemiBold,
    letterSpacing: 0.5,
  },

  /* Modal */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // A real `height` (winHeight * 0.9) is passed inline in the render
    // method above. Do NOT swap this back to `maxHeight` — a clamp with no
    // definite size collapses the `flexGrow` ScrollView below to 0 height
    // on native, which was the actual cause of the invisible BOOK button.
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  modalTitle:   { fontSize: 15, fontFamily: fonts.headingBold, color: colors.accent, letterSpacing: 0.5 },
  closeBtn:     { paddingVertical: 4, paddingHorizontal: 8 },
  closeBtnText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  tabBar:        { borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: '#F5F5F5', flexGrow: 0 },
  tabBarContent: { flexDirection: 'row', alignItems: 'center' },
  tabBtn:        { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:  { borderBottomColor: colors.accent, backgroundColor: colors.white },
  tabLabel:      { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, letterSpacing: 0.4 },
  tabLabelActive:{ color: colors.accent },
  // FIX: `flexGrow`/`flexShrink` instead of a bare `flex: 1`, paired with a
  // contentContainerStyle below, so the ScrollView reliably gets real
  // measured height from its parent (which now has a real pixel maxHeight)
  // on both native and web.
  tabContent:          { flexGrow: 1, flexShrink: 1 },
  tabContentContainer: { flexGrow: 1 },
});

/* ── Tab content styles ─────────────────────────────────────────────────── */
const tabStyles = StyleSheet.create({
  container:    { padding: spacing.md, paddingBottom: 32 },
  sectionTitle: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },

  rateRow:         { flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: 8, gap: 8 },
  rateInfo:        { flex: 1 },
  rateType:        { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 2 },
  ratePoints:      { fontSize: 11, fontFamily: fonts.body, color: colors.accent },
  ratePrices:      { alignItems: 'flex-end', marginRight: 4 },
  ratePriceMain:   { fontSize: 14, fontFamily: fonts.headingBold, color: colors.accent },
  ratePriceStrike: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, textDecorationLine: 'line-through' },
  bookBtn:         { backgroundColor: colors.primaryDark, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm },
  bookBtnText:     { color: '#fff', fontSize: 11, fontFamily: fonts.headingSemiBold, letterSpacing: 0.4 },
  footNote:        { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },

  roomDesc:        { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 20, marginBottom: 14 },
  detailGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  detailItem:      { width: '47%' },
  detailLabel:     { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  detailValue:     { fontSize: 13, fontFamily: fonts.body, color: colors.text },
  inclusionRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 8 },
  inclusionBullet: { fontSize: 12, color: colors.accent, fontFamily: fonts.body, marginTop: 1 },
  inclusionText:   { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, flex: 1 },

  picturesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pictureSlot:  { backgroundColor: colors.cardAlt, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.border, gap: 4 },
  picIcon:      { fontSize: 28 },
  picLabel:     { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 4 },
  thumbRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumbSlot:    { alignItems: 'center', gap: 4 },
  thumbImage:   { borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border },

  backBtn:     { marginBottom: 12 },
  backBtnText: { fontSize: 12, fontFamily: fonts.body, color: colors.accent },
  tncHeader:   { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 12, lineHeight: 18 },
  tncRow:      { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 8 },
  tncNum:      { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.accent, minWidth: 20 },
  tncText:     { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, flex: 1, lineHeight: 18 },
});
'@
Write-Host 'set_safearea_batch2: 3 file(s) written OK'
