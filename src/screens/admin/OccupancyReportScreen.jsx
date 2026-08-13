import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { subscribeToRooms, subscribeToRoomTypes, joinRoomsWithTypes, ROOM_STATUS, statusMeta } from '../../utils/Roomsservice';

/**
 * OccupancyReportScreen — SRS Module 6, Transaction 6.1: live room
 * inventory and housekeeping status.
 *
 * FIXED: the "Rooms by Status" list was showing each room's raw
 * roomTypeId (a UUID) instead of its actual type name (e.g. "King",
 * "Twin") — subscribeToRooms() only returns the room_type_id foreign
 * key, it was never joined against room_types to resolve a name, so the
 * `room.roomTypeName || room.roomTypeId || ...` fallback always landed
 * on the raw UUID. Now also subscribes to room types and joins them via
 * joinRoomsWithTypes() (an existing helper built for exactly this, used
 * elsewhere in the app) so this list reads the same way RevenueReport's
 * "Recent Bookings" does — a real room type name, not an internal id.
 */

export default function OccupancyReportScreen() {
  const [rawRooms, setRawRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const loading = loadingRooms || loadingTypes;

  useEffect(() => {
    const unsubscribeRooms = subscribeToRooms(
      (data) => {
        setRawRooms(data);
        setLoadingRooms(false);
      },
      (error) => {
        console.error('Failed to load room inventory:', error);
        setLoadingRooms(false);
      }
    );
    const unsubscribeTypes = subscribeToRoomTypes(
      (data) => {
        setRoomTypes(data);
        setLoadingTypes(false);
      },
      (error) => {
        console.error('Failed to load room types:', error);
        setLoadingTypes(false);
      }
    );
    return () => {
      unsubscribeRooms();
      unsubscribeTypes();
    };
  }, []);

  const rooms = useMemo(() => joinRoomsWithTypes(rawRooms, roomTypes), [rawRooms, roomTypes]);

  const totals = rooms.reduce((acc, room) => {
    const status = room.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const totalRooms = rooms.length;
  const occupiedRooms = totals[ROOM_STATUS.OCCUPIED] || 0;
  const vacantRooms = totals[ROOM_STATUS.VACANT] || 0;
  const reservedRooms = totals[ROOM_STATUS.RESERVED] || 0;
  const maintenanceRooms = totals[ROOM_STATUS.MAINTENANCE] || 0;
  const inspectRooms = totals[ROOM_STATUS.INSPECT] || 0;
  const inProgressRooms = totals[ROOM_STATUS.IN_PROGRESS] || 0;
  const needsCleaningAgainRooms = totals[ROOM_STATUS.NEEDS_CLEANING_AGAIN] || 0;
  const startCleaningRooms = totals[ROOM_STATUS.START_CLEANING] || 0;

  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : null;

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Occupancy Report</Text>
      <Text style={styles.pageSubtitle}>
        Live room inventory and housekeeping status across the hotel.
      </Text>

      <View style={styles.kpiGrid}>
        <ReportCard label="Total Rooms" value={String(totalRooms)} />
        <ReportCard label="Occupied" value={String(occupiedRooms)} accent={colors.primary} />
        <ReportCard label="Vacant" value={String(vacantRooms)} accent={colors.success} />
        <ReportCard label="Reserved" value={String(reservedRooms)} accent={colors.accent} />
        <ReportCard label="Maintenance" value={String(maintenanceRooms)} accent={colors.danger} />
        <ReportCard label="Occupancy Rate" value={occupancyRate === null ? '—' : `${occupancyRate}%`} accent={colors.primary} />
      </View>

      <Text style={styles.sectionTitle}>Housekeeping / Room Status Breakdown</Text>
      <View style={styles.statusGrid}>
        {[
          ROOM_STATUS.OCCUPIED,
          ROOM_STATUS.VACANT,
          ROOM_STATUS.RESERVED,
          ROOM_STATUS.MAINTENANCE,
          ROOM_STATUS.INSPECT,
          ROOM_STATUS.NEEDS_CLEANING_AGAIN,
          ROOM_STATUS.START_CLEANING,
          ROOM_STATUS.IN_PROGRESS,
        ].map((status) => {
          const meta = statusMeta(status);
          return (
            <View key={status} style={styles.statusCard}>
              <Text style={styles.statusLabel}>{meta.label}</Text>
              <Text style={[styles.statusValue, { color: meta.color }]}>{totals[status] || 0}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Rooms by Status</Text>
      <View style={styles.listCard}>
        {rooms.length === 0 ? (
          <Text style={styles.emptyText}>No rooms found.</Text>
        ) : (
          rooms.map((room) => (
            <View key={room.id || room.roomNumber} style={styles.roomRow}>
              <View>
                <Text style={styles.roomName}>{room.roomNumber || `Room ${room.id}`}</Text>
                <Text style={styles.roomMeta}>{room.roomTypeName}</Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusMeta(room.status).bg }]}> 
                <Text style={[styles.statusPillText, { color: statusMeta(room.status).color }]}>{statusMeta(room.status).label}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function ReportCard({ label, value, accent }) {
  return (
    <View style={[styles.kpiCard, accent ? { borderColor: accent } : null]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  kpiCard: { width: 180, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  kpiLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase' },
  kpiValue: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.text },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  statusCard: { width: 160, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  statusLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginBottom: spacing.xs },
  statusValue: { fontSize: 20, fontFamily: fonts.headingSemiBold },
  listCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },
  roomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  roomName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  roomMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs },
  statusPill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
});