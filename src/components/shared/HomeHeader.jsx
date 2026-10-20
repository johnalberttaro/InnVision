import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import GuestNotificationBell from './GuestNotificationBell';

// Links + actions fit on one row from here up; below it the hamburger
// menu takes over (keeps tablets / small laptops from a crowded row).
const WIDE_SCREEN_BREAKPOINT = 1000;

// Dark header that runs straight into the Home page's dark hero.
// Same palette as HomeScreen.jsx.
const BG = '#17120E';
const TEXT = '#F7F2EA';
const TEXT_MUTED = 'rgba(247,242,234,0.74)';
const GOLD = '#C9A14A';
const GOLD_LIGHT = '#F0D58E';
const F = {
  display: 'Inter_800ExtraBold',
  semi: 'Inter_600SemiBold',
  medium: 'Inter_500Medium',
};
// Gradients / blur / soft shadows are CSS on web; native gets the solid
// colour set next to each one.
const web = (style) => (Platform.OS === 'web' ? style : null);

/**
 * HomeHeader — logo + InnVision name, nav links (wide screens), the
 * notification bell (signed-in guests), the main action, and the
 * hamburger (narrow screens).
 *
 * REDESIGNED (Oct 2026): dark, so it flows into the Home hero like a
 * modern product site's navigation; Inter type; gold "Book now".
 *
 * Safe-area note: this header does NOT call useSafeAreaInsets() itself.
 * The app's root SafeAreaView (App.jsx) already applies the top inset to
 * every screen it wraps. Adding a second inset here would double-pad it.
 *
 * Main action:
 *  - signed out → "Sign in"  (onSignIn)
 *  - signed in  → "Book now" (onBookNow)
 *
 * Props (unchanged):
 *  - onBookNow, onSignIn, onMenuPress, onProfilePress, onAboutPress,
 *    onContactPress, onFindBooking, onReportIssue, onHomePress: () => void
 *  - isAuthenticated: boolean
 */
export default function HomeHeader({
  onBookNow,
  onSignIn,
  onMenuPress,
  onProfilePress,
  onAboutPress,
  onContactPress,
  onFindBooking,
  onReportIssue,
  isAuthenticated,
  onHomePress,
}) {
  const { width } = useWindowDimensions();
  // Hover state (web only — onMouseEnter/Leave never fire on touch devices).
  const [hoveredNav, setHoveredNav] = useState(null);
  const [ctaHovered, setCtaHovered] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const [menuBtnHovered, setMenuBtnHovered] = useState(false);
  const isWideScreen = width >= WIDE_SCREEN_BREAKPOINT;
  const isPhone = width < 420;

  const handleCtaPress = () => {
    if (isAuthenticated) {
      onBookNow && onBookNow();
    } else {
      onSignIn && onSignIn();
    }
  };

  // Report an Issue and Profile only when signed in.
  const navItems = [
    { label: 'About',            onPress: () => onAboutPress && onAboutPress() },
    { label: 'Promos',           onPress: () => {} },
    { label: 'Contact Us',       onPress: () => onContactPress && onContactPress() },
    { label: 'My Reservations',  onPress: () => onFindBooking && onFindBooking() },
    ...(isAuthenticated
      ? [{ label: 'Report an Issue', onPress: () => onReportIssue && onReportIssue() }]
      : []),
    ...(isAuthenticated
      ? [{ label: 'Profile', onPress: () => onProfilePress && onProfilePress(), isAccent: true }]
      : []),
  ];

  return (
    <View style={styles.bar} accessibilityRole="header">
      <View style={styles.content}>
        {/* ── Left: logo + links ───────────────────────────── */}
        <View style={styles.left}>
          <TouchableOpacity
            style={[styles.logoRow, logoHovered && styles.logoRowHovered]}
            activeOpacity={0.8}
            onPress={onHomePress}
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
            accessibilityRole="link"
            accessibilityLabel="InnVision home"
          >
            <View style={styles.logoTile}>
              <Image source={require('../../../assets/logo.png')} style={styles.logoImage} />
            </View>
            <Text style={styles.name} numberOfLines={1}>InnVision</Text>
          </TouchableOpacity>

          {isWideScreen && (
            <View style={styles.navLinks}>
              {navItems.map((item) => {
                const isHovered = hoveredNav === item.label;
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.navLinkItem}
                    onPress={item.onPress}
                    activeOpacity={0.7}
                    onMouseEnter={() => setHoveredNav(item.label)}
                    onMouseLeave={() => setHoveredNav(null)}
                    accessibilityRole="link"
                  >
                    <Text style={[styles.navLinkText, item.isAccent && styles.navLinkAccent, isHovered && styles.navLinkHovered]}>
                      {item.label}
                    </Text>
                    <View style={[styles.navLinkUnderline, (isHovered || item.isAccent) && styles.navLinkUnderlineVisible]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Right: bell + main action + hamburger ────────── */}
        <View style={styles.right}>
          {isAuthenticated && (
            <GuestNotificationBell
              onViewBooking={(id) => onFindBooking && onFindBooking(id)}
              iconColor={TEXT}
              badgeBorderColor={BG}
            />
          )}

          <TouchableOpacity
            style={[
              styles.ctaButton,
              isPhone && styles.ctaButtonPhone,
              isAuthenticated ? styles.ctaBookNow : styles.ctaSignIn,
              ctaHovered && styles.ctaHovered,
            ]}
            onPress={handleCtaPress}
            activeOpacity={0.85}
            onMouseEnter={() => setCtaHovered(true)}
            onMouseLeave={() => setCtaHovered(false)}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>{isAuthenticated ? 'Book now' : 'Sign in'}</Text>
          </TouchableOpacity>

          {!isWideScreen && (
            <TouchableOpacity
              style={[styles.menuButton, menuBtnHovered && styles.menuButtonHovered]}
              onPress={onMenuPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Open menu"
              accessibilityRole="button"
              onMouseEnter={() => setMenuBtnHovered(true)}
              onMouseLeave={() => setMenuBtnHovered(false)}
            >
              <View style={styles.menuLinesWrap}>
                <View style={styles.menuLine} />
                <View style={[styles.menuLine, styles.menuLineShort]} />
                <View style={styles.menuLine} />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(247,242,234,0.08)',
    zIndex: 10,
    ...web({
      backgroundImage: 'linear-gradient(180deg, #1B1511 0%, #17120E 100%)',
      backdropFilter: 'saturate(140%) blur(10px)',
    }),
  },
  content: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: Platform.select({ ios: 10, android: 10, default: 14 }),
    gap: 12,
  },

  left: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 28 },

  // Logo — on a cream tile so the logo's dark parts stay visible.
  logoRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 10 },
  logoRowHovered: { opacity: 0.85 },
  logoTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: TEXT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...web({ boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 14px rgba(0,0,0,0.35)' }),
  },
  logoImage: { width: 30, height: 30, resizeMode: 'contain' },
  name: {
    fontSize: 18,
    fontFamily: F.display,
    color: TEXT,
    letterSpacing: -0.5,
    flexShrink: 1,
  },

  // Links
  navLinks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navLinkItem: { paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  navLinkText: { fontSize: 14, fontFamily: F.medium, color: TEXT_MUTED, letterSpacing: -0.15 },
  navLinkHovered: { color: TEXT },
  navLinkAccent: { color: GOLD_LIGHT, fontFamily: F.semi },
  navLinkUnderline: { width: 16, height: 2, borderRadius: 1, marginTop: 4, backgroundColor: 'transparent' },
  navLinkUnderlineVisible: { backgroundColor: GOLD },

  // Right side
  right: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },

  ctaButton: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  ctaButtonPhone: { paddingHorizontal: 14 },
  ctaBookNow: {
    backgroundColor: '#DDBB6C',
    ...web({
      backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
      boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 6px 18px rgba(201,161,74,0.30)',
    }),
  },
  ctaSignIn: {
    backgroundColor: TEXT,
    ...web({ boxShadow: '0 6px 18px rgba(0,0,0,0.30)' }),
  },
  ctaHovered: { opacity: 0.92 },
  ctaText: { color: '#231B12', fontFamily: F.semi, fontSize: 14, letterSpacing: -0.15 },

  // Hamburger — 44x44 touch target.
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
  },
  menuButtonHovered: { backgroundColor: 'rgba(247,242,234,0.08)' },
  menuLinesWrap: { width: 22, height: 16, justifyContent: 'space-between', alignItems: 'flex-end' },
  menuLine: { width: 22, height: 2, borderRadius: 1, backgroundColor: TEXT },
  menuLineShort: { width: 15 },
});
