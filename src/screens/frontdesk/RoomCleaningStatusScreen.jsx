// Roomcleaningstatusscreen.jsx
// "Room Cleaning Status" — live grid of all rooms showing their current
// status, with cleaning-cycle action buttons for the rooms currently
// moving through housekeeping: Inspect -> (Needs Cleaning Again ->)
// Start Cleaning -> In Progress -> Vacant (Ready for Guest).
//
// Rooms in OCCUPIED, RESERVED, or MAINTENANCE aren't part of the
// cleaning cycle, so this screen shows their status but no action button
// for them — those are managed from Room Management instead.
//
// ENHANCED: this screen was the plainest one left in the Housekeeping
// section once HousekeepingSchedule.jsx and MaintenanceRequest.jsx got
// built with a richer visual system — brought up to the same standard:
//  - KPI summary row (Needs Attention / Ready for Guests / Other) using
//    the same KpiCard component as the dashboards, so staff get an
//    at-a-glance count before scanning individual room cards.
//  - Quick filter chips (All / Needs Attention / Ready / Other) to
//    narrow the grid instead of scanning every room every time.
//  - Room number is now a colored badge with an icon (same convention
//    as ReservationsScreen / HousekeepingSchedule / MaintenanceRequest)
//    instead of plain text.
//  - Each card gets a colored left-border accent matching its status,
//    and the status badge gained an icon alongside color+text — same
//    triple-redundant signal pattern used system-wide now.
//  - Rooms needing attention sort first under the "All" filter, so the
//    most actionable rooms aren't buried among ones that don't need
//    anything right now.

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import KpiCard from '../../components/dashboard/KpiCard';
import {
  subscribeToRooms,
  updateRoomStatus,
  statusMeta,
  ROOM_STATUS,
  CLEANING_WORKFLOW_STATUSES,
  NEXT_CLEANING_STATUS,
  CLEANING_ACTION_LABEL,
} from '../../utils/Roomsservice';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs Attention' },
  { key: 'ready', label: 'Ready' },
  { key: 'other', label: 'Other' },
];

// Small status -> icon map, same pattern used on ReservationsScreen's
// status badges — an icon alongside color+text so status reads through
// more than one signal.
const STATUS_ICON = {
  [ROOM_STATUS.OCCUPIED]:             'person-outline',
  [ROOM_STATUS.INSPECT]:              'search-outline',
  [ROOM_STATUS.NEEDS_CLEANING_AGAIN]: 'refresh-outline',
  [ROOM_STATUS.START_CLEANING]:       'brush-outline',
  [ROOM_STATUS.IN_PROGRESS]:          'time-outline',
  [ROOM_STATUS.VACANT]:               'checkmark-circle-outline',
  [ROOM_STATUS.RESERVED]:             'calendar-outline',
  [ROOM_STATUS.MAINTENANCE]:          'construct-outline',
};

export default function RoomCleaningStatusScreen() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingRoom, setUpdatingRoom] = useState(null);
  const [filter, setFilter] = useState('all');

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

  // ── KPI counts + filter buckets ──────────────────────────────────────
  const attentionRooms = useMemo(
    () => rooms.filter((r) => CLEANING_WORKFLOW_STATUSES.includes(r.status) && r.status !== ROOM_STATUS.VACANT),
    [rooms]
  );
  const readyRooms = useMemo(() => rooms.filter((r) => r.status === ROOM_STATUS.VACANT), [rooms]);
  const otherRooms = useMemo(
    () => rooms.filter((r) => !CLEANING_WORKFLOW_STATUSES.includes(r.status)),
    [rooms]
  );

  const visibleRooms = useMemo(() => {
    let list;
    if (filter === 'attention') list = attentionRooms;
    else if (filter === 'ready') list = readyRooms;
    else if (filter === 'other') list = otherRooms;
    else {
      // "All" — attention-needing rooms first, so the most actionable
      // ones aren't buried among rooms that don't need anything right now.
      list = [...attentionRooms, ...readyRooms, ...otherRooms];
    }
    return list;
  }, [filter, attentionRooms, readyRooms, otherRooms]);

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

      <View style={styles.kpiRow}>
        <KpiCard
          icon="alert-circle-outline"
          label="Needs Attention"
          value={String(attentionRooms.length)}
          accent={attentionRooms.length > 0 ? '#C99400' : '#1E7B34'}
          note="In the cleaning cycle"
        />
        <KpiCard
          icon="checkmark-circle-outline"
          label="Ready for Guests"
          value={String(readyRooms.length)}
          accent="#1E7B34"
          note="Vacant, no action needed"
        />
        <KpiCard
          icon="ellipsis-horizontal-circle-outline"
          label="Other"
          value={String(otherRooms.length)}
          accent={colors.textMuted}
          note="Occupied, reserved, or out of service"
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const count =
            f.key === 'attention' ? attentionRooms.length
              : f.key === 'ready' ? readyRooms.length
              : f.key === 'other' ? otherRooms.length
              : rooms.length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.grid}>
        {visibleRooms.length === 0 ? (
          <Text style={styles.emptyText}>No rooms match this filter.</Text>
        ) : (
          visibleRooms.map((room) => {
            const meta = statusMeta(room.status);
            const isUpdating = updatingRoom === room.roomNumber;
            const inCleaningCycle = CLEANING_WORKFLOW_STATUSES.includes(room.status);
            const isInspect = room.status === ROOM_STATUS.INSPECT;
            const isVacant = room.status === ROOM_STATUS.VACANT;
            const primaryLabel = CLEANING_ACTION_LABEL[room.status];

            return (
              <View key={room.roomNumber} style={[styles.card, { borderLeftColor: meta.color }]}>
                <View style={styles.roomBadge}>
                  <Ionicons name="key-outline" size={12} color={colors.white} />
                  <Text style={styles.roomBadgeText}>Room {room.roomNumber}</Text>
                </View>

                <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                  <Ionicons name={STATUS_ICON[room.status] || 'help-circle-outline'} size={11} color={meta.color} />
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
          })
        )}
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

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  filterChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  filterChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: 220,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4, // color set inline per-card via statusMeta().color
    padding: spacing.md,
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  roomBadgeText: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.white },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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