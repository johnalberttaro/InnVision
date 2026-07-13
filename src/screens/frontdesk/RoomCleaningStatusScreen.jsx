// Roomcleaningstatusscreen.jsx
// "Room Cleaning Status" — live grid of all rooms showing their current
// status, with cleaning-cycle action buttons for the rooms currently
// moving through housekeeping: Inspect -> (Needs Cleaning Again ->)
// Start Cleaning -> In Progress -> Vacant (Ready for Guest).
//
// Rooms in OCCUPIED, RESERVED, or MAINTENANCE aren't part of the
// cleaning cycle, so this screen shows their status but no action button
// for them — those are managed from Room Management instead.

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import {
  subscribeToRooms,
  updateRoomStatus,
  statusMeta,
  ROOM_STATUS,
  STATUS_META,
  CLEANING_WORKFLOW_STATUSES,
  NEXT_CLEANING_STATUS,
  CLEANING_ACTION_LABEL,
} from '../../utils/Roomsservice';

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

  const runUpdate = async (roomNumber, nextStatus) => {
    setUpdatingRoom(roomNumber);
    try {
      await updateRoomStatus(roomNumber, nextStatus);
    } catch (err) {
      console.error('Failed to update room status:', err);
    } finally {
      setUpdatingRoom(null);
    }
  };

  // Primary advance button — e.g. Inspect -> Start Cleaning,
  // Start Cleaning -> In Progress, In Progress -> Vacant.
  const handleAdvance = (room) => {
    const nextStatus = NEXT_CLEANING_STATUS[room.status];
    if (!nextStatus) return;
    runUpdate(room.roomNumber, nextStatus);
  };

  // Branch action, only shown while a room is at Inspect: fails
  // inspection -> Needs Cleaning Again (instead of going straight to
  // Start Cleaning).
  const handleNeedsCleaningAgain = (room) => {
    runUpdate(room.roomNumber, ROOM_STATUS.NEEDS_CLEANING_AGAIN);
  };

  // Manual reset for a room that's already Vacant but gets dirtied again
  // outside the normal checkout flow (e.g. a long-stay guest's room
  // needs a mid-stay clean).
  const handleResetFromVacant = (room) => {
    runUpdate(room.roomNumber, ROOM_STATUS.NEEDS_CLEANING_AGAIN);
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
          const meta = statusMeta(room.status);
          const isUpdating = updatingRoom === room.roomNumber;
          const inCleaningCycle = CLEANING_WORKFLOW_STATUSES.includes(room.status);
          const isInspect = room.status === ROOM_STATUS.INSPECT;
          const isVacant = room.status === ROOM_STATUS.VACANT;
          const primaryLabel = CLEANING_ACTION_LABEL[room.status];

          return (
            <View key={room.roomNumber} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.roomNumber}>Room {room.roomNumber}</Text>
              </View>

              <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>

              {isUpdating ? (
                <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: spacing.sm }} />
              ) : inCleaningCycle && primaryLabel ? (
                <View>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleAdvance(room)}
                  >
                    <Text style={styles.actionButtonText}>{primaryLabel}</Text>
                  </TouchableOpacity>

                  {isInspect && (
                    <TouchableOpacity
                      style={styles.resetButton}
                      onPress={() => handleNeedsCleaningAgain(room)}
                    >
                      <Text style={styles.resetButtonText}>Needs Cleaning Again</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : isVacant ? (
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => handleResetFromVacant(room)}
                >
                  <Text style={styles.resetButtonText}>Needs Cleaning Again</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.notInCycleNote}>
                  {room.status === ROOM_STATUS.OCCUPIED
                    ? 'Guest currently staying — not in the cleaning cycle yet.'
                    : 'Managed from Room Management.'}
                </Text>
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
  actionButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.white },
  resetButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  resetButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textMuted },
  notInCycleNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
});