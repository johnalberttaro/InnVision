// Billingrecorddetailscreen.jsx
// Full folio view: charges breakdown, running balance, payment history,
// and the entry point into recording a new payment. Opened from
// Billingrecordsscreen via onSelectRecord -> AdminShell's openFolioDetail.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { getBillingRecord, getReceiptsForFolio } from '../../utils/BillingService';

function formatDate(value) {
  if (!value) return '—';
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(value);
  }
}

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Matches getReferenceNumber() in Adminbookingsscreen.jsx — reservationRef
// on the folio is the raw Firestore doc id, but every other screen in the
// app displays it as RES- + first 8 chars, uppercased. Keeping this in
// sync so the same reservation shows the same reference everywhere.
function formatReservationRef(id) {
  if (!id) return '—';
  return `RES-${id.slice(0, 8).toUpperCase()}`;
}

const STATUS_STYLE = {
  paid: { bg: '#DFF5E1', text: '#1E7B34', label: 'Paid' },
  partially_paid: { bg: '#FFF4D6', text: '#9A7B00', label: 'Partially Paid' },
  unpaid: { bg: '#FCE1E1', text: '#B3261E', label: 'Unpaid' },
};

/**
 * Props:
 *  - folioId: string           the billingRecords doc id (from selectedFolioId in AdminShell)
 *  - onBack: () => void        returns to whichever billing screen opened this
 *  - onRecordPayment?: (folio) => void   opens the Record Payment flow — wire this
 *      up once Paymentsscreen / a payment modal exists. Left optional so this
 *      screen still works stand-alone before that piece is built.
 */
export default function BillingRecordDetailScreen({ folioId, onBack, onRecordPayment }) {
  const [folio, setFolio] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFolio = useCallback(async () => {
    if (!folioId) return;
    try {
      setError(null);
      const [folioData, receiptData] = await Promise.all([
        getBillingRecord(folioId),
        getReceiptsForFolio(folioId),
      ]);
      setFolio(folioData);
      setReceipts(receiptData);
    } catch (err) {
      console.error('Failed to load billing record:', err);
      setError('Could not load this billing record.');
    } finally {
      setLoading(false);
    }
  }, [folioId]);

  useEffect(() => {
    setLoading(true);
    loadFolio();
  }, [loadFolio]);

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error || !folio) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.errorText}>{error || 'Billing record not found.'}</Text>
        <TouchableOpacity style={styles.backLink} onPress={onBack}>
          <Text style={styles.backLinkText}>← Back to Billing Records</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = STATUS_STYLE[folio.billingStatus] || STATUS_STYLE.unpaid;
  const roomNumbers = Array.isArray(folio.roomNumbers) ? folio.roomNumbers : [folio.roomNumbers].filter(Boolean);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack} style={styles.backLink}>
        <Text style={styles.backLinkText}>← Back to Billing Records</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.folioNumber}>{folio.folioNumber}</Text>
          <Text style={styles.guestName}>{folio.guestName}</Text>
          <View style={styles.roomBadgeRow}>
            {roomNumbers.map((rn) => (
              <View key={rn} style={styles.roomBadge}>
                <Ionicons name="key-outline" size={11} color={colors.white} />
                <Text style={styles.roomBadgeText}>Room {rn}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
        </View>
      </View>

      {/* Stay details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stay Details</Text>
        <DetailRow label="Reservation Ref" value={formatReservationRef(folio.reservationRef)} />
        <DetailRow label="Check-in" value={formatDate(folio.checkInDate)} />
        <DetailRow label="Check-out" value={formatDate(folio.checkOutDate)} />
      </View>

      {/* Charges breakdown */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Charges</Text>
        <DetailRow label="Room Charges" value={formatCurrency(folio.roomCharges)} />
        <DetailRow label="Additional Charges" value={formatCurrency(folio.additionalCharges)} />
        <DetailRow label="Taxes & Service Charges" value={formatCurrency(folio.taxServiceCharges)} />
        <View style={styles.divider} />
        <DetailRow label="Total Amount Due" value={formatCurrency(folio.totalAmountDue)} emphasize />
        <DetailRow label="Amount Paid" value={formatCurrency(folio.amountPaid)} />
        <DetailRow label="Remaining Balance" value={formatCurrency(folio.remainingBalance)} emphasize />
      </View>

      {/* Payment history for this folio */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment History</Text>
        {receipts.length === 0 ? (
          <Text style={styles.emptyText}>No payments recorded yet.</Text>
        ) : (
          receipts.map((r) => (
            <View key={r.id} style={styles.receiptRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.receiptNumber}>{r.receiptNumber}</Text>
                <Text style={styles.receiptMeta}>
                  {formatDate(r.paymentDate)} • {r.paymentMethod?.replace('_', ' ')}
                </Text>
              </View>
              <Text style={styles.receiptAmount}>{formatCurrency(r.amountPaid)}</Text>
            </View>
          ))
        )}
      </View>

      {folio.remainingBalance > 0 && (
        <TouchableOpacity
          style={styles.paymentButton}
          activeOpacity={0.85}
          onPress={() => onRecordPayment && onRecordPayment(folio)}
        >
          <Ionicons name="card-outline" size={15} color={colors.white} />
          <Text style={styles.paymentButtonText}>Record Payment</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value, emphasize }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, emphasize && styles.detailValueEmphasis]}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { fontFamily: fonts.body, color: '#B3261E', marginBottom: spacing.md, textAlign: 'center' },
  backLink: { marginBottom: spacing.md, alignSelf: 'flex-start' },
  backLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primary },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  folioNumber: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.secondary || '#734A09' },
  guestName: { fontFamily: fonts.headingExtraBold, fontSize: 22, color: colors.primary, marginTop: 2 },
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  statusBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  detailValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
    textAlign: 'right',
  },
  detailValueEmphasis: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 15,
    color: colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  receiptNumber: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  receiptMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  receiptAmount: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.text },
  paymentButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  paymentButtonText: { color: colors.white, fontFamily: fonts.headingSemiBold, fontSize: 14 },
  roomBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  roomBadgeText: { fontSize: 10, fontFamily: fonts.headingSemiBold, color: colors.white },
});