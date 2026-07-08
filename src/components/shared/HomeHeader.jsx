import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing, fonts } from '../../utils/theme';

const WIDE_SCREEN_BREAKPOINT = 768;

/**
 * HomeHeader — logo + InnVision name + dynamic CTA + nav/hamburger.
 *
 * Safe-area note: the root SafeAreaView in App.jsx already reserves space
 * for the status bar / notch on both iOS and Android, so this header only
 * needs its normal small padding for visual breathing room — it should
 * NOT also add useSafeAreaInsets() here, or the inset gets applied twice
 * (once by the root wrapper, once here), producing an oversized gap above
 * the header on mobile.
 *
 * CTA button behavior:
 *  - isAuthenticated = false  →  shows "SIGN IN"  (calls onSignIn)
 *  - isAuthenticated = true   →  shows "BOOK NOW" (calls onBookNow)
 *
 * Props:
 *  - onBookNow:        () => void
 *  - onSignIn:         () => void
 *  - onMenuPress:      () => void
 *  - onProfilePress:   () => void
 *  - onAboutPress:     () => void
 *  - onContactPress:   () => void
 *  - onFindBooking:    () => void   — navigate to the booking lookup screen
 *  - isAuthenticated:  boolean
 */
export default function HomeHeader({
  onBookNow,
  onSignIn,
  onMenuPress,
  onProfilePress,
  onAboutPress,
  onContactPress,
  onFindBooking,
  isAuthenticated,
}) {
  const { width } = useWindowDimensions();
  const isWideScreen = width >= WIDE_SCREEN_BREAKPOINT;

  const handleCtaPress = () => {
    if (isAuthenticated) {
      onBookNow && onBookNow();
    } else {
      onSignIn && onSignIn();
    }
  };

  // Nav items — Profile only shown when authenticated
  const navItems = [
    { label: 'About',            onPress: () => onAboutPress && onAboutPress() },
    { label: 'Promos',           onPress: () => {} },
    { label: 'Contact Us',       onPress: () => onContactPress && onContactPress() },
    { label: 'Find My Booking',  onPress: () => onFindBooking && onFindBooking() },
    ...(isAuthenticated
      ? [{ label: 'Profile', onPress: () => onProfilePress && onProfilePress(), isAccent: true }]
      : []
    ),
  ];

  return (
    <View style={styles.shadowWrap}>
      <BlurView
        intensity={40}
        tint="light"
        style={styles.blur}
        experimentalBlurMethod="dimezisBlurView"
      >
        <View style={styles.tint} />

        <View style={styles.content}>

          {/* ── Logo ─────────────────────────────────────────── */}
          <View style={styles.logoRow}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logoImage}
            />
            <Text style={styles.name} numberOfLines={1}>InnVision</Text>
          </View>

          {/* ── Right side ───────────────────────────────────── */}
          <View style={styles.navRight}>

            {/* Wide screen nav links */}
            {isWideScreen && (
              <View style={styles.navLinks}>
                {navItems.map(item => (
                  <TouchableOpacity key={item.label} style={styles.navLinkItem} onPress={item.onPress} activeOpacity={0.7}>
                    <Text style={[styles.navLinkText, item.isAccent && styles.navLinkAccent]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* CTA button */}
            <TouchableOpacity
              style={[styles.ctaButton, isAuthenticated ? styles.ctaBookNow : styles.ctaSignIn]}
              onPress={handleCtaPress}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>
                {isAuthenticated ? 'BOOK NOW' : 'SIGN IN'}
              </Text>
            </TouchableOpacity>

            {/* Hamburger — mobile only. 44x44 touch target with extra
                inset from the screen edge, per accessibility guidelines. */}
            {!isWideScreen && (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={onMenuPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Open menu"
                accessibilityRole="button"
              >
                <View style={styles.menuLinesWrap}>
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                  <View style={styles.menuLine} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  blur: {
    overflow: 'hidden',
  },
  tint: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.select({
      ios: spacing.sm,
      android: spacing.sm,
      default: spacing.md,
    }),
  },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  logoImage: {
    width: 44,
    height: 44,
    borderRadius: 10,
    marginRight: spacing.sm,
    resizeMode: 'contain',
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.headingExtraBold,
    color: colors.primary,
    letterSpacing: 0.3,
  },

  // Nav
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  navLinkItem: {
    marginHorizontal: spacing.sm,
    alignItems: 'center',
  },
  navLinkText: {
    fontSize: 14,
    fontFamily: fonts.headingSemiBold,
    color: colors.text,
  },
  navLinkAccent: {
    color: colors.primary,
    fontFamily: fonts.headingBold,
    textDecorationLine: 'underline',
    textDecorationColor: colors.accent,
    textDecorationStyle: 'solid',
  },

  // CTA
  ctaButton: {
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  ctaBookNow: {
    backgroundColor: colors.step,
  },
  ctaSignIn: {
    backgroundColor: colors.primary,
  },
  ctaText: {
    color: colors.white,
    fontFamily: fonts.headingSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },

  // Hamburger — outer touchable is a full 44x44 target; inner lines stay
  // visually compact and centered within it.
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
    marginRight: -spacing.xs, // keeps the visible icon aligned with content edge despite the larger tap target
  },
  menuLinesWrap: {
    width: 24,
    height: 18,
    justifyContent: 'space-between',
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
});