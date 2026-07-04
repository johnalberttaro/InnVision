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
 *  - isAuthenticated:  boolean
 */
export default function HomeHeader({
  onBookNow,
  onSignIn,
  onMenuPress,
  onProfilePress,
  onAboutPress,
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
    { label: 'About',      onPress: () => onAboutPress && onAboutPress() },
    { label: 'Promos',     onPress: () => {} },
    { label: 'Contact Us', onPress: () => {} },
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

            {/* Hamburger — mobile only */}
            {!isWideScreen && (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={onMenuPress}
                accessibilityLabel="Open menu"
              >
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
                <View style={styles.menuLine} />
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
    width: 34,
    height: 34,
    borderRadius: 8,
    marginRight: spacing.sm,
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

  // Hamburger
  menuButton: {
    width: 28,
    height: 20,
    justifyContent: 'space-between',
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
});