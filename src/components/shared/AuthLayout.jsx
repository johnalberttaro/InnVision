import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Animated,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shared look for the sign-in pages (Login, Register): the same dark-and-gold
// style as the guest Home page. On wide screens the HM building photo sits in
// a welcome panel beside the form; on phones the photo fills the whole screen
// behind the form card.

const BUILDING = require('../../../assets/hm-building.jpg');
const LOGO = require('../../../assets/logo.png');

export const AUTH = {
  bg: '#17120E',
  text: '#F7F2EA',
  muted: 'rgba(247,242,234,0.70)',
  gold: '#C9A14A',
  goldLight: '#F0D58E',
  ink: '#1C1712',
  inkMuted: '#6E655B',
  line: '#E6DFD3',
  field: '#FBF9F5',
  page: '#F6F2EB',
  danger: '#B3261E',
  dangerBg: '#FDEEEE',
  success: '#1E7B34',
};

// Fills the parent. Written out by hand: React Native 0.85+ (Expo SDK 57)
// removed StyleSheet.absoluteFillObject, so spreading it adds nothing on phones.
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
const web = (s) => (Platform.OS === 'web' ? s : null);

/**
 * Props:
 *  - title, subtitle: form heading
 *  - onBack?: () => void — back arrow (top-left)
 *  - sideHeadline, sideLead: welcome panel text
 *  - sidePoints?: [{ icon, text }] — short reasons shown in the panel
 *  - children: the form
 */
export default function AuthLayout({ title, subtitle, onBack, sideHeadline, sideLead, sidePoints = [], children }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isTablet = width >= 600;

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    const native = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 360, useNativeDriver: native }),
      Animated.timing(rise, { toValue: 0, duration: 360, useNativeDriver: native }),
    ]).start();
  }, [fade, rise]);

  const brand = (
    <View style={styles.brandRow}>
      <View style={styles.logoTile}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </View>
      <Text style={styles.brandName}>
        <Text style={{ color: AUTH.text }}>Inn</Text>
        <Text style={styles.brandGold}>Vision</Text>
      </Text>
    </View>
  );

  const backBtn = !!onBack && (
    <TouchableOpacity
      style={styles.back}
      onPress={onBack}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="arrow-back" size={18} color={AUTH.text} />
    </TouchableOpacity>
  );

  const form = (
    <Animated.View style={[styles.formCard, !isWide && styles.formCardNarrow, { opacity: fade, transform: [{ translateY: rise }] }]}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <View style={{ marginTop: 22 }}>{children}</View>
    </Animated.View>
  );

  if (isWide) {
    return (
      <View style={styles.wideRoot}>
        <View style={styles.side}>
          <Image source={BUILDING} style={styles.sidePhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={styles.sideShade} pointerEvents="none" />
          <View style={styles.sideInner}>
            <View style={styles.sideTop}>
              {backBtn}
              {brand}
            </View>
            <View>
              <Text style={styles.sideHeadline}>{sideHeadline}</Text>
              {!!sideLead && <Text style={styles.sideLead}>{sideLead}</Text>}
              {sidePoints.length > 0 && (
                <View style={styles.points}>
                  {sidePoints.map((p) => (
                    <View key={p.text} style={styles.point}>
                      <View style={styles.pointIcon}><Ionicons name={p.icon} size={15} color={AUTH.goldLight} /></View>
                      <Text style={styles.pointText}>{p.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <Text style={styles.sideFoot}>CCTC Training Hotel · Hospitality Management Department</Text>
          </View>
        </View>

        <KeyboardAvoidingView style={styles.formSide} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
            {form}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    // Phones: the photo and dark shade fill the whole screen (fixed behind
    // the page), and the header + form card scroll on top of it.
    <View style={styles.narrowRoot}>
      <Image source={BUILDING} style={styles.narrowPhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.bandShade} pointerEvents="none" />
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={[styles.narrowScroll, { paddingHorizontal: isTablet ? 32 : 16 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.bandInner}>
            <View style={styles.sideTop}>
              {backBtn}
              {brand}
            </View>
            <Text style={styles.bandHeadline}>{sideHeadline}</Text>
          </View>
          <View style={styles.narrowFormWrap}>{form}</View>
          <Text style={styles.narrowFoot}>CCTC Training Hotel · Hospitality Management Department</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Text field with label, icon, focus ring, error and "valid" tick. */
export function AuthField({
  label, icon, value, onChangeText, placeholder, error, valid, required,
  secure, inputRef, onSubmitEditing, returnKeyType, keyboardType, autoCapitalize = 'none',
  autoComplete, onBlur, style,
}) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>
        {label}{required && <Text style={{ color: AUTH.danger }}> *</Text>}
      </Text>
      <View style={[styles.inputBox, focused && styles.inputFocused, !!error && styles.inputError]}>
        <Ionicons name={icon} size={17} color={error ? AUTH.danger : focused ? AUTH.ink : AUTH.inkMuted} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#A69C8F"
          secureTextEntry={!!secure && !shown}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          blurOnSubmit={returnKeyType !== 'next'}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur && onBlur(); }}
        />
        {valid && !error && <Ionicons name="checkmark-circle" size={17} color={AUTH.success} />}
        {!!secure && (
          <TouchableOpacity onPress={() => setShown((s) => !s)} style={styles.eye} accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
            <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={19} color={AUTH.inkMuted} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

export function AuthButton({ label, onPress, loading, icon }) {
  return (
    <TouchableOpacity
      style={[styles.primary, loading && { opacity: 0.75 }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.88}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={AUTH.ink} />
      ) : (
        <>
          <Text style={styles.primaryText}>{label}</Text>
          {!!icon && <Ionicons name={icon} size={17} color={AUTH.ink} />}
        </>
      )}
    </TouchableOpacity>
  );
}

export function AuthError({ text }) {
  if (!text) return null;
  return (
    <View style={styles.errorBanner} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={17} color={AUTH.danger} />
      <Text style={styles.errorBannerText}>{text}</Text>
    </View>
  );
}

/** "Don't have an account? Register" style line. */
export function AuthSwitch({ prompt, action, onPress }) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchInner}>
        <Text style={styles.switchPrompt}>{prompt}</Text>
        <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.switchAction}>{action}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Wide
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: AUTH.page },
  side: { flex: 1.05, backgroundColor: AUTH.bg, overflow: 'hidden', position: 'relative' },
  sidePhoto: { ...FILL, width: '100%', height: '100%', opacity: 0.5 },
  sideShade: {
    ...FILL,
    backgroundColor: 'rgba(23,18,14,0.72)',
    ...web({
      backgroundColor: 'transparent',
      backgroundImage: [
        'radial-gradient(ellipse at 90% 0%, rgba(201,161,74,0.28) 0%, rgba(201,161,74,0) 50%)',
        'linear-gradient(180deg, rgba(23,18,14,0.55) 0%, rgba(23,18,14,0.78) 55%, rgba(23,18,14,0.96) 100%)',
      ].join(', '),
    }),
  },
  sideInner: { flex: 1, padding: 44, justifyContent: 'space-between', position: 'relative', zIndex: 1 },
  sideTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sideHeadline: {
    fontFamily: 'Inter_800ExtraBold', fontSize: 44, lineHeight: 48, letterSpacing: -1.5,
    color: AUTH.text, maxWidth: 520,
  },
  sideLead: { fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 26, color: AUTH.muted, marginTop: 16, maxWidth: 460 },
  points: { marginTop: 28, gap: 12 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(240,213,142,0.10)', borderWidth: 1, borderColor: 'rgba(240,213,142,0.22)',
  },
  pointText: { fontFamily: 'Inter_500Medium', fontSize: 14.5, color: AUTH.text },
  sideFoot: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: 'rgba(247,242,234,0.45)' },

  formSide: { flex: 1 },
  formScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  // Narrow
  narrowRoot: { flex: 1, backgroundColor: AUTH.bg, overflow: 'hidden', position: 'relative' },
  narrowPhoto: { ...FILL, width: '100%', height: '100%', opacity: 0.45 },
  flex1: { flex: 1 },
  narrowScroll: { flexGrow: 1, paddingTop: 18, paddingBottom: 24 },
  bandShade: {
    ...FILL,
    backgroundColor: 'rgba(23,18,14,0.74)',
    ...web({
      backgroundColor: 'transparent',
      backgroundImage: [
        'radial-gradient(ellipse at 90% 0%, rgba(201,161,74,0.30) 0%, rgba(201,161,74,0) 45%)',
        'linear-gradient(180deg, rgba(23,18,14,0.55) 0%, rgba(23,18,14,0.82) 45%, rgba(23,18,14,0.95) 100%)',
      ].join(', '),
    }),
  },
  bandInner: { position: 'relative', zIndex: 1 },
  bandHeadline: {
    fontFamily: 'Inter_800ExtraBold', fontSize: 28, lineHeight: 32, letterSpacing: -0.8,
    color: AUTH.text, marginTop: 22, maxWidth: 420,
  },
  // Grows to fill the screen, so on tall phones the card sits in the middle
  // of the remaining space instead of leaving an empty area below it.
  narrowFormWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 24 },
  narrowFoot: {
    fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center',
    color: 'rgba(247,242,234,0.45)', marginTop: 4,
  },

  // Brand
  back: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(247,242,234,0.10)', borderWidth: 1, borderColor: 'rgba(247,242,234,0.16)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: '#F7F2EA',
    alignItems: 'center', justifyContent: 'center',
    ...web({ backgroundImage: 'linear-gradient(160deg, #FBF7F0 0%, #EFE6D6 100%)' }),
  },
  logo: { width: 26, height: 26 },
  brandName: { fontFamily: 'Inter_800ExtraBold', fontSize: 20, letterSpacing: -0.5 },
  brandGold: {
    color: AUTH.gold,
    ...web({
      backgroundImage: `linear-gradient(180deg, ${AUTH.goldLight} 0%, ${AUTH.gold} 100%)`,
      WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    }),
  },

  // Form card
  formCard: {
    width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 22,
    padding: 32, borderWidth: 1, borderColor: AUTH.line,
    shadowColor: '#2A2119', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 4,
    ...web({ boxShadow: '0 1px 2px rgba(42,33,25,0.05), 0 18px 48px rgba(42,33,25,0.10)' }),
  },
  formCardNarrow: { padding: 22, borderRadius: 20 },
  title: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, letterSpacing: -0.7, color: AUTH.ink },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14.5, lineHeight: 22, color: AUTH.inkMuted, marginTop: 6 },

  // Fields
  field: { marginBottom: 14 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: AUTH.ink, marginBottom: 7 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50,
    borderRadius: 13, borderWidth: 1, borderColor: AUTH.line, backgroundColor: AUTH.field, paddingHorizontal: 14,
  },
  inputFocused: {
    borderColor: AUTH.gold, backgroundColor: '#FFFFFF',
    ...web({ boxShadow: '0 0 0 4px rgba(201,161,74,0.16)' }),
  },
  inputError: { borderColor: AUTH.danger, backgroundColor: '#FFFBFB' },
  input: {
    flex: 1, minWidth: 0, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 15, color: AUTH.ink,
    ...web({ outlineStyle: 'none' }),
  },
  eye: { paddingVertical: 6, paddingLeft: 2 },
  fieldError: { fontFamily: 'Inter_500Medium', fontSize: 12.5, color: AUTH.danger, marginTop: 6 },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 52, borderRadius: 13, backgroundColor: '#DDBB6C', marginTop: 8,
    ...web({
      backgroundImage: `linear-gradient(180deg, ${AUTH.goldLight} 0%, ${AUTH.gold} 100%)`,
      boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 10px 24px rgba(201,161,74,0.30)',
    }),
  },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15.5, color: AUTH.ink, letterSpacing: -0.1 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16,
    backgroundColor: AUTH.dangerBg, borderWidth: 1, borderColor: '#F3C7C4', borderRadius: 12, padding: 12,
  },
  errorBannerText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13.5, lineHeight: 19, color: AUTH.danger },

  switchRow: { marginTop: 24, alignItems: 'center' },
  switchInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  switchPrompt: { fontFamily: 'Inter_400Regular', fontSize: 14, color: AUTH.inkMuted },
  switchAction: {
    fontFamily: 'Inter_700Bold', fontSize: 14, color: '#8A6A22',
    textDecorationLine: 'underline', textDecorationColor: 'rgba(138,106,34,0.35)',
  },
});