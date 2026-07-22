import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';
import { createBillingRecord } from '../../utils/BillingService';
import { updateRoomStatus, ROOM_STATUS } from '../../utils/Roomsservice';

// confirmDialog/notifyDialog used to be module-level functions calling
// window.confirm()/window.alert() on web and Alert.alert() on native —
// both are unstyled system dialogs completely disconnected from the
// app's own design (the browser's raw "localhost:8081 says..." popup
// being the most jarring example). They're now defined INSIDE the
// component below (same names, same call signatures — none of the 7
// call sites needed to change) as closures over a single dialogState
// piece of state, rendered via one themed <Modal> at the bottom of this
// file. This also means web and native now show the exact same custom
// dialog instead of two different unstyled system ones.

export default function ReservationsScreen({ onLogout, filterKey = 'reservations:all' }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [toast, setToast] = useState(null);

  // Drives the single themed dialog rendered at the bottom of this
  // component. null = closed. `onConfirm` present = two-button
  // confirm/cancel dialog; `onConfirm` absent = single-button info dialog.
  const [dialogState, setDialogState] = useState(null);

  const confirmDialog = (title, message, confirmLabel, onConfirmPressed) => {
    setDialogState({
      title,
      message,
      confirmLabel,
      onConfirm: onConfirmPressed,
      destructive: confirmLabel === 'Decline',
    });
  };

  const notifyDialog = (title, message) => {
    setDialogState({ title, message, confirmLabel: null, onConfirm: null, destructive: false });
  };

  // Maps a Postgres reservations row (snake_case) to the same camelCase
  // shape the Firestore version used, so getGuestName/getRoomNumbersForFolio
  // /the JSX below all stayed unchanged.
  const reservationToCamel = (row) => ({
    id: row.id,
    uid: row.user_id,
    guestEmail: row.guest_email,
    guestDetails: row.guest_details,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    selectedRooms: row.selected_rooms,
    roomType: row.room_type,
    totalAmount: row.total_amount,
    status: row.status,
    guestCount: row.guest_count,
    createdAt: row.created_at,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
  });

  const loadBookings = async () => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load bookings:', error);
      setLoading(false);
      return;
    }
    setBookings((data || []).map(reservationToCamel));
    setLoading(false);
  };

  useEffect(() => {
    loadBookings();

    // Realtime keeps this in sync with OTHER staff/devices acting on the
    // same reservations. Our own writes below also call loadBookings()
    // directly, so this screen updates immediately regardless of
    // whether the realtime round-trip has landed yet.
    const channel = supabase
      .channel('reservations-frontdesk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadBookings)
      .subscribe();

    return () => supabase.removeChannel(channel);
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

  // accent = a stronger, more saturated version of `text`, used for the
  // card's left border stripe — bg/text stay softer for the badge itself
  // so the text remains readable, while accent gives a bolder at-a-glance
  // color cue from the edge of the card, before you've even read the badge.
  const getStatusStyle = (status) => {
    switch (status) {
      case 'upcoming':     return { bg: colors.primaryTint, text: colors.primary,   accent: colors.primary,  icon: 'calendar-outline' };
      case 'pending':      return { bg: '#FFF4D6', text: '#9A7B00', accent: '#C99400', icon: 'time-outline' };
      case 'checked-in':   return { bg: '#DFF5E1', text: '#1E7B34', accent: '#1E7B34', icon: 'log-in-outline' };
      case 'checked-out':  return { bg: colors.cardAlt, text: colors.textMuted, accent: colors.textMuted, icon: 'log-out-outline' };
      case 'declined':     return { bg: '#FCE1E1', text: '#B3261E', accent: '#B3261E', icon: 'close-circle-outline' };
      default:             return { bg: colors.cardAlt, text: colors.textMuted, accent: colors.border, icon: 'help-circle-outline' };
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

  // Prominent room-number display for the card header — distinct from
  // getRoomNumbersForFolio below (which falls back to roomType/
  // 'Unassigned' for internal folio/room-status syncing). This one
  // returns null when there's no real room number yet, so the header can
  // show an honest "Room not assigned" state instead of a fake number.
  const getRoomNumbersDisplay = (item) => {
    if (Array.isArray(item.selectedRooms) && item.selectedRooms.length > 0) {
      const numbers = item.selectedRooms
        .map((r) => r.roomNumber || r.number || r.room)
        .filter(Boolean);
      if (numbers.length > 0) return numbers;
    }
    return null;
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
      const { error } = await supabase
        .from('reservations')
        .update({ status: newStatus, ...extraFields })
        .eq('id', item.id);
      if (error) throw error;

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
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: item.uid,
          type: `reservation_${newStatus.replace('-', '_')}`,
          title: notifTitle,
          message: notifMessage,
          reservation_id: item.id,
          read: false,
        });
        if (notifError) console.error('Failed to create notification:', notifError);
      }

      showToast(toastMessage);
      await loadBookings();
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
          extraFields: { confirmed_at: new Date().toISOString() },
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
          extraFields: { declined_at: new Date().toISOString() },
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
          extraFields: { checked_in_at: new Date().toISOString() },
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
          extraFields: { checked_out_at: new Date().toISOString() },
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
              <View style={[styles.card, { borderLeftColor: statusStyle.accent }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.nameCol}>
                    <Text style={styles.referenceNumber}>{getReferenceNumber(item.id)}</Text>
                    <Text style={styles.guestName}>{getGuestName(item)}</Text>

                    {/* Room number(s) — the most important thing for staff
                        to spot at a glance, so it sits right under the
                        guest name rather than buried in the detail rows
                        below. */}
                    {(() => {
                      const roomNumbers = getRoomNumbersDisplay(item);
                      return roomNumbers ? (
                        <View style={styles.roomNumberRow}>
                          {roomNumbers.map((rn) => (
                            <View key={rn} style={styles.roomNumberBadge}>
                              <Ionicons name="key-outline" size={12} color={colors.white} />
                              <Text style={styles.roomNumberText}>Room {rn}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={[styles.roomNumberBadge, styles.roomNumberBadgeMuted]}>
                          <Ionicons name="alert-circle-outline" size={12} color={colors.textMuted} />
                          <Text style={[styles.roomNumberText, styles.roomNumberTextMuted]}>Room not assigned</Text>
                        </View>
                      );
                    })()}
                  </View>

                  {isPending ? (
                    <View style={styles.pendingActionsRow}>
                      <TouchableOpacity
                        style={[styles.pendingActionBtn, styles.declineBtn]}
                        onPress={() => handleAdminDecline(item)}
                        activeOpacity={0.85}
                        disabled={isActing}
                        accessibilityLabel="Decline reservation"
                      >
                        {isActing
                          ? <ActivityIndicator color={colors.danger} size="small" />
                          : (
                            <>
                              <Ionicons name="close" size={14} color={colors.danger} />
                              <Text style={styles.declineBtnText}>Decline</Text>
                            </>
                          )
                        }
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pendingActionBtn, styles.confirmBtn]}
                        onPress={() => handleAdminConfirm(item)}
                        activeOpacity={0.85}
                        disabled={isActing}
                        accessibilityLabel="Confirm reservation"
                      >
                        {isActing
                          ? <ActivityIndicator color={colors.white} size="small" />
                          : (
                            <>
                              <Ionicons name="checkmark" size={14} color={colors.white} />
                              <Text style={styles.confirmBtnText}>Confirm</Text>
                            </>
                          )
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
                  <Ionicons name={statusStyle.icon} size={11} color={statusStyle.text} />
                  <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                    {getStatusLabel(item.status)}
                  </Text>
                </View>

                <View style={styles.contactRow}>
                  <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.contact}>{item.guestDetails?.phone || '—'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Room Type</Text>
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
                    {item.selectedRooms?.length ?? 0} Room{item.selectedRooms?.length !== 1 ? 's' : ''} ·{' '}
                    {item.guestCount ?? 0} Guest{item.guestCount !== 1 ? 's' : ''}
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
                      : (
                        <View style={styles.actionButtonContent}>
                          <Ionicons name="log-in-outline" size={16} color={colors.white} />
                          <Text style={styles.actionButtonText}>Check In Guest</Text>
                        </View>
                      )
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
                      : (
                        <View style={styles.actionButtonContent}>
                          <Ionicons name="log-out-outline" size={16} color={colors.white} />
                          <Text style={styles.actionButtonText}>Check Out Guest</Text>
                        </View>
                      )
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
          <Ionicons name="checkmark-circle" size={16} color={colors.white} />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      {/* Themed replacement for window.confirm()/window.alert()/Alert.alert()
          — same custom dialog on every platform now. */}
      <Modal visible={!!dialogState} transparent animationType="fade" onRequestClose={() => setDialogState(null)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <View style={[
              styles.dialogIconWrap,
              dialogState?.destructive ? styles.dialogIconWrapDestructive : styles.dialogIconWrapDefault,
            ]}>
              <Ionicons
                name={dialogState?.destructive ? 'alert-circle' : dialogState?.onConfirm ? 'help-circle' : 'information-circle'}
                size={26}
                color={dialogState?.destructive ? '#B3261E' : colors.primary}
              />
            </View>

            <Text style={styles.dialogTitle}>{dialogState?.title}</Text>
            <Text style={styles.dialogMessage}>{dialogState?.message}</Text>

            {dialogState?.onConfirm ? (
              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={styles.dialogCancelBtn}
                  onPress={() => setDialogState(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dialogConfirmBtn, dialogState.destructive && styles.dialogConfirmBtnDestructive]}
                  onPress={() => {
                    const action = dialogState.onConfirm;
                    setDialogState(null);
                    action();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.dialogConfirmText}>{dialogState.confirmLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.dialogOkBtn}
                onPress={() => setDialogState(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.dialogOkText}>OK</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
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
    borderLeftWidth: 4, // color set inline per-card via getStatusStyle().accent
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

  roomNumberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  roomNumberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  roomNumberBadgeMuted: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 6,
  },
  roomNumberText: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.white, letterSpacing: 0.2 },
  roomNumberTextMuted: { color: colors.textMuted },

  pendingActionsRow: { flexDirection: 'row', gap: spacing.xs, flexShrink: 0 },
  pendingActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 999,
  },
  declineBtn: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  declineBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.danger },
  confirmBtn: {
    backgroundColor: '#1E7B34',
  },
  confirmBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.4 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  contact: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
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
  actionButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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

  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  dialogIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dialogIconWrapDefault: { backgroundColor: colors.primaryTint },
  dialogIconWrapDestructive: { backgroundColor: '#FBE7E7' },
  dialogTitle: {
    fontSize: 17,
    fontFamily: fonts.headingBold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  dialogMessage: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  dialogActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  dialogCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  dialogCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  dialogConfirmBtn: {
    flex: 1,
    backgroundColor: '#1E7B34',
    borderRadius: 999,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  dialogConfirmBtnDestructive: { backgroundColor: '#B3261E' },
  dialogConfirmText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
  dialogOkBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  dialogOkText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});