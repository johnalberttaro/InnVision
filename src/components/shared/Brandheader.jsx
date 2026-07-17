import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../context/ThemeContext';

// ─── Logo image ───────────────────────────────────────────────────────────
// Path is relative to src/components/shared/Brandheader.jsx — adjust if you move this file.
const LOGO_SOURCE = require('../../../assets/logo.png');
// ─────────────────────────────────────────────────────────────────────────

// Converts a "#rrggbb" hex string to "r,g,b" for building an rgba() string.
// Needed because RN StyleSheet requires a literal rgba string for alpha —
// there's no way to apply opacity to a hex color token at runtime otherwise.
function hexToRgbTriplet(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

/**
 * BrandHeader — minimal brand-identity header: logo + "InnVision" name only.
 * No menu, no buttons, no links — intentionally has no props for adding any,
 * so it can't accidentally grow controls later. If a screen needs a menu or
 * actions in its header, use AppHeader instead (see components/AppHeader.jsx).
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). This header's frosted-glass
 * overlay now derives its color from `colors.background` (theme.js) instead
 * of a hardcoded white/dark value — so it automatically follows whatever
 * palette theme.js defines (currently cream in light mode, dark charcoal in
 * dark mode) without needing another manual update here if the palette
 * changes again. The BlurView's `tint` prop still switches to `"dark"` in
 * dark mode so iOS blurs correctly against dark content behind it.
 *
 * Overlay opacity is 0.94, not a lower value like 0.7 — BlurView's native
 * tint="light"/"dark" renders its own whitish/dark blur backdrop
 * underneath, and at lower opacity that native tint bleeds through and
 * washes out the intended theme color (this exact issue showed up on
 * HomeHeader first). High opacity keeps the theme color dominant; it does
 * trade away some of the visible "blur" softening effect as a result.
 *
 * Glassmorphism look via expo-blur's BlurView (real blur on iOS; on this
 * project's installed expo-blur 13.x, Android needs the ref-less
 * `experimentalBlurMethod="dimezisBlurView"` prop — no BlurTargetView, since
 * that newer API only exists in expo-blur 15+ / Expo SDK 55+).
 *
 * Already "sticky": render this ABOVE your screen's <ScrollView>, not inside
 * its contentContainerStyle — that alone pins it while content scrolls
 * underneath, no extra positioning needed.
 *
 * Usage:
 *   <View style={{ flex: 1 }}>
 *     <BrandHeader />
 *     <ScrollView>...room cards...</ScrollView>
 *   </View>
 */
export default function BrandHeader({ onHomePress }) {
  const { colors, spacing, fonts, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, fonts), [colors, spacing, fonts]);
  const overlayColor = `rgba(${hexToRgbTriplet(colors.background)},0.94)`;

  return (
    <View style={styles.shadowWrap}>
      <BlurView
        intensity={40}
        tint={isDark ? 'dark' : 'light'}
        style={styles.blur}
        experimentalBlurMethod="dimezisBlurView"
      >
        {/* Semi-transparent tint on top of the blur so text/logo stay
            crisp while the blur still softens whatever is behind it —
            color follows colors.background, flipping between cream and
            dark charcoal with the theme. */}
        <View style={[styles.tint, { backgroundColor: overlayColor }]} />

        <TouchableOpacity style={styles.content} activeOpacity={0.8} onPress={onHomePress}>
          <View style={styles.logoBadge}>
            <Image source={LOGO_SOURCE} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.name}>InnVision</Text>
        </TouchableOpacity>
      </BlurView>
    </View>
  );
}

function getStyles(colors, spacing, fonts) {
  return StyleSheet.create({
    // Shadow lives on a separate wrapper from the blur/clip layer — RN clips
    // shadows away when overflow:hidden sits on the same element (same fix
    // used on the Reservation screen's hero card).
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
    // Overlay tint — flips between cream and dark charcoal frosted glass;
    // the actual color comes from overlayColor above, set inline.
    tint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      // A little extra top padding on iOS/Android status-bar-adjacent layouts;
      // adjust if this sits inside a SafeAreaView that already insets it.
      paddingVertical: Platform.select({ ios: spacing.md, android: spacing.md, default: spacing.lg }),
    },
    // White boxed badge behind the logo — matches the treatment used on the
    // auth screens (Login/Register/Forgot Password), so the mark reads
    // consistently across the app instead of floating bare in the header.
    // Intentionally colors.white (literal white), not colors.background —
    // the badge is a fixed white card the logo sits on, same as the auth
    // screens, not a themed surface.
    logoBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
      overflow: 'hidden',
    },
    logoImage: {
      width: 26,
      height: 26,
    },
    name: {
      fontSize: 17,
      fontFamily: fonts.headingExtraBold,
      color: colors.primary,
      letterSpacing: 0.4,
    },
  });
}