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

const CONTENT_PADDING_TOP = Platform.select({
  ios: spacing.sm,
  android: spacing.sm,
  default: spacing.md,
});

const CONTENT_PADDING_BOTTOM = Platform.select({
  ios: spacing.sm,
  android: spacing.sm,
  default: spacing.md,
});

/**
 * HomeHeader — logo + InnVision name + dynamic CTA + nav/hamburger.
 *
 * Safe-area note: this header does NOT call useSafeAreaInsets() itself.
 * The app's root SafeAreaView (in App.jsx, imported from
 * 'react-native-safe-area-context') already applies the top inset to every
 * screen it wraps, including the one that renders this header. Adding a
 * second inset here would double-pad the header — that's exactly what
 * happened during initial development, which is why this component went
 * through an inset-handling change and back. If this header is ever
 * rendered somewhere NOT wrapped by that root SafeAreaView, re-add
 * useSafeAreaInsets() here at that point — don't add it preemptively.
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
  onHomePress,
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
          <TouchableOpacity style={styles.logoRow} activeOpacity={0.8} onPress={onHomePress}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logoImage}
            />
            <Text style={styles.name} numberOfLines={1}>InnVision</Text>
          </TouchableOpacity>

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
    // Matches theme.js lightColors.background (#F5EFE6). Opacity raised to
    // 0.94 (from 0.72) because BlurView's tint="light" renders its own
    // native whitish blur backdrop underneath — at lower opacity that
    // native white was bleeding through and washing out the cream color,
    // making the header read white instead of cream. If the background
    // token in theme.js changes, update the rgb values to match (keep the
    // alpha near 0.9+ for the same reason).
    backgroundColor: 'rgba(245,239,230,0.94)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // At narrow phone widths the logo + name + CTA + hamburger can
    // overflow a non-wrapping row and clip the right-side CTA.
    // Allow the row itself to wrap so nothing gets pushed off-screen.
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: CONTENT_PADDING_TOP,
    paddingBottom: CONTENT_PADDING_BOTTOM,
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
    flexShrink: 1,
  },

  // Nav
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
    marginLeft: 'auto',
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
    flexShrink: 1,
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