import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { subscribeToRoomTypes, subscribeToRooms, joinRoomsWithTypes, formatCurrency } from '../../utils/Roomsservice';
import Brandheader from '../../components/shared/Brandheader';
import Appfooter from '../../components/shared/Appfooter';
import StepIndicator from '../../components/shared/StepIndicator';
import StayBar from '../../components/shared/StayBar';
import RateCard from '../../components/roomRates/RateCard';
import { ROOM_RATES } from '../../utils/roomRates';
import { useTheme } from '../../context/ThemeContext';

// Use 2 columns only on screens wider than this (tablets/web)
const TWO_COL_BREAKPOINT = 600;

/**
 * "Room & Rates" screen — shown after a valid search.
 *  - Mobile  (< 600px) → 1 card per row, full width
 *  - Tablet / Web (≥ 600px) → 2 cards per row
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). Three fixes made during
 * migration:
 *  - `roomTabLabelActive` used `colors.white` for text on the active tab
 *    (background = colors.step, which flips) — changed to `onPrimary` so
 *    it stays readable when step flips to a light color in dark mode.
 *  - `roomTabSubtextActive` used a hardcoded `rgba(255,255,255,0.85)` for
 *    the same reason — changed to `color: colors.onPrimary` + a separate
 *    `opacity: 0.85` so it still dims correctly against either palette.
 *  - `continueBar`'s background was `colors.white` (invariant, doesn't
 *    flip) used as a card surface — changed to `colors.card` so this bar
 *    matches every other card in dark mode instead of staying stuck white.
 *  - `continueButtonText` was `colors.white` on top of `colors.primary`
 *    (which flips) — changed to `onPrimary`.
 *
 * MULTI-ROOM SELECTION: bookingDetails.totals.totalRooms (set on
 * ReservationScreen's Guests & Rooms step) drives how many independent
 * room slots the guest needs to fill. Each slot ("ROOM 1", "ROOM 2", ...)
 * is chosen separately and can be a different room number and/or a
 * different room type — nothing forces every slot to match.
 *
 * Local state `selectedRooms` is an array with one entry per slot,
 * `null` until filled. Tapping a tab switches which slot you're editing;
 * picking a room (via RateCard's modal "BOOK" button) fills the active
 * slot and auto-advances to the next unfilled one. Once every slot is
 * filled, either:
 *   - totalRoomsNeeded === 1 → onReserve(selectedRooms) fires immediately
 *     (preserves the original one-tap booking flow for the common case)
 *   - totalRoomsNeeded > 1   → a "Continue" button appears so the guest
 *     can review all picks before moving to Review & Pay
 *
 * Availability rules enforced here:
 *   - Only rooms with status "vacant" (room.available) are ever shown as
 *     selectable, when real Firestore room data is loaded.
 *   - A physical room already assigned to a DIFFERENT slot is hidden from
 *     the list for the current slot (can't double-book the same room
 *     across slots in one reservation).
 *   - The room currently assigned to the active slot stays visible/
 *     selectable so the guest can confirm or change their pick.
 *
 * Each of the property's physical rooms is shown as its own card —
 * sourced from Firestore's "rooms" collection joined with "roomTypes"
 * (via joinRoomsWithTypes in utils/Roomsservice.js), the same read path
 * the admin Room Management screen uses. Kept live via onSnapshot.
 *
 * ROOM_RATES (utils/roomRates.js) is used as a fallback so the screen
 * never looks empty while Firestore loads or if "rooms" hasn't been
 * seeded yet. NOTE: fallback entries have no roomNumber, so the
 * "one room per slot" uniqueness rule doesn't apply to them — this only
 * matters in the edge case where Firestore has no data at all.
 *
 * Props:
 *  - bookingDetails: object produced by ReservationScreen's onSearch
 *  - onEditSearch: () => void
 *  - onReserve: (selectedRooms: Array<{roomNumber, roomTypeId, roomTypeName, ...}>) => void
 */
export default function RoomSelectionScreen({ bookingDetails, onEditSearch, onReserve }) {
  const { width } = useWindowDimensions();
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [firestoreReady, setFirestoreReady] = useState(false);

  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  useEffect(() => {
    let typesLoaded = false;
    let roomsLoaded = false;
    const checkReady = () => {
      if (typesLoaded && roomsLoaded) setFirestoreReady(true);
    };

    const unsubTypes = subscribeToRoomTypes(
      (data) => { setRoomTypes(data); typesLoaded = true; checkReady(); },
      (error) => { console.error('Failed to load room types, falling back to ROOM_RATES:', error); typesLoaded = true; checkReady(); }
    );
    const unsubRooms = subscribeToRooms(
      (data) => { setRooms(data); roomsLoaded = true; checkReady(); },
      (error) => { console.error('Failed to load rooms, falling back to ROOM_RATES:', error); roomsLoaded = true; checkReady(); }
    );

    return () => {
      unsubTypes();
      unsubRooms();
    };
  }, []);

  const joinedRooms = useMemo(() => joinRoomsWithTypes(rooms, roomTypes), [rooms, roomTypes]);
  const isFirestoreRooms = firestoreReady && joinedRooms.length > 0;

  // Base pool of selectable rooms: only vacant ones when we have real
  // Firestore data. Fallback categories (no roomNumber) are always
  // "available" since there's no live status to check.
  const allRoomOptions = useMemo(() => {
    if (isFirestoreRooms) {
      return joinedRooms
        .filter((room) => room.available)
        .map((room) => ({
          ...room,
          name: `Room ${room.roomNumber} — ${room.roomTypeName}`,
        }));
    }
    return ROOM_RATES.map((rate) => ({ ...rate, roomNumber: null, available: true }));
  }, [isFirestoreRooms, joinedRooms]);

  const totalRoomsNeeded = bookingDetails?.totals?.totalRooms || 1;

  const [selectedRooms, setSelectedRooms] = useState(() => Array(totalRoomsNeeded).fill(null));
  const [activeIndex, setActiveIndex] = useState(0);

  // Keep the selectedRooms array in sync if totalRoomsNeeded changes
  // (e.g. guest goes back and edits Guests & Rooms), preserving whatever
  // was already picked for slots that still exist.
  useEffect(() => {
    setSelectedRooms((prev) => {
      if (prev.length === totalRoomsNeeded) return prev;
      const next = Array(totalRoomsNeeded).fill(null);
      prev.forEach((r, i) => { if (i < totalRoomsNeeded) next[i] = r; });
      return next;
    });
    setActiveIndex((i) => Math.min(i, totalRoomsNeeded - 1));
  }, [totalRoomsNeeded]);

  // Hide rooms already claimed by a DIFFERENT slot; keep the active
  // slot's own current pick visible so it can be confirmed or changed.
  const availableForActiveSlot = useMemo(() => {
    return allRoomOptions.filter((room) => {
      if (room.roomNumber == null) return true; // fallback categories — no uniqueness rule
      const takenByOtherSlot = selectedRooms.some(
        (r, idx) => idx !== activeIndex && r?.roomNumber === room.roomNumber
      );
      return !takenByOtherSlot;
    });
  }, [allRoomOptions, selectedRooms, activeIndex]);

  const handlePickRoom = (room) => {
    const next = [...selectedRooms];
    next[activeIndex] = room;
    setSelectedRooms(next);

    const allFilled = next.every(Boolean);

    // Single-room bookings keep the original one-tap flow: picking a
    // room proceeds straight to Review & Pay, no extra "Continue" tap.
    if (totalRoomsNeeded === 1 && allFilled) {
      onReserve(next);
      return;
    }

    // Multi-room: auto-advance to the next unfilled slot so the guest
    // doesn't have to manually switch tabs after every pick.
    const nextUnfilledIndex = next.findIndex((r) => r === null);
    if (nextUnfilledIndex !== -1) {
      setActiveIndex(nextUnfilledIndex);
    }
  };

  const handleContinue = () => {
    if (selectedRooms.every(Boolean) && selectedRooms.length === totalRoomsNeeded) {
      onReserve(selectedRooms);
    }
  };

  const isTwoCol  = width >= TWO_COL_BREAKPOINT;
  const GAP       = spacing.md;
  const PADDING   = spacing.lg * 2;

  // On mobile: full width minus padding. On wide: half minus gap.
  const cardWidth = isTwoCol
    ? (width - PADDING - GAP) / 2
    : width - PADDING;

  if (!bookingDetails) {
    return (
      <View style={styles.container}>
        <Brandheader />
        <Text style={styles.message}>No search details found.</Text>
      </View>
    );
  }

  const { checkIn, checkOut, totals } = bookingDetails;

  // Pair up rooms only for 2-col layout
  const rows = [];
  if (isTwoCol) {
    for (let i = 0; i < availableForActiveSlot.length; i += 2) {
      rows.push(availableForActiveSlot.slice(i, i + 2));
    }
  }

  const allFilled = selectedRooms.every(Boolean);
  const filledCount = selectedRooms.filter(Boolean).length;
  const combinedPrice = selectedRooms.reduce((sum, r) => sum + (r?.price || 0), 0);

  return (
    <View style={styles.container}>
      <Brandheader />
      <StepIndicator currentStep={1} />

      <ScrollView contentContainerStyle={styles.content}>
        <StayBar checkIn={checkIn} checkOut={checkOut} totals={totals} onEdit={onEditSearch} />

        {/* Room slot tabs — one per room in this reservation */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.roomTabScroll}
          contentContainerStyle={styles.roomTabRow}
        >
          {selectedRooms.map((selected, index) => {
            const isActive = index === activeIndex;
            return (
              <TouchableOpacity
                key={index}
                onPress={() => setActiveIndex(index)}
                activeOpacity={0.8}
                style={[
                  styles.roomTab,
                  isActive ? styles.roomTabActive : styles.roomTabInactive,
                ]}
              >
                <Text style={[styles.roomTabLabel, isActive && styles.roomTabLabelActive]}>
                  ROOM {index + 1}{selected ? ' ✓' : ''}
                </Text>
                <Text
                  style={[styles.roomTabSubtext, isActive && styles.roomTabSubtextActive]}
                  numberOfLines={1}
                >
                  {selected ? selected.name : 'Select room category & rate'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionTitle}>Room</Text>

        {availableForActiveSlot.length === 0 && (
          <Text style={styles.message}>
            No vacant rooms available for this selection right now.
          </Text>
        )}

        {/* ── Mobile: single column ── */}
        {!isTwoCol && availableForActiveSlot.map((rate) => (
          <RateCard
            key={rate.id}
            rate={rate}
            onReserve={() => handlePickRoom(rate)}
            cardWidth={cardWidth}
          />
        ))}

        {/* ── Tablet/Web: two columns ── */}
        {isTwoCol && rows.map((pair, rowIndex) => (
          <View key={rowIndex} style={[styles.row, { gap: GAP }]}>
            {pair.map((rate) => (
              <RateCard
                key={rate.id}
                rate={rate}
                onReserve={() => handlePickRoom(rate)}
                cardWidth={cardWidth}
              />
            ))}
            {/* Empty spacer if odd number of rooms */}
            {pair.length === 1 && <View style={{ width: cardWidth }} />}
          </View>
        ))}

        {/* Multi-room progress + continue — hidden for the single-room
            case, which proceeds automatically on pick (see handlePickRoom). */}
        {totalRoomsNeeded > 1 && (
          <View style={styles.continueBar}>
            <View style={styles.continueInfo}>
              <Text style={styles.continueProgress}>
                {filledCount} of {totalRoomsNeeded} room{totalRoomsNeeded !== 1 ? 's' : ''} selected
              </Text>
              {combinedPrice > 0 && (
                <Text style={styles.continuePrice}>
                  Combined: {formatCurrency(combinedPrice)} / night
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.continueButton, !allFilled && styles.continueButtonDisabled]}
              onPress={handleContinue}
              disabled={!allFilled}
              activeOpacity={0.85}
            >
              <Text style={styles.continueButtonText}>Continue to Review & Pay</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footerBleed}>
          <Appfooter />
        </View>
      </ScrollView>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    message: {
      fontSize: 15,
      fontFamily: fonts.body,
      color: colors.textMuted,
      margin: spacing.lg,
    },
    footerBleed: {
      marginHorizontal: -spacing.lg,
      marginTop: spacing.xl,
      marginBottom: -spacing.xxl,
    },
    roomTabScroll: {
      marginBottom: spacing.lg,
      flexGrow: 0,
    },
    roomTabRow: {
      flexDirection: 'row',
      borderRadius: 8,
      overflow: 'hidden',
      gap: 1,
    },
    roomTab: {
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      minWidth: 160,
    },
    roomTabActive: {
      backgroundColor: colors.step,
    },
    roomTabInactive: {
      backgroundColor: colors.stepBg,
    },
    roomTabLabel: {
      color: colors.textMuted,
      fontFamily: fonts.headingSemiBold,
      fontSize: 12,
      letterSpacing: 0.4,
    },
    roomTabLabelActive: {
      color: colors.onPrimary,
    },
    roomTabSubtext: {
      color: colors.textMuted,
      fontFamily: fonts.body,
      fontSize: 11,
      marginTop: 2,
    },
    roomTabSubtextActive: {
      color: colors.onPrimary,
      opacity: 0.85,
    },
    sectionTitle: {
      fontSize: 14,
      fontFamily: fonts.headingBold,
      color: colors.step,
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
    },
    continueBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginTop: spacing.md,
      gap: spacing.md,
      flexWrap: 'wrap',
    },
    continueInfo: {
      flexShrink: 1,
    },
    continueProgress: {
      fontSize: 13,
      fontFamily: fonts.headingSemiBold,
      color: colors.text,
    },
    continuePrice: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.textMuted,
      marginTop: 2,
    },
    continueButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    continueButtonDisabled: {
      opacity: 0.4,
    },
    continueButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontFamily: fonts.headingSemiBold,
      letterSpacing: 0.3,
    },
  });
}