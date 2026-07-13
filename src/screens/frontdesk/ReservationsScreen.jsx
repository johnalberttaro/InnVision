import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  collection,
  doc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';
import { createBillingRecord } from '../../utils/BillingService';
import { updateRoomStatus, ROOM_STATUS } from '../../utils/Roomsservice';

function confirmDialog(title, message, confirmLabel, onConfirmPressed) {
  if (Platform.OS === 'web') {
    const ok = window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirmPressed();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: confirmLabel === 'Decline' ? 'destructive' : 'default', onPress: onConfirmPressed },
  ]);
}

function notifyDialog(title, message) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function ReservationsScreen({ onLogout, filterKey = 'reservations:all' }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const bookingsQuery = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load bookings:', error);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const handleLogout = () => onLogout();

  const formatDateRange = (checkIn, checkOut) => {
    try {
      return `${new Date(checkIn).toLocaleDateString()} – ${new Date(checkOut).toLocaleDateString()}`;
    } catch {
      return `${checkIn} – ${checkOut}`;
    }
  };

  const getReferenceNumber = (id) => `RES-${id.slice(0, 8).toUpperCase()}`;

  const getGuestName = (item) => {
    if (!item.guestDetails) return item.guestName || '— (pending) —';
    const { firstName, lastName } = item.guestDetails;
    return `${firstName || ''} ${lastName || ''}`.trim() || '—';
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'upcoming':     return { bg: colors.primaryTint, text: colors.primary };
      case 'pending':      return { bg: '#FFF4D6', text: '#9A7B00' };
      case 'checked-in':   return { bg: '#DFF5E1', text: '#1E7B34' };
      case 'checked-out':  return { bg: colors.cardAlt, text: colors.textMuted };
      case 'declined':     return { bg: '#FCE1E1', text: '#B3261E' };
      default:             return { bg: colors.cardAlt, text: colors.textMuted };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'checked-in':  return 'CHECKED IN';
      case 'checked-out': return 'CHECKED OUT';
      case 'declined':    return 'DECLINED';
      default: return (status || 'unknown').toUpperCase();
    }
  };

  const showToast = (message) => {
    setToast({ message });
    setTimeout(() => setToast(null), 2800);
  };

  // Derives the room number list for the folio / room-status sync.
  // Prefers item.selectedRooms (written by the multi-room booking flow
  // in ReviewPayScreen) and falls back to roomType if selectedRooms
  // isn't present or has an unexpected shape — better to show something
  // on the folio than crash check-in.
  const getRoomNumbersForFolio = (item) => {
    if (Array.isArray(item.selectedRooms) && item.selectedRooms.length > 0) {
      return item.selectedRooms.map(
        (r) => r.roomNumber || r.number || r.room || String(r)
      );
    }
    return [item.roomType || 'Unassigned'];
  };

  // Creates the guest folio at the moment of check-in. Runs as a
  // runStatusUpdate sideEffect — see note there on failure handling.
  const createFolioForCheckIn = async (item) => {
    await createBillingRecord({
      reservationRef: item.id,
      guestUid: item.uid || null,
      guestName: getGuestName(item),
      roomNumbers: getRoomNumbersForFolio(item),
      checkInDate: item.checkIn,
      checkOutDate: item.checkOut,
      roomCharges: item.totalAmount || 0,
      additionalCharges: 0,
      taxServiceCharges: 0,
    });
  };

  // Flips every physical room tied to this reservation to OCCUPIED the
  // moment a guest is checked in. Skips 'Unassigned' — that placeholder
  // means the booking never had a real room number attached, so there's
  // no rooms/{roomNumber} doc to update.
  const markRoomsOccupied = async (item) => {
    const roomNumbers = getRoomNumbersForFolio(item).filter((rn) => rn !== 'Unassigned');
    await Promise.all(roomNumbers.map((rn) => updateRoomStatus(rn, ROOM_STATUS.OCCUPIED)));
  };

  // Flips every physical room tied to this reservation to INSPECT the
  // moment a guest is checked out — kicks off the housekeeping cycle in
  // Room Cleaning Status, and immediately removes the room from the
  // available pool in Reservation Management / Room Management until it
  // comes all the way back through to Vacant.
  const markRoomsNeedInspection = async (item) => {
    const roomNumbers = getRoomNumbersForFolio(item).filter((rn) => rn !== 'Unassigned');
    await Promise.all(roomNumbers.map((rn) => updateRoomStatus(rn, ROOM_STATUS.INSPECT)));
  };

  const runStatusUpdate = async ({ item, newStatus, extraFields = {}, notifTitle, notifMessage, toastMessage, sideEffect }) => {
    setActingId(item.id);
    try {
      await updateDoc(doc(db, 'reservations', item.id), {
        status: newStatus,
        ...extraFields,
      });

      // Runs after the status update succeeds but is isolated in its own
      // try/catch: a folio-creation or room-status failure shouldn't
      // undo a check-in/check-out that already went through, and
      // shouldn't block the guest notification either — it just
      // surfaces a separate warning so staff know to fix it manually if
      // this ever fails.
      if (sideEffect) {
        try {
          await sideEffect();
        } catch (sideEffectError) {
          console.error('Post-status-update step failed:', sideEffectError);
          notifyDialog(
            'Status updated, but one step failed',
            'The reservation status changed, but a follow-up step (billing folio or room status) could not be completed automatically. Please check Billing Records and Room Management.'
          );
        }
      }

      if (item.uid) {
        await addDoc(collection(db, 'notifications'), {
          uid: item.uid,
          type: `reservation_${newStatus.replace('-', '_')}`,
          title: notifTitle,
          message: notifMessage,
          reservationId: item.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      showToast(toastMessage);
    } catch (err) {
      console.error(`Failed to update reservation to ${newStatus}:`, err);
      notifyDialog('Error', 'Could not update this reservation. Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const handleAdminConfirm = (item) => {
    if (!item.roomType || !item.guestDetails) {
      notifyDialog(
        'Cannot confirm yet',
        "This guest hasn't finished selecting a room and entering their details. Ask them to complete the booking first."
      );
      return;
    }
    confirmDialog(
      'Confirm this reservation?',
      `${getGuestName(item)} — ${item.roomType}, ${formatDateRange(item.checkIn, item.checkOut)}`,
      'Confirm',
      () =>
        runStatusUpdate({
          item,
          newStatus: 'upcoming',
          extraFields: { confirmedAt: serverTimestamp(), confirmedByAdmin: true },
          notifTitle: 'Reservation Confirmed! 🎉',
          notifMessage: `Your ${item.roomType} room (${formatDateRange(item.checkIn, item.checkOut)}) is confirmed.`,
          toastMessage: `${getGuestName(item)}'s reservation confirmed`,
        })
    );
  };

  const handleAdminDecline = (item) => {
    confirmDialog(
      'Decline this reservation?',
      `${getGuestName(item)} — ${formatDateRange(item.checkIn, item.checkOut)}. This cannot be undone.`,
      'Decline',
      () =>
        runStatusUpdate({
          item,
          newStatus: 'declined',
          extraFields: { declinedAt: serverTimestamp(), declinedByAdmin: true },
          notifTitle: 'Reservation Update',
          notifMessage: `We're sorry — your reservation request for ${formatDateRange(item.checkIn, item.checkOut)} could not be accommodated.`,
          toastMessage: `${getGuestName(item)}'s reservation declined`,
        })
    );
  };

  const handleCheckIn = (item) => {
    confirmDialog(
      'Check in this guest?',
      `${getGuestName(item)} — ${item.roomType}`,
      'Check In',
      () =>
        runStatusUpdate({
          item,
          newStatus: 'checked-in',
          extraFields: { checkedInAt: serverTimestamp() },
          notifTitle: "You're Checked In! 🏨",
          notifMessage: `Welcome! You're checked in to your ${item.roomType} room. Enjoy your stay.`,
          toastMessage: `${getGuestName(item)} checked in`,
          // Creates the billing folio AND flips the room(s) to Occupied.
          // Both run together so a check-in always leaves billing and
          // room status in sync; if either fails it's caught above and
          // surfaced as a single "one step failed" warning.
          sideEffect: () => Promise.all([createFolioForCheckIn(item), markRoomsOccupied(item)]),
        })
    );
  };

  const handleCheckOut = (item) => {
    confirmDialog(
      'Check out this guest?',
      `${getGuestName(item)} — ${item.roomType}`,
      'Check Out',
      () =>
        runStatusUpdate({
          item,
          newStatus: 'checked-out',
          extraFields: { checkedOutAt: serverTimestamp() },
          notifTitle: 'Thanks for Staying With Us! 👋',
          notifMessage: `You've been checked out of your ${item.roomType} room. We hope you enjoyed your stay!`,
          toastMessage: `${getGuestName(item)} checked out`,
          // Kicks the room(s) into Inspect — the start of the
          // housekeeping cycle in Room Cleaning Status.
          sideEffect: () => markRoomsNeedInspection(item),
        })
    );
  };

  const todayStr = new Date().toDateString();

  const filteredBookings = bookings.filter((b) => {
    switch (filterKey) {
      case 'reservations:pending':   return b.status === 'pending';
      case 'reservations:confirmed': return b.status === 'upcoming';
      case 'reservations:checkins':
        try { return b.status === 'upcoming' && new Date(b.checkIn).toDateString() === todayStr; }
        catch { return false; }
      case 'reservations:checkouts':
        try { return b.status === 'checked-in' && new Date(b.checkOut).toDateString() === todayStr; }
        catch { return false; }
      default: return true;
    }
  });

  const sectionTitles = {
    'reservations:all': 'Bookings',
    'reservations:pending': 'Pending Reservations',
    'reservations:confirmed': 'Confirmed Reservations',
    'reservations:checkins': "Today's Check-ins",
    'reservations:checkouts': "Today's Check-outs",
  };
  const emptyMessages = {
    'reservations:all': 'No bookings yet.',
    'reservations:pending': 'No pending reservations.',
    'reservations:confirmed': 'No confirmed reservations.',
    'reservations:checkins': 'No guests due to arrive today.',
    'reservations:checkouts': 'No guests due to leave today.',
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{sectionTitles[filterKey] || 'Bookings'}</Text>
          <Text style={styles.subtitle}>
            {filteredBookings.length} reservation{filteredBookings.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : filteredBookings.length === 0 ? (
        <View style={styles.centerWrap}><Text style={styles.emptyText}>{emptyMessages[filterKey] || 'No bookings yet.'}</Text></View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const statusStyle = getStatusStyle(item.status);
            const isPending = item.status === 'pending';
            const isActing = actingId === item.id;
            const showCheckIn  = filterKey === 'reservations:checkins'  && item.status === 'upcoming';
            const showCheckOut = filterKey === 'reservations:checkouts' && item.status === 'checked-in';

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.nameCol}>
                    <Text style={styles.referenceNumber}>{getReferenceNumber(item.id)}</Text>
                    <Text style={styles.guestName}>{getGuestName(item)}</Text>
                  </View>

                  {isPending ? (
                    <View style={styles.iconButtonRow}>
                      <TouchableOpacity
                        style={[styles.iconButton, styles.declineIconButton]}
                        onPress={() => handleAdminDecline(item)}
                        activeOpacity={0.8}
                        disabled={isActing}
                        accessibilityLabel="Decline reservation"
                      >
                        {isActing
                          ? <ActivityIndicator color={colors.white} size="small" />
                          : <Text style={styles.iconButtonText}>✕</Text>
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconButton, styles.confirmIconButton]}
                        onPress={() => handleAdminConfirm(item)}
                        activeOpacity={0.8}
                        disabled={isActing}
                        accessibilityLabel="Confirm reservation"
                      >
                        {isActing
                          ? <ActivityIndicator color={colors.white} size="small" />
                          : <Text style={styles.iconButtonText}>✓</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.subtotal}>
                      {item.totalAmount != null ? formatCurrency(item.totalAmount) : '—'}
                    </Text>
                  )}
                </View>

                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                    {getStatusLabel(item.status)}
                  </Text>
                </View>

                <Text style={styles.contact}>📞 {item.guestDetails?.phone || '—'}</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Room</Text>
                  <Text style={styles.detailValue}>{item.roomType || 'Not selected yet'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Dates</Text>
                  <Text style={styles.detailValue}>{formatDateRange(item.checkIn, item.checkOut)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nights</Text>
                  <Text style={styles.detailValue}>{item.nights}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Rooms : Guests</Text>
                  <Text style={styles.detailValue}>
                    {item.totals?.totalRooms ?? 0} Room{item.totals?.totalRooms !== 1 ? 's' : ''} ·{' '}
                    {item.totals?.totalAdults ?? 0} Adult{item.totals?.totalAdults !== 1 ? 's' : ''} +{' '}
                    {item.totals?.totalChildren ?? 0} Child{item.totals?.totalChildren !== 1 ? 'ren' : ''}
                  </Text>
                </View>

                {showCheckIn && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.checkInButton, isActing && styles.actionButtonDisabled]}
                    onPress={() => handleCheckIn(item)}
                    activeOpacity={0.85}
                    disabled={isActing}
                  >
                    {isActing
                      ? <ActivityIndicator color={colors.white} size="small" />
                      : <Text style={styles.actionButtonText}>🛎️ Check In Guest</Text>
                    }
                  </TouchableOpacity>
                )}

                {showCheckOut && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.checkOutButton, isActing && styles.actionButtonDisabled]}
                    onPress={() => handleCheckOut(item)}
                    activeOpacity={0.85}
                    disabled={isActing}
                  >
                    {isActing
                      ? <ActivityIndicator color={colors.white} size="small" />
                      : <Text style={styles.actionButtonText}>🚪 Check Out Guest</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastIcon}>✓</Text>
          <Text style={styles.toastText}>{toast.message}</Text>
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
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted },
  listContent: { padding: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  nameCol: { flexShrink: 1 },
  referenceNumber: {
    fontSize: 11,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
    marginBottom: 2,
  },
  guestName: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text, flexShrink: 1 },
  subtotal: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.accent },

  iconButtonRow: { flexDirection: 'row', gap: spacing.xs },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmIconButton: { backgroundColor: '#1E7B34' },
  declineIconButton: { backgroundColor: '#B3261E' },
  iconButtonText: { color: colors.white, fontSize: 14, fontFamily: fonts.headingBold },

  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.4 },
  contact: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  detailLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  detailValue: {
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing.sm,
  },
  actionButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInButton: { backgroundColor: '#1E7B34' },
  checkOutButton: { backgroundColor: colors.textMuted },
  actionButtonDisabled: { opacity: 0.7 },
  actionButtonText: { color: colors.white, fontSize: 13, fontFamily: fonts.headingSemiBold, letterSpacing: 0.3 },
  toast: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  toastIcon: { color: colors.white, fontSize: 13, fontFamily: fonts.headingBold },
  toastText: { color: colors.white, fontSize: 13, fontFamily: fonts.bodySemiBold },
});