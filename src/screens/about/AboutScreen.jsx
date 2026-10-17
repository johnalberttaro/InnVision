import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Appfooter from '../../components/shared/Appfooter';
import GuestPageTop from '../../components/shared/GuestPageTop';
import { DEVELOPERS } from '../../config/developers';
import { useTheme } from '../../context/ThemeContext';

const LOGO_SOURCE = require('../../../assets/logo.png');

/**
 * AboutScreen — what InnVision is, why it was built, what it does, who
 * built it and with what.
 *
 * REDESIGNED (Oct 2026) to match the Home page: dark top + hero (shared
 * GuestPageTop), Inter type, gold accents, clean sections, then the footer.
 * The "Developed By" cards still come straight from src/config/developers.js
 * — edit that file to change photos, names or roles.
 *
 * Props:
 *  - onBack: () => void
 */

const GOLD = '#C9A14A';
const GOLD_LIGHT = '#F0D58E';
const F = {
  display: 'Inter_800ExtraBold',
  bold: 'Inter_700Bold',
  semi: 'Inter_600SemiBold',
  medium: 'Inter_500Medium',
  body: 'Inter_400Regular',
};
const web = (style) => (Platform.OS === 'web' ? style : null);

const GUEST_CYCLE = [
  { step: 1, label: 'Reservation', icon: 'calendar-outline' },
  { step: 2, label: 'Check-in',    icon: 'log-in-outline' },
  { step: 3, label: 'Room status', icon: 'pulse-outline' },
  { step: 4, label: 'Billing',     icon: 'receipt-outline' },
  { step: 5, label: 'Check-out',   icon: 'log-out-outline' },
];

const FEATURES = [
  { icon: 'bed-outline',       title: 'Online booking',          text: 'Guests browse rooms and venues, see live availability and reserve online.' },
  { icon: 'pulse-outline',     title: 'Live room status',        text: 'Vacant, occupied, reserved and out-of-service rooms at a glance.' },
  { icon: 'key-outline',       title: 'Check-in and check-out',  text: 'Front desk processes arrivals, departures and stay extensions.' },
  { icon: 'receipt-outline',   title: 'Folios and billing',      text: 'Every charge and payment recorded on the guest folio, with receipts.' },
  { icon: 'bar-chart-outline', title: 'Reports',                 text: 'Occupancy and revenue reports for administrators.' },
  { icon: 'notifications-outline', title: 'Guest reminders',     text: 'Check-in and check-out reminders sent to guests automatically.' },
];

const BUILT_WITH = [
  { label: 'Expo and React Native', detail: 'Web and mobile app', icon: 'phone-portrait-outline' },
  { label: 'Supabase Postgres',     detail: 'Database',           icon: 'server-outline' },
  { label: 'Supabase Auth',         detail: 'Accounts and sign-in', icon: 'shield-checkmark-outline' },
];

function getInitials(name) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export default function AboutScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const isTablet = width >= 640;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, { isWide, isTablet, isDark }), [colors, isWide, isTablet, isDark]);

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <GuestPageTop
          title="About"
          onBack={onBack}
          headline="Front office software, built for a training hotel."
          lead="InnVision runs the Hospitality Management training hotel of Consolatrix College of Toledo City, Inc. It replaces logbooks and paper forms with one live system, from the first booking to the final check-out."
        />

        {/* ── The guest cycle ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.inner}>
            <View style={styles.brandRow}>
              <View style={styles.logoTile}>
                <Image source={LOGO_SOURCE} style={styles.logoImage} resizeMode="contain" />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.brandName}>InnVision</Text>
                <Text style={styles.brandTagline}>Real-time front office and guest service management</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle} accessibilityRole="header">One system for the whole stay</Text>
            <Text style={styles.sectionLead}>Each step of a guest's stay happens in the same place, so every team sees the same up-to-date picture.</Text>

            <View style={styles.cycle}>
              {GUEST_CYCLE.map((item, i) => (
                <View key={item.step} style={[styles.cycleStep, i > 0 && styles.cycleStepDivider]}>
                  <View style={styles.cycleIcon}>
                    <Ionicons name={item.icon} size={18} color={styles.goldIcon.color} />
                  </View>
                  <Text style={styles.cycleNumber}>{item.step}</Text>
                  <Text style={styles.cycleLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Purpose ─────────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionTint]}>
          <View style={[styles.inner, styles.purposeWrap]}>
            <Text style={styles.purposeLabel}>Why it was built</Text>
            <Text style={styles.purposeText}>
              A capstone project for the Department of Hospitality Management, InnVision gives HM students
              hands-on practice with the same front office work done in real hotels using a property management system.
            </Text>
          </View>
        </View>

        {/* ── Key features ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.inner}>
            <Text style={styles.sectionTitle} accessibilityRole="header">What it does</Text>
            <View style={styles.featureGrid}>
              {FEATURES.map((f) => (
                <View key={f.title} style={styles.feature}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={f.icon} size={18} color={styles.goldIcon.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureText}>{f.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Developed by ────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionTint]}>
          <View style={styles.inner}>
            <Text style={styles.sectionTitle} accessibilityRole="header">The team</Text>
            <Text style={styles.sectionLead}>
              Bachelor of Science in Hospitality Management, Consolatrix College of Toledo City, Inc. Academic year 2025–2026.
            </Text>
            <View style={styles.devGrid}>
              {DEVELOPERS.map((dev) => (
                <View key={dev.name} style={styles.devCard}>
                  <View style={styles.devPhotoWrap}>
                    {dev.photo
                      ? <Image source={dev.photo} style={styles.devPhoto} resizeMode="cover" />
                      : <Text style={styles.devInitials}>{getInitials(dev.name)}</Text>}
                  </View>
                  <Text style={styles.devName} numberOfLines={2}>{dev.name}</Text>
                  <Text style={styles.devRole}>{dev.role}</Text>
                  {!!dev.description && <Text style={styles.devDescription}>{dev.description}</Text>}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Built with ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.inner}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Built with</Text>
            <View style={styles.builtRow}>
              {BUILT_WITH.map((b) => (
                <View key={b.label} style={styles.builtChip}>
                  <Ionicons name={b.icon} size={17} color={styles.goldIcon.color} />
                  <View>
                    <Text style={styles.builtLabel}>{b.label}</Text>
                    <Text style={styles.builtDetail}>{b.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.version}>Version 1.0.0, published 2026</Text>
          </View>
        </View>

        <Appfooter />
      </ScrollView>
    </View>
  );
}

function getStyles(colors, { isWide, isTablet, isDark }) {
  const gutter = isTablet ? 32 : 20;
  const cardShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 14px 34px rgba(0,0,0,0.35)'
    : '0 1px 2px rgba(43,36,28,0.06), 0 14px 34px rgba(43,36,28,0.09)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,36,28,0.08)';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, #1E1A14 0%, #17130F 100%)'
          : 'linear-gradient(180deg, #FBF8F3 0%, #F4EDE2 100%)',
      }),
    },
    scroll: { flex: 1 },
    goldIcon: { color: isDark ? GOLD_LIGHT : '#6B4E1E' },

    section: { paddingHorizontal: gutter, paddingVertical: isWide ? 80 : 52 },
    sectionTint: {
      backgroundColor: colors.cardAlt,
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 100%)'
          : 'linear-gradient(180deg, #F3EBDD 0%, #EFE5D4 100%)',
      }),
    },
    inner: { width: '100%', maxWidth: 1160, alignSelf: 'center' },
    sectionTitle: {
      fontFamily: F.display, fontSize: isTablet ? 36 : 28, lineHeight: isTablet ? 40 : 32,
      letterSpacing: isTablet ? -1.2 : -0.9, color: colors.text,
    },
    sectionLead: { marginTop: 8, fontSize: 15, lineHeight: 23, fontFamily: F.body, color: colors.textMuted, maxWidth: 640 },

    /* Brand */
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: isWide ? 48 : 32 },
    logoTile: {
      width: 56, height: 56, borderRadius: 16, backgroundColor: '#FFFFFF',
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
    },
    logoImage: { width: 44, height: 44 },
    brandName: { fontFamily: F.display, fontSize: 20, letterSpacing: -0.5, color: colors.text },
    brandTagline: { marginTop: 2, fontFamily: F.body, fontSize: 13, color: colors.textMuted },

    /* Guest cycle */
    cycle: {
      marginTop: 28,
      flexDirection: isTablet ? 'row' : 'column',
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
      overflow: 'hidden',
    },
    cycleStep: {
      flex: isTablet ? 1 : undefined,
      flexDirection: isTablet ? 'column' : 'row',
      alignItems: isTablet ? 'flex-start' : 'center',
      gap: isTablet ? 0 : 14,
      padding: isTablet ? 22 : 16,
    },
    cycleStepDivider: isTablet
      ? { borderLeftWidth: 1, borderLeftColor: hairline }
      : { borderTopWidth: 1, borderTopColor: hairline },
    cycleIcon: {
      width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(240,213,142,0.16)' : '#F1E3BC',
    },
    cycleNumber: {
      marginTop: isTablet ? 14 : 0,
      fontFamily: F.display, fontSize: isTablet ? 28 : 22, letterSpacing: -1, color: GOLD,
      ...web({
        backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, #A87E2F 100%)`,
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      }),
    },
    cycleLabel: { marginTop: isTablet ? 2 : 0, fontFamily: F.bold, fontSize: 16, letterSpacing: -0.3, color: colors.text },

    /* Purpose */
    purposeWrap: { maxWidth: 900 },
    purposeLabel: { fontFamily: F.semi, fontSize: 14, color: isDark ? GOLD_LIGHT : '#8A6524', marginBottom: 12 },
    purposeText: {
      fontFamily: F.bold, fontSize: isWide ? 30 : isTablet ? 25 : 21, lineHeight: isWide ? 40 : isTablet ? 34 : 29,
      letterSpacing: isTablet ? -0.8 : -0.5, color: colors.text,
    },

    /* Features */
    featureGrid: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', columnGap: 40, rowGap: 28 },
    feature: { flexDirection: 'row', gap: 14, width: isWide ? '30%' : isTablet ? '46%' : '100%', flexGrow: 1 },
    featureIcon: {
      width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(240,213,142,0.16)' : '#E9D6A6',
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, rgba(240,213,142,0.22) 0%, rgba(201,161,74,0.14) 100%)'
          : 'linear-gradient(180deg, #F6E7BF 0%, #E9D19A 100%)',
      }),
    },
    featureTitle: { fontFamily: F.bold, fontSize: 16, lineHeight: 22, letterSpacing: -0.3, color: colors.text },
    featureText: { marginTop: 3, fontFamily: F.body, fontSize: 14, lineHeight: 22, color: colors.textMuted },

    /* Team */
    devGrid: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
    devCard: {
      width: isWide ? '22%' : isTablet ? '46%' : '100%', flexGrow: 1,
      backgroundColor: colors.card, borderRadius: 20, padding: 10, paddingBottom: 18,
      borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
    },
    devPhotoWrap: {
      width: '100%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden',
      backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
    },
    devPhoto: { width: '100%', height: '100%' },
    devInitials: { fontFamily: F.display, fontSize: 34, color: colors.textMuted },
    devName: { marginTop: 14, marginHorizontal: 6, fontFamily: F.bold, fontSize: 16, letterSpacing: -0.3, color: colors.text },
    devRole: { marginTop: 2, marginHorizontal: 6, fontFamily: F.medium, fontSize: 13, color: isDark ? GOLD_LIGHT : '#8A6524' },
    devDescription: { marginTop: 6, marginHorizontal: 6, fontFamily: F.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },

    /* Built with */
    builtRow: { marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    builtChip: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14,
      backgroundColor: colors.card, borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
    },
    builtLabel: { fontFamily: F.semi, fontSize: 14, color: colors.text, letterSpacing: -0.2 },
    builtDetail: { fontFamily: F.body, fontSize: 12, color: colors.textMuted },
    version: { marginTop: 28, fontFamily: F.body, fontSize: 12, color: colors.textMuted },
  });
}