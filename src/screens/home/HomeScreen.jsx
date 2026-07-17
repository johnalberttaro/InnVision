import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import ImageCarousel from '../../components/home/ImageCarousel';
import HamburgerMenu from '../../components/home/HamburgerMenu';
import HomeHeader from '../../components/shared/HomeHeader';
import Appfooter from '../../components/shared/Appfooter';
import { useTheme } from '../../context/ThemeContext';

/**
 * HomeScreen — Landing page.
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). Two things fixed during
 * migration, not just a mechanical swap:
 *  - `screen`'s background was `colors.white` (a token that's
 *    intentionally literal white in BOTH palettes) — that would have left
 *    this screen stuck white even in dark mode. Changed to
 *    `colors.background`, the token designed to flip.
 *  - `signInPromptText` / `bottomCtaText` used `colors.white` for text
 *    drawn on top of a primary/step-colored button. Since those button
 *    backgrounds flip to a light color in dark mode, the text sitting on
 *    them needs to flip to dark too — changed to the `onPrimary` token,
 *    which exists exactly for this case.
 *
 * Props:
 *  - onBookNow:       () => void
 *  - onSignIn:        () => void
 *  - onLogout:        () => void
 *  - onProfilePress:  () => void
 *  - onAboutPress:    () => void
 *  - onContactPress:  () => void
 *  - onFindBooking:   () => void
 *  - isAuthenticated: boolean
 */
export default function HomeScreen({
  onBookNow,
  onSignIn,
  onLogout,
  onProfilePress,
  onAboutPress,
  onContactPress,
  onFindBooking,
  isAuthenticated,
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const { colors, spacing, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, fonts), [colors, spacing, fonts]);

  return (
    <View style={styles.screen}>
      <HomeHeader
        onBookNow={onBookNow}
        onSignIn={onSignIn}
        onMenuPress={() => setMenuVisible(true)}
        onProfilePress={onProfilePress}
        onAboutPress={onAboutPress}
        onContactPress={onContactPress}
        onFindBooking={onFindBooking}
        isAuthenticated={isAuthenticated}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <ImageCarousel onBookNow={onBookNow} />

        {/* ── About section ──────────────────────────────────────── */}
        <View style={styles.aboutSection}>
          <View style={styles.aboutHeader}>
            <View style={styles.compassIcon}>
              <Text style={styles.compassEmoji}>🧭</Text>
            </View>
            <Text style={styles.aboutTitle}>About InnVision</Text>
          </View>

          <Text style={styles.aboutParagraph}>
            Welcome! InnVision is a student prototype that demonstrates how
            a modern hotel reservation flow works end to end — from search
            to room selection to a final review and confirmation.
          </Text>

          <Text style={styles.aboutParagraph}>
            Guests can check rates and availability, choose room categories,
            and confirm a reservation without creating an account. Built for
            Hospitality Management coursework, every screen mirrors a
            real-world property management booking engine.
          </Text>

          <Text style={styles.aboutParagraph}>
            This homepage, its colors, photos, and menu items are easy to
            customize — swap them for your own property's branding, room
            types, and content whenever you're ready.
          </Text>

          <TouchableOpacity style={styles.learnMoreBtn} onPress={onAboutPress}>
            <Text style={styles.learnMoreText}>Learn More About InnVision</Text>
          </TouchableOpacity>

          {/* Sign In prompt for guests */}
          {!isAuthenticated && (
            <TouchableOpacity style={styles.signInPromptBtn} onPress={onSignIn}>
              <Text style={styles.signInPromptText}>Sign In to Book Your Stay</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Book Your Stay CTA (logged-in users only) ──────────── */}
        {isAuthenticated && (
          <View style={styles.bottomCtaWrap}>
            <TouchableOpacity style={styles.bottomCtaButton} onPress={onBookNow}>
              <Text style={styles.bottomCtaText}>Book Your Stay</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}

        <Appfooter />
      </ScrollView>

      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onProfilePress={onProfilePress}
        onAboutPress={onAboutPress}
        onContactPress={onContactPress}
        onFindBooking={onFindBooking}
        isAuthenticated={isAuthenticated}
      />
    </View>
  );
}

function getStyles(colors, spacing, fonts) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },

    /* About */
    aboutSection: {
      backgroundColor: colors.aboutBackground,
      padding: spacing.xl,
    },
    aboutHeader: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    compassIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      borderColor: colors.aboutAccent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    compassEmoji: {
      fontSize: 24,
    },
    aboutTitle: {
      fontSize: 20,
      fontFamily: fonts.headingExtraBold,
      color: colors.aboutAccent,
      letterSpacing: 0.5,
    },
    aboutParagraph: {
      fontSize: 13,
      fontFamily: fonts.body,
      lineHeight: 20,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.md,
    },

    /* Learn more */
    learnMoreBtn: {
      alignSelf: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    learnMoreText: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.aboutAccent,
      textDecorationLine: 'underline',
    },

    /* Sign in prompt */
    signInPromptBtn: {
      marginTop: spacing.sm,
      alignSelf: 'center',
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xxl,
    },
    signInPromptText: {
      color: colors.onPrimary,
      fontFamily: fonts.headingSemiBold,
      fontSize: 14,
      letterSpacing: 0.3,
    },

    /* Book Your Stay */
    bottomCtaWrap: {
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
    },
    bottomCtaButton: {
      backgroundColor: colors.step,
      borderRadius: 999,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xxl,
    },
    bottomCtaText: {
      color: colors.onPrimary,
      fontFamily: fonts.headingSemiBold,
      fontSize: 15,
    },

    /* Sign out */
    logoutBtn: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    logoutText: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.textMuted,
    },
  });
}