import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { submitRoomReview, fetchReviewedIds } from '../../utils/ReviewsService';
import RatingModal from '../../components/shared/RatingModal';
import ExtendStayModal from './ExtendStayModal';
import GuestNotificationBell from '../../components/shared/GuestNotificationBell';
import Appfooter from '../../components/shared/Appfooter';
import {
  getDownpaymentInfo, downpaymentBadge, downpaymentReminder, downpaymentMethodLabel,
  useDownpaymentSettings, formatDueDate,
} from '../../utils/downpayment';
import {
  fetchMyLatestExtensions,
  cancelStayExtension,
  subscribeToStayExtensions,
} from '../../utils/StayExtensionService';
import { useTheme } from '../../context/ThemeContext';

/**
 * MyReservationsScreen — shows every reservation tied to the logged-in
 * guest's account, newest-first, in expandable cards.
 *
 * MIGRATED TO SUPABASE. Notes on what changed:
 *  - Auth: fetches the current user via supabase.auth.getUser() (async —
 *    there's no synchronous getAuth().currentUser equivalent).
 *  - Fetched rows are mapped from Postgres snake_case to the same
 *    camelCase shape the Firestore version used (checkIn, selectedRooms,
 *    totalAmount, etc.) right after fetching — every helper function
 *    below (guestName, roomLabel, statusMeta, canCancel...) and all the
 *    JSX stayed unchanged as a result.
 *  - FIXED BUG: rateLabel() used to read `room.rate`, but
 *    ReviewPayScreen's submitReservation() actually writes `room.price`
 *    on each selected_rooms entry — this mismatch meant the "Selected
 *    rate" detail was likely always showing ₱0.00. Now reads the field
 *    that's actually written.
 *  - Cancelling no longer touches rooms.status at all. A booking holds
 *    a room through the reservation row itself (see
 *    sql/prevent_double_booking.sql), so setting status 'cancelled' is
 *    what frees it. The old "release" set the room to VACANT, which could
 *    wrongly mark a room vacant while another guest was staying in it.
 *  - Adults/Children breakdown removed from the expanded details: the
 *    new reservations schema only stores a single guest_count (total),
 *    not the per-room adults/children split the old `totals` object on
 *    the Firestore doc had — that granularity wasn't carried over during
 *    the ReviewPayScreen migration. Shows "Guests: N" instead.
 *
 * RESOLVED: reservationToCamel() below never mapped checked_in_at/
 * checked_out_at, even though those columns were already being written
 * by Front Desk on every check-in/check-out (see ReservationsScreen.jsx's
 * handleCheckIn/handleCheckOut) — this screen just never pulled them off
 * the row. Added below, plus a new "Checked in at"/"Checked out at" pair
 * in the expanded details, so guests can see exactly when they arrived/
 * left, not just the booked stay dates (the existing "Check-in"/
 * "Check-out" summary fields, which are unchanged and still show the
 * reserved date range, not the actual event time).
 *
 * Props:
 *  - onBack: () => void
 *  - onViewReservation?: (reservation) => void   // optional deep-link out
 */
// focusReservationId: open the screen AT this booking (from a notification
// tap) — it's expanded, scrolled into view and briefly highlighted, in the
// main list or in Reservation History. onFocusHandled() lets the parent
// clear it so a later visit opens normally.
// REDESIGNED (Oct 2026) to match the Home page: dark top bar + hero, Inter
// type, gold actions, clean cards, shared footer. Logic is unchanged.
const BAR_BG = '#17120E';
const HERO_TEXT = '#F7F2EA';
const GOLD = '#C9A14A';
const GOLD_LIGHT = '#F0D58E';
const F = {
  display: 'Inter_800ExtraBold',
  bold: 'Inter_700Bold',
  semi: 'Inter_600SemiBold',
  medium: 'Inter_500Medium',
  body: 'Inter_400Regular',
};
const web = (style) => (Platform.OS === 'web' ? style : null);

export default function MyReservationsScreen({ onBack, onViewReservation, focusReservationId, onFocusHandled }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isTablet = width >= 640;

  const { colors, spacing, radius, fonts, isDark } = useTheme();
  const styles = useMemo(
    () => getStyles(colors, spacing, radius, fonts, { isWide, isTablet, isDark }),
    [colors, spacing, radius, fonts, isWide, isTablet, isDark]
  );

  const [reservations, setReservations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState('');
  const [expandedId, setExpandedId]     = useState(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyExpandedId, setHistoryExpandedId] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false); // first successful fetch done

  // ── Jump to a booking (notification → "View in My Reservations") ──
  const [localFocusId, setLocalFocusId] = useState(null); // from the bell on THIS screen
  const [highlightId, setHighlightId]   = useState(null);
  const mainScrollRef    = useRef(null);
  const historyScrollRef = useRef(null);
  const cardOffsetsRef   = useRef({});   // `${list}:${id}` -> y inside the list
  const listPadOffsetRef = useRef({ main: 0, history: 0 });

  // Which of this guest's checked-out reservations already have a room
  // rating submitted — hides the "Rate your stay" prompt for those.
  const [reviewedReservationIds, setReviewedReservationIds] = useState(new Set());
  const [ratingTarget, setRatingTarget] = useState(null); // reservation being rated
  // Extend Stay: latest request per reservation ({ [reservationId]: ext })
  // and the reservation whose Extend Stay dialog is open.
  const [extensions, setExtensions] = useState({});
  const [extendTarget, setExtendTarget] = useState(null);
  const [withdrawingId, setWithdrawingId] = useState(null);

  // Checked-out and cancelled reservations are "done" — they move out of
  // the main list and into the History panel behind the ⋮ menu, so the
  // main screen only ever shows reservations still in play.
  const HISTORY_STATUSES = ['checked-out', 'cancelled'];
  const activeReservations = useMemo(
    () => reservations.filter((r) => !HISTORY_STATUSES.includes((r.status || '').toLowerCase())),
    [reservations]
  );
  const historyReservations = useMemo(
    () => reservations.filter((r) => HISTORY_STATUSES.includes((r.status || '').toLowerCase())),
    [reservations]
  );

  // Jump to the booking a notification is about: expand it, scroll it into
  // view and highlight it for a few seconds. Works for the main list and for
  // Reservation History (cancelled / checked-out bookings). Timers live in a
  // ref, not the effect cleanup, because clearing the focus id re-runs this
  // effect and would otherwise cancel the scroll before it happens.
  const focusTimersRef = useRef([]);
  useEffect(() => () => focusTimersRef.current.forEach(clearTimeout), []);
  const focusId = localFocusId || focusReservationId || null;
  useEffect(() => {
    if (!focusId || !hasLoaded) return;
    const inMain = activeReservations.some((r) => r.id === focusId);
    const inHistory = !inMain && historyReservations.some((r) => r.id === focusId);
    setLocalFocusId(null);
    onFocusHandled && onFocusHandled();
    if (!inMain && !inHistory) return; // not one of this guest's bookings

    const list = inMain ? 'main' : 'history';
    if (inMain) {
      setHistoryVisible(false);
      setExpandedId(focusId);
    } else {
      setHistoryVisible(true);
      setHistoryExpandedId(focusId);
    }
    setHighlightId(focusId);
    focusTimersRef.current.push(
      setTimeout(() => {
        const y = cardOffsetsRef.current[`${list}:${focusId}`];
        const scroller = (list === 'main' ? mainScrollRef : historyScrollRef).current;
        if (y != null && scroller) {
          scroller.scrollTo({ y: Math.max(0, (listPadOffsetRef.current[list] || 0) + y - 12), animated: true });
        }
      }, 450),
      setTimeout(() => setHighlightId((h) => (h === focusId ? null : h)), 4500)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, hasLoaded, activeReservations, historyReservations]);

  // Cancellation flow state
  const [cancelTarget, setCancelTarget] = useState(null); // reservation being confirmed
  const [cancelling, setCancelling]     = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // ---- AUTH SOURCE ----
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null));
  }, []);
  // -----------------------------------------------------------------

  // REMOVED: this screen used to auto-flip a stale 'checked-in' reservation
  // to 'checked-out' on its own, the moment the guest opened My
  // Reservations and their checkout date was judged far enough in the
  // past (isPastCheckout / autoResolveOverdueCheckouts, now deleted). That
  // logic is what produced a live, reproducible bug: a guest who checked
  // in at 11:28 PM was silently marked checked-out 48 minutes later, at
  // 12:16 AM, the instant the calendar flipped to their checkout date.
  // Tightening the cutoff (calendar-day compare, then a 24-hour grace
  // window past the standard noon checkout hour) fixed that specific
  // case, but per a deliberate decision, checkout is no longer inferred
  // automatically at all, at any interval. Front desk marking a guest
  // checked out (ReservationsScreen.jsx's handleCheckOut) is now the only
  // way a reservation's status/checked_out_at ever changes to
  // 'checked-out' — nothing implicit, nothing guessed from elapsed time.

  // Maps a Postgres reservations row (snake_case) to the same camelCase
  // shape the Firestore version used, so every helper/JSX below stays
  // unchanged.
  const dpSettings = useDownpaymentSettings();

  const reservationToCamel = (row) => ({
    id: row.id,
    guestEmail: row.guest_email,
    guestDetails: row.guest_details,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    selectedRooms: row.selected_rooms,
    roomType: row.room_type,
    subtotal: row.subtotal,
    tax: row.tax,
    totalAmount: row.total_amount,
    paymentMode: row.payment_mode,
    paymentStatus: row.payment_status,
    eWalletProvider: row.ewallet_provider,
    status: row.status,
    guestCount: row.guest_count,
    createdAt: row.created_at,
    // RESOLVED: these two were never mapped here, even though Front Desk
    // has been writing them on every check-in/check-out all along — see
    // the note at the top of this file.
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    // Downpayment (sql/downpayment.sql) — empty on bookings made before it.
    downpaymentAmount: row.downpayment_amount,
    downpaymentStatus: row.downpayment_status,
    downpaymentDueAt: row.downpayment_due_at,
    downpaymentPaidAt: row.downpayment_paid_at,
    downpaymentMethod: row.downpayment_method,
  });

  const fetchReservations = useCallback(async () => {
    if (!currentUser?.id) {
      setError('You need to be signed in to view your reservations.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('reservations')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;

      const docs = (data || []).map(reservationToCamel);
      setReservations(docs);
      setHasLoaded(true);
    } catch (err) {
      console.error('Failed to load reservations:', err);
      setError('Something went wrong while loading your reservations.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // Loaded once we know who's logged in — separate from fetchReservations
  // since it only needs to change when the user (or a newly-submitted
  // rating) changes, not on every pull-to-refresh of the reservation list.
  useEffect(() => {
    if (!currentUser?.id) return;
    fetchReviewedIds(currentUser.id, 'room')
      .then(setReviewedReservationIds)
      .catch((err) => console.error('Failed to load reviewed reservations:', err));
  }, [currentUser?.id]);

  // Extend Stay requests — loaded with the reservations and kept live, so
  // the card flips from "waiting for the front desk" to the new check-out
  // date the moment staff approve (the approval also changes the
  // reservation row, hence the reservation refetch alongside it).
  const loadExtensions = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setExtensions(await fetchMyLatestExtensions(currentUser.id));
    } catch (err) {
      console.error('Failed to load stay extension requests:', err);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    loadExtensions();
    return subscribeToStayExtensions(`my-stay-extensions-${currentUser.id}`, () => {
      loadExtensions();
      fetchReservations();
    });
  }, [currentUser?.id, loadExtensions, fetchReservations]);

  const handleWithdrawExtension = async (ext) => {
    setWithdrawingId(ext.id);
    try {
      await cancelStayExtension(ext.id);
      await loadExtensions();
    } catch (err) {
      console.error('Failed to withdraw extension request:', err);
    } finally {
      setWithdrawingId(null);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReservations();
    loadExtensions();
  };

  // ---------------- Formatting helpers ----------------

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      // Handles both ISO strings and Firestore Timestamps
      const d = value?.toDate ? value.toDate() : new Date(value);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  // NEW: date AND time, unlike formatDate above (date-only). Needed
  // specifically for checked_in_at/checked_out_at, which record the exact
  // moment Front Desk tapped Check In/Check Out — a plain date would lose
  // the actual time-of-day info those fields exist to capture.
  const formatDateTime = (value) => {
    if (!value) return '—';
    try {
      const d = value?.toDate ? value.toDate() : new Date(value);
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const formatCurrency = (value) => {
    const n = Number(value ?? 0);
    return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const referenceNumber = (id) => `RES-${id.slice(0, 8).toUpperCase()}`;

  const roomLabel = (r) => {
    const rooms = r.selectedRooms || [];
    if (rooms.length === 0) return 'Not yet assigned';
    return rooms.map((room) => room.roomNumber ?? '—').join(', ');
  };

  const rateLabel = (r) => {
    const rooms = r.selectedRooms || [];
    if (rooms.length === 0) return '—';
    // FIXED: was reading room.rate, but selected_rooms entries actually
    // have a `price` field (see submitReservation() in ReviewPayScreen)
    // — this was likely always showing ₱0.00 before.
    if (rooms.length === 1) return formatCurrency(rooms[0].price);
    return rooms.map((room) => formatCurrency(room.price)).join(' + ');
  };

  const guestName = (r) => {
    if (r.guestDetails?.firstName || r.guestDetails?.lastName) {
      return `${r.guestDetails.firstName || ''} ${r.guestDetails.lastName || ''}`.trim();
    }
    return r.guestName || '—';
  };

  // Human-readable labels for known e-wallet providers. Add more here as
  // new providers get wired up in ReviewPayScreen/submitReservation.
  const EWALLET_LABELS = {
    gcash: 'GCash',
    maya: 'Maya',
    maribank: 'Maribank',
    gotyme: 'GoTyme',
  };

  /**
   * submitReservation() writes `paymentMode` ('online' | 'cash' | ...)
   * and, for online payments, `eWalletProvider` (e.g. 'gcash') — it does
   * NOT write a top-level `paymentMethod` field. This maps those actual
   * fields to a display label, while still checking the legacy
   * `paymentMethod` / `guestDetails.paymentMethod` fields first in case
   * any older reservations used them.
   */
  const paymentMethod = (r) => {
    if (r.paymentMethod || r.guestDetails?.paymentMethod) {
      return r.paymentMethod || r.guestDetails?.paymentMethod;
    }

    const mode = (r.paymentMode || '').toLowerCase();
    if (mode === 'online') {
      const provider = (r.eWalletProvider || '').toLowerCase();
      return `${EWALLET_LABELS[provider] || (r.eWalletProvider ? r.eWalletProvider : 'E-wallet')} (simulated)`;
    }
    if (mode === 'cash') return 'Cash on arrival';
    if (mode === 'hotel') return 'Pay at Hotel';
    if (mode) return mode.charAt(0).toUpperCase() + mode.slice(1);

    return '—';
  };

  const contactNumber = (r) => r.guestDetails?.phone || r.guestPhone || '—';
  const emailAddress = (r) => r.guestDetails?.email || r.guestEmail || '—';

  const statusMeta = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'upcoming':    return { label: 'Confirmed',             bg: '#E3ECF8', text: '#2C5EA8' };
      case 'pending':     return { label: 'Awaiting confirmation', bg: '#FFF4D6', text: '#8A6A00' };
      case 'checked-in':  return { label: 'Checked in',            bg: '#DFF5E1', text: '#1E7B34' };
      case 'checked-out': return { label: 'Checked out',           bg: colors.cardAlt, text: colors.textMuted };
      case 'cancelled':   return { label: 'Cancelled',   bg: '#FCE1E1', text: '#B3261E' };
      default:            return { label: status || 'Unknown', bg: colors.cardAlt, text: colors.textMuted };
    }
  };

  // Cancellable up until check-in status-wise ('pending'/'upcoming'). The
  // 24hr cancel/refund window only applies to guests who paid online
  // (e-wallet) — there's real money to refund for those, which is what
  // the policy is actually protecting. A "Pay at Hotel" booking has no
  // payment on file yet, so restricting it the same way would just block
  // a guest from cancelling a booking nothing was ever charged for —
  // those stay cancellable anytime up to check-in, same as before.
  // 24-hour cancellation/refund window, measured from when the booking
  // was made (createdAt). For a quick test of the refund flow you can
  // temporarily set this to 1 * 60 * 1000 (1 minute) — but change it back.
  const CANCEL_WINDOW_MS = (dpSettings.cancelWindowHours || 24) * 60 * 60 * 1000; // 24 hours (booking_settings)
  const isOnlinePaid = (r) => (r.paymentMode || '').toLowerCase() === 'online';
  const withinCancelWindow = (r) => {
    if (!r.createdAt) return false;
    const bookedAt = new Date(r.createdAt).getTime();
    if (isNaN(bookedAt)) return false;
    return Date.now() - bookedAt < CANCEL_WINDOW_MS;
  };
  const canCancel = (r) => {
    if (!['pending', 'upcoming'].includes((r.status || '').toLowerCase())) return false;
    if (!isOnlinePaid(r)) return true; // pay-at-hotel: no 24hr restriction
    return withinCancelWindow(r);
  };
  // Distinguishes "not cancellable because already checked-in/out" from
  // "not cancellable because the 24hr refund window passed" (online-paid
  // only) — the latter gets its own explanatory note instead of just
  // silently hiding the button.
  const cancelWindowExpired = (r) =>
    ['pending', 'upcoming'].includes((r.status || '').toLowerCase()) &&
    isOnlinePaid(r) &&
    !withinCancelWindow(r);

  // ---------------- Cancellation workflow ----------------

  const requestCancel = (reservation) => setCancelTarget(reservation);
  const dismissCancelDialog = () => {
    if (!cancelling) setCancelTarget(null);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      // Same eligibility check already shown to the guest in the confirm
      // dialog below ("...this qualifies for a refund") — flag it here so
      // it's actually queryable afterward. Front Desk/Admin's "Refunds
      // Pending" view (ReservationsScreen.jsx, filterKey
      // 'reservations:refunds') reads refund_status directly off this row.
      // With a downpayment, only what was actually paid is refundable, and
      // only inside the window. Older bookings (no downpayment) keep the
      // original rule: online-paid and inside the window.
      const dp = getDownpaymentInfo(cancelTarget);
      const refundEligible = dp.applies
        ? dp.status === 'paid' && withinCancelWindow(cancelTarget)
        : isOnlinePaid(cancelTarget) && withinCancelWindow(cancelTarget);
      const { error } = await supabase
        .from('reservations')
        .update({
          status: 'cancelled', // updated_at trigger covers the "when" automatically
          ...(refundEligible
            ? {
                refund_status: 'pending',
                refund_requested_at: new Date().toISOString(),
                ...(dp.applies ? { downpayment_status: 'refund_pending' } : {}),
              }
            : {}),
        })
        .eq('id', cancelTarget.id);
      if (error) throw error;

      setCancelTarget(null);
      setSuccessMessage(
        refundEligible
          ? dp.applies
            ? `Your reservation has been cancelled. Your downpayment refund of ${formatCurrency(dp.amount)} is being processed by our front desk team.`
            : 'Your reservation has been cancelled. Your refund is being processed by our front desk team.'
          : 'Your reservation has been cancelled.'
      );
      await fetchReservations();
    } catch (err) {
      console.error('Cancellation failed:', err);
      setError('We couldn’t cancel that reservation. Please try again.');
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  };

  // ---------------- Card renderer (shared by main list + history modal) --

  const renderReservationCard = (r, { expandedIdState, setExpandedIdState, listKey = 'main' }) => {
    const meta = statusMeta(r.status);
    const expanded = expandedIdState === r.id;
    const isCheckedIn = r.status === 'checked-in';
    const ext = isCheckedIn ? extensions[r.id] : null;
    const extPending = ext?.status === 'pending';
    return (
      <View
        key={r.id}
        style={[styles.card, highlightId === r.id && styles.cardHighlighted]}
        onLayout={(e) => { cardOffsetsRef.current[`${listKey}:${r.id}`] = e.nativeEvent.layout.y; }}
      >
        {/* Summary */}
        <View style={styles.resHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.resTitle} numberOfLines={1}>{r.roomType || 'Reservation'}</Text>
            <Text style={styles.resId}>{referenceNumber(r.id)}  ·  {guestName(r)}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>

        <View style={styles.stayStrip}>
          <View style={styles.stayCol}>
            <Text style={styles.stayLabel}>Check-in</Text>
            <Text style={styles.stayValue}>{formatDate(r.checkIn)}</Text>
          </View>
          <View style={styles.stayArrow}>
            <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
            <Text style={styles.stayNights}>{r.nights ?? '—'} night{r.nights === 1 ? '' : 's'}</Text>
          </View>
          <View style={styles.stayCol}>
            <Text style={styles.stayLabel}>Check-out</Text>
            <Text style={styles.stayValue}>{formatDate(r.checkOut)}</Text>
          </View>
          <View style={[styles.stayCol, styles.stayTotal]}>
            <Text style={styles.stayLabel}>Total</Text>
            <Text style={styles.stayTotalValue}>{formatCurrency(r.totalAmount)}</Text>
          </View>
        </View>

        {/* Downpayment status, amount, balance and due date */}
        {(() => {
          const dp = getDownpaymentInfo(r);
          const badge = downpaymentBadge(dp);
          if (!badge) return null;
          const beforeCheckIn = ['pending', 'upcoming'].includes((r.status || '').toLowerCase());
          return (
            <View style={styles.dpStrip}>
              <View style={styles.dpStripTop}>
                <View style={[styles.dpBadge, { backgroundColor: badge.bg }]}>
                  <Ionicons name={badge.icon} size={13} color={badge.text} />
                  <Text style={[styles.dpBadgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
                <Text style={styles.dpAmounts}>
                  {formatCurrency(dp.amount)} downpayment · {formatCurrency(dp.balance)} balance at the hotel
                </Text>
              </View>
              {dp.status === 'pending' && beforeCheckIn && !!dp.dueAt && (
                <Text style={[styles.dpLine, dp.overdue && { color: colors.danger }]}>
                  {dp.overdue
                    ? `The downpayment was due ${formatDueDate(dp.dueAt)}. Please pay at the front desk as soon as possible — your room may be released.`
                    : `Downpayment required: ${formatCurrency(dp.amount)}, pay at the front desk by ${formatDueDate(dp.dueAt)}.`}
                </Text>
              )}
              {dp.status === 'paid' && !!dp.paidAt && (
                <Text style={styles.dpLine}>
                  Paid {formatDateTime(dp.paidAt)} via {downpaymentMethodLabel(dp.method)}
                  {(r.paymentMode || '').toLowerCase() === 'online' ? ' (simulated)' : ''}.
                </Text>
              )}
              {dp.status === 'refund_pending' && (
                <Text style={styles.dpLine}>Your downpayment refund of {formatCurrency(dp.amount)} is being processed by the front desk.</Text>
              )}
              {beforeCheckIn && (
                <Text style={styles.dpReminder}>
                  {downpaymentReminder({ amount: dp.amount, balance: dp.balance, cancelWindowHours: dpSettings.cancelWindowHours })}
                </Text>
              )}
            </View>
          );
        })()}

        {/* Expanded details */}
        {expanded && (
          <View style={styles.detailsBlock}>
            <View style={styles.divider} />
            <View style={styles.resGrid}>
              <SummaryItem label="Booking date" value={formatDate(r.createdAt)} styles={styles} />
              <SummaryItem label="Guests" value={r.guestCount ?? '—'} styles={styles} />
              <SummaryItem label="Rooms" value={r.selectedRooms?.length ?? 0} styles={styles} />
              <SummaryItem label="Selected rate" value={rateLabel(r)} styles={styles} />
              <SummaryItem label="Payment method" value={paymentMethod(r)} styles={styles} />
              {getDownpaymentInfo(r).applies && (
                <>
                  <SummaryItem label="Downpayment" value={formatCurrency(getDownpaymentInfo(r).amount)} styles={styles} />
                  <SummaryItem label="Balance at the hotel" value={formatCurrency(getDownpaymentInfo(r).balance)} styles={styles} />
                </>
              )}
              <SummaryItem label="Email" value={emailAddress(r)} styles={styles} />
              <SummaryItem label="Contact number" value={contactNumber(r)} styles={styles} />
              {/* NEW: actual arrival/departure timestamps — distinct from
                  the "Check-in"/"Check-out" fields in the summary row
                  above, which show the BOOKED stay dates, not when the
                  guest actually walked in or out. Each only appears once
                  that event has really happened. */}
              {!!r.checkedInAt && (
                <SummaryItem label="Checked in at" value={formatDateTime(r.checkedInAt)} styles={styles} />
              )}
              {!!r.checkedOutAt && (
                <SummaryItem label="Checked out at" value={formatDateTime(r.checkedOutAt)} styles={styles} />
              )}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => setExpandedIdState(expanded ? null : r.id)}
          >
            <Text style={styles.linkButtonText}>
              {expanded ? 'Hide details' : 'View details'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={styles.linkButtonText.color}
            />
          </TouchableOpacity>

          <View style={styles.actionsRight}>
          {canCancel(r) && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => requestCancel(r)}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelButtonText}>Cancel reservation</Text>
            </TouchableOpacity>
          )}

          {isCheckedIn && !extPending && (
            <TouchableOpacity
              style={styles.rateButton}
              onPress={() => setExtendTarget(r)}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={14} color="#231B12" />
              <Text style={styles.rateButtonText}>Extend stay</Text>
            </TouchableOpacity>
          )}

          {r.status === 'checked-out' && (
            reviewedReservationIds.has(r.id) ? (
              <View style={styles.ratedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={colors.text} />
                <Text style={styles.ratedBadgeText}>Rated</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.rateButton}
                onPress={() => setRatingTarget(r)}
                activeOpacity={0.85}
              >
                <Ionicons name="star-outline" size={14} color="#231B12" />
                <Text style={styles.rateButtonText}>Rate your stay</Text>
              </TouchableOpacity>
            )
          )}
          </View>
        </View>

        {extPending && (
          <View style={styles.extensionNote}>
            <Ionicons name="time-outline" size={16} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.extensionNoteTitle}>
                Extension requested: +{ext.extraNights} night{ext.extraNights === 1 ? '' : 's'}
              </Text>
              <Text style={styles.extensionNoteText}>
                New check-out {formatDate(ext.newCheckOut)} · {formatCurrency(ext.amount)} · waiting for the front desk to confirm.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleWithdrawExtension(ext)}
              disabled={withdrawingId === ext.id}
              accessibilityLabel="Withdraw extension request"
            >
              {withdrawingId === ext.id
                ? <ActivityIndicator size="small" color={colors.textMuted} />
                : <Text style={styles.extensionWithdraw}>Withdraw</Text>}
            </TouchableOpacity>
          </View>
        )}

        {ext?.status === 'declined' && (
          <View style={styles.cancelExpiredNote}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
            <Text style={styles.cancelExpiredNoteText}>
              Your last extension request was declined{ext.declineReason ? `: ${ext.declineReason}` : '.'}
            </Text>
          </View>
        )}

        {cancelWindowExpired(r) && (
          <View style={styles.cancelExpiredNote}>
            <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
            <Text style={styles.cancelExpiredNoteText}>24-hour refund window has passed for this online payment</Text>
          </View>
        )}
      </View>
    );
  };

  // ---------------- Render ----------------

  return (
    <View style={styles.screen}>
      {/* Top bar */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={HERO_TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Reservations</Text>
          <View style={styles.headerActions}>
            <GuestNotificationBell
              iconColor={HERO_TEXT}
              badgeBorderColor={BAR_BG}
              onViewBooking={(id) => id && setLocalFocusId(id)}
            />
            <TouchableOpacity
              onPress={() => setHistoryVisible(true)}
              style={styles.historyButton}
              accessibilityRole="button"
              accessibilityLabel="Reservation history"
            >
              <Ionicons name="time-outline" size={16} color={HERO_TEXT} />
              {isTablet && <Text style={styles.historyButtonText}>History</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        ref={mainScrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            <Text style={styles.heroTitle} accessibilityRole="header">My reservations</Text>
            <Text style={styles.heroLead}>
              {loading
                ? 'Loading your bookings…'
                : activeReservations.length === 0
                  ? 'No current bookings. Past and cancelled stays are in History.'
                  : `${activeReservations.length} current booking${activeReservations.length === 1 ? '' : 's'}. Past and cancelled stays are in History.`}
            </Text>
          </View>
        </View>

        {/* list offset is measured here (relative to the scroll content) so a
            notification tap still scrolls to the right card */}
        <View onLayout={(e) => { listPadOffsetRef.current.main = e.nativeEvent.layout.y; }}>
        <View style={styles.wideContainer}>
          <View style={styles.contentPad}>

            {loading ? (
              <View style={styles.centerBlock}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.helperText}>Loading your reservations…</Text>
              </View>
            ) : error ? (
              <View style={styles.messageCard}>
                <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                <Text style={styles.messageText}>{error}</Text>
              </View>
            ) : activeReservations.length === 0 ? (
              <View style={styles.messageCard}>
                <Ionicons name="calendar-outline" size={22} color={colors.textMuted} />
                <Text style={styles.messageText}>
                  You don't have any active reservations right now.
                </Text>
              </View>
            ) : (
              activeReservations.map((r) =>
                renderReservationCard(r, { expandedIdState: expandedId, setExpandedIdState: setExpandedId, listKey: 'main' })
              )
            )}
          </View>
        </View>
        </View>

        <Appfooter />
      </ScrollView>

      {/* History panel */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
        presentationStyle="fullScreen"
      >
        <View style={styles.screen}>
          <View style={styles.header}>
            <View style={styles.headerInner}>
              <TouchableOpacity
                onPress={() => setHistoryVisible(false)}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Close history"
              >
                <Ionicons name="arrow-back" size={20} color={HERO_TEXT} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Reservation History</Text>
              <View style={styles.headerSpacer} />
            </View>
          </View>
          <ScrollView ref={historyScrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.wideContainer} onLayout={(e) => { listPadOffsetRef.current.history = e.nativeEvent.layout.y; }}>
              <View style={styles.contentPad}>
                {historyReservations.length === 0 ? (
                  <View style={styles.messageCard}>
                    <Ionicons name="time-outline" size={22} color={colors.textMuted} />
                    <Text style={styles.messageText}>
                      Completed or cancelled reservations will show up here.
                    </Text>
                  </View>
                ) : (
                  historyReservations.map((r) =>
                    renderReservationCard(r, { expandedIdState: historyExpandedId, setExpandedIdState: setHistoryExpandedId, listKey: 'history' })
                  )
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Cancellation confirmation dialog */}
      <Modal
        visible={!!cancelTarget}
        transparent
        animationType="fade"
        onRequestClose={dismissCancelDialog}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="warning-outline" size={28} color={colors.danger} style={{ marginBottom: spacing.sm }} />
            <Text style={styles.modalTitle}>Cancel this reservation?</Text>
            <Text style={styles.modalBody}>
              {cancelTarget
                ? (() => {
                    const dp = getDownpaymentInfo(cancelTarget);
                    let refundNote = '';
                    if (dp.applies) {
                      if (dp.status === 'paid' && withinCancelWindow(cancelTarget)) {
                        refundNote = ` You're within the ${dpSettings.cancelWindowHours}-hour cancellation window, so your downpayment of ${formatCurrency(dp.amount)} qualifies for a refund.`;
                      } else if (dp.status === 'paid') {
                        refundNote = ` The ${dpSettings.cancelWindowHours}-hour refund window has passed, so the downpayment of ${formatCurrency(dp.amount)} is not refundable.`;
                      }
                    } else if ((cancelTarget.paymentMode || '').toLowerCase() === 'online') {
                      refundNote = " You're within the 24-hour cancellation window, so this qualifies for a refund.";
                    }
                    return `This will cancel ${referenceNumber(cancelTarget.id)} and release the assigned room(s).${refundNote} This can't be undone.`;
                  })()
                : ''}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={dismissCancelDialog}
                disabled={cancelling}
              >
                <Text style={styles.modalButtonSecondaryText}>Keep reservation</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger]}
                onPress={confirmCancel}
                disabled={cancelling}
              >
                {cancelling
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.modalButtonDangerText}>Yes, cancel</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success toast */}
      <Modal
        visible={!!successMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessMessage('')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle-outline" size={28} color="#1E7B34" style={{ marginBottom: spacing.sm }} />
            <Text style={styles.modalTitle}>Reservation Cancelled</Text>
            <Text style={styles.modalBody}>{successMessage}</Text>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonPrimary, { marginTop: spacing.md }]}
              onPress={() => setSuccessMessage('')}
            >
              <Text style={styles.modalButtonPrimaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ExtendStayModal
        visible={!!extendTarget}
        reservation={extendTarget}
        onClose={() => setExtendTarget(null)}
        onSubmitted={() => loadExtensions()}
      />

      <RatingModal
        visible={!!ratingTarget}
        onClose={() => setRatingTarget(null)}
        subjectTitle={ratingTarget ? (ratingTarget.roomType || 'Your Room') : ''}
        subjectSubtitle={ratingTarget ? `${formatDate(ratingTarget.checkIn)} — ${formatDate(ratingTarget.checkOut)}` : ''}
        onSubmit={async (rating, comment) => {
          await submitRoomReview({
            userId: currentUser.id,
            guestName: guestName(ratingTarget),
            reservationId: ratingTarget.id,
            subjectLabel: `${ratingTarget.roomType || 'Room'} (${roomLabel(ratingTarget)})`,
            rating,
            comment,
          });
          setReviewedReservationIds((prev) => new Set(prev).add(ratingTarget.id));
        }}
      />
    </View>
  );
}

function SummaryItem({ label, value, styles }) {
  return (
    <View style={styles.resItem}>
      <Text style={styles.resItemLabel}>{label}</Text>
      <Text style={styles.resItemValue}>{String(value)}</Text>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts, { isWide, isTablet, isDark }) {
  const gutter = isTablet ? 32 : 20;
  const cardShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 14px 34px rgba(0,0,0,0.35)'
    : '0 1px 2px rgba(43,36,28,0.06), 0 14px 34px rgba(43,36,28,0.09)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,36,28,0.08)';
  const goldText = isDark ? GOLD_LIGHT : '#6B4E1E';
  const goldButton = {
    backgroundColor: '#DDBB6C',
    ...web({
      backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
      boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 6px 18px rgba(201,161,74,0.28)',
    }),
  };

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, #1E1A14 0%, #17130F 100%)'
          : 'linear-gradient(180deg, #FBF8F3 0%, #F4EDE2 100%)',
      }),
    },
    scroll: { flex: 1 },

    /* Top bar */
    header: {
      backgroundColor: BAR_BG,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(247,242,234,0.08)',
      ...web({ backgroundImage: 'linear-gradient(180deg, #1B1511 0%, #17120E 100%)' }),
    },
    headerInner: {
      width: '100%', maxWidth: 1240, alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 12,
    },
    backButton: {
      width: 38, height: 38, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(247,242,234,0.08)',
      borderWidth: 1, borderColor: 'rgba(247,242,234,0.12)',
    },
    headerTitle: { fontFamily: F.semi, fontSize: 15, color: HERO_TEXT, letterSpacing: -0.2 },
    headerSpacer: { width: 38 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    historyButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 38, paddingHorizontal: isTablet ? 14 : 11, borderRadius: 12,
      backgroundColor: 'rgba(247,242,234,0.08)',
      borderWidth: 1, borderColor: 'rgba(247,242,234,0.12)',
    },
    historyButtonText: { fontFamily: F.semi, fontSize: 13, color: HERO_TEXT },

    /* Hero */
    hero: {
      backgroundColor: '#221B15',
      ...web({
        backgroundImage: [
          'radial-gradient(ellipse at 88% 10%, rgba(231,203,130,0.20) 0%, rgba(231,203,130,0) 46%)',
          'linear-gradient(160deg, #17120E 0%, #2A2119 55%, #3E2E1F 100%)',
        ].join(', '),
      }),
      paddingHorizontal: gutter,
      paddingTop: isWide ? 52 : 36,
      paddingBottom: isWide ? 56 : 36,
    },
    heroInner: { width: '100%', maxWidth: 880, alignSelf: 'center' },
    heroTitle: {
      fontFamily: F.display, fontSize: isWide ? 48 : isTablet ? 40 : 32,
      lineHeight: isWide ? 52 : isTablet ? 44 : 36, letterSpacing: isWide ? -1.7 : -1.1, color: HERO_TEXT,
    },
    heroLead: { marginTop: 10, fontFamily: F.body, fontSize: isTablet ? 16 : 15, lineHeight: 24, color: 'rgba(247,242,234,0.70)' },

    /* List */
    wideContainer: { maxWidth: 880, alignSelf: 'center', width: '100%' },
    contentPad: { paddingHorizontal: gutter, paddingTop: isWide ? 36 : 24, paddingBottom: isWide ? 64 : 40 },

    centerBlock: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },

    card: {
      backgroundColor: colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: hairline,
      padding: isTablet ? 22 : 18,
      marginBottom: 18,
      ...web({ boxShadow: cardShadow }),
    },
    cardHighlighted: {
      borderColor: GOLD,
      borderWidth: 2,
      ...web({ boxShadow: `0 0 0 4px rgba(201,161,74,0.18), ${cardShadow}` }),
    },

    helperText: { fontSize: 13, fontFamily: F.body, color: colors.textMuted, lineHeight: 19 },

    messageCard: {
      alignItems: 'center', gap: 10,
      paddingVertical: 40, paddingHorizontal: 24,
      backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
    },
    messageText: { fontSize: 14, fontFamily: F.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 380 },

    resHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    resTitle: { fontFamily: F.display, fontSize: isTablet ? 22 : 19, letterSpacing: -0.6, color: colors.text },
    resId: { marginTop: 3, fontFamily: F.medium, fontSize: 13, color: colors.textMuted },
    badge: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999 },
    badgeText: { fontSize: 12, fontFamily: F.semi },

    stayStrip: {
      marginTop: 16,
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
      columnGap: isTablet ? 22 : 14, rowGap: 12,
      padding: 14, borderRadius: 16,
      backgroundColor: colors.cardAlt,
    },
    stayCol: {},
    stayLabel: { fontFamily: F.medium, fontSize: 12, color: colors.textMuted },
    stayValue: { marginTop: 2, fontFamily: F.bold, fontSize: 15, letterSpacing: -0.3, color: colors.text },
    stayArrow: { alignItems: 'center' },
    stayNights: { fontFamily: F.medium, fontSize: 11, color: colors.textMuted, marginTop: 2 },
    stayTotal: { marginLeft: isTablet ? 'auto' : 0, alignItems: isTablet ? 'flex-end' : 'flex-start' },
    stayTotalValue: { marginTop: 2, fontFamily: F.display, fontSize: 18, letterSpacing: -0.5, color: colors.text },

    resGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 14 },
    resItem: { minWidth: isTablet ? 170 : 130 },
    resItemLabel: { fontSize: 12, fontFamily: F.medium, color: colors.textMuted, marginBottom: 2 },
    resItemValue: { fontSize: 14, fontFamily: F.semi, color: colors.text },

    detailsBlock: { marginTop: 16 },
    divider: { height: 1, backgroundColor: hairline, marginBottom: 16 },

    actionsRow: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: hairline,
    },
    actionsRight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginLeft: 'auto' },
    linkButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
    linkButtonText: { fontSize: 14, fontFamily: F.semi, color: goldText },
    cancelButton: {
      paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12,
      borderWidth: 1, borderColor: isDark ? 'rgba(255,102,89,0.6)' : 'rgba(179,38,30,0.45)',
    },
    cancelButtonText: { fontSize: 14, fontFamily: F.semi, color: colors.danger },
    rateButton: {
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12,
      ...goldButton,
    },
    rateButtonText: { fontSize: 14, fontFamily: F.semi, color: '#231B12' },
    ratedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6 },
    ratedBadgeText: { fontSize: 14, fontFamily: F.semi, color: colors.text },

    cancelExpiredNote: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 6,
      marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: hairline,
    },
    cancelExpiredNoteText: { flex: 1, fontSize: 12, fontFamily: F.body, color: colors.textMuted, lineHeight: 17 },
    dpStrip: {
      marginTop: 12, padding: 12, borderRadius: 14, gap: 6,
      backgroundColor: isDark ? 'rgba(240,213,142,0.08)' : '#FBF6EA',
      borderWidth: 1, borderColor: isDark ? 'rgba(240,213,142,0.22)' : '#EBD9AE',
    },
    dpStripTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    dpBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
    dpBadgeText: { fontSize: 12, fontFamily: F.semi },
    dpAmounts: { fontSize: 13, fontFamily: F.semi, color: colors.text, flexShrink: 1 },
    dpLine: { fontSize: 12.5, fontFamily: F.medium || F.semi, color: colors.text, lineHeight: 18 },
    dpReminder: { fontSize: 12, fontFamily: F.body, color: colors.textMuted, lineHeight: 17 },
    extensionNote: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginTop: 12, padding: 12, borderRadius: 14,
      backgroundColor: isDark ? 'rgba(240,213,142,0.10)' : '#FBF1D8',
      borderWidth: 1, borderColor: isDark ? 'rgba(240,213,142,0.25)' : '#EBD39A',
    },
    extensionNoteTitle: { fontSize: 13, fontFamily: F.semi, color: colors.text },
    extensionNoteText: { fontSize: 12, fontFamily: F.body, color: colors.textMuted, lineHeight: 17, marginTop: 2 },
    extensionWithdraw: { fontSize: 13, fontFamily: F.semi, color: colors.danger },

    /* Dialogs */
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(23,18,14,0.55)',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      ...web({ backdropFilter: 'blur(4px)' }),
    },
    modalCard: {
      backgroundColor: colors.card, borderRadius: 22, padding: 26,
      width: '100%', maxWidth: 420, alignItems: 'center',
      ...web({ boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }),
    },
    modalTitle: { fontSize: 19, fontFamily: F.display, letterSpacing: -0.5, color: colors.text, marginBottom: 6, textAlign: 'center' },
    modalBody: { fontSize: 14, fontFamily: F.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
    modalActions: { flexDirection: 'row', gap: 10, width: '100%' },
    modalButton: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    modalButtonSecondary: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: hairline },
    modalButtonSecondaryText: { fontSize: 14, fontFamily: F.semi, color: colors.text },
    modalButtonDanger: { backgroundColor: colors.danger },
    modalButtonDangerText: { fontSize: 14, fontFamily: F.semi, color: '#FFFFFF' },
    modalButtonPrimary: { width: '100%', ...goldButton },
    modalButtonPrimaryText: { fontSize: 14, fontFamily: F.semi, color: '#231B12' },
  });
}
