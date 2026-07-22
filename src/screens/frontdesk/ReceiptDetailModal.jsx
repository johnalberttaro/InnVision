// Recordpaymentmodal.jsx
// Overlay modal for recording a payment against a folio. Used from both
// Billingrecorddetailscreen's "Record Payment" button and (eventually)
// Paymentsscreen's folio list — one shared form for both entry points.

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { recordPayment } from '../../utils/BillingService';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'gcash', label: 'GCash', icon: 'phone-portrait-outline' },
  { key: 'card', label: 'Credit/Debit Card', icon: 'card-outline' },
  { key: 'pay_at_hotel', label: 'Pay at Hotel', icon: 'business-outline' },
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
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setError(null);
              }}
            />
            <TouchableOpacity style={styles.fullBalanceButton} onPress={handlePayFullBalance}>
              <Text style={styles.fullBalanceButtonText}>Full Balance</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Payment Method</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.methodChip, paymentMethod === m.key && styles.methodChipActive]}
                onPress={() => setPaymentMethod(m.key)}
              >
                <Ionicons
                  name={m.icon}
                  size={18}
                  color={paymentMethod === m.key ? colors.white : colors.textMuted}
                  style={styles.methodIcon}
                />
                <Text
                  style={[
                    styles.methodChipText,
                    paymentMethod === m.key && styles.methodChipTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={submitting}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, (!isValidAmount || submitting) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={!isValidAmount || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Confirm Payment</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: radius.lg || 16,
    padding: spacing.lg,
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
  },
  fullBalanceButton: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryTint,
  },
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
  },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodIcon: { marginBottom: 2 },
  methodChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
  methodChipTextActive: { color: colors.white },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: '#B3261E', marginBottom: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textMuted },
  submitButton: {
    flex: 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
});