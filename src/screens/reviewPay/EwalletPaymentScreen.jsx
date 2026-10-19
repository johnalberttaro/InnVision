import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { formatDate } from '../../utils/dateHelpers';
import { formatCurrency } from '../../utils/roomRates';

import gcashLogo from '../../../assets/payments/gcash.png';
import mayaLogo from '../../../assets/payments/maya.png';
import gotymeLogo from '../../../assets/payments/gotyme.png';
import maribankLogo from '../../../assets/payments/maribank.png';

const EWALLET_OPTIONS = [
  { id: 'gcash',    label: 'GCash',    logo: gcashLogo },
  { id: 'maya',     label: 'Maya',     logo: mayaLogo },
  { id: 'gotyme',   label: 'GoTyme',   logo: gotymeLogo },
  { id: 'maribank', label: 'Maribank', logo: maribankLogo },
];

// Notice colours. The app palette has no warning/info tokens, so these are
// fixed light/dark pairs, chosen to read clearly on both themes and to keep
// the two notices visually distinct (amber = refund warning, blue =
// simulation disclaimer).
const NOTICE_COLORS = {
  light: {
    warn: { bg: '#FFF4D6', border: '#E2B94F', title: '#6B4A00', text: '#5C4A1E', icon: '#9A6700', ackBg: '#FFFBEF', check: '#FFFFFF' },
    sim:  { bg: '#E8F0FA', border: '#9DBBE3', title: '#1F4677', text: '#2B4566', icon: '#2C5EA8' },
  },
  dark: {
    warn: { bg: '#3A2E12', border: '#8A6A22', title: '#F3D58A', text: '#E9DDBB', icon: '#F0C14B', ackBg: 'rgba(0,0,0,0.18)', check: '#3A2E12' },
    sim:  { bg: '#1C2735', border: '#3F5E84', title: '#B9D3F2', text: '#D3E1F2', icon: '#8FB8EA' },
  },
};

/**
 * EwalletPaymentScreen — dedicated "Pay Online" step.
 *
 * Rendered by ReviewPayScreen as a local sub-view (no App.jsx routing
 * involved — ReviewPayScreen just swaps its content for this component
 * when the guest taps "Pay Now" and swaps back on Cancel).
 *
 * This is a SIMULATED payment step — InnVision is not connected to GCash /
 * Maya / GoTyme / Maribank or any payment gateway, and no money moves.
 * Selecting a wallet and confirming simulates a brief "processing" delay
 * and then reports the chosen wallet back to the parent via
 * onConfirmPayment(walletId). ReviewPayScreen owns the actual reservation
 * write, so nothing here touches the database.
 *
 * Two notices are always shown on this screen:
 *  - Simulation disclaimer (blue) — right above the wallet choices.
 *  - 24-hour refund policy warning (amber) — right above the confirm
 *    button, with a checkbox the guest must tick before confirming. The
 *    warning is information only: refunds are still requested from My
 *    Reservations and reviewed by the front desk, never approved here.
 *
 * Props:
 *  - checkIn, checkOut: Date
 *  - nights: number
 *  - roomTypeSummary: string
 *  - guestName: string
 *  - subtotal, tax, total: number
 *  - downpayment, balance: number (optional) — when set, the guest pays only
 *      the downpayment here and the balance at the hotel (utils/downpayment.js).
 *      Left out, the full total is paid (the old behaviour).
 *  - cancelWindowHours: number (optional, default 24)
 *  - onCancel: () => void                 return to the guest details form
 *  - onConfirmPayment: (walletId) => void  called after the simulated
 *      "processing" delay completes; parent handles the reservation write
 */
export default function EwalletPaymentScreen({
  checkIn,
  checkOut,
  nights,
  roomTypeSummary,
  guestName,
  subtotal,
  tax,
  total,
  downpayment,
  balance,
  cancelWindowHours = 24,
  onCancel,
  onConfirmPayment,
}) {
  const isDownpayment = downpayment != null && downpayment > 0;
  const payNow = isDownpayment ? downpayment : total;
  const { colors, spacing, radius, fonts, isDark } = useTheme();
  const notice = isDark ? NOTICE_COLORS.dark : NOTICE_COLORS.light;
  const styles = useMemo(
    () => getStyles(colors, spacing, radius, fonts, notice),
    [colors, spacing, radius, fonts, notice]
  );

  const [selectedWallet, setSelectedWallet] = useState(null);
  const [refundAcknowledged, setRefundAcknowledged] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Generated once per screen mount, display-only.
  const [referenceNo] = useState(() => {
    const a = Date.now().toString().slice(-13).padStart(13, '0');
    const b = `T${Math.floor(1000000000 + Math.random() * 8999999999)}`;
    return `${a} / ${b}`;
  });

  const selectedOption = EWALLET_OPTIONS.find(w => w.id === selectedWallet);
  const canConfirm = !!selectedWallet && refundAcknowledged && !processing;

  const handleProceed = () => {
    // The button is disabled too — this guard is the real gate.
    if (!canConfirm) return;
    setProcessing(true);
    setTimeout(() => {
      onConfirmPayment(selectedWallet);
    }, 1600);
  };

  const handleCancel = () => {
    if (processing) return;
    onCancel();
  };

  let hint = '';
  if (!selectedWallet && !refundAcknowledged) hint = 'Select an e-wallet and acknowledge the refund policy to continue.';
  else if (!selectedWallet) hint = 'Select an e-wallet to continue.';
  else if (!refundAcknowledged) hint = 'Please acknowledge the refund policy to continue.';

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.backLink} onPress={handleCancel} activeOpacity={0.7} disabled={processing}>
        <Ionicons name="arrow-back" size={14} color={colors.textMuted} />
        <Text style={styles.backLinkText}>Back to Guest Details</Text>
      </TouchableOpacity>

      <View style={styles.titleRow}>
        <Text style={styles.panelTitle}>Available Payment Method</Text>
        <View style={styles.demoPill}>
          <Text style={styles.demoPillText}>SIMULATION</Text>
        </View>
      </View>

      {/* Reservation summary */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryHeading}>
          <Ionicons name="receipt-outline" size={13} color={colors.primary} /> Summary Of Transaction
        </Text>
        {isDownpayment ? (
          <>
            <SummaryRow styles={styles} label="Downpayment to pay now" value={formatCurrency(payNow)} strong />
            <SummaryRow styles={styles} label="Balance payable at the hotel" value={formatCurrency(balance)} />
            <SummaryRow styles={styles} label="Net Charges (whole stay)" value={formatCurrency(total)} />
          </>
        ) : (
          <SummaryRow styles={styles} label="Net Charges" value={formatCurrency(total)} strong />
        )}
        <SummaryRow styles={styles} label="Pay To" value="INNVISION HOTEL" />
        <SummaryRow styles={styles} label="Payment Of" value={`${roomTypeSummary} • ${formatDate(checkIn)} – ${formatDate(checkOut)}`} />
        <SummaryRow styles={styles} label="Guest" value={guestName} />
        <SummaryRow styles={styles} label="Reference No. (demo)" value={referenceNo} />
        <View style={styles.summaryDivider} />
        <SummaryRow styles={styles} label="Subtotal" value={formatCurrency(subtotal)} />
        <SummaryRow styles={styles} label={`Tax & Service (${nights} night${nights !== 1 ? 's' : ''})`} value={formatCurrency(tax)} />
      </View>

      {/* ── Simulation disclaimer (blue) ─────────────────────────── */}
      <View style={[styles.notice, styles.simNotice]} accessibilityRole="text">
        <Ionicons name="information-circle" size={22} color={notice.sim.icon} style={styles.noticeIcon} />
        <View style={styles.noticeBody}>
          <Text style={[styles.noticeTitle, { color: notice.sim.title }]}>
            Simulation Only:{' '}
            <Text style={[styles.noticeText, { color: notice.sim.text }]}>
              This is a simulated payment process for demonstration purposes. No real money will be transferred, deducted, or charged to your e-wallet.
            </Text>
          </Text>
          <Text style={[styles.noticeSmall, { color: notice.sim.text }]}>
            InnVision is not connected to GCash, Maya, GoTyme, Maribank, or any real payment gateway. Choosing a wallet below only records which one you picked for this demo.
          </Text>
        </View>
      </View>

      {/* Wallet selection */}
      <Text style={styles.sectionLabel}>Select E-Wallet</Text>
      <View style={styles.walletGrid}>
        {EWALLET_OPTIONS.map(w => (
          <TouchableOpacity
            key={w.id}
            style={[styles.walletCard, selectedWallet === w.id && styles.walletCardActive]}
            onPress={() => !processing && setSelectedWallet(w.id)}
            activeOpacity={0.8}
            disabled={processing}
          >
            <Image source={w.logo} style={styles.walletLogo} resizeMode="contain" />
            <Text style={[styles.walletLabel, selectedWallet === w.id && styles.walletLabelActive]}>
              {w.label}
            </Text>
            {selectedWallet === w.id && (
              <View style={styles.walletCheckBadge}>
                <Ionicons name="checkmark" size={11} color={colors.onPrimary} />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Refund policy warning (amber) + acknowledgment ───────── */}
      <View style={[styles.notice, styles.warnNotice]}>
        <Ionicons name="warning" size={22} color={notice.warn.icon} style={styles.noticeIcon} />
        <View style={styles.noticeBody}>
          <Text style={[styles.noticeTitle, { color: notice.warn.title }]}>
            Important:{' '}
            <Text style={[styles.noticeText, { color: notice.warn.text }]}>
              {isDownpayment
                ? `You are paying the downpayment only (${formatCurrency(payNow)}). The balance of ${formatCurrency(balance)} is paid at the hotel. The downpayment is refundable only if you cancel within ${cancelWindowHours} hours of payment.`
                : `E-wallet payments are non-refundable after ${cancelWindowHours} hours from the payment time. Please review the refund policy carefully before proceeding.`}
            </Text>
          </Text>

          <View style={styles.policyList}>
            <PolicyLine styles={styles} color={notice.warn.text} label={`When the ${cancelWindowHours} hours start:`}>
              the moment you tap "Confirm Simulated Payment". That exact date and time is shown on your confirmation.
            </PolicyLine>
            <PolicyLine styles={styles} color={notice.warn.text} label={`Within ${cancelWindowHours} hours:`}>
              you may cancel from My Reservations and request a refund{isDownpayment ? ' of the downpayment you paid' : ''}. Each request is reviewed by the front desk — it is not approved automatically.
            </PolicyLine>
            <PolicyLine styles={styles} color={notice.warn.text} label={`After ${cancelWindowHours} hours:`}>
              the booking can no longer be cancelled for a refund.
            </PolicyLine>
            <PolicyLine styles={styles} color={notice.warn.text} label="Demo policy:">
              because no real money is charged, any refund is simulated as well.
            </PolicyLine>
          </View>

          <TouchableOpacity
            style={[styles.ackRow, refundAcknowledged && styles.ackRowChecked]}
            onPress={() => !processing && setRefundAcknowledged(v => !v)}
            activeOpacity={0.8}
            disabled={processing}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: refundAcknowledged, disabled: processing }}
          >
            <View style={[styles.checkbox, refundAcknowledged && styles.checkboxChecked]}>
              {refundAcknowledged && <Ionicons name="checkmark" size={13} color={notice.warn.check} />}
            </View>
            <Text style={[styles.ackText, { color: notice.warn.title }]}>
              I have read and understand the {cancelWindowHours}-hour refund policy for this simulated e-wallet payment.
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Confirm / Cancel */}
      {!processing && (
        <View style={styles.actionSection}>
          <View style={styles.divider} />
          {selectedOption && (
            <Text style={styles.selectedWalletNote}>
              Simulated payment of <Text style={styles.selectedWalletNoteStrong}>{formatCurrency(payNow)}</Text> with <Text style={styles.selectedWalletNoteStrong}>{selectedOption.label}</Text>
            </Text>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.proceedBtn, !canConfirm && styles.proceedBtnDisabled]}
              onPress={handleProceed}
              activeOpacity={0.85}
              disabled={!canConfirm}
              accessibilityState={{ disabled: !canConfirm }}
            >
              <Text style={styles.proceedBtnText}>Confirm Simulated Payment</Text>
            </TouchableOpacity>
          </View>
          {!!hint && <Text style={styles.hintText}>{hint}</Text>}
        </View>
      )}

      {processing && (
        <View style={styles.processingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.processingText}>
            Processing your simulated {selectedOption?.label} payment…
          </Text>
        </View>
      )}
    </View>
  );
}

function SummaryRow({ label, value, styles, strong }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryValueStrong]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function PolicyLine({ label, children, styles, color }) {
  return (
    <View style={styles.policyLine}>
      <Text style={[styles.policyBullet, { color }]}>•</Text>
      <Text style={[styles.policyText, { color }]}>
        <Text style={styles.policyLabel}>{label}</Text> {children}
      </Text>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts, notice) {
  return StyleSheet.create({
    panel: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md },
    backLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textMuted },

    titleRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
      marginBottom: spacing.md, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    panelTitle: {
      fontSize: 13, fontFamily: fonts.headingBold, color: colors.primary,
      textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 1,
    },
    demoPill: {
      backgroundColor: notice.sim.bg, borderColor: notice.sim.border, borderWidth: 1,
      borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
    },
    demoPillText: { fontSize: 9.5, fontFamily: fonts.bodySemiBold, color: notice.sim.title, letterSpacing: 0.8 },

    summaryBox: { backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, gap: 2 },
    summaryHeading: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.primary, marginBottom: spacing.xs },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
    summaryLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, flexShrink: 0 },
    summaryValue: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.text, textAlign: 'right', flex: 1 },
    summaryValueStrong: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
    summaryDivider: { height: 0.5, backgroundColor: colors.border, marginVertical: spacing.sm },

    // Shared notice shell; the two variants differ in colour, icon and border style.
    notice: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
    },
    simNotice: { backgroundColor: notice.sim.bg, borderWidth: 1, borderColor: notice.sim.border },
    warnNotice: {
      backgroundColor: notice.warn.bg, borderWidth: 1, borderColor: notice.warn.border,
      borderLeftWidth: 4, marginTop: spacing.md,
    },
    noticeIcon: { marginTop: 1 },
    noticeBody: { flex: 1, minWidth: 0 },
    noticeTitle: { fontSize: 13, fontFamily: fonts.headingBold, lineHeight: 19 },
    noticeText: { fontSize: 13, fontFamily: fonts.body, lineHeight: 19 },
    noticeSmall: { fontSize: 11.5, fontFamily: fonts.body, lineHeight: 17, marginTop: 6 },

    policyList: { marginTop: spacing.sm, gap: 4 },
    policyLine: { flexDirection: 'row', gap: 6 },
    policyBullet: { fontSize: 12, lineHeight: 17, fontFamily: fonts.bodySemiBold },
    policyText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: fonts.body },
    policyLabel: { fontFamily: fonts.bodySemiBold },

    ackRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.sm || 8,
      borderWidth: 1, borderColor: notice.warn.border, backgroundColor: notice.warn.ackBg,
    },
    ackRowChecked: { borderColor: notice.warn.icon },
    checkbox: {
      width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: notice.warn.icon,
      alignItems: 'center', justifyContent: 'center', marginTop: 1, backgroundColor: 'transparent',
    },
    checkboxChecked: { backgroundColor: notice.warn.icon },
    ackText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: fonts.bodySemiBold },

    sectionLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginBottom: spacing.sm },

    walletGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    walletCard: {
      flexBasis: '47%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.cardAlt,
      position: 'relative',
    },
    walletCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
    walletLogo: { width: 56, height: 32 },
    walletLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textMuted },
    walletLabelActive: { color: colors.primary },
    walletCheckBadge: {
      position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    },

    actionSection: { marginTop: spacing.xs },
    divider: { height: 0.5, backgroundColor: colors.border, marginBottom: spacing.md },
    selectedWalletNote: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm, textAlign: 'center' },
    selectedWalletNoteStrong: { fontFamily: fonts.bodySemiBold, color: colors.text },

    actionRow: { flexDirection: 'row', gap: spacing.sm },
    cancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    cancelBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
    proceedBtn: { flex: 2, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    proceedBtnDisabled: { opacity: 0.4 },
    proceedBtnText: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.onPrimary, letterSpacing: 0.3, textAlign: 'center' },
    hintText: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },

    processingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
    processingText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  });
}
