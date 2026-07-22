import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ImageCarousel from '../../components/home/ImageCarousel';
import HamburgerMenu from '../../components/home/HamburgerMenu';
import HomeHeader from '../../components/shared/HomeHeader';
import Appfooter from '../../components/shared/Appfooter';
import FeedbackWidget from '../../components/shared/FeedbackWidget';
import { useTheme } from '../../context/ThemeContext';

// Two genuinely different photos, not two crops of the same one — web
// keeps the original building photo, mobile uses a separate photo
// better suited to a narrow portrait screen. Platform.OS (not a width
// breakpoint) is the right check here since these are two different
// source images tied to the platform itself, not just two sizes of one.
const homeBackground = Platform.OS === 'web'
  ? require('../../../assets/background.jpg')
  : require('../../../assets/mobilebackground.jpg');

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
 * NEW: full-screen blurred background photo (assets/background.jpg —
 * pre-blurred at build time via PIL, not a runtime CSS/BlurView filter,
 * so it renders identically on web, iOS, and Android with zero extra
 * cost). Implemented as an absolutely-positioned <Image> filling the
 * outer container exactly (StyleSheet.absoluteFillObject +
 * resizeMode="cover"), rather than <ImageBackground> — ImageBackground's
 * flex-based sizing is inconsistent between React Native Web and native
 * (tall narrow mobile viewports vs. wide desktop ones), where an
 * explicit absolute-fill sizes identically on both. A semi-transparent
 * scrim in colors.background sits between the photo and all content, at
 * the same opacity in both themes, so every existing section keeps
 * exactly the legibility it had before — the photo just reads as a
 * subtle textured backdrop rather than a full takeover.
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
      <Image source={homeBackground} style={styles.backgroundImage} resizeMode="cover" />
      <View style={styles.scrim} />
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

            <Text style={styles.aboutIntro}>
              InnVision is a fully working hotel reservation system, built to
              mirror how real property-management software runs a hotel from
              the front desk to the back office.
            </Text>

            <Text style={styles.aboutCapabilities}>
              Guests get real-time room availability, instant booking
              confirmation, and a secure account to track every stay. Behind
              the scenes, front desk and admin teams get their own dashboards
              for managing reservations, billing, housekeeping, and staff
              accounts — the same workflow a real hotel runs on, end to end.
            </Text>

            <View style={styles.stepsList}>
              {[
                { n: '1', title: 'Search your dates', body: 'Check rates and room availability for any date range.' },
                { n: '2', title: 'Choose your room', body: 'Compare room categories, amenities, and nightly rates.' },
                { n: '3', title: 'Review & confirm', body: 'No account needed — get instant confirmation on the spot.' },
              ].map((step) => (
                <View key={step.n} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{step.n}</Text>
                  </View>
                  <View style={styles.stepTextWrap}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepBody}>{step.body}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.aboutAside}>
              Built for Hospitality Management coursework at Consolatrix
              College of Toledo City — every screen mirrors a real-world
              property management booking engine. This homepage's colors,
              photos, and menu items are easy to swap for your own
              property's branding whenever you're ready.
            </Text>

            <TouchableOpacity style={styles.learnMoreBtn} onPress={onAboutPress} activeOpacity={0.7}>
              <Text style={styles.learnMoreText}>Learn more about InnVision</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.aboutAccent} />
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

      <FeedbackWidget />
    </View>
  );
}

function getStyles(colors, spacing, fonts) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      position: 'relative',
      // Needed on web so the flex:1 height actually resolves to a real
      // pixel value the absolute-fill Image below can size against —
      // without it, some browsers leave the container's height
      // ambiguous and the image collapses to 0px.
      minHeight: '100%',
    },
    // Sized identically on web and native via absolute-fill, rather
    // than ImageBackground's flex-based sizing (see file header note).
    backgroundImage: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
    },
    // Sits between the photo and all content. Same hex as the old solid
    // screen background, just with reduced opacity so the photo shows
    // through as a soft texture rather than fighting with the white
    // cards/sections on top of it.
    scrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: `${colors.background}A6`,
    },
    scroll: {
      flex: 1,
    },

    /* About */
    aboutSection: {
      backgroundColor: `${colors.aboutBackground}A6`,
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
    aboutIntro: {
      fontSize: 15,
      fontFamily: fonts.headingSemiBold,
      lineHeight: 22,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    aboutCapabilities: {
      fontSize: 13,
      fontFamily: fonts.body,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'left',
      marginBottom: spacing.lg,
    },

    /* Steps — a real sequence (search -> select -> confirm), not a
       decorative numbered list */
    stepsList: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    stepNumber: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.aboutAccent,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 2,
    },
    stepNumberText: {
      fontSize: 13,
      fontFamily: fonts.headingBold,
      color: colors.onPrimary,
    },
    stepTextWrap: { flex: 1 },
    stepTitle: {
      fontSize: 14,
      fontFamily: fonts.headingSemiBold,
      color: colors.text,
      marginBottom: 2,
    },
    stepBody: {
      fontSize: 12.5,
      fontFamily: fonts.body,
      lineHeight: 18,
      color: colors.textMuted,
    },

    aboutAside: {
      fontSize: 12,
      fontFamily: fonts.body,
      lineHeight: 18,
      color: colors.textMuted,
      textAlign: 'center',
      paddingTop: spacing.md,
      marginBottom: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },

    /* Learn more */
    learnMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'center',
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    learnMoreText: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.aboutAccent,
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