import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Brandheader from '../../components/shared/Brandheader';
import Appfooter from '../../components/shared/Appfooter';
import StepIndicator from '../../components/shared/StepIndicator';
import StayBar from '../../components/shared/StayBar';
import RateCard from '../../components/roomRates/RateCard';
import { ROOM_RATES } from '../../utils/roomRates';
import { colors, spacing, fonts } from '../../utils/theme';

// Use 2 columns only on screens wider than this (tablets/web)
const TWO_COL_BREAKPOINT = 600;

/**
 * "Room & Rates" screen — shown after a valid search.
 *  - Mobile  (< 600px) → 1 card per row, full width
 *  - Tablet / Web (≥ 600px) → 2 cards per row
 *
 * Props:
 *  - bookingDetails: object produced by ReservationScreen's onSearch
 *  - onEditSearch: () => void
 *  - onReserve: (rate) => void
 */
export default function RoomSelectionScreen({ bookingDetails, onEditSearch, onReserve }) {
  const { width } = useWindowDimensions();

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
    for (let i = 0; i < ROOM_RATES.length; i += 2) {
      rows.push(ROOM_RATES.slice(i, i + 2));
    }
  }

  return (
    <View style={styles.container}>
      <Brandheader />
      <StepIndicator currentStep={1} />

      <ScrollView contentContainerStyle={styles.content}>
        <StayBar checkIn={checkIn} checkOut={checkOut} totals={totals} onEdit={onEditSearch} />

        {/* Room tab row */}
        <View style={styles.roomTabRow}>
          <View style={styles.roomTabActive}>
            <Text style={styles.roomTabActiveText}>ROOM 1</Text>
          </View>
          <View style={styles.roomTabRest}>
            <Text style={styles.roomTabRestText}>Select room category &amp; rate</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Room</Text>

        {/* ── Mobile: single column ── */}
        {!isTwoCol && ROOM_RATES.map((rate) => (
          <RateCard
            key={rate.id}
            rate={rate}
            onReserve={() => onReserve(rate)}
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
                onReserve={() => onReserve(rate)}
                cardWidth={cardWidth}
              />
            ))}
            {/* Empty spacer if odd number of rooms */}
            {pair.length === 1 && <View style={{ width: cardWidth }} />}
          </View>
        ))}

        <View style={styles.footerBleed}>
          <Appfooter />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  roomTabRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    borderRadius: 8,
    overflow: 'hidden',
  },
  roomTabActive: {
    backgroundColor: colors.step,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  roomTabActiveText: {
    color: colors.white,
    fontFamily: fonts.headingSemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  roomTabRest: {
    flex: 1,
    backgroundColor: colors.stepBg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  roomTabRestText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
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
});