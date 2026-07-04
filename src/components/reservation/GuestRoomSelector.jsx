import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';

const MAX_GUESTS_PER_ROOM = 10; // mirrors the "Maximum of 2 guests per room" style hint, configurable

/**
 * Popup panel: one row of Adults/Children steppers per room, "+ Add room",
 * and a Done button. Matches the reference's "1 Room, 1 Adult, 0 Children"
 * dropdown panel.
 * Used by: screens/reservation/ReservationScreen.jsx
 *
 * Props:
 *  - rooms: [{ adults, children }]
 *  - onChangeAdults, onChangeChildren: (roomIndex, value) => void
 *  - onAddRoom: () => void
 *  - onRemoveRoom: (roomIndex) => void
 *  - onDone: () => void
 */
export default function GuestRoomSelector({
  rooms,
  onChangeAdults,
  onChangeChildren,
  onAddRoom,
  onRemoveRoom,
  onDone,
}) {
  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {rooms.map((room, index) => (
          <View key={index} style={styles.roomBlock}>
            <View style={styles.roomHeader}>
              <Text style={styles.roomLabel}>Room {index + 1}</Text>
              {rooms.length > 1 && (
                <TouchableOpacity onPress={() => onRemoveRoom(index)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.countersRow}>
              <View style={styles.counterColumn}>
                <Text style={styles.counterLabel}>Adult(s)</Text>
                <CenteredCounter
                  value={room.adults}
                  min={1}
                  onChange={(val) => onChangeAdults(index, val)}
                />
              </View>
              <View style={styles.counterColumn}>
                <Text style={styles.counterLabel}>Children below 12</Text>
                <CenteredCounter
                  value={room.children}
                  min={0}
                  onChange={(val) => onChangeChildren(index, val)}
                />
              </View>
            </View>
            {index < rooms.length - 1 && <View style={styles.divider} />}
          </View>
        ))}

        <TouchableOpacity onPress={onAddRoom} style={styles.addRoomRow}>
          <Text style={styles.addRoomText}>+ Add room</Text>
        </TouchableOpacity>

        <Text style={styles.hintText}>
          Maximum of {MAX_GUESTS_PER_ROOM} guests per room
        </Text>
      </ScrollView>

      <TouchableOpacity style={styles.doneButton} onPress={onDone}>
        <Text style={styles.doneText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

function CenteredCounter({ value, min, onChange }) {
  const canDecrease = value > min;
  return (
    <View style={styles.counterControls}>
      <TouchableOpacity
        style={[styles.counterButton, !canDecrease && styles.counterButtonDisabled]}
        onPress={() => canDecrease && onChange(value - 1)}
        disabled={!canDecrease}
        accessibilityLabel="Decrease"
      >
        <Text style={[styles.counterButtonText, !canDecrease && styles.counterButtonTextDisabled]}>−</Text>
      </TouchableOpacity>
      <Text style={styles.counterValue}>{value}</Text>
      <TouchableOpacity
        style={styles.counterButton}
        onPress={() => onChange(value + 1)}
        accessibilityLabel="Increase"
      >
        <Text style={styles.counterButtonText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  scroll: {
    maxHeight: 360,
  },
  roomBlock: {
    marginBottom: spacing.md,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  roomLabel: {
    fontSize: 14,
    fontFamily: fonts.headingSemiBold,
    color: colors.text,
  },
  removeText: {
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
    color: colors.danger,
  },
  countersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  counterColumn: {
    flex: 1,
    marginRight: spacing.md,
  },
  counterLabel: {
    fontSize: 11,
    fontFamily: fonts.body,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
  },
  counterButton: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterButtonDisabled: {
    opacity: 0.4,
  },
  counterButtonText: {
    fontSize: 16,
    color: colors.step,
    fontFamily: fonts.headingSemiBold,
  },
  counterButtonTextDisabled: {
    color: colors.disabled,
  },
  counterValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: fonts.headingSemiBold,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },
  addRoomRow: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  addRoomText: {
    color: colors.step,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  hintText: {
    fontSize: 10,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  doneButton: {
    backgroundColor: colors.step,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  doneText: {
    color: colors.white,
    fontFamily: fonts.headingSemiBold,
    fontSize: 14,
  },
});
