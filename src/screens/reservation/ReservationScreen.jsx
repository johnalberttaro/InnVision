import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  SafeAreaView,
  Alert,
  Image,
  Platform,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RangeCalendar from '../../components/reservation/RangeCalendar';
import GuestRoomSelector from '../../components/reservation/GuestRoomSelector';
import DropdownTrigger from '../../components/reservation/DropdownTrigger';
import { useTheme } from '../../context/ThemeContext';
import { formatDate, isCheckOutValid, nightsBetween } from '../../utils/dateHelpers';

const logo = require('../../../assets/logo.png');

const initialRoom = () => ({ adults: 1, children: 0 });

const DESKTOP_BREAKPOINT = 900;
const CONTENT_MAX_WIDTH = 980;

const TRUST_POINTS = [
  { icon: 'shield-checkmark-outline', label: 'Best rate guaranteed', hint: 'Book direct, pay no more.' },
  { icon: 'checkmark-circle-outline', label: 'Instant confirmation', hint: 'No waiting on an email back.' },
  { icon: 'time-outline', label: 'Free cancellation', hint: 'Change your mind, change your dates.' },
];

/**
 * ReservationScreen — STAY DETAILS ONLY.
 *
 * ENHANCED: five concrete fixes/upgrades over the previous version:
 *  1. FIXED DARK-MODE BUG: the close button hardcoded `lightColors.primary`
 *     instead of reading from useTheme()'s `colors` — every other color on
 *     this screen already flips correctly in dark mode, this one didn't.
 *  2. Emoji icons (📅 👤) replaced with real Ionicons (calendar-outline,
 *     people-outline) — every other screen in the app uses vector icons;
 *     this was the one remaining holdout.
 *  3. CTA button changed from a rounded rectangle to the full pill shape
 *     (borderRadius: 999) used everywhere else in the app now (Book Now,
 *     Sign In to Book Your Stay, the auth screens' buttons, etc.).
 *  4. Added the same fade+slide-in mount animation used on the auth
 *     screens, for consistency — this modal now eases in instead of
 *     appearing instantly.
 *  5. Trust points (Best rate guaranteed / Instant confirmation / Free
 *     cancellation) used to only render on the desktop brand panel —
 *     mobile users never saw that reassurance at all. Added a compact
 *     horizontal version above the CTA on mobile.
 *
 * DESKTOP PASS 2: the earlier fix (max-width + shadow) stopped the card
 * from stretching, but left a large flat void beside it — a centered
 * modal doesn't become a "page" just by capping its width. This pass
 * splits wide layouts into two panels: a brand/trust panel (left) and
 * the booking form (right), joined into a single card so the desktop
 * view reads as one considered layout, not a floating dialog. Mobile is
 * untouched — the brand panel only renders when isDesktop is true.
 *
 * CENTERING PASS: scrollContent now uses flexGrow so the content
 * container is at least as tall as the ScrollView, giving
 * justifyContent/alignItems real space to center the shell within on
 * both mobile and desktop. When the form is taller than the screen,
 * flexGrow doesn't clip anything — the ScrollView still scrolls
 * normally to reach the bottom CTA.
 */
export default function ReservationScreen({ user, onSearch, onClose }) {
  const [checkIn, setCheckIn]   = useState(null);
  const [checkOut, setCheckOut] = useState(null);
  const [dateError, setDateError] = useState('');
  const [rooms, setRooms]       = useState([initialRoom()]);
  const [showCalendar, setShowCalendar]           = useState(false);
  const [showGuestSelector, setShowGuestSelector] = useState(false);
  const [errors, setErrors]     = useState({});

  const { colors, spacing, radius, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const styles = useMemo(
    () => getStyles(colors, spacing, radius, fonts, isDesktop),
    [colors, spacing, radius, fonts, isDesktop]
  );

  // Smooth entrance, matching the same fade+slide-in pattern the auth
  // screens use — this modal now eases in instead of appearing instantly.
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start();
  }, []);

  const totals = useMemo(() => {
    const totalRooms    = rooms.length;
    const totalAdults   = rooms.reduce((sum, r) => sum + r.adults, 0);
    const totalChildren = rooms.reduce((sum, r) => sum + r.children, 0);
    return { totalRooms, totalAdults, totalChildren, totalGuests: totalAdults + totalChildren };
  }, [rooms]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);

  const handleSelectRange = (newCheckIn, newCheckOut) => {
    setCheckIn(newCheckIn);
    setCheckOut(newCheckOut);
    if (newCheckIn && newCheckOut && !isCheckOutValid(newCheckIn, newCheckOut)) {
      setDateError('Check-out cannot be earlier than or the same as check-in.');
    } else {
      setDateError('');
    }
  };

  const updateRoomAdults   = (i, v) => setRooms(p => p.map((r, idx) => idx === i ? { ...r, adults: v }   : r));
  const updateRoomChildren = (i, v) => setRooms(p => p.map((r, idx) => idx === i ? { ...r, children: v } : r));
  const addRoom    = () => setRooms(p => [...p, initialRoom()]);
  const removeRoom = (i) => setRooms(p => p.length > 1 ? p.filter((_, idx) => idx !== i) : p);

  const validate = () => {
    const e = {};
    if (!checkIn || !checkOut)
      e.dates = 'Check-in and check-out dates are required.';
    if (checkIn && checkOut && !isCheckOutValid(checkIn, checkOut))
      e.dates = 'Check-out cannot be earlier than or the same as check-in.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSearch = () => {
    if (!validate()) return;

    if (!user) {
      Alert.alert('Please log in', 'You need to be logged in to book a room.');
      return;
    }

    onSearch({ checkIn, checkOut, nights, rooms, totals });
  };

  const dateSummaryLabel = checkIn && checkOut
    ? `${formatDate(checkIn)}  –  ${formatDate(checkOut)}`
    : checkIn
      ? `${formatDate(checkIn)}  –  Check out`
      : 'Check in  |  Check out';

  const guestSummaryLabel =
    `${totals.totalRooms} Room${totals.totalRooms > 1 ? 's' : ''}, ` +
    `${totals.totalAdults} Adult${totals.totalAdults !== 1 ? 's' : ''}, ` +
    `${totals.totalChildren} Child${totals.totalChildren !== 1 ? 'ren' : ''}`;

  return (
    <SafeAreaView style={styles.screen}>

      {/* ── Header ───────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.logoBadge}>
            <Image source={logo} style={styles.logoImage} resizeMode="contain" />
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
            <Ionicons name="close-outline" size={20} color={colors.primary} />
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Content ──────────────────────────────────────────── */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.shell, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Brand / trust panel — desktop only. Fills the space that
              used to just be dark void, with real information instead
              of decoration. */}
          {isDesktop && (
            <View style={styles.brandPanel}>
              <View style={styles.brandPattern} pointerEvents="none" />
              <View style={styles.brandContent}>
                <Image source={logo} style={styles.brandLogo} resizeMode="contain" />
                <Text style={styles.brandHeading}>A stay, sorted.</Text>
                <Text style={styles.brandSubheading}>
                  Pick your dates, tell us who's coming, and we'll hold the room.
                </Text>

                <View style={styles.trustList}>
                  {TRUST_POINTS.map((point) => (
                    <View key={point.label} style={styles.trustRow}>
                      <View style={styles.trustIconWrap}>
                        <Ionicons name={point.icon} size={16} color={colors.white} />
                      </View>
                      <View style={styles.trustTextWrap}>
                        <Text style={styles.trustLabel}>{point.label}</Text>
                        <Text style={styles.trustHint}>{point.hint}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Form panel */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Book Your Stay</Text>
            <Text style={styles.cardSubtitle}>Select your dates and number of guests.</Text>

            <Text style={styles.sectionLabel}>Stay Details</Text>

            <View style={styles.fieldsRow}>
              {/* Stay Dates */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Stay Dates <Text style={styles.required}>*</Text>
                </Text>
                <DropdownTrigger
                  icon={<Ionicons name="calendar-outline" size={16} color={colors.textMuted} />}
                  isOpen={showCalendar}
                  onPress={() => setShowCalendar(true)}
                  error={errors.dates || dateError}
                >
                  <Text
                    style={checkIn ? styles.pillValue : styles.pillPlaceholder}
                    numberOfLines={1}
                  >
                    {dateSummaryLabel}
                  </Text>
                </DropdownTrigger>
                {(errors.dates || dateError)
                  ? <Text style={styles.errorText}>{errors.dates || dateError}</Text>
                  : null}
                {nights > 0 && !dateError
                  ? <Text style={styles.nightsHint}>{nights} night{nights > 1 ? 's' : ''}</Text>
                  : null}
              </View>

              {/* Guests & Rooms */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Guests & Rooms</Text>
                <DropdownTrigger
                  icon={<Ionicons name="people-outline" size={16} color={colors.textMuted} />}
                  isOpen={showGuestSelector}
                  onPress={() => setShowGuestSelector(true)}
                >
                  <Text style={styles.pillValue} numberOfLines={1}>
                    {guestSummaryLabel}
                  </Text>
                </DropdownTrigger>
              </View>
            </View>

            {/* Mobile trust row — the desktop brand panel already shows
                these; mobile never did, so this compact version gives
                mobile users the same reassurance in one line instead of
                the full sidebar treatment. */}
            {!isDesktop && (
              <View style={styles.mobileTrustRow}>
                {TRUST_POINTS.map((point) => (
                  <View key={point.label} style={styles.mobileTrustItem}>
                    <Ionicons name={point.icon} size={14} color={colors.accent} />
                    <Text style={styles.mobileTrustLabel} numberOfLines={2}>{point.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* CTA — same on every platform. In Expo Go / native
                (Platform.OS !== 'web') isDesktop is always false, so this
                is the only submit path; never hide it there. */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleSearch}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>Check Rates & Availability</Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>*Terms and conditions apply.</Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Calendar Modal ────────────────────────────────────── */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <RangeCalendar
              checkIn={checkIn}
              checkOut={checkOut}
              onSelectRange={handleSelectRange}
              onDone={() => setShowCalendar(false)}
            />
          </View>
        </View>
      </Modal>

      {/* ── Guest Selector Modal ──────────────────────────────── */}
      <Modal
        visible={showGuestSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGuestSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <GuestRoomSelector
              rooms={rooms}
              onChangeAdults={updateRoomAdults}
              onChangeChildren={updateRoomChildren}
              onAddRoom={addRoom}
              onRemoveRoom={removeRoom}
              onDone={() => setShowGuestSelector(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStyles(colors, spacing, radius, fonts, isDesktop) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.heroBackground,
    },

    /* Header */
    header: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    headerInner: {
      width: '100%',
      maxWidth: isDesktop ? CONTENT_MAX_WIDTH : undefined,
      marginHorizontal: isDesktop ? 'auto' : 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    logoBadge: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    logoImage: { width: 28, height: 28 },
    closeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      gap: spacing.xs,
      ...Platform.select({ web: { cursor: 'pointer', transitionDuration: '150ms' } }),
    },
    closeText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      color: colors.primary,
    },

    /* Scroll */
    scroll: { flex: 1 },
    scrollContent: {
      // flexGrow makes the content container at least as tall as the
      // ScrollView itself — that's what gives justifyContent/alignItems
      // real space to center the shell within, on both mobile and
      // desktop. When the form is taller than the screen, flexGrow
      // doesn't clip anything: the container just grows past 100% and
      // the ScrollView scrolls normally to reach the bottom CTA.
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
      paddingVertical: spacing.xl,
    },

    /* Shell — holds brand panel + card side by side on desktop */
    shell: {
      width: '100%',
      maxWidth: isDesktop ? CONTENT_MAX_WIDTH : undefined,
      flexDirection: isDesktop ? 'row' : 'column',
      borderRadius: radius.lg,
      overflow: 'hidden',
      ...Platform.select({
        web: { boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)' },
        default: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.25,
          shadowRadius: 20,
          elevation: 8,
        },
      }),
    },

    /* Brand panel (desktop only) */
    brandPanel: {
      width: 320,
      backgroundColor: colors.heroBackground,
      padding: spacing.xl,
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      borderRightWidth: 1,
      borderRightColor: 'rgba(255,255,255,0.08)',
    },
    brandPattern: {
      position: 'absolute',
      top: -60,
      right: -60,
      width: 260,
      height: 260,
      borderRadius: 260,
      borderWidth: 40,
      borderColor: 'rgba(255,255,255,0.04)',
    },
    brandContent: { position: 'relative' },
    brandLogo: {
      width: 36,
      height: 36,
      marginBottom: spacing.lg,
      tintColor: colors.white,
    },
    brandHeading: {
      fontFamily: fonts.headingExtraBold,
      fontSize: 26,
      color: colors.white,
      marginBottom: spacing.sm,
    },
    brandSubheading: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: 'rgba(255,255,255,0.65)',
      marginBottom: spacing.xl,
    },
    trustList: { gap: spacing.md },
    trustRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    trustIconWrap: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      backgroundColor: 'rgba(255,255,255,0.10)',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    trustTextWrap: { flex: 1 },
    trustLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      color: colors.white,
      marginBottom: 2,
    },
    trustHint: {
      fontFamily: fonts.body,
      fontSize: 11.5,
      lineHeight: 15,
      color: 'rgba(255,255,255,0.55)',
    },

    /* Form panel */
    card: {
      flex: isDesktop ? 1 : undefined,
      width: isDesktop ? undefined : '100%',
      backgroundColor: colors.card,
      borderWidth: isDesktop ? 0 : 0.5,
      borderColor: colors.border,
      borderRadius: isDesktop ? 0 : radius.lg,
      padding: isDesktop ? spacing.xl * 1.4 : spacing.xl,
    },
    cardTitle: {
      fontFamily: fonts.headingExtraBold,
      fontSize: isDesktop ? 24 : 22,
      color: colors.primary,
      textAlign: isDesktop ? 'left' : 'center',
      marginBottom: spacing.xs,
    },
    cardSubtitle: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: isDesktop ? 'left' : 'center',
      marginBottom: spacing.xl,
    },

    /* Section label */
    sectionLabel: {
      fontFamily: fonts.headingBold,
      fontSize: 12,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.md,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },

    /* Fields */
    fieldsRow: {
      flexDirection: isDesktop ? 'row' : 'column',
      alignItems: isDesktop ? 'flex-start' : 'stretch',
      gap: spacing.md,
    },
    fieldGroup: {
      flex: isDesktop ? 1 : undefined,
      marginBottom: isDesktop ? 0 : spacing.md,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    required: { color: colors.danger },
    errorText: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: colors.danger,
      marginTop: spacing.xs,
    },
    pillValue: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },
    pillPlaceholder: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textMuted,
    },
    nightsHint: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },

    /* Mobile trust row */
    mobileTrustRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    mobileTrustItem: { flex: 1, alignItems: 'center', gap: 4 },
    mobileTrustLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: 10.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 13,
    },

    /* CTA */
    ctaButton: {
      backgroundColor: colors.accent,
      borderRadius: 999,
      height: 48,
      width: isDesktop ? 260 : undefined,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
      ...Platform.select({ web: { cursor: 'pointer', transitionDuration: '150ms' } }),
    },
    ctaText: {
      color: colors.onPrimary,
      fontSize: 15,
      fontFamily: fonts.headingSemiBold,
      letterSpacing: 0.3,
    },
    termsText: {
      fontFamily: fonts.body,
      fontSize: 10,
      color: colors.textMuted,
      textAlign: isDesktop ? 'left' : 'right',
      marginTop: spacing.sm,
    },

    /* Modals */
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlayDim,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalSheet: {
      maxHeight: '85%',
      maxWidth: isDesktop ? 480 : undefined,
      width: isDesktop ? '100%' : '100%',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      overflow: 'hidden',
      alignSelf: isDesktop ? 'center' : 'stretch',
    },
  });
}