// Receiptsscreen.jsx
// "Receipts" sidebar item — browsable list of every receipt generated
// across all folios. Tapping a row opens Receiptdetailmodal for
// view/print/download.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { getAllReceipts, searchReceipts } from '../../utils/BillingService';
import ReceiptDetailModal from './ReceiptDetailModal';

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
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

export default function ReceiptsScreen() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const loadReceipts = useCallback(async () => {
    try {
      setError(null);
      const data = searchTerm.trim().length > 0
        ? await searchReceipts(searchTerm.trim())
        : await getAllReceipts();
      setReceipts(data);
    } catch (err) {
      console.error('Failed to load receipts:', err);
      setError('Could not load receipts. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    setLoading(true);
    loadReceipts();
  }, [loadReceipts]);

  const onRefresh = () => {
    setRefreshing(true);
    loadReceipts();
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => setSelectedReceipt(item)}>
      <View style={styles.rowMain}>
        <Text style={styles.receiptNumber}>{item.receiptNumber}</Text>
        <Text style={styles.guestName}>{item.guestName}</Text>
        <Text style={styles.subInfo}>
          {formatDate(item.paymentDate)} • {paymentMethodLabel(item.paymentMethod)}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.amount}>{formatCurrency(item.amountPaid)}</Text>
        <Text style={styles.viewLink}>View →</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Receipts</Text>
      <Text style={styles.subtitle}>Every payment receipt generated across all folios</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by receipt # or guest name"
        placeholderTextColor={colors.textMuted}
        value={searchTerm}
        onChangeText={setSearchTerm}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : receipts.length === 0 ? (
        <Text style={styles.emptyText}>No receipts found.</Text>
      ) : (
        <FlatList
          data={receipts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />
      )}

      <ReceiptDetailModal
        visible={!!selectedReceipt}
        receipt={selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontFamily: fonts.headingBold, fontSize: 24, color: colors.primary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  searchInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowMain: { flex: 1, paddingRight: 10 },
  receiptNumber: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.secondary || '#734A09', marginBottom: 2 },
  guestName: { fontFamily: fonts.headingSemiBold, fontSize: 16, color: colors.text },
  subInfo: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowSide: { alignItems: 'flex-end' },
  amount: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.text, marginBottom: 4 },
  viewLink: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primary },
  errorText: { fontFamily: fonts.body, color: '#B3261E', marginTop: spacing.xl, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xl, textAlign: 'center' },
});