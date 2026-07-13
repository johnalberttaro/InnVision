import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import {
  subscribeToRoomTypes,
  subscribeToRooms,
  joinRoomsWithTypes,
  updateRoomStatus,
  seedInitialRooms,
  formatCurrency,
  ROOM_STATUS,
  STATUS_META,
  statusMeta,
} from '../../utils/Roomsservice';
import { colors, spacing, radius, fonts } from '../../utils/theme';

const SECTION_TITLES = {
  types: 'Room Types',
  list: 'Room List',
  availability: 'Room Availability',
  status: 'Room Status',
  maintenance: 'Room Maintenance',
};

const notifyUser = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

const confirmAction = (title, message, confirmLabel, onConfirm) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export default function RoomManagementScreen({ onLogout, section = 'types' }) {
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [updatingRoomNumber, setUpdatingRoomNumber] = useState(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const unsubTypes = subscribeToRoomTypes(
      (data) => { setRoomTypes(data); setLoadingTypes(false); },
      () => setLoadingTypes(false)
    );
    const unsubRooms = subscribeToRooms(
      (data) => { setRooms(data); setLoadingRooms(false); },
      () => setLoadingRooms(false)
    );
    return () => {
      unsubTypes();
      unsubRooms();
    };
  }, []);

  const roomsWithDetails = useMemo(
    () => joinRoomsWithTypes(rooms, roomTypes),
    [rooms, roomTypes]
  );

  const loading = loadingTypes || loadingRooms;
  const isEmpty = !loading && rooms.length === 0;

  const handleLogout = () => onLogout();

  const handleStatusChange = async (room, status, extra = {}) => {
    if (room.status === status && !Object.keys(extra).length) return;
    setUpdatingRoomNumber(room.roomNumber);
    try {
      await updateRoomStatus(room.roomNumber, status, extra);
    } catch (err) {
      console.error('Failed to update room status:', err);
      notifyUser('Error', 'Could not update this room. Please check your connection and try again.');
    } finally {
      setUpdatingRoomNumber(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedInitialRooms();
      notifyUser('Done', 'Seeded 3 room types and 8 rooms into Firestore.');
    } catch (err) {
      console.error('Failed to seed rooms:', err);
      notifyUser('Error', 'Could not seed room data. Check your Firestore connection/rules and try again.');
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedWithConfirm = () => {
    confirmAction(
      'Reseed room data?',
      'This overwrites roomTypes/RM101, roomTypes/RM102, roomTypes/RM103, and rooms/101–108 with whatever is currently defined in Roomsservice.js. Any manual edits made directly in the Firebase console will be lost.',
      'Reseed',
      handleSeed
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{SECTION_TITLES[section] || 'Room Management'}</Text>
          <Text style={styles.subtitle}>
            {roomTypes.length} room type{roomTypes.length !== 1 ? 's' : ''} · {rooms.length} room{rooms.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={handleSeedWithConfirm}
            style={styles.reseedButton}
            disabled={seeding}
          >
            {seeding
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={styles.reseedText}>↻ Reseed Data (Dev)</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : isEmpty ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyStateTitle}>No rooms seeded yet</Text>
          <Text style={styles.emptyStateText}>
            The "rooms" collection doesn't exist in Firestore yet.{'\n'}
            Tap below to create this property's fixed inventory:{'\n'}
            3 room types (Twin, King, Single Room) and 8 rooms (101–108).{'\n'}
            {roomTypes.length > 0 ? 'This will overwrite any existing roomTypes documents with the correct seed data.' : ''}
          </Text>
          <TouchableOpacity
            style={[styles.seedBtn, seeding && styles.seedBtnDisabled]}
            onPress={handleSeed}
            disabled={seeding}
            activeOpacity={0.85}
          >
            {seeding
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Text style={styles.seedBtnText}>Seed Sample Rooms (one-time)</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {section === 'types' && <RoomTypesSection roomTypes={roomTypes} />}
          {section === 'list' && <RoomListSection rooms={roomsWithDetails} />}
          {section === 'availability' && <AvailabilitySection rooms={roomsWithDetails} />}
          {section === 'status' && (
            <StatusSection
              rooms={roomsWithDetails}
              updatingRoomNumber={updatingRoomNumber}
              onStatusChange={handleStatusChange}
            />
          )}
          {section === 'maintenance' && (
            <MaintenanceSection
              rooms={roomsWithDetails}
              updatingRoomNumber={updatingRoomNumber}
              onStatusChange={handleStatusChange}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function RoomTypesSection({ roomTypes }) {
  return (
    <View>
      <SectionIntro description="The property's fixed room categories, live from Firestore (roomTypes collection)." />
      {roomTypes.map((rt) => {
        const thumb = rt.images && rt.images.length > 0 ? rt.images[0] : null;
        return (
          <View key={rt.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              {thumb ? (
                <Image source={{ uri: thumb.uri }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Text style={styles.thumbFallbackIcon}>🛏️</Text>
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{rt.name}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {rt.bed} · {rt.occupancy} · {rt.size}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>{formatCurrency(rt.price)}</Text>
                  <Text style={styles.perNight}> / night </Text>
                  {rt.originalPrice ? (
                    <Text style={styles.strikePrice}>{formatCurrency(rt.originalPrice)}</Text>
                  ) : null}
                </View>
                <Text style={styles.idTag}>ID: {rt.id} · {rt.floor}</Text>
              </View>
            </View>
            {rt.description ? <Text style={styles.description}>{rt.description}</Text> : null}
            {rt.inclusions && rt.inclusions.length > 0 && (
              <View style={styles.inclusionsWrap}>
                {rt.inclusions.map((inc, i) => (
                  <View key={i} style={styles.inclusionChip}>
                    <Text style={styles.inclusionChipText}>{inc}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function RoomListSection({ rooms }) {
  return (
    <View>
      <SectionIntro description="Every physical room on the property, live from Firestore (rooms collection, joined with roomTypes)." />
      {rooms.map((room) => (
        <RoomRow key={room.roomNumber} room={room} showStatus />
      ))}
    </View>
  );
}

function AvailabilitySection({ rooms }) {
  const available = rooms.filter((r) => r.available);
  const unavailable = rooms.filter((r) => !r.available);

  return (
    <View>
      <SectionIntro description="Which rooms are open to book right now versus already occupied, reserved, or out of service. A room counts as available only while its status is Vacant." />

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderColor: STATUS_META[ROOM_STATUS.VACANT].color }]}>
          <Text style={[styles.summaryNumber, { color: STATUS_META[ROOM_STATUS.VACANT].color }]}>{available.length}</Text>
          <Text style={styles.summaryLabel}>Available</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: colors.textMuted }]}>
          <Text style={[styles.summaryNumber, { color: colors.text }]}>{unavailable.length}</Text>
          <Text style={styles.summaryLabel}>Unavailable</Text>
        </View>
      </View>

      <Text style={styles.groupHeading}>Available</Text>
      {available.length === 0 ? (
        <Text style={styles.emptyText}>No vacant rooms right now.</Text>
      ) : (
        available.map((room) => <RoomRow key={room.roomNumber} room={room} showStatus />)
      )}

      <Text style={[styles.groupHeading, { marginTop: spacing.lg }]}>Occupied / Reserved / Out of Service</Text>
      {unavailable.length === 0 ? (
        <Text style={styles.emptyText}>Every room is currently vacant.</Text>
      ) : (
        unavailable.map((room) => <RoomRow key={room.roomNumber} room={room} showStatus />)
      )}
    </View>
  );
}

function StatusSection({ rooms, updatingRoomNumber, onStatusChange }) {
  const grouped = useMemo(() => {
    const byStatus = {};
    Object.keys(STATUS_META).forEach((key) => { byStatus[key] = []; });
    // Rooms whose status doesn't match any known STATUS_META key (missing
    // field, stale data, a typo entered directly in Firestore) go here
    // instead of silently vanishing from this screen — previously a room
    // like this wouldn't appear under ANY group below, since only
    // Object.keys(STATUS_META) gets rendered, leaving no way to fix it
    // from here at all.
    const unrecognized = [];
    rooms.forEach((room) => {
      if (byStatus[room.status]) {
        byStatus[room.status].push(room);
      } else {
        unrecognized.push(room);
      }
    });
    return { byStatus, unrecognized };
  }, [rooms]);

  return (
    <View>
      <SectionIntro description="Current status of every room. Tap a status chip on any room to update it — the change is saved to Firestore immediately and reflected everywhere else in the system." />
      {Object.keys(STATUS_META).map((statusKey) => {
        const meta = STATUS_META[statusKey];
        const roomsInGroup = grouped.byStatus[statusKey] || [];
        return (
          <View key={statusKey} style={{ marginBottom: spacing.lg }}>
            <View style={styles.statusGroupHeader}>
              <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
              <Text style={styles.groupHeading}>{meta.label} ({roomsInGroup.length})</Text>
            </View>
            {roomsInGroup.length === 0 ? (
              <Text style={styles.emptyText}>None.</Text>
            ) : (
              roomsInGroup.map((room) => (
                <RoomRow
                  key={room.roomNumber}
                  room={room}
                  editable
                  isUpdating={updatingRoomNumber === room.roomNumber}
                  onStatusChange={(status) => onStatusChange(room, status)}
                />
              ))
            )}
          </View>
        );
      })}

      {grouped.unrecognized.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <View style={styles.statusGroupHeader}>
            <View style={[styles.statusDot, { backgroundColor: '#6b7280' }]} />
            <Text style={styles.groupHeading}>Unrecognized Status ({grouped.unrecognized.length})</Text>
          </View>
          <Text style={styles.emptyText}>
            These rooms have missing or invalid status data. Tap a status chip below to set them to a valid state.
          </Text>
          {grouped.unrecognized.map((room) => (
            <RoomRow
              key={room.roomNumber}
              room={room}
              editable
              isUpdating={updatingRoomNumber === room.roomNumber}
              onStatusChange={(status) => onStatusChange(room, status)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function MaintenanceSection({ rooms, updatingRoomNumber, onStatusChange }) {
  const maintenanceRooms = rooms.filter((r) => r.status === ROOM_STATUS.MAINTENANCE);
  const otherRooms = rooms.filter((r) => r.status !== ROOM_STATUS.MAINTENANCE);

  return (
    <View>
      <SectionIntro description="Rooms currently marked out of service. Clear a room once repairs are done, or flag another room below." />

      {maintenanceRooms.length === 0 ? (
        <Text style={styles.emptyText}>No rooms are currently under maintenance.</Text>
      ) : (
        maintenanceRooms.map((room) => {
          const isUpdating = updatingRoomNumber === room.roomNumber;
          return (
            <View key={room.roomNumber} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.roomNumberBadge}>
                  <Text style={styles.roomNumberText}>{room.roomNumber}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{room.roomTypeName}</Text>
                  <Text style={styles.cardMeta}>{room.floor}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: STATUS_META[ROOM_STATUS.MAINTENANCE].bg }]}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_META[ROOM_STATUS.MAINTENANCE].color }]} />
                  <Text style={[styles.statusPillText, { color: STATUS_META[ROOM_STATUS.MAINTENANCE].color }]}>
                    {STATUS_META[ROOM_STATUS.MAINTENANCE].label}
                  </Text>
                </View>
              </View>
              {room.maintenanceNote ? (
                <Text style={styles.maintenanceNote}>{room.maintenanceNote}</Text>
              ) : (
                <Text style={styles.maintenanceNoteMuted}>No maintenance note provided.</Text>
              )}
              <TouchableOpacity
                style={[styles.clearBtn, isUpdating && styles.clearBtnDisabled]}
                onPress={() => onStatusChange(room, ROOM_STATUS.VACANT, { maintenanceNote: '' })}
                disabled={isUpdating}
                activeOpacity={0.85}
              >
                {isUpdating
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <Text style={styles.clearBtnText}>Mark as Repaired (set Vacant)</Text>
                }
              </TouchableOpacity>
            </View>
          );
        })
      )}

      <Text style={[styles.groupHeading, { marginTop: spacing.lg }]}>Other Rooms</Text>
      <Text style={styles.emptyText}>Tap "Out of Service" on any room below to flag it for maintenance.</Text>
      {otherRooms.map((room) => (
        <RoomRow
          key={room.roomNumber}
          room={room}
          editable
          onlyMaintenanceToggle
          isUpdating={updatingRoomNumber === room.roomNumber}
          onStatusChange={(status) => onStatusChange(room, status)}
        />
      ))}
    </View>
  );
}

function SectionIntro({ description }) {
  return (
    <View style={styles.sectionIntro}>
      <Text style={styles.sectionIntroDescription}>{description}</Text>
    </View>
  );
}

function RoomRow({ room, showStatus, editable, onlyMaintenanceToggle, isUpdating, onStatusChange }) {
  const meta = statusMeta(room.status);

  const chipsToShow = onlyMaintenanceToggle
    ? [ROOM_STATUS.MAINTENANCE]
    : Object.keys(STATUS_META);

  return (
    <View style={styles.rowCard}>
      <View style={styles.roomNumberBadgeSmall}>
        <Text style={styles.roomNumberTextSmall}>{room.roomNumber}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{room.roomTypeName}</Text>
        <Text style={styles.rowMeta}>{room.floor}</Text>
      </View>

      {showStatus && !editable && (
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      )}

      {editable && (
        <View style={styles.chipRow}>
          {isUpdating ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            chipsToShow.map((key) => {
              const chipMeta = STATUS_META[key];
              const active = room.status === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => onStatusChange(key)}
                  style={[
                    styles.statusChip,
                    { borderColor: chipMeta.color },
                    active && { backgroundColor: chipMeta.bg },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.statusChipText, { color: chipMeta.color }]}>{chipMeta.label}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  logoutButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryTint,
  },
  logoutText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reseedButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reseedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyStateTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  emptyStateText: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
    maxWidth: 420,
  },
  seedBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedBtnDisabled: { opacity: 0.7 },
  seedBtnText: { color: colors.white, fontSize: 13, fontFamily: fonts.headingSemiBold, letterSpacing: 0.3 },

  content: { flex: 1 },
  contentInner: { padding: spacing.lg, paddingBottom: spacing.xxl },

  sectionIntro: { marginBottom: spacing.lg },
  sectionIntroDescription: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTopRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbFallbackIcon: { fontSize: 28 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text, marginBottom: 2 },
  cardMeta: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  price: { fontSize: 14, fontFamily: fonts.headingExtraBold, color: colors.accent },
  perNight: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted },
  strikePrice: { fontSize: 10, fontFamily: fonts.body, color: colors.priceStrike, textDecorationLine: 'line-through' },
  idTag: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },
  description: { fontSize: 12, fontFamily: fonts.body, color: colors.text, marginTop: spacing.md, lineHeight: 18 },

  inclusionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  inclusionChip: {
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  inclusionChipText: { fontSize: 10, fontFamily: fonts.body, color: colors.text },

  roomNumberBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomNumberText: { fontSize: 15, fontFamily: fonts.headingExtraBold, color: colors.primary },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontFamily: fonts.bodySemiBold },

  maintenanceNote: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.text,
    marginTop: spacing.md,
    backgroundColor: '#fef3c7',
    padding: spacing.sm,
    borderRadius: radius.sm,
    lineHeight: 18,
  },
  maintenanceNoteMuted: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  clearBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnDisabled: { opacity: 0.7 },
  clearBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },

  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  summaryNumber: { fontSize: 24, fontFamily: fonts.headingExtraBold },
  summaryLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginTop: 2 },

  groupHeading: {
    fontSize: 12,
    fontFamily: fonts.headingSemiBold,
    color: colors.text,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  roomNumberBadgeSmall: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomNumberTextSmall: { fontSize: 13, fontFamily: fonts.headingExtraBold, color: colors.primary },
  rowInfo: { flex: 1, minWidth: 120 },
  rowTitle: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.text },
  rowMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  statusChipText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
});