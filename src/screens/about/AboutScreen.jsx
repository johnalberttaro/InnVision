import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Appfooter from '../../components/shared/Appfooter';
import { colors, spacing, fonts, radius } from '../../utils/theme';

/**
 * AboutScreen — informational screen describing InnVision, its purpose,
 * key features, dev team, and tech stack.
 *
 * Props:
 *  - onBack: () => void   — navigate back to the previous screen
 */

const FEATURES = [
  'Online room browsing and reservation (with or without an account)',
  'Real-time room status monitoring (vacant, occupied, housekeeping, maintenance)',
  'Front desk check-in and check-out processing',
  'Guest folio and billing management',
  'Occupancy and revenue reporting for administrators',
  'Hybrid guest access (registered account or booking reference)',
];

const BUILT_WITH = [
  { label: 'Expo & React Native', detail: 'Cross-platform mobile app' },
  { label: 'Firebase Firestore', detail: 'Database' },
  { label: 'Firebase Authentication', detail: 'User management' },
];

// TODO: Insert group member names here, e.g. ['Juan Dela Cruz', 'Maria Santos']
const DEVELOPERS = [];

export default function AboutScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

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

          {/* ── Hero ─────────────────────────────────────────── */}
          <View style={styles.hero}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>IV</Text>
            </View>
            <Text style={styles.appName}>InnVision</Text>
            <Text style={styles.tagline}>
              Real-Time Front Office and Guest Service Management
            </Text>
          </View>

          {/* ── About the System ────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About the System</Text>
            <Text style={styles.paragraph}>
              InnVision is a front office management app developed for the
              Hospitality Management (HM) training hotel of Consolatrix College
              of Toledo City, Inc. It streamlines the complete guest cycle —
              reservation, check-in, room status monitoring, billing, and
              check-out — replacing manual logbooks and paper-based
              transactions with a centralized, real-time digital platform.
            </Text>
          </View>

          {/* ── Purpose ──────────────────────────────────────────── */}
          <View style={[styles.section, styles.sectionAlt]}>
            <Text style={styles.sectionTitle}>Purpose</Text>
            <Text style={styles.paragraph}>
              Developed as a capstone project for the Department of Hospitality
              Management, InnVision gives HM students hands-on exposure to
              industry-standard front office operations similar to real-world
              Property Management Systems (PMS).
            </Text>
          </View>

          {/* ── Key Features ─────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Features</Text>
            {FEATURES.map((feature) => (
              <View key={feature} style={styles.featureRow}>
                <View style={styles.featureDot} />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {/* ── Developed By ─────────────────────────────────────── */}
          <View style={[styles.section, styles.sectionAlt]}>
            <Text style={styles.sectionTitle}>Developed By</Text>
            {DEVELOPERS.length > 0 ? (
              DEVELOPERS.map((name) => (
                <Text key={name} style={styles.developerName}>{name}</Text>
              ))
            ) : (
              <Text style={styles.developerPlaceholder}>
                (Insert group member names here)
              </Text>
            )}
            <Text style={styles.programText}>
              Bachelor of Science in Hospitality Management{'\n'}
              Consolatrix College of Toledo City, Inc.{'\n'}
              Academic Year 2025–2026
            </Text>
          </View>

          {/* ── Built With ───────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Built With</Text>
            <View style={styles.badgeWrap}>
              {BUILT_WITH.map((item) => (
                <View key={item.label} style={styles.badge}>
                  <Text style={styles.badgeLabel}>{item.label}</Text>
                  <Text style={styles.badgeDetail}>{item.detail}</Text>
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

          <Appfooter />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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

  /* Hero */
  hero: {
    backgroundColor: colors.heroBackground,
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoText: {
    fontFamily: fonts.headingExtraBold,
    fontSize: 20,
    color: colors.primary,
    letterSpacing: -0.5,
  },
  appName: {
    fontSize: 26,
    fontFamily: fonts.headingExtraBold,
    color: colors.white,
    letterSpacing: 0.3,
    marginBottom: spacing.xs,
  },
  tagline: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    maxWidth: 280,
  },

  /* Sections */
  section: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  sectionAlt: {
    backgroundColor: colors.aboutBackground,
  },
  sectionTitle: {
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

  /* Key Features */
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
    marginRight: spacing.sm,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 20,
    color: colors.text,
  },

  /* Developed By */
  developerName: {
    fontSize: 14,
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  developerPlaceholder: {
    fontSize: 13,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  programText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },

  /* Built With */
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
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