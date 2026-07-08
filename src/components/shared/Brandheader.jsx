import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../context/ThemeContext';

// ─── Logo image ───────────────────────────────────────────────────────────
// Replace null with require('../../../assets/logo.png') once you have the file.
// Path is relative to src/components/shared/Brandheader.jsx — adjust if you move this file.
const LOGO_SOURCE = null; // ← swap to require('../../assets/logo.png')
// ─────────────────────────────────────────────────────────────────────────

/**
 * BrandHeader — minimal brand-identity header: logo + "InnVision" name only.
 * No menu, no buttons, no links — intentionally has no props for adding any,
 * so it can't accidentally grow controls later. If a screen needs a menu or
 * actions in its header, use AppHeader instead (see components/AppHeader.jsx).
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). This header's frosted-glass
 * look was hardcoded for a light background only — `tint="light"` on the
 * BlurView, plus a white `rgba(255,255,255,0.72)` overlay tint. Both now
 * flip based on `isDark`: the BlurView's `tint` prop switches to `"dark"`
 * (so iOS blurs correctly against dark content behind it), and the overlay
 * becomes a dark frosted tint instead of a white one.
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
export default function BrandHeader() {
  const { colors, spacing, fonts, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, fonts), [colors, spacing, fonts]);
  const overlayColor = isDark ? 'rgba(20,20,20,0.75)' : 'rgba(255,255,255,0.72)';

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
            flips between a white and dark frosted look with the theme. */}
        <View style={[styles.tint, { backgroundColor: overlayColor }]} />

        <View style={styles.content}>
          {LOGO_SOURCE ? (
            <Image source={LOGO_SOURCE} style={styles.logoImage} resizeMode="contain" />
          ) : (
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>LOGO</Text>
            </View>
          )}
          <Text style={styles.name}>InnVision</Text>
        </View>
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
    // Overlay tint — flips between white and dark frosted glass; the
    // actual color comes from overlayColor above, set inline.
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
    logoImage: {
      width: 32,
      height: 32,
      marginRight: spacing.sm,
    },
    logoBadge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    logoBadgeText: {
      fontSize: 7,
      fontFamily: fonts.bodySemiBold,
      color: colors.textMuted,
    },
    name: {
      fontSize: 17,
      fontFamily: fonts.headingExtraBold,
      color: colors.primary,
      letterSpacing: 0.4,
    },
  });
}