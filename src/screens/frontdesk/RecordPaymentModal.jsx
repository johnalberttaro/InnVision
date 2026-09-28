// Recordpaymentmodal.jsx
// Overlay modal for recording a payment against a folio. Used from both
// Billingrecorddetailscreen's "Record Payment" button and (eventually)
// Paymentsscreen's folio list — one shared form for both entry points.
//
// UI PASS (this redesign):
//  1. Removed "Pay at Hotel" from the selectable payment methods — a
//     front-desk staffer is recording a payment that has already
//     happened, and "pay at hotel" describes a future promise to pay,
//     not something you'd record after the fact. (Historical payments
//     already recorded with this method still display correctly
//     elsewhere — ReceiptsScreen/ReceiptDetailModal's label lookups
//     were deliberately left alone.) With it gone, the remaining 3
//     chips also now fit on one row instead of "Pay at Hotel" wrapping
//     alone onto a second row.
//  2. Every interactive element (chips, Full Balance, Cancel, Confirm)
//     switched from TouchableOpacity to Pressable with onHoverIn/
//     onHoverOut, the same pattern KpiCard.jsx already uses — this app
//     runs on web (npm run build:web), where TouchableOpacity gives no
//     mouse-hover feedback at all.
//  3. General polish to match the rest of the app: a real card shadow
//     (was missing entirely), a focus ring on the amount input, emoji
//     icons swapped for the same Ionicons set used everywhere else,
//     and the error message promoted from bare red text to a small
//     tinted banner (same "status color as a soft pill" language as
//     the dashboard KPI cards).

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { recordPayment } from '../../utils/BillingService';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'e-wallet', label: 'E-Wallet', icon: 'wallet-outline' },
  { key: 'card', label: 'Credit/Debit Card', icon: 'card-outline' },
];

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Props:
 *  - visible: boolean
 *  - folio: object | null      the billingRecords doc (needs id, guestName, remainingBalance)
 *  - staffUid: string          currently signed-in admin's uid, stamped on the payment
 *  - staffName: string         currently signed-in admin's display name
 *  - onClose: () => void       dismiss without recording anything
 *  - onSuccess: (result) => void   called after a successful recordPayment() call
 */
export default function RecordPaymentModal({ visible, folio, staffUid, staffName, onClose, onSuccess }) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [amountFocused, setAmountFocused] = useState(false);
  const [fullBalanceHovered, setFullBalanceHovered] = useState(false);
  const [hoveredMethod, setHoveredMethod] = useState(null);
  const [cancelHovered, setCancelHovered] = useState(false);
  const [confirmHovered, setConfirmHovered] = useState(false);

  // Reset form state each time the modal opens for a (possibly different) folio.
  useEffect(() => {
    if (visible) {
      setAmount('');
      setPaymentMethod('cash');
      setError(null);
      setSubmitting(false);
    }
  }, [visible, folio?.id]);

  if (!folio) return null;

  const remainingBalance = folio.remainingBalance || 0;
  const parsedAmount = parseFloat(amount);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= remainingBalance;
  const confirmDisabled = !isValidAmount || submitting;

  const handlePayFullBalance = () => {
    setAmount(remainingBalance.toFixed(2));
  };

  const handleSubmit = async () => {
    if (!isValidAmount) {
      setError(
        parsedAmount > remainingBalance
          ? `Amount can't exceed the remaining balance of ${formatCurrency(remainingBalance)}.`
          : 'Enter a valid payment amount.'
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await recordPayment({
        folioId: folio.id,
        amount: parsedAmount,
        paymentMethod,
        processedByUid: staffUid || null,
        processedByName: staffName || 'Front Desk Staff',
      });
      onSuccess && onSuccess(result);
    } catch (err) {
      console.error('Failed to record payment:', err);
      setError(err.message || 'Could not record this payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Record Payment</Text>
          <Text style={styles.subtitle}>{folio.guestName} • {folio.folioNumber}</Text>

          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Remaining Balance</Text>
            <Text style={styles.balanceAmount}>{formatCurrency(remainingBalance)}</Text>
          </View>

          <Text style={styles.fieldLabel}>Payment Amount</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.amountInput, amountFocused && styles.amountInputFocused]}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setError(null);
              }}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
            />
            <Pressable
              onHoverIn={() => setFullBalanceHovered(true)}
              onHoverOut={() => setFullBalanceHovered(false)}
              style={[styles.fullBalanceButton, fullBalanceHovered && styles.fullBalanceButtonHovered]}
              onPress={handlePayFullBalance}
            >
              <Text style={styles.fullBalanceButtonText}>Full Balance</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Payment Method</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((m) => {
              const isActive = paymentMethod === m.key;
              const isHovered = hoveredMethod === m.key;
              return (
                <Pressable
                  key={m.key}
                  onHoverIn={() => setHoveredMethod(m.key)}
                  onHoverOut={() => setHoveredMethod((k) => (k === m.key ? null : k))}
                  style={[
                    styles.methodChip,
                    isActive && styles.methodChipActive,
                    !isActive && isHovered && styles.methodChipHovered,
                  ]}
                  onPress={() => setPaymentMethod(m.key)}
                >
                  <Ionicons name={m.icon} size={15} color={isActive ? colors.white : colors.textMuted} />
                  <Text style={[styles.methodChipText, isActive && styles.methodChipTextActive]}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={14} color="#B3261E" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.actionsRow}>
            <Pressable
              onHoverIn={() => setCancelHovered(true)}
              onHoverOut={() => setCancelHovered(false)}
              style={[styles.cancelButton, !submitting && cancelHovered && styles.cancelButtonHovered]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onHoverIn={() => setConfirmHovered(true)}
              onHoverOut={() => setConfirmHovered(false)}
              style={[
                styles.submitButton,
                !confirmDisabled && confirmHovered && styles.submitButtonHovered,
                confirmDisabled && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={confirmDisabled}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Confirm Payment</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlayDim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    // Modals sit a level above inline cards in the visual hierarchy, so
    // this is deliberately heavier than e.g. KpiCard's shadow.
    shadowColor: '#332B22',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: { fontFamily: fonts.headingExtraBold, fontSize: 20, color: colors.primary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  balanceLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  balanceAmount: { fontFamily: fonts.headingSemiBold, fontSize: 17, color: colors.primary },
  fieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text, marginBottom: 6 },
  amountRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    outlineStyle: 'none', // web: swap the browser's default blue focus ring for amountInputFocused's border below
  },
  amountInputFocused: { borderColor: colors.primary },
  fullBalanceButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryTint,
    cursor: 'pointer',
  },
  fullBalanceButtonHovered: { backgroundColor: colors.border },
  fullBalanceButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primary },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    cursor: 'pointer',
  },
  methodChipHovered: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
  methodChipTextActive: { color: colors.white },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(179,38,30,0.08)',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: '#B3261E', flex: 1 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    cursor: 'pointer',
  },
  // backgroundColor tint alone (background vs. white) was too close to
  // register at a glance — added borderColor + a slight shadow so the
  // hover state is unmistakable, not just technically-present.
  cancelButtonHovered: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.textMuted,
    shadowColor: '#332B22',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cancelButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textMuted },
  submitButton: {
    flex: 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    cursor: 'pointer',
  },
  // primary -> primaryDark is a genuine color change, but both are
  // near-black, so on its own it barely reads at a glance — the shadow
  // lift is what actually makes the hover state unmistakable here.
  submitButtonHovered: {
    backgroundColor: colors.primaryDark,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  submitButtonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  submitButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
});