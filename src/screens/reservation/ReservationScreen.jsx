import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RangeCalendar from '../../components/reservation/RangeCalendar';
import GuestRoomSelector from '../../components/reservation/GuestRoomSelector';
import DropdownTrigger from '../../components/reservation/DropdownTrigger';
import { useTheme } from '../../context/ThemeContext';
import { lightColors } from '../../utils/theme';
import { formatDate, isCheckOutValid, nightsBetween } from '../../utils/dateHelpers';

const logo = require('../../../assets/logo.png');

const initialRoom = () => ({ adults: 1, children: 0 });

/**
 * ReservationScreen — STAY DETAILS ONLY.
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). Two intentional fixes made
 * during migration, not just a mechanical swap:
 *
 *  - `screen`'s background was `colors.primary`, a token meant to flip
 *    for buttons/headings — used as a full-bleed backdrop, it would have
 *    turned near-white in dark mode and swallowed the white logo/close
 *    chips. Changed to `colors.heroBackground`, the token intentionally
 *    kept a dark band in BOTH palettes (same one AboutScreen's header
 *    uses), so this immersive booking sheet keeps its look either way.
 *  - `closeText` sits on a chip that is deliberately always white
 *    (`colors.white`, literal in both palettes) against that now
 *    always-dark backdrop. Its text must therefore stay always dark too —
 *    using `colors.primary` here would flip to near-white in dark mode
 *    and vanish against the white chip. Pinned to `lightColors.primary`
 *    directly (bypassing the active theme on purpose) for this spot.
 *  - `logoBadge` no longer renders "IV" text — it now hosts the actual
 *    hotel logo image, same white badge treatment as `BrandHeader`.
 *
 * IMPORTANT: this screen no longer writes to Firestore. Nothing the guest
 * enters here (dates, rooms, guests) is an official reservation yet — it's
 * just in-progress local state. A Firestore document should only be
 * created once, at the moment the guest confirms on ReviewPayScreen. That
 * keeps "pending" reservations in the admin panel meaning "a guest
 * actually submitted a booking," not "someone opened the date picker."
 *
 * Props:
 *  - user:     Firebase auth user (still required — guest must be logged
 *              in to eventually book, checked here for a fast fail before
 *              they fill out the whole form)
 *  - onSearch: ({ checkIn, checkOut, nights, rooms, totals }) => void
 *  - onClose:  () => void
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
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

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

    // No Firestore write here. This is still just local, in-progress stay
    // details — dates, rooms, guest counts. Nothing gets saved to the
    // database until the guest actually confirms on ReviewPayScreen.
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
        <View style={styles.logoBadge}>
          <Image source={logo} style={styles.logoImage} resizeMode="contain" />
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
          <Ionicons name="close-outline" size={20} color={lightColors.primary} />
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {/* ── Content ──────────────────────────────────────────── */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Book Your Stay</Text>
          <Text style={styles.cardSubtitle}>Select your dates and number of guests.</Text>

          <Text style={styles.sectionLabel}>Stay Details</Text>

          {/* Stay Dates */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Stay Dates <Text style={styles.required}>*</Text>
            </Text>
            <DropdownTrigger
              icon="📅"
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
              icon="👤"
              isOpen={showGuestSelector}
              onPress={() => setShowGuestSelector(true)}
            >
              <Text style={styles.pillValue} numberOfLines={1}>
                {guestSummaryLabel}
              </Text>
            </DropdownTrigger>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleSearch}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Check Rates & Availability</Text>
          </TouchableOpacity>

          <Text style={styles.termsText}>*Terms and conditions apply.</Text>
        </View>
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

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.heroBackground,
    },

    /* Header */
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
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
    logoImage: {
      width: 28,
      height: 28,
    },
    closeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.white,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      gap: spacing.xs,
    },
    closeText: {
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
      color: lightColors.primary, // always-dark text on an always-white chip
    },

    /* Scroll */
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.lg,
      paddingVertical: spacing.xl,
    },

    /* Card */
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 0.5,
      borderColor: colors.border,
      padding: spacing.xl,
    },
    cardTitle: {
      fontFamily: fonts.headingExtraBold,
      fontSize: 22,
      color: colors.primary,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    cardSubtitle: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
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
    fieldGroup: {
      marginBottom: spacing.md,
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

    /* CTA */
    ctaButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.md,
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
      textAlign: 'right',
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
    },
  });
}