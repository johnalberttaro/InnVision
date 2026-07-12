// Roomcleaningstatusscreen.jsx
// "Room Cleaning Status" — live grid of all 8 rooms showing their current
// housekeeping status (independent of occupancy status), with a button to
// advance each room through the cleaning cycle: dirty -> in_progress ->
// clean -> inspected.

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import {
  subscribeToRooms,
  updateRoomHousekeepingStatus,
  housekeepingStatusMeta,
  NEXT_HOUSEKEEPING_STATUS,
  HOUSEKEEPING_STATUS,
  STATUS_META,
} from '../../utils/Roomsservice';

const NEXT_ACTION_LABEL = {
  [HOUSEKEEPING_STATUS.DIRTY]: 'Start Cleaning',
  [HOUSEKEEPING_STATUS.IN_PROGRESS]: 'Mark Clean',
  [HOUSEKEEPING_STATUS.CLEAN]: 'Mark Inspected',
};

export default function RoomCleaningStatusScreen() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingRoom, setUpdatingRoom] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeToRooms(
      (data) => {
        setRooms(data);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load rooms:', err);
        setError('Could not load room data.');
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const handleAdvanceStatus = async (room) => {
    const currentStatus = room.housekeepingStatus || HOUSEKEEPING_STATUS.CLEAN;
    const nextStatus = NEXT_HOUSEKEEPING_STATUS[currentStatus];
    if (!nextStatus) return;

    setUpdatingRoom(room.roomNumber);
    try {
      await updateRoomHousekeepingStatus(room.roomNumber, nextStatus);
    } catch (err) {
      console.error('Failed to update housekeeping status:', err);
    } finally {
      setUpdatingRoom(null);
    }
  };

  // Manual reset for a room that's already Inspected but gets dirtied
  // again outside the normal checkout flow (e.g. a long-stay guest's
  // room needs a mid-stay clean).
  const handleResetToDirty = async (room) => {
    setUpdatingRoom(room.roomNumber);
    try {
      await updateRoomHousekeepingStatus(room.roomNumber, HOUSEKEEPING_STATUS.DIRTY);
    } catch (err) {
      console.error('Failed to reset housekeeping status:', err);
    } finally {
      setUpdatingRoom(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Room Cleaning Status</Text>
      <Text style={styles.subtitle}>Live housekeeping status for all rooms</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.grid}>
        {rooms.map((room) => {
          const hkStatus = room.housekeepingStatus || HOUSEKEEPING_STATUS.CLEAN;
          const hkMeta = housekeepingStatusMeta(hkStatus);
          const occupancyMeta = STATUS_META[room.status] || STATUS_META.vacant;
          const nextStatus = NEXT_HOUSEKEEPING_STATUS[hkStatus];
          const isUpdating = updatingRoom === room.roomNumber;

          return (
            <View key={room.roomNumber} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.roomNumber}>Room {room.roomNumber}</Text>
                <View style={[styles.occupancyBadge, { backgroundColor: occupancyMeta.bg }]}>
                  <Text style={[styles.occupancyBadgeText, { color: occupancyMeta.color }]}>
                    {occupancyMeta.label}
                  </Text>
                </View>
              </View>

              <View style={[styles.statusBadge, { backgroundColor: hkMeta.bg }]}>
                <Text style={[styles.statusBadgeText, { color: hkMeta.color }]}>{hkMeta.label}</Text>
              </View>

              {nextStatus ? (
                <TouchableOpacity
                  style={[styles.actionButton, isUpdating && styles.actionButtonDisabled]}
                  onPress={() => handleAdvanceStatus(room)}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.actionButtonText}>{NEXT_ACTION_LABEL[hkStatus]}</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.resetButton, isUpdating && styles.actionButtonDisabled]}
                  onPress={() => handleResetToDirty(room)}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <Text style={styles.resetButtonText}>Needs Cleaning Again</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.headingBold, fontSize: 24, color: colors.primary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  errorText: { fontFamily: fonts.body, color: '#B3261E', marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: 220,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  roomNumber: { fontFamily: fonts.headingSemiBold, fontSize: 16, color: colors.text },
  occupancyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  occupancyBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  statusBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  actionButtonDisabled: { opacity: 0.6 },
  actionButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.white },
  resetButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  resetButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textMuted },
});