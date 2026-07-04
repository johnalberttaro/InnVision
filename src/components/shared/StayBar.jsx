import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatDate } from '../../utils/dateHelpers';

/**
 * Compact summary strip: CHECK-IN | CHECK-OUT | ROOMS : PAX, with an Edit link
 * that takes the guest back to the Search/Reservation screen.
 * Used by: screens/roomRates/RoomSelectionScreen.jsx, screens/reviewPay/ReviewPayScreen.jsx
 *
 * Props:
 *  - checkIn, checkOut: Date
 *  - totals: { totalRooms, totalAdults, totalChildren }
 *  - onEdit: () => void
 */
export default function StayBar({ checkIn, checkOut, totals, onEdit }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <StayCell icon="📅" label="Check-in" value={formatDate(checkIn)} />
        <Divider />
        <StayCell icon="📅" label="Check-out" value={formatDate(checkOut)} />
        <Divider />
        <StayCell
          icon="👤"
          label="Rooms : Guests"
          value={`${totals.totalRooms} Room${totals.totalRooms > 1 ? 's' : ''} · ${totals.totalAdults} Adult${totals.totalAdults !== 1 ? 's' : ''} + ${totals.totalChildren} Child${totals.totalChildren !== 1 ? 'ren' : ''}`}
          grow
        />
      </View>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} style={styles.editButton} activeOpacity={0.75}>
          <Text style={styles.editText}>✎ Edit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function StayCell({ icon, label, value, grow }) {
  return (
    <View style={[styles.cell, grow && styles.cellGrow]}>
      <View style={styles.cellLabelRow}>
        <Text style={styles.cellIcon}>{icon}</Text>
        <Text style={styles.cellLabel}>{label}</Text>
      </View>
      <Text style={styles.cellValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cell: {
    paddingHorizontal: spacing.xs,
  },
  cellGrow: {
    flex: 1,
  },
  cellLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cellIcon: {
    fontSize: 10,
    marginRight: 4,
  },
  cellLabel: {
    fontSize: 10,
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.4,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  cellValue: {
    fontSize: 13,
    fontFamily: fonts.headingSemiBold,
    color: colors.text,
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  editButton: {
    alignSelf: 'flex-end',
    marginTop: spacing.md,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  editText: {
    fontSize: 12,
    fontFamily: fonts.headingSemiBold,
    color: colors.primary,
  },
});