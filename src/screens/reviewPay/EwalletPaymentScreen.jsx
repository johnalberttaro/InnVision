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

/**
 * EwalletPaymentScreen — dedicated "Pay Online" step.
 *
 * Rendered by ReviewPayScreen as a local sub-view (no App.jsx routing
 * involved — ReviewPayScreen just swaps its content for this component
 * when the guest taps "Pay Now" and swaps back on Cancel). This keeps the
 * guest-details form and this payment step visually and structurally
 * separate, per request, without introducing a new top-level route.
 *
 * This is a MOCK payment step — no real gateway integration exists for
 * GCash / Maya / GoTyme / Maribank. Selecting a wallet and tapping
 * Proceed simulates a brief "processing" delay and then reports the
 * chosen wallet back to the parent via onConfirmPayment(walletId).
 * ReviewPayScreen owns the actual Firestore write (submitReservation),
 * so nothing here touches the database directly — this screen is
 * presentation + selection only.
 *
 * The reservation summary block is always visible (not conditional on
 * wallet selection), matching the reference screenshots. The
 * Proceed/Cancel action row only appears once a wallet has been picked.
 *
 * Props:
 *  - checkIn, checkOut: Date
 *  - nights: number
 *  - roomTypeSummary: string
 *  - guestName: string
 *  - subtotal, tax, total: number
 *  - onCancel: () => void                 return to the guest details form
 *  - onConfirmPayment: (walletId) => void  called after the mock "processing"
 *      delay completes; parent handles the actual reservation submission
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
  onCancel,
  onConfirmPayment,
}) {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const [selectedWallet, setSelectedWallet] = useState(null);
  const [processing, setProcessing] = useState(false);

  // Generated once per screen mount, display-only — mirrors the
  // "Reference No / Payment ID" line in the reference gateway screenshots.
  const [referenceNo] = useState(() => {
    const a = Date.now().toString().slice(-13).padStart(13, '0');
    const b = `T${Math.floor(1000000000 + Math.random() * 8999999999)}`;
    return `${a} / ${b}`;
  });

  const selectedOption = EWALLET_OPTIONS.find(w => w.id === selectedWallet);

  const handleProceed = () => {
    if (!selectedWallet || processing) return;
    setProcessing(true);
    setTimeout(() => {
      onConfirmPayment(selectedWallet);
    }, 1600);
  };

  const handleCancel = () => {
    if (processing) return;
    onCancel();
  };

  return (
    <View style={styles.panel}>
      <TouchableOpacity style={styles.backLink} onPress={handleCancel} activeOpacity={0.7} disabled={processing}>
        <Ionicons name="arrow-back" size={14} color={colors.textMuted} />
        <Text style={styles.backLinkText}>Back to Guest Details</Text>
      </TouchableOpacity>

      <Text style={styles.panelTitle}>Available Payment Method</Text>

      {/* Reservation summary — always visible, per reference screenshots */}
      <View style={styles.summaryBox}>
        <Text style={styles.summaryHeading}>
          <Ionicons name="receipt-outline" size={13} color={colors.primary} /> Summary Of Transaction
        </Text>
        <SummaryRow styles={styles} label="Net Charges" value={formatCurrency(total)} strong />
        <SummaryRow styles={styles} label="Pay To" value="INNVISION HOTEL" />
        <SummaryRow styles={styles} label="Payment Of" value={`${roomTypeSummary} • ${formatDate(checkIn)} – ${formatDate(checkOut)}`} />
        <SummaryRow styles={styles} label="Guest" value={guestName} />
        <SummaryRow styles={styles} label="Reference No." value={referenceNo} />
        <View style={styles.summaryDivider} />
        <SummaryRow styles={styles} label="Subtotal" value={formatCurrency(subtotal)} />
        <SummaryRow styles={styles} label={`Tax & Service (${nights} night${nights !== 1 ? 's' : ''})`} value={formatCurrency(tax)} />
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

      {/* Proceed / Cancel — only once a wallet is chosen */}
      {selectedWallet && !processing && (
        <View style={styles.actionSection}>
          <View style={styles.divider} />
          <Text style={styles.selectedWalletNote}>
            Paying with <Text style={styles.selectedWalletNoteStrong}>{selectedOption?.label}</Text>
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.proceedBtn} onPress={handleProceed} activeOpacity={0.85}>
              <Text style={styles.proceedBtnText}>» Proceed</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {processing && (
        <View style={styles.processingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.processingText}>
            Processing your {selectedOption?.label} payment…
          </Text>
        </View>
      )}

      <Text style={styles.disclaimer}>
        This is a simulated payment step for demo purposes — no real transaction is processed.
      </Text>
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

function getStyles(colors, spacing, radius, fonts) {
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

    panelTitle: {
      fontSize: 13, fontFamily: fonts.headingBold, color: colors.primary,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.md,
      paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
    },

    summaryBox: { backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, gap: 2 },
    summaryHeading: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.primary, marginBottom: spacing.xs },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
    summaryLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, flexShrink: 0 },
    summaryValue: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.text, textAlign: 'right', flex: 1 },
    summaryValueStrong: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
    summaryDivider: { height: 0.5, backgroundColor: colors.border, marginVertical: spacing.sm },

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

    actionSection: { marginTop: spacing.md },
    divider: { height: 0.5, backgroundColor: colors.border, marginBottom: spacing.md },
    selectedWalletNote: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm, textAlign: 'center' },
    selectedWalletNoteStrong: { fontFamily: fonts.bodySemiBold, color: colors.text },

    actionRow: { flexDirection: 'row', gap: spacing.sm },
    cancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, alignItems: 'center' },
    cancelBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
    proceedBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    proceedBtnText: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.onPrimary, letterSpacing: 0.3 },

    processingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
    processingText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },

    disclaimer: { fontSize: 9, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, lineHeight: 13 },
  });
}