// Receiptdetailmodal.jsx
// Displays a single receipt's full details with Print and Download
// actions. Print/Download use the browser's native capabilities and only
// work on web (Platform.OS === 'web') — native iOS/Android would need a
// library like expo-print, which isn't part of this project yet.

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

// Kept in sync with the map in Receiptsscreen.jsx — add new payment
// methods to both places (or better, move this to a shared constants
// file both screens import from).
const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Credit/Debit Card',
  hotel: 'Pay at Hotel',
  pay_at_hotel: 'Pay at Hotel',
  online: 'E-wallet',
  gcash: 'GCash',
  maya: 'Maya',
  maribank: 'Maribank',
  gotyme: 'GoTyme',
};

function paymentMethodLabel(method) {
  if (!method) return '—';
  return PAYMENT_METHOD_LABELS[method.toLowerCase()] || method;
}

// Matches getReferenceNumber() in Adminbookingsscreen.jsx and
// formatReservationRef() in Billingrecorddetailscreen.jsx — the stored
// reservationRef is the raw Firestore doc id, but every screen displays
// it as RES- + first 8 chars, uppercased.
function formatReservationRef(id) {
  if (!id) return '—';
  return `RES-${id.slice(0, 8).toUpperCase()}`;
}

function buildReceiptHTML(receipt) {
  const methodLabel = paymentMethodLabel(receipt.paymentMethod);
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${receipt.receiptNumber}</title>
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 40px; color: #1A1A1A; }
          .header { border-bottom: 3px solid #093173; padding-bottom: 16px; margin-bottom: 24px; }
          .hotel-name { font-size: 22px; font-weight: 800; color: #093173; }
          .receipt-title { font-size: 14px; color: #734A09; font-weight: 600; margin-top: 4px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .label { color: #666; font-size: 13px; }
          .value { font-weight: 600; font-size: 13px; }
          .amount-row { margin-top: 16px; padding: 16px; background: #FAF6EF; border-radius: 8px; }
          .amount-value { font-size: 24px; font-weight: 800; color: #093173; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="hotel-name">InnVision</div>
          <div class="receipt-title">Payment Receipt — ${receipt.receiptNumber}</div>
        </div>
        <div class="row"><span class="label">Guest Name</span><span class="value">${receipt.guestName || '—'}</span></div>
        <div class="row"><span class="label">Reservation Ref</span><span class="value">${formatReservationRef(receipt.reservationRef)}</span></div>
        <div class="row"><span class="label">Payment Date</span><span class="value">${formatDateTime(receipt.paymentDate)}</span></div>
        <div class="row"><span class="label">Payment Method</span><span class="value">${methodLabel}</span></div>
        <div class="row"><span class="label">Remaining Balance</span><span class="value">${formatCurrency(receipt.remainingBalanceAfter)}</span></div>
        <div class="row"><span class="label">Processed By</span><span class="value">${receipt.processedByName || '—'}</span></div>
        <div class="amount-row">
          <div class="label">Amount Paid</div>
          <div class="amount-value">${formatCurrency(receipt.amountPaid)}</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Props:
 *  - visible: boolean
 *  - receipt: object | null
 *  - onClose: () => void
 */
export default function ReceiptDetailModal({ visible, receipt, onClose }) {
  if (!receipt) return null;

  const methodLabel = paymentMethodLabel(receipt.paymentMethod);

  const handlePrint = () => {
    if (Platform.OS !== 'web') {
      window?.alert
        ? window.alert('Printing is only available on web right now.')
        : console.warn('Printing is only available on web right now.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(buildReceiptHTML(receipt));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownload = () => {
    if (Platform.OS !== 'web') {
      window?.alert
        ? window.alert('Downloading is only available on web right now.')
        : console.warn('Downloading is only available on web right now.');
      return;
    }
    const html = buildReceiptHTML(receipt);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${receipt.receiptNumber}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.hotelName}>InnVision</Text>
          <Text style={styles.receiptTitle}>Payment Receipt</Text>
          <Text style={styles.receiptNumber}>{receipt.receiptNumber}</Text>

          <View style={styles.divider} />

          <DetailRow label="Guest Name" value={receipt.guestName} />
          <DetailRow label="Reservation Ref" value={formatReservationRef(receipt.reservationRef)} />
          <DetailRow label="Payment Date" value={formatDateTime(receipt.paymentDate)} />
          <DetailRow label="Payment Method" value={methodLabel} />
          <DetailRow label="Remaining Balance" value={formatCurrency(receipt.remainingBalanceAfter)} />
          <DetailRow label="Processed By" value={receipt.processedByName} />

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Amount Paid</Text>
            <Text style={styles.amountValue}>{formatCurrency(receipt.amountPaid)}</Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handlePrint}>
              <Text style={styles.secondaryButtonText}>🖨️ Print</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleDownload}>
              <Text style={styles.secondaryButtonText}>⬇️ Download</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value ?? '—'}</Text>
    </View>
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
  hotelName: { fontFamily: fonts.headingExtraBold, fontSize: 20, color: colors.primary },
  receiptTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.secondary || '#734A09',
    marginTop: 2,
  },
  receiptNumber: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  detailValue: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text, textAlign: 'right' },
  amountBox: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  amountLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  amountValue: { fontFamily: fonts.headingExtraBold, fontSize: 24, color: colors.primary, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  secondaryButton: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  closeButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  closeButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
});