import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  AccessibilityInfo,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HamburgerMenu from '../../components/home/HamburgerMenu';
import HomeHeader from '../../components/shared/HomeHeader';
import Appfooter from '../../components/shared/Appfooter';
import FeedbackWidget from '../../components/shared/FeedbackWidget';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToRoomTypes, compareRoomsForList, formatCurrency } from '../../utils/Roomsservice';

/**
 * HomeScreen — guest landing page.
 *
 * REDESIGNED (Oct 2026). The old page was a stock-photo carousel
 * ("Luxury Suites", "Student Discounts") on top of a blurred background
 * photo. Now:
 *   1. Announcement bar — events (Conference Room / Banquet Hall) can be
 *      booked online.
 *   2. Dark hero — one big headline, one sentence, two actions, three
 *      quick facts; beside it a mosaic of the hotel's REAL photos, read
 *      from the room types the admin manages (Room Types → images).
 *   3. "Spaces you can book" — every room type, in the same order as the
 *      Room List (Room 1, 2, 3, Conference Room, Accreditation Room,
 *      Banquet Hall), with live "from" prices.
 *   4. How booking works (a real 3-step sequence) and Good to know
 *      (check-in/out, refund window, house rules).
 *
 * The hero is always dark (in light and dark mode); everything below it
 * follows the theme. One accent colour only (BRASS, from the logo's gold).
 *
 * Props (unchanged):
 *  - onBookNow, onSignIn, onLogout, onProfilePress, onAboutPress,
 *    onContactPress, onFindBooking, onReportIssue: () => void
 *  - isAuthenticated: boolean
 */

const BRASS = '#C9A14A';
const GOLD_LIGHT = '#F0D58E';
const HERO_BG = '#221B15';       // solid fallback (native) for the hero gradient
const HERO_TEXT = '#F7F2EA';
const HERO_MUTED = 'rgba(247,242,234,0.70)';

// Clean sans throughout the home page: Inter (already loaded by App.jsx —
// the portal theme registers these two heavier weights).
const F = {
  display: 'Inter_800ExtraBold',
  bold: 'Inter_700Bold',
  semi: 'Inter_600SemiBold',
  medium: 'Inter_500Medium',
  body: 'Inter_400Regular',
};

// Gradients / soft shadows / glass are CSS on web; native gets the solid
// fallback colour set next to each one.
const web = (style) => (Platform.OS === 'web' ? style : null);
const WIDE = 960;
// Photo of the HM building (Consolatrix Suites) used as the hero backdrop.
const HERO_PHOTO = require('../../../assets/hm-building.jpg');                // side-by-side hero from here up
const TABLET = 640;

function imageSource(img) {
  if (!img) return null;
  if (typeof img === 'string') return { uri: img };
  if (img.source) return img.source;
  if (img.uri) return { uri: img.uri };
  return null;
}

export default function HomeScreen({
  onBookNow,
  onSignIn,
  onLogout,
  onProfilePress,
  onAboutPress,
  onContactPress,
  onFindBooking,
  onReportIssue,
  isAuthenticated,
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const { colors, spacing, fonts, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;
  const isTablet = width >= TABLET;
  const styles = useMemo(
    () => getStyles(colors, spacing, fonts, { isWide, isTablet, isDark }),
    [colors, spacing, fonts, isWide, isTablet, isDark]
  );

  // Room types (names, photos, prices) — same source as the booking screens.
  const [roomTypes, setRoomTypes] = useState([]);
  useEffect(() => {
    const unsub = subscribeToRoomTypes(setRoomTypes, () => {});
    return () => unsub && unsub();
  }, []);

  const spaces = useMemo(
    () => roomTypes
      .filter((rt) => rt.isBookable !== false)
      .map((rt) => ({ ...rt, roomTypeName: rt.name, roomNumber: '' }))
      .sort(compareRoomsForList),
    [roomTypes]
  );

  // Hero mosaic: the Banquet Hall (or the first type with a photo) large,
  // two more spaces small.
  const mosaic = useMemo(() => {
    const withPhoto = spaces.filter((s) => imageSource((s.images || [])[0]));
    if (withPhoto.length === 0) return [];
    const lead = withPhoto.find((s) => /banquet/i.test(s.name)) || withPhoto[0];
    const rest = withPhoto.filter((s) => s !== lead).slice(0, 2);
    return [lead, ...rest];
  }, [spaces]);

  // One entrance moment: the hero copy fades/slides in once (skipped when
  // the device asks for reduced motion).
  const heroAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) heroAnim.setValue(1);
        else Animated.timing(heroAnim, { toValue: 1, duration: 520, useNativeDriver: true }).start();
      })
      .catch(() => heroAnim.setValue(1));
    return () => { cancelled = true; };
  }, [heroAnim]);
  const heroAnimStyle = {
    opacity: heroAnim,
    transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  // Signed-out guests go to the login screen first (booking needs an
  // account); signed-in guests go straight to the booking flow.
  const bookOrSignIn = isAuthenticated ? onBookNow : (onSignIn || onBookNow);

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
        onReportIssue={onReportIssue}
        isAuthenticated={isAuthenticated}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Announcement ───────────────────────────────────────── */}
        <TouchableOpacity style={styles.announce} onPress={bookOrSignIn} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.announceText}>
            Planning a seminar or a celebration? The Conference Room and Banquet Hall can now be booked online.
          </Text>
          <View style={styles.announceLink}>
            <Text style={styles.announceLinkText}>Check dates</Text>
            <Ionicons name="chevron-forward" size={13} color={HERO_BG} />
          </View>
        </TouchableOpacity>

        {/* ── Hero ───────────────────────────────────────────────── */}
        <View style={styles.hero}>
          {/* The HM building, softly behind the hero (see heroPhoto/heroShade) */}
          <Image source={HERO_PHOTO} style={styles.heroPhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={styles.heroShade} pointerEvents="none" />
          <View style={styles.heroInner}>
            <Animated.View style={[styles.heroCopy, heroAnimStyle]}>
              <Text style={styles.heroTitle} accessibilityRole="header">
                Stay, meet and celebrate at the CCTC training hotel.
              </Text>
              <Text style={styles.heroLead}>
                Guest rooms, a conference room and a banquet hall in Toledo City, run by
                Hospitality Management students. See what's free and book in a few minutes.
              </Text>

              <View style={styles.heroActions}>
                <TouchableOpacity style={styles.btnPrimary} onPress={bookOrSignIn} activeOpacity={0.85} accessibilityRole="button">
                  <Text style={styles.btnPrimaryText}>Book a stay</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={bookOrSignIn} activeOpacity={0.85} accessibilityRole="button">
                  <Text style={styles.btnGhostText}>See rooms and rates</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.facts}>
                <Fact styles={styles} icon="wallet-outline" text="Pay online or at the hotel" />
              </View>
            </Animated.View>

            {mosaic.length > 0 && (
              <View style={styles.mosaic}>
                <MosaicTile styles={styles} space={mosaic[0]} big onPress={bookOrSignIn} />
                {mosaic.length > 1 && (
                  <View style={styles.mosaicCol}>
                    {mosaic.slice(1).map((s) => (
                      <MosaicTile key={s.id} styles={styles} space={s} onPress={bookOrSignIn} />
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── Spaces you can book ────────────────────────────────── */}
        {spaces.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Spaces you can book</Text>
              <Text style={styles.sectionLead}>Prices are per night. Taxes and service charges are added at checkout.</Text>
            </View>
            {isTablet ? (
              <View style={styles.spaceGrid}>
                {spaces.map((s) => (
                  <SpaceCard key={s.id} styles={styles} space={s} onPress={bookOrSignIn} />
                ))}
              </View>
            ) : (
              // Phones: one swipeable row instead of a very long column.
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={Math.round(width * 0.78) + 16}
                decelerationRate="fast"
                contentContainerStyle={styles.spaceRow}
                style={styles.spaceRowScroll}
              >
                {spaces.map((s) => (
                  <View key={s.id} style={{ width: Math.round(width * 0.78) }}>
                    <SpaceCard styles={styles} space={s} onPress={bookOrSignIn} />
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ── How booking works ──────────────────────────────────── */}
        <View style={[styles.section, styles.sectionTint]}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle} accessibilityRole="header">How booking works</Text>
          </View>
          <View style={styles.steps}>
            {[
              { n: '1', title: 'Pick your dates', body: 'Choose check-in and check-out dates and how many guests are coming.' },
              { n: '2', title: 'Choose a room or venue', body: 'Only spaces that are free for every night of your stay are shown.' },
              { n: '3', title: 'Confirm your booking', body: 'Sign in, check the details, then pay online or at the hotel. The front desk confirms it.' },
            ].map((step, i) => (
              <View key={step.n} style={[styles.step, i > 0 && styles.stepDivider]}>
                <Text style={styles.stepNumber}>{step.n}</Text>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Good to know ───────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Good to know</Text>
          </View>
          <View style={styles.infoGrid}>
            <Info styles={styles} icon="key-outline" title="Arrive any time after 2:00 PM"
              body="Check-in opens at 2:00 PM on your arrival day. Bring a valid ID to the front desk." />
            <Info styles={styles} icon="sunny-outline" title="Check out by 12:00 noon"
              body="Want to stay longer? Request an extension from My Reservations before then." />
            <Info styles={styles} icon="card-outline" title="24-hour refund window"
              body="Online payments can be refunded if you cancel within 24 hours of paying." />
            <Info styles={styles} icon="moon-outline" title="House rules"
              body="Quiet hours from 10:00 PM to 7:00 AM. No smoking and no pets anywhere on the premises." />
          </View>

          <View style={styles.closing}>
            <Text style={styles.closingText}>
              {isAuthenticated ? 'Ready when you are.' : 'Sign in or create an account to book.'}
            </Text>
            <View style={styles.closingActions}>
              <TouchableOpacity style={styles.btnDark} onPress={bookOrSignIn} activeOpacity={0.85} accessibilityRole="button">
                <Text style={styles.btnDarkText}>{isAuthenticated ? 'Book a stay' : 'Sign in to book'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.textLink} onPress={onAboutPress} activeOpacity={0.7} accessibilityRole="link">
                <Text style={styles.textLinkText}>About InnVision</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <Appfooter />
      </ScrollView>

      <HamburgerMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onProfilePress={onProfilePress}
        onAboutPress={onAboutPress}
        onContactPress={onContactPress}
        onFindBooking={onFindBooking}
        onReportIssue={onReportIssue}
        onLogout={onLogout}
        isAuthenticated={isAuthenticated}
      />

      <FeedbackWidget autoOpenOnRecentBooking />
    </View>
  );
}

function Fact({ styles, icon, text }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={16} color={BRASS} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

function MosaicTile({ styles, space, big, onPress }) {
  const src = imageSource((space.images || [])[0]);
  return (
    <TouchableOpacity
      style={[styles.tile, big ? styles.tileBig : styles.tileSmall]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Book the ${space.name}`}
    >
      {src && <Image source={src} style={styles.tileImage} resizeMode="cover" />}
      <View style={styles.tileCaption}>
        <Text style={styles.tileCaptionText} numberOfLines={1}>{space.name}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SpaceCard({ styles, space, onPress }) {
  const src = imageSource((space.images || [])[0]);
  const hasDiscount = space.originalPrice && space.price && space.originalPrice > space.price;
  const detail = [space.bed, space.occupancy].filter(Boolean).join(', ');
  return (
    <TouchableOpacity style={styles.space} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${space.name}, from ${formatCurrency(space.price)} per night`}>
      <View style={styles.spaceImageWrap}>
        {src
          ? <Image source={src} style={styles.spaceImage} resizeMode="cover" />
          : <View style={[styles.spaceImage, styles.spaceImageEmpty]}><Ionicons name="image-outline" size={26} color="#9C8F78" /></View>}
      </View>
      <Text style={styles.spaceName}>{space.name}</Text>
      {!!detail && <Text style={styles.spaceDetail} numberOfLines={1}>{detail}</Text>}
      {space.price != null && (
        <Text style={styles.spacePrice}>
          From <Text style={styles.spacePriceStrong}>{formatCurrency(space.price)}</Text> a night
          {hasDiscount ? <Text>{'\u00A0\u00A0'}<Text style={styles.spacePriceWas}>{formatCurrency(space.originalPrice)}</Text></Text> : null}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function Info({ styles, icon, title, body }) {
  return (
    <View style={styles.info}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={styles.infoIconColor.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoBody}>{body}</Text>
      </View>
    </View>
  );
}

function getStyles(colors, spacing, fonts, { isWide, isTablet, isDark }) {
  const gutter = isTablet ? spacing.xl : spacing.lg;
  const maxW = 1160;
  const titleSize = isWide ? 68 : isTablet ? 52 : 40;
  const cardShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 14px 34px rgba(0,0,0,0.35)'
    : '0 1px 2px rgba(43,36,28,0.06), 0 14px 34px rgba(43,36,28,0.09)';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, #1E1A14 0%, #17130F 100%)'
          : 'linear-gradient(180deg, #FBF8F3 0%, #F4EDE2 100%)',
      }),
    },
    scroll: { flex: 1 },

    /* Announcement — gold sheen */
    announce: {
      backgroundColor: '#D6B464',
      ...web({ backgroundImage: 'linear-gradient(90deg, #B98C3A 0%, #E7CB82 50%, #B98C3A 100%)' }),
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      columnGap: spacing.md,
      rowGap: 4,
      paddingVertical: 10,
      paddingHorizontal: gutter,
    },
    announceText: { fontSize: 13, lineHeight: 18, fontFamily: F.medium, color: '#231B12', textAlign: 'center', flexShrink: 1, letterSpacing: -0.1 },
    announceLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    announceLinkText: { fontSize: 13, fontFamily: F.semi, color: '#231B12', textDecorationLine: 'underline' },

    /* Hero — smooth espresso → bronze with a soft gold glow */
    hero: {
      backgroundColor: HERO_BG,
      position: 'relative',
      overflow: 'hidden',
      paddingHorizontal: gutter,
      paddingTop: isWide ? 84 : 52,
      paddingBottom: isWide ? 92 : 52,
    },
    // Building photo fills the hero; the shade above it keeps the left
    // (headline) side dark and lets the building show on the right.
    heroPhoto: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      width: '100%', height: '100%',
      opacity: isWide ? 0.55 : 0.4,
    },
    heroShade: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(23,18,14,0.78)',
      ...web({
        backgroundColor: 'transparent',
        backgroundImage: [
          'radial-gradient(ellipse at 88% 12%, rgba(231,203,130,0.20) 0%, rgba(231,203,130,0) 46%)',
          isWide
            ? 'linear-gradient(90deg, rgba(23,18,14,0.97) 0%, rgba(23,18,14,0.90) 38%, rgba(30,23,17,0.62) 70%, rgba(42,32,22,0.50) 100%)'
            : 'linear-gradient(180deg, rgba(23,18,14,0.94) 0%, rgba(23,18,14,0.86) 60%, rgba(30,23,17,0.80) 100%)',
          'linear-gradient(180deg, rgba(23,18,14,0) 70%, rgba(23,18,14,0.6) 100%)',
        ].join(', '),
      }),
    },
    heroInner: {
      position: 'relative', // above the photo + shade
      zIndex: 1,
      width: '100%',
      maxWidth: maxW,
      alignSelf: 'center',
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'center' : 'stretch',
      gap: isWide ? 64 : 40,
    },
    heroCopy: { flex: isWide ? 1.1 : undefined, maxWidth: 660 },
    heroTitle: {
      fontFamily: F.display,
      fontSize: titleSize,
      lineHeight: Math.round(titleSize * 1.03),
      letterSpacing: -(titleSize * 0.035),
      color: HERO_TEXT,
    },
    heroLead: {
      marginTop: spacing.lg,
      fontSize: isTablet ? 18 : 16,
      lineHeight: isTablet ? 29 : 25,
      fontFamily: F.body,
      color: HERO_MUTED,
      maxWidth: 560,
      letterSpacing: -0.1,
    },
    heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 32 },
    btnPrimary: {
      backgroundColor: '#DDBB6C',
      ...web({
        backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${BRASS} 100%)`,
        boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 10px 26px rgba(201,161,74,0.35)',
      }),
      borderRadius: 12,
      paddingVertical: 15,
      paddingHorizontal: 26,
    },
    btnPrimaryText: { fontSize: 15, fontFamily: F.semi, color: '#231B12', letterSpacing: -0.1 },
    btnGhost: {
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderWidth: 1,
      borderColor: 'rgba(247,242,234,0.22)',
      backgroundColor: 'rgba(247,242,234,0.06)',
      ...web({ backdropFilter: 'blur(8px)' }),
    },
    btnGhostText: { fontSize: 15, fontFamily: F.semi, color: HERO_TEXT, letterSpacing: -0.1 },

    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 28 },
    fact: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
      backgroundColor: 'rgba(247,242,234,0.07)',
      borderWidth: 1, borderColor: 'rgba(247,242,234,0.10)',
    },
    factText: { fontSize: 13, fontFamily: F.medium, color: HERO_TEXT, letterSpacing: -0.1 },

    mosaic: {
      flex: isWide ? 1 : undefined,
      flexDirection: 'row',
      gap: 12,
      height: isWide ? 460 : isTablet ? 360 : 260,
    },
    mosaicCol: { flex: 1, gap: 12 },
    tile: {
      overflow: 'hidden',
      backgroundColor: '#3A3127',
      position: 'relative',
      borderWidth: 1,
      borderColor: 'rgba(247,242,234,0.08)',
      ...web({ boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }),
    },
    tileBig: { flex: 1.5, borderRadius: 22 },
    tileSmall: { flex: 1, borderRadius: 18 },
    tileImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
    tileCaption: {
      position: 'absolute', left: 12, bottom: 12, maxWidth: '85%',
      backgroundColor: 'rgba(23,18,14,0.62)',
      ...web({ backdropFilter: 'blur(10px)' }),
      borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
      borderWidth: 1, borderColor: 'rgba(247,242,234,0.12)',
    },
    tileCaptionText: { fontSize: 12, fontFamily: F.semi, color: HERO_TEXT },

    /* Sections */
    section: { paddingHorizontal: gutter, paddingVertical: isWide ? 88 : 56 },
    sectionTint: {
      backgroundColor: colors.cardAlt,
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 100%)'
          : 'linear-gradient(180deg, #F3EBDD 0%, #EFE5D4 100%)',
      }),
    },
    sectionHead: { width: '100%', maxWidth: maxW, alignSelf: 'center', marginBottom: isTablet ? 36 : 24 },
    sectionTitle: {
      fontFamily: F.display,
      fontSize: isTablet ? 38 : 30,
      lineHeight: isTablet ? 42 : 34,
      letterSpacing: isTablet ? -1.3 : -1,
      color: colors.text,
    },
    sectionLead: { marginTop: 8, fontSize: 15, lineHeight: 23, fontFamily: F.body, color: colors.textMuted, maxWidth: 620 },

    spaceGrid: {
      width: '100%', maxWidth: maxW, alignSelf: 'center',
      flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 24,
    },
    spaceRowScroll: { marginHorizontal: -gutter },
    spaceRow: { paddingHorizontal: gutter, paddingBottom: 12, gap: 16 },
    space: {
      ...(isTablet ? { width: isWide ? '31%' : '47%', flexGrow: 1, maxWidth: isWide ? 372 : undefined } : { width: '100%' }),
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 10,
      paddingBottom: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(43,36,28,0.06)',
      ...web({ boxShadow: cardShadow }),
    },
    spaceImageWrap: { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.cardAlt },
    spaceImage: { width: '100%', aspectRatio: 16 / 10 },
    spaceImageEmpty: { alignItems: 'center', justifyContent: 'center' },
    spaceName: { marginTop: 14, marginHorizontal: 6, fontFamily: F.bold, fontSize: 18, lineHeight: 23, letterSpacing: -0.4, color: colors.text },
    spaceDetail: { marginTop: 2, marginHorizontal: 6, fontSize: 13, fontFamily: F.body, color: colors.textMuted },
    spacePrice: { marginTop: 10, marginHorizontal: 6, fontSize: 14, fontFamily: F.body, color: colors.textMuted },
    spacePriceStrong: { fontFamily: F.bold, color: colors.text, fontSize: 16, letterSpacing: -0.3 },
    spacePriceWas: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'line-through' },

    steps: {
      width: '100%', maxWidth: maxW, alignSelf: 'center',
      flexDirection: isTablet ? 'row' : 'column',
    },
    step: { flex: isTablet ? 1 : undefined, paddingVertical: isTablet ? 0 : spacing.md, paddingRight: isTablet ? spacing.xl : 0 },
    stepDivider: isTablet
      ? { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: spacing.xl }
      : { borderTopWidth: 1, borderTopColor: colors.border },
    stepNumber: {
      fontFamily: F.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.5,
      color: BRASS,
      ...web({
        backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, #A87E2F 100%)`,
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      }),
    },
    stepTitle: { marginTop: 6, fontFamily: F.bold, fontSize: 18, lineHeight: 23, letterSpacing: -0.4, color: colors.text },
    stepBody: { marginTop: 4, fontSize: 14, lineHeight: 22, fontFamily: F.body, color: colors.textMuted, maxWidth: 340 },

    infoGrid: {
      width: '100%', maxWidth: maxW, alignSelf: 'center',
      flexDirection: 'row', flexWrap: 'wrap', columnGap: 40, rowGap: 30,
    },
    info: { flexDirection: 'row', gap: 14, width: isTablet ? '46%' : '100%', flexGrow: 1 },
    infoIcon: {
      width: 42, height: 42, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(240,213,142,0.16)' : '#E9D6A6',
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, rgba(240,213,142,0.22) 0%, rgba(201,161,74,0.14) 100%)'
          : 'linear-gradient(180deg, #F6E7BF 0%, #E9D19A 100%)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset',
      }),
    },
    infoIconColor: { color: isDark ? GOLD_LIGHT : '#6B4E1E' },
    infoTitle: { fontFamily: F.bold, fontSize: 16, lineHeight: 22, letterSpacing: -0.3, color: colors.text },
    infoBody: { marginTop: 3, fontSize: 14, lineHeight: 22, fontFamily: F.body, color: colors.textMuted, maxWidth: 460 },

    closing: {
      width: '100%', maxWidth: maxW, alignSelf: 'center',
      marginTop: isWide ? 72 : 48,
      padding: isTablet ? 32 : 24,
      borderRadius: 22,
      backgroundColor: HERO_BG,
      ...web({
        backgroundImage: 'radial-gradient(ellipse at 100% 0%, rgba(231,203,130,0.20) 0%, rgba(231,203,130,0) 55%), linear-gradient(135deg, #1B1511 0%, #3A2B1D 100%)',
        boxShadow: '0 20px 50px rgba(23,18,14,0.25)',
      }),
      flexDirection: isTablet ? 'row' : 'column',
      alignItems: isTablet ? 'center' : 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    closingText: { fontFamily: F.display, fontSize: isTablet ? 26 : 22, letterSpacing: -0.8, color: HERO_TEXT, flexShrink: 1 },
    closingActions: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
    btnDark: {
      backgroundColor: '#DDBB6C',
      ...web({
        backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${BRASS} 100%)`,
        boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 10px 26px rgba(201,161,74,0.30)',
      }),
      borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24,
    },
    btnDarkText: { fontSize: 15, fontFamily: F.semi, color: '#231B12' },
    textLink: { paddingVertical: 6 },
    textLinkText: { fontSize: 14, fontFamily: F.semi, color: HERO_TEXT, textDecorationLine: 'underline' },
  });
}