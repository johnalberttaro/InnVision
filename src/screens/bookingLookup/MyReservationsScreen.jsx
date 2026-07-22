import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { updateRoomStatus, ROOM_STATUS } from '../../utils/Roomsservice';
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
 *  - Room release on cancellation now goes through
 *    Roomsservice.updateRoomStatus() (the shared service every other
 *    room screen uses) instead of a raw Firestore transaction, and sets
 *    ROOM_STATUS.VACANT directly — correct for a pre-check-in
 *    cancellation (no guest ever occupied the room, so no cleaning cycle
 *    is needed, unlike an actual checkout which goes through INSPECT).
 *  - Adults/Children breakdown removed from the expanded details: the
 *    new reservations schema only stores a single guest_count (total),
 *    not the per-room adults/children split the old `totals` object on
 *    the Firestore doc had — that granularity wasn't carried over during
 *    the ReviewPayScreen migration. Shows "Guests: N" instead.
 *
 * Props:
 *  - onBack: () => void
 *  - onViewReservation?: (reservation) => void   // optional deep-link out
 */
export default function MyReservationsScreen({ onBack, onViewReservation }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const [reservations, setReservations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState('');
  const [expandedId, setExpandedId]     = useState(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyExpandedId, setHistoryExpandedId] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);

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

  /**
   * Front desk sometimes forgets to mark the checkout. Rather than let a
   * stale 'checked-in' reservation sit on the guest's active list forever,
   * treat "checked-in AND checkout date already passed" as an implicit
   * checkout: correct it in Firestore and fold it into history right away.
   */
  const isPastCheckout = (checkOutValue) => {
    if (!checkOutValue) return false;
    const d = checkOutValue?.toDate ? checkOutValue.toDate() : new Date(checkOutValue);
    return !isNaN(d) && d.getTime() < Date.now();
  };

  const autoResolveOverdueCheckouts = async (docs) => {
    const overdue = docs.filter(
      (r) => (r.status || '').toLowerCase() === 'checked-in' && isPastCheckout(r.checkOut)
    );
    if (overdue.length === 0) return docs;

    await Promise.all(
      overdue.map(async (r) => {
        try {
          const { error } = await supabase
            .from('reservations')
            .update({
              status: 'checked-out',
              checked_out_at: new Date().toISOString(),
              auto_checked_out: true, // flags this as system-corrected, not front-desk-confirmed
            })
            .eq('id', r.id);
          if (error) throw error;
          r.status = 'checked-out'; // reflect immediately without a second fetch
        } catch (err) {
          console.error(`Auto-checkout failed for ${r.id}:`, err);
        }
      })
    );
    return docs;
  };

  // Maps a Postgres reservations row (snake_case) to the same camelCase
  // shape the Firestore version used, so every helper/JSX below stays
  // unchanged.
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

      let docs = (data || []).map(reservationToCamel);
      docs = await autoResolveOverdueCheckouts(docs);
      setReservations(docs);
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

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReservations();
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
      return EWALLET_LABELS[provider] || (r.eWalletProvider ? r.eWalletProvider : 'E-wallet');
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
      case 'upcoming':    return { label: 'Upcoming',    bg: colors.primaryTint, text: colors.primary };
      case 'pending':     return { label: 'Pending',     bg: '#FFF4D6', text: '#9A7B00' };
      case 'checked-in':  return { label: 'Checked-In',  bg: '#DFF5E1', text: '#1E7B34' };
      case 'checked-out': return { label: 'Checked-Out', bg: colors.cardAlt, text: colors.textMuted };
      case 'cancelled':   return { label: 'Cancelled',   bg: '#FCE1E1', text: '#B3261E' };
      default:            return { label: status || 'Unknown', bg: colors.cardAlt, text: colors.textMuted };
    }
  };

  // Cancellable up until check-in — covers both statuses your reservations
  // actually use pre-check-in ('pending' and 'upcoming').
  const canCancel = (r) => ['pending', 'upcoming'].includes((r.status || '').toLowerCase());

  // ---------------- Cancellation workflow ----------------

  const requestCancel = (reservation) => setCancelTarget(reservation);
  const dismissCancelDialog = () => {
    if (!cancelling) setCancelTarget(null);
  };

  /**
   * Best-effort release of room inventory, via the same shared
   * Roomsservice every other room screen uses. Sets rooms straight to
   * VACANT (not through the INSPECT cleaning cycle) — correct here
   * because canCancel() only allows cancelling 'pending'/'upcoming'
   * reservations, meaning the guest never actually occupied the room.
   */
  const releaseRoomsInventory = async (selectedRooms = []) => {
    for (const room of selectedRooms) {
      if (!room?.roomNumber) continue;
      try {
        await updateRoomStatus(String(room.roomNumber), ROOM_STATUS.VACANT);
      } catch (err) {
        // Don't let one room's failure block the rest — surface it but
        // continue, since the reservation-level status update is the
        // guest-facing source of truth.
        console.error(`Failed to release room ${room.roomNumber}:`, err);
      }
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'cancelled' }) // updated_at trigger covers the "when" automatically
        .eq('id', cancelTarget.id);
      if (error) throw error;
      await releaseRoomsInventory(cancelTarget.selectedRooms);

      setCancelTarget(null);
      setSuccessMessage('Your reservation has been cancelled.');
      await fetchReservations();
    } catch (err) {
      console.error('Cancellation failed:', err);
      setError('We couldn\u2019t cancel that reservation. Please try again.');
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  };

  // ---------------- Card renderer (shared by main list + history modal) --

  const renderReservationCard = (r, { expandedIdState, setExpandedIdState }) => {
    const meta = statusMeta(r.status);
    const expanded = expandedIdState === r.id;
    return (
      <View key={r.id} style={styles.card}>
        {/* Summary row */}
        <View style={styles.resHeader}>
          <Text style={styles.resId}>{referenceNumber(r.id)}</Text>
          <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.text }]}>
              {meta.label.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.resGuestName}>{guestName(r)}</Text>

        <View style={styles.resGrid}>
          <SummaryItem label="Check-in" value={formatDate(r.checkIn)} styles={styles} />
          <SummaryItem label="Check-out" value={formatDate(r.checkOut)} styles={styles} />
          <SummaryItem label="Nights" value={r.nights ?? '—'} styles={styles} />
          <SummaryItem label="Rooms" value={r.selectedRooms?.length ?? 0} styles={styles} />
          <SummaryItem label="Room type" value={r.roomType || '—'} styles={styles} />
          <SummaryItem label="Total" value={formatCurrency(r.totalAmount)} styles={styles} />
        </View>

        {/* Expanded details */}
        {expanded && (
          <View style={styles.detailsBlock}>
            <View style={styles.divider} />
            <View style={styles.resGrid}>
              <SummaryItem label="Booking date" value={formatDate(r.createdAt)} styles={styles} />
              <SummaryItem label="Guests" value={r.guestCount ?? '—'} styles={styles} />
              <SummaryItem label="Room number(s)" value={roomLabel(r)} styles={styles} />
              <SummaryItem label="Selected rate" value={rateLabel(r)} styles={styles} />
              <SummaryItem label="Payment method" value={paymentMethod(r)} styles={styles} />
              <SummaryItem label="Email" value={emailAddress(r)} styles={styles} />
              <SummaryItem label="Contact number" value={contactNumber(r)} styles={styles} />
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
              color={colors.primary}
            />
          </TouchableOpacity>

          {canCancel(r) && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => requestCancel(r)}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelButtonText}>Cancel Reservation</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ---------------- Render ----------------

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, isWide && styles.headerWide]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reservations</Text>
        <TouchableOpacity
          onPress={() => setMenuVisible((v) => !v)}
          style={styles.backButton}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Dropdown menu */}
      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuDropdown, isWide && styles.menuDropdownWide]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setHistoryVisible(true);
              }}
            >
              <Ionicons name="time-outline" size={18} color={colors.text} />
              <Text style={styles.menuItemText}>Reservation History</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        <View style={isWide && styles.wideContainer}>
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
                renderReservationCard(r, { expandedIdState: expandedId, setExpandedIdState: setExpandedId })
              )
            )}
          </View>
        </View>
      </ScrollView>

      {/* History panel */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
        presentationStyle="fullScreen"
      >
        <View style={styles.screen}>
          <View style={[styles.header, isWide && styles.headerWide]}>
            <TouchableOpacity
              onPress={() => setHistoryVisible(false)}
              style={styles.backButton}
              accessibilityLabel="Close history"
            >
              <Ionicons name="arrow-back" size={22} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Reservation History</Text>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={isWide && styles.wideContainer}>
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
                    renderReservationCard(r, { expandedIdState: historyExpandedId, setExpandedIdState: setHistoryExpandedId })
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
                ? `This will cancel ${referenceNumber(cancelTarget.id)} and release the assigned room(s). This can't be undone.`
                : ''}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={dismissCancelDialog}
                disabled={cancelling}
              >
                <Text style={styles.modalButtonSecondaryText}>Keep Reservation</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger]}
                onPress={confirmCancel}
                disabled={cancelling}
              >
                {cancelling
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.modalButtonDangerText}>Yes, Cancel</Text>
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
              <Text style={styles.modalButtonDangerText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.heroBackground,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    headerWide: {
      paddingHorizontal: spacing.xxl * 2,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: fonts.headingSemiBold,
      color: colors.white,
      letterSpacing: 0.3,
    },
    headerSpacer: {
      width: 36,
    },

    menuOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.15)',
    },
    menuDropdown: {
      position: 'absolute',
      top: 56,
      right: spacing.lg,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.xs,
      minWidth: 190,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    },
    menuDropdownWide: {
      right: spacing.xxl * 2,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
    },
    menuItemText: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },

    wideContainer: {
      maxWidth: 800,
      alignSelf: 'center',
      width: '100%',
    },
    contentPad: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },

    centerBlock: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },

    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 2,
    },

    helperText: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.textMuted,
      lineHeight: 18,
    },

    messageCard: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    messageText: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },

    resHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    resId: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },
    badge: {
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: fonts.bodySemiBold,
      letterSpacing: 0.4,
    },
    resGuestName: {
      fontSize: 15,
      fontFamily: fonts.headingBold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    resGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    resItem: {
      minWidth: 120,
    },
    resItemLabel: {
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.textMuted,
      marginBottom: 2,
    },
    resItemValue: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },

    detailsBlock: {
      marginTop: spacing.sm,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },

    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    linkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    linkButtonText: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.primary,
    },
    cancelButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    cancelButtonText: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: colors.danger,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.xl,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 16,
      fontFamily: fonts.headingExtraBold,
      color: colors.text,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    modalBody: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: spacing.lg,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      width: '100%',
    },
    modalButton: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalButtonSecondary: {
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalButtonSecondaryText: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },
    modalButtonDanger: {
      backgroundColor: colors.danger,
    },
    modalButtonDangerText: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.white,
    },
    modalButtonPrimary: {
      backgroundColor: colors.primary,
      width: '100%',
    },
  });
}