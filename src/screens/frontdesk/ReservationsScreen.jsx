import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { formatCurrency } from '../../utils/roomRates';
import { createBillingRecord, getBillingRecordByReservation } from '../../utils/BillingService';
import { updateRoomStatus, ROOM_STATUS, isDoubleBookingError } from '../../utils/Roomsservice';
import WalkInScreen from './WalkInScreen';
import TapeChartScreen from './TapeChartScreen';
import RecordPaymentModal from './RecordPaymentModal';
import { getDownpaymentInfo, downpaymentBadge, downpaymentMethodLabel, formatDueDate } from '../../utils/downpayment';
import {
  fetchPendingExtensions,
  approveStayExtension,
  declineStayExtension,
  subscribeToStayExtensions,
} from '../../utils/StayExtensionService';

// All 8 Reservation Management sidebar items, now tabs at the top of this
// one screen instead of separate sidebar sub-items/routes. The first 6 are
// real filters over the same `bookings` list (see filteredBookings below);
// the last 2 (Walk-In, Tape Chart) swap the whole body for a different
// embedded screen instead — see the activeTab ternary in the render below.
const TABS = [
  { key: 'reservations:all',       label: 'All',         icon: 'list-outline' },
  { key: 'reservations:pending',   label: 'Pending',      icon: 'time-outline' },
  { key: 'reservations:confirmed', label: 'Confirmed',    icon: 'checkmark-circle-outline' },
  { key: 'reservations:downpayment', label: 'Awaiting Downpayment', icon: 'wallet-outline' },
  { key: 'reservations:checkins',  label: 'Check-ins',    icon: 'log-in-outline' },
  { key: 'reservations:checkouts', label: 'Check-outs',   icon: 'log-out-outline' },
  { key: 'reservations:extensions', label: 'Extensions',  icon: 'calendar-number-outline' },
  { key: 'reservations:refunds',   label: 'Refunds',      icon: 'cash-outline' },
  { key: 'reservations:walkin',    label: 'Walk-In',      icon: 'person-add-outline' },
  { key: 'reservations:tapechart', label: 'Tape Chart',   icon: 'grid-outline' },
];

// Same bg/text/accent trio BillingRecordsScreen.jsx's STATUS_STYLE uses for
// these two folio states — kept as its own small map here (rather than
// importing that file's local const) since the outstanding-balance
// checkpoint below is the only place in this screen that needs it. 'paid'
// has no entry on purpose: the checkpoint never shows once a folio is
// fully settled, so there's nothing to look up for it.
const BALANCE_STATUS_STYLE = {
  unpaid:         { bg: '#FBE7E7', accent: '#B3261E', label: 'Unpaid' },
  partially_paid: { bg: '#FFF4D6', accent: '#C99400', label: 'Partially Paid' },
};

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

// onLogout is intentionally not accepted as a prop here anymore — the
// in-screen header (title/count/Log Out button) was removed since it
// duplicated the sidebar's own logout controls (a menu item and a power
// icon, both already in FrontDeskSidebar.jsx/AdminSidebar.jsx). Both
// Shells still pass onLogout when rendering this screen, which is
// harmless — an unused prop is simply ignored.
export default function ReservationsScreen({ filterKey = 'reservations:all', staffUid, staffName }) {
  // filterKey still exists as a PROP (not just for the initial value below)
  // because dashboard KPI shortcuts (FrontDeskDashboardScreen's goTo(),
  // AdmindashboardScreen's onNavigate()) still deep-link straight to a
  // specific tab, e.g. 'reservations:checkins' — that's a real, live path
  // that has to keep landing on the right tab. Everything reachable only
  // through the sidebar now flows through the tab bar below instead, which
  // is why the Shells' routing didn't need the same per-item wiring anymore.
  const [activeTab, setActiveTab] = useState(filterKey);
  useEffect(() => {
    setActiveTab(filterKey);
    // Only matters if a future caller re-renders an already-mounted
    // ReservationsScreen with a new filterKey — today every path into this
    // screen is a fresh mount (Shell only ever renders one active screen at
    // a time), so this is a safety net rather than something in active use.
  }, [filterKey]);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  // Guests' pending Extend Stay requests, keyed by reservation id.
  const [pendingExtensions, setPendingExtensions] = useState({});
  const [toast, setToast] = useState(null);

  // Drives the single themed dialog rendered at the bottom of this
  // component. null = closed. `onConfirm` present = two-button
  // confirm/cancel dialog; `onConfirm` absent = single-button info dialog.
  const [dialogState, setDialogState] = useState(null);

  // Checkout-time balance checkpoint (see handleCheckOut below).
  // checkoutWarning: { item, folio } | null — shown instead of the plain
  // "Check out this guest?" dialog when the folio still has money owed.
  // recordPaymentFolio: the folio | null currently open in
  // RecordPaymentModal, reached from checkoutWarning's "Collect Payment".
  const [checkoutWarning, setCheckoutWarning] = useState(null);
  const [recordPaymentFolio, setRecordPaymentFolio] = useState(null);
  // "Record Downpayment" dialog (pay-at-hotel bookings): { item } | null.
  const [downpaymentTarget, setDownpaymentTarget] = useState(null);
  const [downpaymentMethod, setDownpaymentMethod] = useState('cash');
  const [recordingDownpayment, setRecordingDownpayment] = useState(false);

  const confirmDialog = (title, message, confirmLabel, onConfirmPressed) => {
    setDialogState({
      title,
      message,
      confirmLabel,
      onConfirm: onConfirmPressed,
      destructive: confirmLabel === 'Decline' || confirmLabel === 'Mark No Show',
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
    paymentMode: row.payment_mode,
    eWalletProvider: row.ewallet_provider,
    // Refunds Pending (see sql/refunds_pending.sql) — set on the guest's
    // side by MyReservationsScreen.jsx's confirmCancel() when a
    // cancellation is online-paid and within the 24hr window.
    refundStatus: row.refund_status,
    refundRequestedAt: row.refund_requested_at,
    refundProcessedAt: row.refund_processed_at,
    refundProcessedByName: row.refund_processed_by_name,
    // Downpayment (sql/downpayment.sql) — empty on bookings made before it.
    downpaymentAmount: row.downpayment_amount,
    downpaymentStatus: row.downpayment_status,
    downpaymentDueAt: row.downpayment_due_at,
    downpaymentPaidAt: row.downpayment_paid_at,
    downpaymentMethod: row.downpayment_method,
    downpaymentRecordedByName: row.downpayment_recorded_by_name,
    paymentOption: row.payment_option,
  });

  // Human-readable labels for known e-wallet providers — same mapping
  // MyReservationsScreen.jsx uses guest-side, needed here so staff know
  // which provider to actually send the refund through.
  const EWALLET_LABELS = {
    gcash: 'GCash',
    maya: 'Maya',
    maribank: 'Maribank',
    gotyme: 'GoTyme',
  };
  const paymentProviderLabel = (item) => {
    const provider = (item.eWalletProvider || '').toLowerCase();
    return EWALLET_LABELS[provider] || item.eWalletProvider || 'E-wallet';
  };

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

  // Extend Stay requests from guests (sql/stay_extensions.sql). Shown on
  // the guest's card on every tab, and gathered under the Extensions tab.
  const loadPendingExtensions = async () => {
    try {
      setPendingExtensions(await fetchPendingExtensions());
    } catch (err) {
      console.error('Failed to load stay extension requests:', err);
    }
  };

  useEffect(() => {
    loadPendingExtensions();
    return subscribeToStayExtensions('stay-extensions-frontdesk', loadPendingExtensions);
  }, []);

  const handleApproveExtension = (item, ext) => {
    confirmDialog(
      'Approve this extension?',
      `${getGuestName(item)} stays ${ext.extraNights} more night${ext.extraNights === 1 ? '' : 's'}, until ${new Date(ext.newCheckOut).toLocaleDateString()}. ${formatCurrency(ext.amount)} will be added to their folio as a balance to collect.`,
      'Approve',
      async () => {
        setActingId(item.id);
        try {
          await approveStayExtension(ext.id, staffName);
          showToast(`${getGuestName(item)}'s stay extended to ${new Date(ext.newCheckOut).toLocaleDateString()}`);
          await Promise.all([loadBookings(), loadPendingExtensions()]);
        } catch (err) {
          console.error('Failed to approve stay extension:', err);
          notifyDialog(
            isDoubleBookingError(err) ? 'Room not available' : 'Could not approve',
            isDoubleBookingError(err)
              ? `${err.message} Another booking holds this room on one of the added nights. Decline the request or move the incoming guest first.`
              : err?.message || 'Please try again.'
          );
        } finally {
          setActingId(null);
        }
      }
    );
  };

  const handleDeclineExtension = (item, ext) => {
    confirmDialog(
      'Decline this extension?',
      `${getGuestName(item)} will be told the extension isn't available and keeps their current check-out date.`,
      'Decline',
      async () => {
        setActingId(item.id);
        try {
          await declineStayExtension(ext.id, null, staffName);
          showToast(`Extension declined for ${getGuestName(item)}`);
          await loadPendingExtensions();
        } catch (err) {
          console.error('Failed to decline stay extension:', err);
          notifyDialog('Could not decline', err?.message || 'Please try again.');
        } finally {
          setActingId(null);
        }
      }
    );
  };

  const formatDateRange = (checkIn, checkOut) => {
    try {
      return `${new Date(checkIn).toLocaleDateString()} – ${new Date(checkOut).toLocaleDateString()}`;
    } catch {
      return `${checkIn} – ${checkOut}`;
    }
  };

  // DIAGNOSTIC, RESOLVED: checked_in_at/checked_out_at were already being
  // written to the DB on every check-in/check-out (see handleCheckIn/
  // handleCheckOut below — extraFields: { checked_in_at: ... } already
  // existed) and already exposed here as item.checkedInAt/checkedOutAt via
  // reservationToCamel above. The gap was display-only: nothing in this
  // screen ever rendered them. toLocaleString() (not toLocaleDateString())
  // is deliberate — it includes both date AND time, same call the Refunds
  // tab's "Requested" row below already uses for refundRequestedAt.
  const formatDateTime = (value) => {
    if (!value) return null;
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
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
      // Same red pairing MyReservationsScreen.jsx's guest-facing statusMeta()
      // already uses for 'cancelled' — kept consistent app-wide.
      case 'cancelled':    return { bg: '#FCE1E1', text: '#B3261E', accent: '#B3261E', icon: 'close-circle-outline' };
      case 'no-show':      return { bg: '#F3E8E8', text: '#8C2F2F', accent: '#8C2F2F', icon: 'person-remove-outline' };
      default:             return { bg: colors.cardAlt, text: colors.textMuted, accent: colors.border, icon: 'help-circle-outline' };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'checked-in':  return 'CHECKED IN';
      case 'checked-out': return 'CHECKED OUT';
      case 'declined':    return 'DECLINED';
      case 'cancelled':   return 'CANCELLED';
      case 'no-show':     return 'NO SHOW';
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
      if (isDoubleBookingError(err)) {
        // Refused by the double-booking trigger: another active booking
        // already holds this room for an overlapping night (only possible
        // for bookings made before sql/prevent_double_booking.sql was run).
        notifyDialog(
          'Room not available',
          `${err.message} Another reservation already holds this room for one of these nights. Decline this booking or ask the guest to change rooms.`
        );
      } else {
        notifyDialog('Error', 'Could not update this reservation. Please try again.');
      }
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

  // One line for dialogs: what was paid up front and what's still due.
  const downpaymentSummary = (item) => {
    const dp = getDownpaymentInfo(item);
    if (!dp.applies) return '';
    if (dp.status === 'paid') {
      if (dp.full) return `Paid in full: ${formatCurrency(dp.amount)} (${downpaymentMethodLabel(dp.method)}). Balance due: ${formatCurrency(0)}.`;
      return `Downpayment paid: ${formatCurrency(dp.amount)} (${downpaymentMethodLabel(dp.method)}). Balance due: ${formatCurrency(dp.balance)}.`;
    }
    if (dp.status === 'pending') {
      return `Downpayment NOT paid yet (${formatCurrency(dp.amount)}). Full amount due: ${formatCurrency(dp.total)}.`;
    }
    return '';
  };

  const handleCheckIn = (item) => {
    const dpLine = downpaymentSummary(item);
    confirmDialog(
      'Check in this guest?',
      `${getGuestName(item)} — ${item.roomType}${dpLine ? `\n\n${dpLine}` : ''}`,
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

  // Guest never arrived: marks the booking "No Show". The room is released
  // for those dates (only pending/upcoming/checked-in bookings hold a room)
  // and a paid downpayment is kept, not refunded.
  const handleNoShow = (item) => {
    const dp = getDownpaymentInfo(item);
    const dpLine = dp.applies && dp.paid
      ? `\n\nThe ${dp.full ? 'payment' : 'downpayment'} of ${formatCurrency(dp.amount)} is kept and will not be refunded.`
      : '';
    confirmDialog(
      'Mark as No Show?',
      `${getGuestName(item)} — ${item.roomType}, ${formatDateRange(item.checkIn, item.checkOut)}.\n\nThe room will be free again for these dates. This cannot be undone.${dpLine}`,
      'Mark No Show',
      () =>
        runStatusUpdate({
          item,
          newStatus: 'no-show',
          extraFields: { no_show_at: new Date().toISOString() },
          notifTitle: 'Reservation marked as No Show',
          notifMessage: `You did not check in for your ${item.roomType} reservation (${formatDateRange(item.checkIn, item.checkOut)}), so it was marked as a no-show.`,
          toastMessage: `${getGuestName(item)} marked as no show`,
        })
    );
  };

  // Checks out a guest — but first checks whether they still owe
  // anything on their folio, so a balance can't ride along silently
  // past checkout.
  const handleCheckOut = async (item) => {
    setActingId(item.id); // reuses the existing per-card spinner during this lookup
    let folio = null;
    try {
      folio = await getBillingRecordByReservation(item.id);
    } catch (err) {
      // Fails open rather than blocking checkout entirely on a network
      // hiccup — logged so it's debuggable, but see the plain-checkout
      // fallback below.
      console.error('Could not check billing balance before checkout:', err);
    }
    setActingId(null);

    const remainingBalance = folio?.remainingBalance || 0;
    if (folio && remainingBalance > 0) {
      setCheckoutWarning({ item, folio });
      return;
    }

    // No balance owed (or no folio found / lookup failed) — same plain
    // confirmation checkout has always used.
    confirmDialog(
      'Check out this guest?',
      `${getGuestName(item)} — ${item.roomType}${isDueTodayOrEarlier(item.checkOut) ? '' : `\n\nEarly checkout: this guest was booked until ${formatCheckoutDay(item.checkOut)}.`}`,
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

  // "Check Out Anyway" from the outstanding-balance checkpoint — same
  // checkout as above, just reached from checkoutWarning instead of the
  // plain confirm dialog, and the toast says so explicitly rather than
  // pretending the balance doesn't exist.
  const handleCheckOutWithBalance = () => {
    if (!checkoutWarning) return;
    const { item, folio } = checkoutWarning;
    setCheckoutWarning(null);
    runStatusUpdate({
      item,
      newStatus: 'checked-out',
      extraFields: { checked_out_at: new Date().toISOString() },
      notifTitle: 'Thanks for Staying With Us! 👋',
      notifMessage: `You've been checked out of your ${item.roomType} room. We hope you enjoyed your stay!`,
      toastMessage: `${getGuestName(item)} checked out — ${formatCurrency(folio.remainingBalance)} still owed`,
      sideEffect: () => markRoomsNeedInspection(item),
    });
  };

  // Marks a flagged refund as actually sent. Kept as its own function
  // rather than routed through runStatusUpdate() above: reservation
  // `status` itself doesn't change here (it's staying 'cancelled'), and
  // runStatusUpdate's notification type is derived from newStatus, which
  // would mislabel this as a "reservation_cancelled" notification instead
  // of a refund one. Same shape otherwise (setActingId, confirm-then-act,
  // toast, notification, reload, error handling).
  // With a downpayment, only the downpayment that was paid is refunded.
  const refundAmount = (item) => {
    const dp = getDownpaymentInfo(item);
    return dp.applies ? dp.amount : item.totalAmount;
  };
  const refundViaLabel = (item) => {
    const dp = getDownpaymentInfo(item);
    return dp.applies && dp.method ? downpaymentMethodLabel(dp.method) : paymentProviderLabel(item);
  };

  const handleMarkRefunded = (item) => {
    confirmDialog(
      'Mark this refund as processed?',
      `${getGuestName(item)} — ${formatCurrency(refundAmount(item))}${getDownpaymentInfo(item).applies ? (getDownpaymentInfo(item).full ? ' full payment' : ' downpayment') : ''} via ${refundViaLabel(item)}. Only confirm after you've actually sent the refund — this just records that it's done.`,
      'Mark as Refunded',
      () => runRefundUpdate(item)
    );
  };

  const runRefundUpdate = async (item) => {
    setActingId(item.id);
    try {
      const { error } = await supabase
        .from('reservations')
        .update({
          refund_status: 'processed',
          refund_processed_at: new Date().toISOString(),
          refund_processed_by: staffUid || null,
          refund_processed_by_name: staffName || 'Staff',
          ...(item.downpaymentStatus === 'refund_pending' ? { downpayment_status: 'refunded' } : {}),
        })
        .eq('id', item.id);
      if (error) throw error;

      if (item.uid) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: item.uid,
          type: 'refund_processed',
          title: 'Refund Processed',
          message: `Your refund of ${formatCurrency(refundAmount(item))} for the cancelled reservation has been processed.`,
          reservation_id: item.id,
          read: false,
        });
        if (notifError) console.error('Failed to create notification:', notifError);
      }

      showToast(`Refund marked as processed for ${getGuestName(item)}`);
      await loadBookings();
    } catch (err) {
      console.error('Failed to mark refund as processed:', err);
      notifyDialog('Error', 'Could not update this refund. Please try again.');
    } finally {
      setActingId(null);
    }
  };

  // Pay-at-hotel downpayment received at the front desk (cash, GCash, card).
  // record_downpayment() (sql/downpayment.sql) checks staff role and status.
  const openRecordDownpayment = (item) => {
    setDownpaymentMethod('cash');
    setDownpaymentTarget({ item });
  };

  const submitRecordDownpayment = async () => {
    if (!downpaymentTarget) return;
    const { item } = downpaymentTarget;
    const dp = getDownpaymentInfo(item);
    setRecordingDownpayment(true);
    try {
      const { error } = await supabase.rpc('record_downpayment', {
        p_reservation_id: item.id,
        p_method: downpaymentMethod,
      });
      if (error) throw error;

      if (item.uid) {
        const { error: notifError } = await supabase.from('notifications').insert({
          user_id: item.uid,
          type: 'downpayment_received',
          title: 'Downpayment Received',
          message: `We received your downpayment of ${formatCurrency(dp.amount)}. Your reservation is secured. The balance of ${formatCurrency(dp.balance)} is payable at the hotel.`,
          reservation_id: item.id,
          read: false,
        });
        if (notifError) console.error('Failed to create notification:', notifError);
      }

      setDownpaymentTarget(null);
      showToast(`Downpayment of ${formatCurrency(dp.amount)} recorded for ${getGuestName(item)}`);
      await loadBookings();
    } catch (err) {
      console.error('Failed to record downpayment:', err);
      setDownpaymentTarget(null);
      notifyDialog('Could not record downpayment', err?.message || 'Please try again.');
    } finally {
      setRecordingDownpayment(false);
    }
  };

  // RESOLVED: both tabs below used to require an exact same-day match
  // (checkIn/checkOut === today's date), so the moment the calendar
  // rolled over, anyone not yet dealt with just vanished from the list —
  // reproduced live: a guest booked to arrive 9/23 was still 'upcoming'
  // at 12:57 AM on 9/24, no longer showed under Check-ins (checkIn date
  // no longer matched "today"), and had no way to be checked in from
  // anywhere else in the UI either, since the Check In button only ever
  // renders on this tab (see showCheckIn below). The same gap applies to
  // Check-outs, and matters more now that there's no automatic fallback
  // on the guest side either (see MyReservationsScreen.jsx) — this list
  // is the only mechanism left for catching a forgotten checkout, so it
  // has to keep showing anyone overdue, not just today's exact-date
  // cases. Compares calendar days rather than exact instants (so
  // time-of-day in the stored value doesn't matter) and now matches "due
  // today OR earlier" instead of "due today only" — a future-dated
  // booking still correctly stays hidden until its actual day.
  const formatCheckoutDay = (dateValue) => {
    try {
      return new Date(dateValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  };

  // "Due today" / "Overdue" / "Checks out Oct 24" line on Check-outs cards.
  const checkoutDueInfo = (dateValue) => {
    const d = new Date(dateValue);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (day < today) return { label: `Overdue — was due ${formatCheckoutDay(dateValue)}`, color: '#B3261E', icon: 'alert-circle-outline' };
    if (day === today) return { label: 'Due to check out today', color: '#9A7B00', icon: 'time-outline' };
    return { label: `Checks out ${formatCheckoutDay(dateValue)} · early checkout available`, color: colors.textMuted, icon: 'calendar-outline' };
  };

  const isDueTodayOrEarlier = (dateValue) => {
    try {
      const d = new Date(dateValue);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const now = new Date();
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return day.getTime() <= todayDay.getTime();
    } catch {
      return false;
    }
  };

  const inTab = (b, tabKey) => {
    switch (tabKey) {
      case 'reservations:pending':   return b.status === 'pending';
      case 'reservations:confirmed': return b.status === 'upcoming';
      case 'reservations:checkins':
        return b.status === 'upcoming' && isDueTodayOrEarlier(b.checkIn);
      // Every checked-in guest, so staff can also do an early checkout.
      // Due today / overdue come first (see sort below).
      case 'reservations:checkouts':
        return b.status === 'checked-in';
      case 'reservations:extensions':
        return b.status === 'checked-in' && !!pendingExtensions[b.id];
      // Deliberately scoped to PENDING refunds only, matching the sidebar
      // label exactly — once staff mark one processed it drops off this
      // list (refund_status becomes 'processed'), same one-purpose-per-tab
      // pattern as every other filter here. A "Refund History" view would
      // be a reasonable follow-up but isn't what this nav item asks for.
      case 'reservations:refunds':   return b.refundStatus === 'pending';
      // Pay-at-hotel bookings whose downpayment hasn't been recorded yet
      // (overdue ones first, see sort below).
      case 'reservations:downpayment': return getDownpaymentInfo(b).awaiting;
      default: return true;
    }
  };
  const filteredBookings = bookings.filter((b) => inTab(b, activeTab));

  // Red number badges: how many bookings are waiting in each of these tabs.
  // Updates live, since bookings and extensions already refresh in realtime.
  const BADGE_TABS = [
    'reservations:pending', 'reservations:checkins', 'reservations:checkouts',
    'reservations:extensions', 'reservations:refunds',
  ];
  const tabCounts = {};
  BADGE_TABS.forEach((key) => { tabCounts[key] = bookings.filter((b) => inTab(b, key)).length; });
  // Check-outs lists every checked-in guest, but the badge only counts the
  // ones due to leave today or overdue.
  tabCounts['reservations:checkouts'] = bookings.filter(
    (b) => b.status === 'checked-in' && isDueTodayOrEarlier(b.checkOut)
  ).length;

  if (activeTab === 'reservations:checkouts') {
    filteredBookings.sort((a, b) => new Date(a.checkOut) - new Date(b.checkOut));
  }

  if (activeTab === 'reservations:downpayment') {
    filteredBookings.sort((a, b) => {
      const da = getDownpaymentInfo(a), db = getDownpaymentInfo(b);
      if (da.overdue !== db.overdue) return da.overdue ? -1 : 1;
      return new Date(da.dueAt || 0) - new Date(db.dueAt || 0);
    });
  }
  const awaitingDownpaymentCount = bookings.filter((b) => getDownpaymentInfo(b).awaiting).length;

  const emptyMessages = {
    'reservations:all': 'No bookings yet.',
    'reservations:pending': 'No pending reservations.',
    'reservations:confirmed': 'No confirmed reservations.',
    'reservations:checkins': 'No arrivals due or overdue right now.',
    'reservations:checkouts': 'No guests are checked in right now.',
    'reservations:refunds': 'No refunds pending right now.',
    'reservations:downpayment': 'No reservations are waiting for a downpayment.',
    'reservations:extensions': 'No extension requests right now.',
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS
            // Guests pay the downpayment by e-wallet when booking, so this tab
            // only matters for older bookings still waiting for one.
            .filter((tab) => tab.key !== 'reservations:downpayment' || awaitingDownpaymentCount > 0 || activeTab === tab.key)
            .map((tab) => (
            <ReservationTabButton
              key={tab.key}
              count={tabCounts[tab.key] || 0}
              tab={
                tab.key === 'reservations:downpayment' && awaitingDownpaymentCount > 0
                    ? { ...tab, label: `${tab.label} (${awaitingDownpaymentCount})` }
                    : tab
              }
              active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {activeTab === 'reservations:walkin' ? (
        <WalkInScreen staffUid={staffUid} staffName={staffName} />
      ) : activeTab === 'reservations:tapechart' ? (
        <TapeChartScreen />
      ) : loading ? (
        <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : filteredBookings.length === 0 ? (
        <View style={styles.centerWrap}><Text style={styles.emptyText}>{emptyMessages[activeTab] || 'No bookings yet.'}</Text></View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const statusStyle = getStatusStyle(item.status);
            const isPending = item.status === 'pending';
            const isActing = actingId === item.id;
            const showCheckIn  = activeTab === 'reservations:checkins'  && item.status === 'upcoming';
            const showCheckOut = activeTab === 'reservations:checkouts' && item.status === 'checked-in';
            const showMarkRefunded = activeTab === 'reservations:refunds' && item.refundStatus === 'pending';
            const extension = item.status === 'checked-in' ? pendingExtensions[item.id] : null;

            return (
              <View style={[styles.card, { borderLeftColor: statusStyle.accent }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.nameCol}>
                    <Text style={styles.referenceNumber}>{getReferenceNumber(item.id)}</Text>
                    <Text style={styles.guestName}>{getGuestName(item)}</Text>

                    {/* Rooms are shown by name only (Room Type row below), no room numbers. */}
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

                {/* Downpayment: status, amount paid, balance due */}
                {(() => {
                  const dp = getDownpaymentInfo(item);
                  const badge = downpaymentBadge(dp);
                  if (!badge) return null;
                  return (
                    <View style={[styles.dpPanel, dp.overdue && styles.dpPanelOverdue]}>
                      <View style={styles.dpPanelHead}>
                        <View style={[styles.dpBadge, { backgroundColor: badge.bg }]}>
                          <Ionicons name={badge.icon} size={12} color={badge.text} />
                          <Text style={[styles.dpBadgeText, { color: badge.text }]}>{badge.label.toUpperCase()}</Text>
                        </View>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{dp.full ? 'Payment option' : 'Downpayment'}</Text>
                        <Text style={styles.detailValue}>{dp.full ? `Pay in full · ${formatCurrency(dp.amount)}` : formatCurrency(dp.amount)}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Amount paid</Text>
                        <Text style={styles.detailValue}>
                          {dp.paid ? `${formatCurrency(dp.amount)} · ${downpaymentMethodLabel(dp.method)}${dp.paidOnline ? ' (simulated e-wallet)' : ''}` : formatCurrency(0)}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Balance due</Text>
                        <Text style={[styles.detailValue, { fontFamily: fonts.bodySemiBold }]}>
                          {formatCurrency(dp.paid && dp.status === 'paid' ? dp.balance : dp.total)}
                        </Text>
                      </View>
                      {dp.status === 'pending' && !!dp.dueAt && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>{dp.overdue ? 'Was due' : 'Due by'}</Text>
                          <Text style={[styles.detailValue, dp.overdue && { color: '#B3261E', fontFamily: fonts.bodySemiBold }]}>
                            {formatDueDate(dp.dueAt)}
                          </Text>
                        </View>
                      )}
                      {dp.status === 'paid' && !!dp.recordedByName && !dp.paidOnline && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Recorded by</Text>
                          <Text style={styles.detailValue}>{dp.recordedByName}</Text>
                        </View>
                      )}
                      {dp.overdue && (
                        <Text style={styles.dpOverdueText}>
                          Not paid by the deadline. You may release the room (decline or cancel this booking), or record the downpayment if the guest pays now.
                        </Text>
                      )}
                      {dp.awaiting && (
                        <TouchableOpacity
                          style={[styles.dpRecordBtn, isActing && styles.actionButtonDisabled]}
                          onPress={() => openRecordDownpayment(item)}
                          disabled={isActing}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="wallet-outline" size={15} color={colors.white} />
                          <Text style={styles.actionButtonText}>Record Downpayment</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()}

                {/* NEW: actual check-in/check-out timestamps (as opposed to
                    "Dates" above, which is the BOOKED stay range, not when
                    the guest physically arrived/left). checked_in_at/
                    checked_out_at were already being recorded on every
                    check-in/check-out action — this just surfaces them.
                    Each row only appears once that event has actually
                    happened, so a still-upcoming reservation shows neither,
                    a checked-in one shows just "Checked In", and a
                    checked-out one shows both. */}
                {!!item.checkedInAt && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Checked In</Text>
                    <Text style={styles.detailValue}>{formatDateTime(item.checkedInAt)}</Text>
                  </View>
                )}
                {!!item.checkedOutAt && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Checked Out</Text>
                    <Text style={styles.detailValue}>{formatDateTime(item.checkedOutAt)}</Text>
                  </View>
                )}

                {activeTab === 'reservations:refunds' && (
                  <>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Refund via</Text>
                      <Text style={styles.detailValue}>{refundViaLabel(item)}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Refund amount</Text>
                      <Text style={styles.detailValue}>
                        {formatCurrency(refundAmount(item))}{getDownpaymentInfo(item).applies ? (getDownpaymentInfo(item).full ? ' (full payment)' : ' (downpayment)') : ''}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Requested</Text>
                      <Text style={styles.detailValue}>
                        {item.refundRequestedAt ? new Date(item.refundRequestedAt).toLocaleString() : '—'}
                      </Text>
                    </View>
                  </>
                )}

                {!!extension && (
                  <View style={styles.extensionPanel}>
                    <View style={styles.extensionHeader}>
                      <Ionicons name="calendar-number-outline" size={15} color="#2C5EA8" />
                      <Text style={styles.extensionTitle}>
                        Extension request: +{extension.extraNights} night{extension.extraNights === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={styles.extensionText}>
                      New check-out {new Date(extension.newCheckOut).toLocaleDateString()} · {formatCurrency(extension.amount)} added to folio
                    </Text>
                    <Text style={styles.extensionMeta}>
                      Requested {new Date(extension.requestedAt).toLocaleString()}
                    </Text>
                    <View style={[styles.pendingActionsRow, { marginTop: spacing.sm }]}>
                      <TouchableOpacity
                        style={[styles.pendingActionBtn, styles.declineBtn]}
                        onPress={() => handleDeclineExtension(item, extension)}
                        activeOpacity={0.85}
                        disabled={isActing}
                        accessibilityLabel="Decline extension"
                      >
                        <Ionicons name="close" size={14} color={colors.danger} />
                        <Text style={styles.declineBtnText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pendingActionBtn, styles.confirmBtn]}
                        onPress={() => handleApproveExtension(item, extension)}
                        activeOpacity={0.85}
                        disabled={isActing}
                        accessibilityLabel="Approve extension"
                      >
                        {isActing
                          ? <ActivityIndicator color={colors.white} size="small" />
                          : (
                            <>
                              <Ionicons name="checkmark" size={14} color={colors.white} />
                              <Text style={styles.confirmBtnText}>Approve</Text>
                            </>
                          )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {showCheckIn && (
                  <View style={styles.checkInRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.noShowButton, isActing && styles.actionButtonDisabled]}
                      onPress={() => handleNoShow(item)}
                      activeOpacity={0.85}
                      disabled={isActing}
                    >
                      <View style={styles.actionButtonContent}>
                        <Ionicons name="person-remove-outline" size={16} color="#B3261E" />
                        <Text style={[styles.actionButtonText, styles.noShowButtonText]}>No Show</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.checkInButton, styles.checkInRowMain, isActing && styles.actionButtonDisabled]}
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
                  </View>
                )}

                {showCheckOut && (() => {
                  const due = checkoutDueInfo(item.checkOut);
                  return (
                    <View style={styles.checkoutDueRow}>
                      <Ionicons name={due.icon} size={14} color={due.color} />
                      <Text style={[styles.checkoutDueText, { color: due.color }]}>{due.label}</Text>
                    </View>
                  );
                })()}

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

                {showMarkRefunded && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.refundButton, isActing && styles.actionButtonDisabled]}
                    onPress={() => handleMarkRefunded(item)}
                    activeOpacity={0.85}
                    disabled={isActing}
                  >
                    {isActing
                      ? <ActivityIndicator color={colors.white} size="small" />
                      : (
                        <View style={styles.actionButtonContent}>
                          <Ionicons name="cash-outline" size={16} color={colors.white} />
                          <Text style={styles.actionButtonText}>Mark as Refunded</Text>
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
                  <Text style={styles.dialogCancelText}>{dialogState.cancelLabel || 'Cancel'}</Text>
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

      {/* Outstanding-balance checkpoint — shown instead of the plain
          checkout confirm when the guest's folio still has money owed.
          "Collect Payment" is the recommended path (opens
          RecordPaymentModal right here); "Check Out Anyway" stays
          available but is visually de-emphasized so it's a deliberate
          choice, not the path of least resistance. */}
      <Modal visible={!!checkoutWarning} transparent animationType="fade" onRequestClose={() => setCheckoutWarning(null)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            {!!checkoutWarning && (() => {
              const { item, folio } = checkoutWarning;
              const balanceStyle = BALANCE_STATUS_STYLE[folio.billingStatus] || BALANCE_STATUS_STYLE.unpaid;
              const roomLabel = getRoomNumbersForFolio(item).join(', ');
              return (
                <>
                  <View style={[styles.dialogIconWrap, { backgroundColor: balanceStyle.bg }]}>
                    <Ionicons name="alert-circle" size={26} color={balanceStyle.accent} />
                  </View>

                  <Text style={styles.dialogTitle}>Outstanding Balance</Text>
                  <Text style={styles.balanceDialogSubtitle}>
                    {item.roomType || 'Reservation'} · {getGuestName(item)}
                  </Text>

                  <Text style={styles.balanceDialogAmount}>{formatCurrency(folio.remainingBalance)}</Text>
                  <View style={[styles.balancePill, { backgroundColor: balanceStyle.bg }]}>
                    <Text style={[styles.balancePillText, { color: balanceStyle.accent }]}>
                      {balanceStyle.label.toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.dialogMessage}>
                    Collect it now, or check out anyway and settle it later.
                  </Text>

                  <DialogHoverButton
                    style={[styles.dialogConfirmBtn, styles.balanceDialogCollectBtn]}
                    hoverStyle={styles.balanceDialogCollectBtnHovered}
                    onPress={() => {
                      setCheckoutWarning(null);
                      setRecordPaymentFolio(folio);
                    }}
                  >
                    <Ionicons name="cash-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
                    <Text style={styles.dialogConfirmText}>Collect Payment</Text>
                  </DialogHoverButton>

                  <View style={[styles.dialogActions, { marginTop: spacing.sm }]}>
                    <DialogHoverButton
                      style={styles.dialogCancelBtn}
                      hoverStyle={styles.dialogCancelBtnHovered}
                      onPress={() => setCheckoutWarning(null)}
                    >
                      <Text style={styles.dialogCancelText}>Cancel</Text>
                    </DialogHoverButton>
                    <DialogHoverButton
                      style={[styles.dialogCancelBtn, styles.checkoutAnywayBtn]}
                      hoverStyle={styles.checkoutAnywayBtnHovered}
                      onPress={handleCheckOutWithBalance}
                    >
                      <Text style={[styles.dialogCancelText, styles.checkoutAnywayText]}>Check Out Anyway</Text>
                    </DialogHoverButton>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Record Downpayment (pay-at-hotel) */}
      <Modal visible={!!downpaymentTarget} transparent animationType="fade" onRequestClose={() => !recordingDownpayment && setDownpaymentTarget(null)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            {!!downpaymentTarget && (() => {
              const { item } = downpaymentTarget;
              const dp = getDownpaymentInfo(item);
              return (
                <>
                  <View style={[styles.dialogIconWrap, styles.dialogIconWrapDefault]}>
                    <Ionicons name="wallet" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.dialogTitle}>Record downpayment</Text>
                  <Text style={styles.balanceDialogSubtitle}>{getGuestName(item)} · {getReferenceNumber(item.id)}</Text>
                  <Text style={styles.balanceDialogAmount}>{formatCurrency(dp.amount)}</Text>
                  <Text style={styles.dialogMessage}>
                    Balance after this: {formatCurrency(dp.balance)}, payable at check-in or check-out. It will be counted on the guest's bill at check-in.
                  </Text>
                  <Text style={styles.dpMethodLabel}>Paid with</Text>
                  <View style={styles.dpMethodRow}>
                    {[
                      { id: 'cash', label: 'Cash', icon: 'cash-outline' },
                      { id: 'gcash', label: 'GCash', icon: 'phone-portrait-outline' },
                      { id: 'card', label: 'Card', icon: 'card-outline' },
                    ].map((m) => (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.dpMethodChip, downpaymentMethod === m.id && styles.dpMethodChipActive]}
                        onPress={() => setDownpaymentMethod(m.id)}
                        disabled={recordingDownpayment}
                        activeOpacity={0.85}
                      >
                        <Ionicons name={m.icon} size={14} color={downpaymentMethod === m.id ? colors.white : colors.text} />
                        <Text style={[styles.dpMethodChipText, downpaymentMethod === m.id && { color: colors.white }]}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[styles.dialogActions, { marginTop: spacing.md }]}>
                    <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setDownpaymentTarget(null)} disabled={recordingDownpayment} activeOpacity={0.85}>
                      <Text style={styles.dialogCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dialogConfirmBtn} onPress={submitRecordDownpayment} disabled={recordingDownpayment} activeOpacity={0.85}>
                      {recordingDownpayment
                        ? <ActivityIndicator color={colors.white} size="small" />
                        : <Text style={styles.dialogConfirmText}>Record {formatCurrency(dp.amount)}</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      <RecordPaymentModal
        visible={!!recordPaymentFolio}
        folio={recordPaymentFolio}
        staffUid={staffUid}
        staffName={staffName}
        onClose={() => setRecordPaymentFolio(null)}
        onSuccess={() => {
          setRecordPaymentFolio(null);
          showToast('Payment recorded — you can check the guest out now.');
        }}
      />
    </View>
  );
}

// Pressable (not TouchableOpacity) specifically so the hover state below
// works — react-native-web fires onHoverIn/onHoverOut on Pressable for a
// mouse pointer; there's no touch equivalent, so this is simply inert
// (never fires) on a phone/tablet, no platform check needed.
function ReservationTabButton({ tab, active, count = 0, onPress }) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !active;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.tabBtn, active && styles.tabBtnActive, showHover && styles.tabBtnHovered]}
    >
      <Ionicons
        name={tab.icon}
        size={14}
        color={active ? colors.onPrimary : showHover ? colors.primary : colors.textMuted}
      />
      <Text
        numberOfLines={1}
        style={[styles.tabBtnText, active && styles.tabBtnTextActive, showHover && styles.tabBtnTextHovered]}
      >
        {tab.label}
      </Text>
      {count > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Same Pressable + onHoverIn/onHoverOut + local `hovered` state as
// ReservationTabButton above, generalized so the outstanding-balance
// dialog's three action buttons don't each need to repeat that dance —
// pass the button's resting style, its hover-only overlay style, and
// whatever's inside it (icon + text, or just text).
function DialogHoverButton({ style, hoverStyle, disabled, onPress, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[style, !disabled && hovered && hoverStyle]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  tabBarWrap: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBarContent: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  // Hover only ever fires on web (react-native-web) — mouse-only, so it
  // naturally never triggers on a touch device. Skipped entirely when the
  // tab is already active, since the active style already gives feedback.
  tabBtnHovered: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: colors.onPrimary,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    marginLeft: 2,
    backgroundColor: '#E5383B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fonts.bodySemiBold,
  },
  tabBtnTextHovered: {
    color: colors.primary,
  },

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
  checkInRow: { flexDirection: 'row', gap: spacing.sm },
  checkoutDueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  checkoutDueText: { fontSize: 12, fontFamily: fonts.bodySemiBold },
  checkInRowMain: { flex: 1 },
  noShowButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#B3261E',
    paddingHorizontal: spacing.lg,
  },
  noShowButtonText: { color: '#B3261E' },
  checkOutButton: { backgroundColor: colors.textMuted },
  // Same green as checkInButton/confirmBtn — "mark as refunded" is the
  // same kind of resolving, forward-moving action, so it gets the same
  // semantic color despite being a fresh reservation status (cancelled).
  refundButton: { backgroundColor: '#1E7B34' },
  extensionPanel: {
    marginTop: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: '#E3ECF8',
    borderWidth: 1,
    borderColor: '#C3D4EE',
  },
  extensionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Downpayment panel on each card
  dpPanel: {
    marginTop: spacing.sm, padding: spacing.sm + 2, borderRadius: radius.md,
    backgroundColor: '#FBF6EA', borderWidth: 1, borderColor: '#EBD9AE',
  },
  dpPanelOverdue: { backgroundColor: '#FDF0EF', borderColor: '#F3C7C4' },
  dpPanelHead: { flexDirection: 'row', marginBottom: 4 },
  dpBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  dpBadgeText: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, letterSpacing: 0.4 },
  dpOverdueText: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', marginTop: 4, lineHeight: 17 },
  dpRecordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.sm, paddingVertical: spacing.sm, borderRadius: 999, backgroundColor: colors.primary,
  },
  dpMethodLabel: { alignSelf: 'flex-start', fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: spacing.sm, marginBottom: 6 },
  dpMethodRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  dpMethodChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  dpMethodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dpMethodChipText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  extensionTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: '#2C5EA8' },
  extensionText: { fontSize: 12, fontFamily: fonts.body, color: colors.text, marginTop: 4 },
  extensionMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
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

  // "Check Out Anyway" on the outstanding-balance checkpoint — same
  // shape as dialogCancelBtn, just tinted as a deliberate-but-discouraged
  // choice rather than a neutral one.
  checkoutAnywayBtn: { borderColor: colors.danger },
  checkoutAnywayText: { color: colors.danger },

  // Outstanding-balance checkpoint — room/guest context line, the big
  // peso figure that's the actual point of the dialog, and the small
  // status pill next to it (same bg/accent pairing as the Billing
  // Records status badges, via BALANCE_STATUS_STYLE above).
  balanceDialogSubtitle: {
    fontSize: 12.5,
    fontFamily: fonts.bodyMedium,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  balanceDialogAmount: {
    fontSize: 30,
    fontFamily: fonts.headingExtraBold,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  balancePill: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
    marginBottom: spacing.md,
  },
  balancePillText: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, letterSpacing: 0.4 },
  balanceDialogCollectBtn: { flexDirection: 'row', justifyContent: 'center', width: '100%' },

  // Hover overlays for the outstanding-balance dialog's three buttons,
  // applied via DialogHoverButton above. Same "darken + lift" treatment
  // RecordPaymentModal.jsx uses for its own Confirm/Cancel pair, so this
  // dialog and the payment form it opens into feel like one system.
  balanceDialogCollectBtnHovered: {
    backgroundColor: '#17662B',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  dialogCancelBtnHovered: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.textMuted,
    shadowColor: '#332B22',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // Check Out Anyway hovers into a light red wash rather than the same
  // neutral tint Cancel gets — it's still the discouraged option even on
  // hover, not just at rest.
  checkoutAnywayBtnHovered: {
    backgroundColor: 'rgba(179,38,30,0.08)',
    borderColor: colors.danger,
  },
});
