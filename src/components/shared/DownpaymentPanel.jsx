import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTheme } from '../../context/ThemeContext';
import EwalletPaymentScreen from '../../screens/reviewPay/EwalletPaymentScreen';
import {
  getDownpaymentInfo, downpaymentBadge, paymentReminderFor, downpaymentMethodLabel,
  useDownpaymentSettings, formatPeso, formatDueDate,
} from '../../utils/downpayment';

/**
 * DownpaymentPanel — drop-in block for a guest's reservation card.
 *
 * Shows the downpayment status (required / paid / overdue / refund), the
 * amount, the balance at the hotel and the due date.
 *
 * Guests pay the downpayment by e-wallet on Review & Pay, so this panel is
 * status-only. allowPay (off by default) adds a "Pay downpayment via
 * e-wallet" button for an unpaid one — the same simulated e-wallet screen,
 * then pay_downpayment_online() (sql/downpayment.sql) marks it paid.
 *
 * It loads its own data by reservation id, so the screen using it only needs:
 *
 *   import DownpaymentPanel from '../../components/shared/DownpaymentPanel';
 *   ...
 *   <DownpaymentPanel reservationId={r.id} onChanged={fetchReservations} />
 *
 * Renders nothing for bookings with no downpayment (older bookings, walk-ins).
 */

const WALLET_LABELS = { gcash: 'GCash', maya: 'Maya', gotyme: 'GoTyme', maribank: 'Maribank' };

export default function DownpaymentPanel({ reservationId, onChanged, allowPay = false }) {
  const { colors, fonts, isDark } = useTheme();
  const styles = getStyles(colors, fonts, isDark);
  const settings = useDownpaymentSettings();

  const [row, setRow] = useState(null);
  const [paying, setPaying] = useState(false);    // modal open
  const [result, setResult] = useState(null);     // { amount, balance, wallet, paidAt } after paying
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!reservationId) return;
    const { data, error: err } = await supabase
      .from('reservations')
      .select('id, status, check_in, check_out, nights, room_type, guest_details, subtotal, tax, total_amount, payment_mode, created_at, payment_option, downpayment_amount, downpayment_status, downpayment_due_at, downpayment_paid_at, downpayment_method, downpayment_recorded_by_name')
      .eq('id', reservationId)
      .maybeSingle();
    if (!err) setRow(data || null);
  }, [reservationId]);

  useEffect(() => { load(); }, [load]);

  const dp = getDownpaymentInfo(row);
  const badge = downpaymentBadge(dp);
  if (!row || !badge) return null;

  const beforeCheckIn = ['pending', 'upcoming'].includes(String(row.status || '').toLowerCase());
  const refundUntil = row.created_at
    ? new Date(new Date(row.created_at).getTime() + (settings.cancelWindowHours || 24) * 3600 * 1000)
    : null;
  const refundStillOpen = refundUntil && refundUntil.getTime() > Date.now();

  const handleConfirmPayment = async (walletId) => {
    setError('');
    const { data, error: err } = await supabase.rpc('pay_downpayment_online', {
      p_reservation_id: row.id,
      p_wallet: walletId,
    });
    if (err) {
      setError(err.message || 'Could not complete the payment. Please try again.');
      setPaying(false);
      return;
    }
    setResult({
      amount: Number(data?.amount ?? dp.amount),
      balance: Number(data?.balance ?? dp.balance),
      wallet: walletId,
      paidAt: data?.paidAt || new Date().toISOString(),
    });
    await load();
    onChanged && onChanged();
  };

  const guestName = `${row.guest_details?.firstName || ''} ${row.guest_details?.lastName || ''}`.trim();

  return (
    <View style={[styles.strip, dp.overdue && styles.stripOverdue]}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Ionicons name={badge.icon} size={13} color={badge.text} />
          <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>
        <Text style={styles.amounts}>
          {dp.full
            ? `${formatPeso(dp.amount)} ${dp.paid ? 'paid in full' : 'to pay'} · nothing to pay at the hotel`
            : `${formatPeso(dp.amount)} downpayment · ${formatPeso(dp.balance)} balance at the hotel`}
        </Text>
      </View>

      {dp.status === 'pending' && beforeCheckIn && !!dp.dueAt && (
        <Text style={[styles.line, dp.overdue && { color: colors.danger }]}>
          {dp.overdue
            ? `The downpayment was due ${formatDueDate(dp.dueAt)}. Please pay now — your room may be released.`
            : allowPay
              ? `Downpayment required: ${formatPeso(dp.amount)}. Pay with your e-wallet or at the front desk by ${formatDueDate(dp.dueAt)}.`
              : `Downpayment required: ${formatPeso(dp.amount)}. Please pay at the front desk by ${formatDueDate(dp.dueAt)}.`}
        </Text>
      )}
      {dp.status === 'paid' && !!dp.paidAt && (
        <Text style={styles.line}>
          Paid {formatDueDate(dp.paidAt)} via {downpaymentMethodLabel(dp.method)}{dp.paidOnline ? ' (simulated)' : ''}.
        </Text>
      )}
      {dp.status === 'refund_pending' && (
        <Text style={styles.line}>Your refund of {formatPeso(dp.amount)} is being processed by the front desk.</Text>
      )}
      {beforeCheckIn && (
        <Text style={styles.reminder}>
          {paymentReminderFor(dp, settings.cancelWindowHours)}
        </Text>
      )}

      {!!error && <Text style={[styles.line, { color: colors.danger }]}>{error}</Text>}

      {allowPay && dp.awaiting && (
        <TouchableOpacity
          style={styles.payBtn}
          onPress={() => { setError(''); setResult(null); setPaying(true); }}
          activeOpacity={0.88}
          accessibilityRole="button"
        >
          <Ionicons name="wallet-outline" size={16} color="#231B12" />
          <Text style={styles.payBtnText}>Pay downpayment via e-wallet · {formatPeso(dp.amount)}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={paying} transparent animationType="fade" onRequestClose={() => setPaying(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {result ? (
                <View style={styles.done}>
                  <Ionicons name="checkmark-circle" size={52} color="#1E7B34" />
                  <Text style={styles.doneTitle}>Downpayment paid</Text>
                  <View style={styles.simStamp}><Text style={styles.simStampText}>SIMULATED PAYMENT</Text></View>
                  <Text style={styles.doneSub}>Demo transaction — no real money was transferred or charged.</Text>
                  <Row styles={styles} label="E-wallet (demo)" value={WALLET_LABELS[result.wallet] || result.wallet} />
                  <Row styles={styles} label="Downpayment (simulated)" value={formatPeso(result.amount)} />
                  <Row styles={styles} label="Balance at the hotel" value={formatPeso(result.balance)} />
                  <Row styles={styles} label="Payment time" value={formatDueDate(result.paidAt)} />
                  {refundUntil && <Row styles={styles} label="Refund requests until" value={formatDueDate(refundUntil)} last />}
                  <TouchableOpacity style={[styles.payBtn, { alignSelf: 'stretch', marginTop: 16 }]} onPress={() => setPaying(false)} activeOpacity={0.88}>
                    <Text style={styles.payBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <EwalletPaymentScreen
                  checkIn={new Date(row.check_in)}
                  checkOut={new Date(row.check_out)}
                  nights={row.nights || 1}
                  roomTypeSummary={row.room_type || 'Reservation'}
                  guestName={guestName}
                  subtotal={Number(row.subtotal) || 0}
                  tax={Number(row.tax) || 0}
                  total={dp.total}
                  downpayment={dp.amount}
                  balance={dp.balance}
                  cancelWindowHours={settings.cancelWindowHours}
                  refundNote={
                    refundStillOpen
                      ? `the refund window counts from when you booked. Cancel before ${formatDueDate(refundUntil)} to get this downpayment back.`
                      : `the ${settings.cancelWindowHours}-hour refund window from your booking time has passed, so this downpayment will not be refundable.`
                  }
                  onCancel={() => setPaying(false)}
                  onConfirmPayment={handleConfirmPayment}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({ label, value, styles, last }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const web = (s) => (Platform.OS === 'web' ? s : null);

function getStyles(colors, fonts, isDark) {
  return StyleSheet.create({
    strip: {
      marginTop: 12, padding: 12, borderRadius: 14, gap: 6,
      backgroundColor: isDark ? 'rgba(240,213,142,0.08)' : '#FBF6EA',
      borderWidth: 1, borderColor: isDark ? 'rgba(240,213,142,0.22)' : '#EBD9AE',
    },
    stripOverdue: {
      backgroundColor: isDark ? 'rgba(179,38,30,0.12)' : '#FDF0EF',
      borderColor: isDark ? 'rgba(179,38,30,0.35)' : '#F3C7C4',
    },
    top: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
    badgeText: { fontSize: 12, fontFamily: fonts.bodySemiBold },
    amounts: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, flexShrink: 1 },
    line: { fontSize: 12.5, lineHeight: 18, fontFamily: fonts.bodyMedium || fonts.body, color: colors.text },
    reminder: { fontSize: 12, lineHeight: 17, fontFamily: fonts.body, color: colors.textMuted },
    payBtn: {
      marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      minHeight: 44, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#DDBB6C',
      ...web({
        backgroundImage: 'linear-gradient(180deg, #F0D58E 0%, #C9A14A 100%)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 6px 16px rgba(201,161,74,0.25)',
      }),
    },
    payBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: '#231B12' },

    backdrop: { flex: 1, backgroundColor: 'rgba(23,18,14,0.6)', justifyContent: 'center', padding: 12 },
    sheet: {
      alignSelf: 'center', width: '100%', maxWidth: 720, maxHeight: '94%',
      backgroundColor: colors.background, borderRadius: 18, overflow: 'hidden',
    },
    done: { alignItems: 'center', gap: 6, paddingVertical: 8 },
    doneTitle: { fontSize: 20, fontFamily: fonts.headingBold || fonts.bodySemiBold, color: colors.text },
    doneSub: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: 8 },
    simStamp: {
      borderWidth: 2, borderColor: colors.text, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 10,
      transform: [{ rotate: '-3deg' }], marginTop: 4,
    },
    simStampText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, letterSpacing: 1.5 },
    row: {
      alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', gap: 12,
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    rowLabel: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },
    rowValue: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, flexShrink: 1, textAlign: 'right' },
  });
}
