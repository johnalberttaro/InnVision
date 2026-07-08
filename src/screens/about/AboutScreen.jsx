import React, { useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Appfooter from '../../components/shared/Appfooter';
import { DEVELOPERS } from '../../config/developers';
import { useTheme } from '../../context/ThemeContext';

/**
 * AboutScreen — informational screen describing InnVision, its purpose,
 * key features, dev team, and tech stack.
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). One fix made during
 * migration: `logoText` used `colors.white` for text on top of
 * `logoBadge` (background = colors.primary). Since primary flips to a
 * light color in dark mode, that text would become invisible — changed
 * to `colors.onPrimary`. The header's white icon/title on
 * `colors.heroBackground` are left as literal white — that token stays a
 * dark band in both palettes, so it doesn't need to flip.
 *
 * The "Developed By" section renders developer profile cards straight from
 * `src/config/developers.js` — to change photos, names, roles, or add new
 * team members, edit that file only. Nothing here needs to change.
 *
 * Props:
 *  - onBack: () => void   — navigate back to the previous screen
 */

const GUEST_CYCLE = [
  { step: 1, label: 'Reservation',  icon: 'calendar-outline' },
  { step: 2, label: 'Check-in',     icon: 'log-in-outline' },
  { step: 3, label: 'Room Status',  icon: 'pulse-outline' },
  { step: 4, label: 'Billing',      icon: 'receipt-outline' },
  { step: 5, label: 'Check-out',    icon: 'log-out-outline' },
];

const FEATURES = [
  { icon: 'bed-outline',       text: 'Online room browsing and reservation (with or without an account)' },
  { icon: 'pulse-outline',     text: 'Real-time room status monitoring (vacant, occupied, housekeeping, maintenance)' },
  { icon: 'key-outline',       text: 'Front desk check-in and check-out processing' },
  { icon: 'receipt-outline',   text: 'Guest folio and billing management' },
  { icon: 'bar-chart-outline', text: 'Occupancy and revenue reporting for administrators' },
  { icon: 'people-outline',    text: 'Hybrid guest access (registered account or booking reference)' },
];

const BUILT_WITH = [
  { label: 'Expo & React Native',     detail: 'Cross-platform mobile app', icon: 'phone-portrait-outline' },
  { label: 'Firebase Firestore',      detail: 'Database',                  icon: 'server-outline' },
  { label: 'Firebase Authentication', detail: 'User management',           icon: 'shield-checkmark-outline' },
];

function getInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function DeveloperCard({ dev, isWide, styles }) {
  return (
    <View style={[styles.devCard, isWide && styles.devCardWide]}>
      <View style={styles.devAvatarWrap}>
        {dev.photo ? (
          <Image source={dev.photo} style={styles.devAvatarImage} resizeMode="cover" />
        ) : (
          <Text style={styles.devAvatarInitials}>{getInitials(dev.name)}</Text>
        )}
      </View>
      <Text style={styles.devName} numberOfLines={2}>{dev.name}</Text>
      <View style={styles.devRoleBadge}>
        <Text style={styles.devRoleText}>{dev.role}</Text>
      </View>
      {!!dev.description && (
        <Text style={styles.devDescription}>{dev.description}</Text>
      )}
    </View>
  );
}

export default function AboutScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, isWide && styles.headerWide]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={isWide && styles.wideContainer}>
          <View style={styles.contentPad}>

            {/* ── About the System (logo/name/tagline now live here) ── */}
            <View style={styles.card}>
              <View style={styles.brandBlock}>
                <View style={styles.logoBadge}>
                  <Text style={styles.logoText}>IV</Text>
                </View>
                <Text style={styles.appName}>InnVision</Text>
                <Text style={styles.tagline}>
                  Real-Time Front Office and Guest Service Management
                </Text>
              </View>

              <View style={styles.brandDivider} />

              <Text style={styles.cardTitle}>About the System</Text>
              <Text style={styles.paragraph}>
                InnVision is a front office management app developed for the
                Hospitality Management (HM) training hotel of Consolatrix College
                of Toledo City, Inc. It replaces manual logbooks and paper-based
                transactions with a centralized, real-time digital platform that
                covers the complete guest cycle from booking to departure.
              </Text>

              {/* Guest cycle — real sequence from the paragraph above, made visual */}
              <View style={styles.cycleWrap}>
                {GUEST_CYCLE.map((item, i) => (
                  <React.Fragment key={item.step}>
                    <View style={styles.cycleStep}>
                      <View style={styles.cycleIconRing}>
                        <Ionicons name={item.icon} size={18} color={colors.primary} />
                      </View>
                      <Text style={styles.cycleNumber}>{item.step}</Text>
                      <Text style={styles.cycleLabel}>{item.label}</Text>
                    </View>
                    {i < GUEST_CYCLE.length - 1 && <View style={styles.cycleConnector} />}
                  </React.Fragment>
                ))}
              </View>
            </View>

            {/* ── Purpose ──────────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Purpose</Text>
              <View style={styles.purposeAccent}>
                <Text style={styles.paragraph}>
                  Developed as a capstone project for the Department of Hospitality
                  Management, InnVision gives HM students hands-on exposure to
                  industry-standard front office operations similar to real-world
                  Property Management Systems (PMS).
                </Text>
              </View>
            </View>

            {/* ── Key Features ─────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Key Features</Text>
              {FEATURES.map((feature) => (
                <View key={feature.text} style={styles.featureRow}>
                  <View style={styles.featureIconWrap}>
                    <Ionicons name={feature.icon} size={16} color={colors.primary} />
                  </View>
                  <Text style={styles.featureText}>{feature.text}</Text>
                </View>
              ))}
            </View>

            {/* ── Developed By ─────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Developed By</Text>
              <View style={styles.devGrid}>
                {DEVELOPERS.map((dev) => (
                  <DeveloperCard key={dev.name} dev={dev} isWide={isWide} styles={styles} />
                ))}
              </View>
              <Text style={styles.programText}>
                Bachelor of Science in Hospitality Management{'\n'}
                Consolatrix College of Toledo City, Inc.{'\n'}
                Academic Year 2025–2026
              </Text>
            </View>

            {/* ── Built With ───────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Built With</Text>
              <View style={styles.badgeWrap}>
                {BUILT_WITH.map((item) => (
                  <View key={item.label} style={styles.badge}>
                    <View style={styles.badgeIconWrap}>
                      <Ionicons name={item.icon} size={15} color={colors.primary} />
                    </View>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.badgeLabel}>{item.label}</Text>
                      <Text style={styles.badgeDetail}>{item.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Version ──────────────────────────────────────────── */}
            <View style={styles.versionRow}>
              <Text style={styles.versionText}>Version 1.0.0</Text>
              <View style={styles.versionDivider} />
              <Text style={styles.versionText}>Published 2026</Text>
            </View>

          </View>
        </View>

        {/* Footer sits outside the wide container so its dark band can
            still span the full screen width, while its own inner content
            (handled inside Appfooter) lines up with the 800px column above. */}
        <Appfooter />
      </ScrollView>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },

    /* Header */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.heroBackground,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    headerWide: {
      paddingHorizontal: spacing.xxl * 2,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: fonts.headingSemiBold,
      color: colors.white,
      letterSpacing: 0.3,
    },
    headerSpacer: {
      width: 36,
    },

    /* Wide-screen container — matches ProfileScreen's contentWide pattern */
    wideContainer: {
      maxWidth: 800,
      alignSelf: 'center',
      width: '100%',
    },

    /* Content wrapper — holds all the cards */
    contentPad: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },

    /* Card — shared container style for every major section */
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 16,
      fontFamily: fonts.headingExtraBold,
      color: colors.aboutAccent,
      letterSpacing: 0.4,
      marginBottom: spacing.md,
    },
    paragraph: {
      fontSize: 13,
      fontFamily: fonts.body,
      lineHeight: 20,
      color: colors.text,
    },

    /* Brand block — logo/name/tagline, now living inside the first card */
    brandBlock: {
      alignItems: 'center',
      paddingBottom: spacing.md,
    },
    logoBadge: {
      width: 52,
      height: 52,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    logoText: {
      fontFamily: fonts.headingExtraBold,
      fontSize: 18,
      color: colors.onPrimary,
      letterSpacing: -0.5,
    },
    appName: {
      fontSize: 20,
      fontFamily: fonts.headingExtraBold,
      color: colors.text,
      letterSpacing: 0.3,
      marginBottom: spacing.xs,
    },
    tagline: {
      fontSize: 12,
      fontFamily: fonts.bodyMedium,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 280,
    },
    brandDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: spacing.lg,
    },

    /* Guest cycle step tracker */
    cycleWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: spacing.xl,
    },
    cycleStep: {
      alignItems: 'center',
      width: 62,
    },
    cycleIconRing: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    cycleNumber: {
      fontSize: 10,
      fontFamily: fonts.bodySemiBold,
      color: colors.textMuted,
      marginBottom: 1,
    },
    cycleLabel: {
      fontSize: 10,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
      textAlign: 'center',
    },
    cycleConnector: {
      flex: 1,
      height: 1.5,
      backgroundColor: colors.border,
      marginTop: 20,
      marginHorizontal: -6,
    },

    /* Purpose */
    purposeAccent: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: spacing.md,
    },

    /* Key Features */
    featureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: spacing.md,
    },
    featureIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    featureText: {
      flex: 1,
      fontSize: 13,
      fontFamily: fonts.body,
      lineHeight: 20,
      color: colors.text,
      paddingTop: 4,
    },

    /* Developed By — profile cards */
    devGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    devCard: {
      width: '100%',
      alignItems: 'center',
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    devCardWide: {
      width: '31%',
    },
    devAvatarWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primaryTint,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: spacing.sm,
    },
    devAvatarImage: {
      width: '100%',
      height: '100%',
    },
    devAvatarInitials: {
      fontSize: 20,
      fontFamily: fonts.headingBold,
      color: colors.primary,
    },
    devName: {
      fontSize: 14,
      fontFamily: fonts.headingBold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    devRoleBadge: {
      backgroundColor: colors.primaryTint,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    devRoleText: {
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
      color: colors.primary,
    },
    devDescription: {
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
      lineHeight: 16,
    },
    programText: {
      fontSize: 12,
      fontFamily: fonts.body,
      lineHeight: 19,
      color: colors.textMuted,
      textAlign: 'center',
    },

    /* Built With */
    badgeWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    badgeIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    badgeLabel: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },
    badgeDetail: {
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.textMuted,
      marginTop: 2,
    },

    /* Version */
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.lg,
      gap: spacing.sm,
    },
    versionDivider: {
      width: 1,
      height: 12,
      backgroundColor: colors.border,
    },
    versionText: {
      fontSize: 11,
      fontFamily: fonts.bodyMedium,
      color: colors.textMuted,
      letterSpacing: 0.3,
    },
  });
}