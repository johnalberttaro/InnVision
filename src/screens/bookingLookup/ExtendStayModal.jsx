import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { fetchBookedRoomNumbers } from '../../utils/Roomsservice';
import {
  MAX_EXTENSION_NIGHTS,
  addNights,
  previewExtensionCost,
  reservationNightlyTotal,
  requestStayExtension,
} from '../../utils/StayExtensionService';

/**
 * ExtendStayModal — guest-facing "Extend Stay" request for a reservation
 * that is currently checked in (opened from MyReservationsScreen).
 *
 * The guest picks how many extra nights, sees the new check-out date and
 * an estimated cost, and sends a request. Nothing about the stay changes
 * yet: Front Desk approves or declines it from Reservation Management, and
 * on approval the server moves the check-out date and adds the amount to
 * the folio (see sql/stay_extensions.sql). The guest is notified either way.
 *
 * Availability is checked live as the nights change (same
 * booked_room_numbers() RPC the booking flow uses), so the guest finds out
 * immediately if their room is taken on one of the extra nights instead of
 * waiting for Front Desk to decline.
 *
 * Props:
 *  - visible: boolean
 *  - reservation: camelCase reservation (id, checkOut, selectedRooms, ...)
 *  - onClose: () => void
 *  - onSubmitted: (result) => void — called after a successful request
 */
export default function ExtendStayModal({ visible, reservation, onClose, onSubmitted }) {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const [nights, setNights] = useState(1);
  const [checking, setChecking] = useState(false);
  const [takenRooms, setTakenRooms] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null); // result from the server once sent

  // Fresh form every time it opens.
  useEffect(() => {
    if (visible) {
      setNights(1);
      setError('');
      setSent(null);
      setTakenRooms([]);
    }
  }, [visible, reservation?.id]);

  const currentCheckOut = reservation?.checkOut ? new Date(reservation.checkOut) : null;
  const newCheckOut = currentCheckOut ? addNights(currentCheckOut, nights) : null;
  const roomNumbers = (reservation?.selectedRooms || [])
    .map((r) => (r?.roomNumber != null ? String(r.roomNumber) : null))
    .filter(Boolean);
  const nightlyTotal = reservationNightlyTotal(reservation?.selectedRooms);
  const cost = previewExtensionCost(nightlyTotal, nights);

  // Live availability for the extra nights only: [current check-out, new check-out).
  const currentOutMs = currentCheckOut ? currentCheckOut.getTime() : null;
  useEffect(() => {
    if (!visible || currentOutMs == null || !reservation?.id) return;
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      fetchBookedRoomNumbers(new Date(currentOutMs), addNights(currentOutMs, nights), reservation.id)
        .then((booked) => {
          if (cancelled) return;
          setTakenRooms(roomNumbers.filter((rn) => booked.has(rn)));
        })
        .catch((err) => {
          // Not fatal: the server checks again when the request is sent.
          console.error('Extension availability check failed:', err);
          if (!cancelled) setTakenRooms([]);
        })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
    // roomNumbers is derived from reservation, which is covered by its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reservation?.id, currentOutMs, nights]);

  const formatDate = (d) =>
    d ? d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const formatCurrency = (n) =>
    `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const blocked = takenRooms.length > 0;
  const canSubmit = !submitting && !checking && !blocked && !!reservation;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await requestStayExtension(reservation.id, nights);
      setSent(result);
      onSubmitted && onSubmitted(result);
    } catch (err) {
      console.error('Extend stay request failed:', err);
      setError(err?.message || 'Could not send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => { if (!submitting) onClose && onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity onPress={close} style={styles.closeIcon} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {sent ? (
            // ── Request sent ─────────────────────────────────────────
            <View style={styles.centered}>
              <View style={styles.iconCircle}>
                <Ionicons name="paper-plane-outline" size={24} color={colors.onPrimary} />
              </View>
              <Text style={styles.title}>Request Sent</Text>
              <Text style={styles.body}>
                The front desk will review your request to stay {sent.extraNights} more night
                {sent.extraNights === 1 ? '' : 's'} (until {formatDate(new Date(sent.newCheckOut))}).
                You'll get a notification once it's approved. {formatCurrency(sent.amount)} will
                be added to your bill, payable at the front desk.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'stretch' }]} onPress={close}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // ── Form ─────────────────────────────────────────────────
            <>
              <View style={styles.centered}>
                <View style={styles.iconCircle}>
                  <Ionicons name="calendar-outline" size={24} color={colors.onPrimary} />
                </View>
                <Text style={styles.title}>Extend Your Stay</Text>
                <Text style={styles.subtitle}>
                  {roomNumbers.length ? `Room ${roomNumbers.join(', ')}` : reservation?.roomType || 'Your room'}
                </Text>
              </View>

              <Text style={styles.label}>Extra nights</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepBtn, nights <= 1 && styles.stepBtnDisabled]}
                  onPress={() => setNights((n) => Math.max(1, n - 1))}
                  disabled={nights <= 1 || submitting}
                  accessibilityLabel="One night fewer"
                >
                  <Ionicons name="remove" size={18} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.stepValue}>
                  {nights} night{nights === 1 ? '' : 's'}
                </Text>
                <TouchableOpacity
                  style={[styles.stepBtn, nights >= MAX_EXTENSION_NIGHTS && styles.stepBtnDisabled]}
                  onPress={() => setNights((n) => Math.min(MAX_EXTENSION_NIGHTS, n + 1))}
                  disabled={nights >= MAX_EXTENSION_NIGHTS || submitting}
                  accessibilityLabel="One more night"
                >
                  <Ionicons name="add" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <View style={styles.summaryBox}>
                <Row styles={styles} label="Current check-out" value={formatDate(currentCheckOut)} />
                <Row styles={styles} label="New check-out" value={formatDate(newCheckOut)} strong />
                <View style={styles.divider} />
                <Row
                  styles={styles}
                  label={`${formatCurrency(nightlyTotal)} × ${nights} night${nights === 1 ? '' : 's'}`}
                  value={formatCurrency(cost.subtotal)}
                />
                <Row styles={styles} label="Tax & service charge (17%)" value={formatCurrency(cost.tax)} />
                <Row styles={styles} label="Estimated total" value={formatCurrency(cost.total)} strong />
              </View>

              <View style={styles.statusLine}>
                {checking ? (
                  <>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                    <Text style={styles.statusText}>Checking availability…</Text>
                  </>
                ) : blocked ? (
                  <>
                    <Ionicons name="close-circle" size={16} color={colors.danger} />
                    <Text style={[styles.statusText, { color: colors.danger }]}>
                      Room {takenRooms.join(', ')} is already booked for one of these nights. Try fewer nights.
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#1E7B34" />
                    <Text style={[styles.statusText, { color: '#1E7B34' }]}>Your room is free for these nights.</Text>
                  </>
                )}
              </View>

              <Text style={styles.note}>
                The front desk confirms every extension. The amount is added to your bill and paid at the front desk.
              </Text>

              {!!error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={close} disabled={submitting}>
                  <Text style={styles.secondaryBtnText}>Not now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1 }, !canSubmit && styles.primaryBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.primaryBtnText}>Send Request</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, strong, styles }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.xl,
      width: '100%',
      maxWidth: 420,
    },
    closeIcon: { position: 'absolute', top: spacing.md, right: spacing.md, padding: 4, zIndex: 1 },
    centered: { alignItems: 'center' },
    iconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    title: { fontSize: 18, fontFamily: fonts.headingExtraBold, color: colors.text, textAlign: 'center' },
    subtitle: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    body: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    label: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginBottom: spacing.xs },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.xs,
      marginBottom: spacing.md,
    },
    stepBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: colors.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnDisabled: { opacity: 0.4 },
    stepValue: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
    summaryBox: {
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 6,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    rowLabel: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
    rowValue: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, textAlign: 'right' },
    rowStrong: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
    statusLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: spacing.md,
      minHeight: 20,
    },
    statusText: { flex: 1, fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textMuted, lineHeight: 17 },
    note: {
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.textMuted,
      lineHeight: 16,
      marginTop: spacing.sm,
    },
    error: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.danger, marginTop: spacing.sm, lineHeight: 17 },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    secondaryBtn: {
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    primaryBtn: {
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
  });
}
