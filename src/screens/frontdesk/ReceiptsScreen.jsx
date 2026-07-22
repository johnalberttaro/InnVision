// Receiptsscreen.jsx
// "Receipts" sidebar item — browsable list of every receipt generated
// across all folios. Tapping a row opens Receiptdetailmodal for
// view/print/download.
//
// ENHANCED: added a KPI row (Total Collected, Receipts Today) computed
// from a separate always-unfiltered fetch, and turned the plain "View →"
// text link into a proper icon+text affordance matching KpiCard's "View
// details" pattern used elsewhere.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { getAllReceipts, searchReceipts } from '../../utils/BillingService';
import ReceiptDetailModal from './ReceiptDetailModal';
import Pagination from '../../components/shared/Pagination';
import KpiCard from '../../components/dashboard/KpiCard';

const PAGE_SIZE = 5;

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
  const [currentPage, setCurrentPage] = useState(1);

  // Separate from `receipts` (which reflects the current search) — this
  // always holds every receipt, so the KPI row stays accurate no matter
  // what the list below is currently searched for.
  const [allReceiptsForKpis, setAllReceiptsForKpis] = useState([]);

  const loadKpiData = useCallback(async () => {
    try {
      const data = await getAllReceipts();
      setAllReceiptsForKpis(data);
    } catch (err) {
      console.error('Failed to load receipts KPI data:', err);
    }
  }, []);

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
    loadKpiData();
  }, [loadReceipts, loadKpiData]);

  // Result set shape changes whenever the search term changes — jump back
  // to page 1 so the user isn't stranded on a page that may no longer exist.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const pagedReceipts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return receipts.slice(start, start + PAGE_SIZE);
  }, [receipts, currentPage]);

  const onRefresh = () => {
    setRefreshing(true);
    loadReceipts();
    loadKpiData();
  };

  // ── KPIs ───────────────────────────────────────────────────────────────
  const totalCollected = useMemo(
    () => allReceiptsForKpis.reduce((sum, r) => sum + (r.amountPaid || 0), 0),
    [allReceiptsForKpis]
  );
  const receiptsTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return allReceiptsForKpis.filter((r) => r.paymentDate && new Date(r.paymentDate).toDateString() === today).length;
  }, [allReceiptsForKpis]);

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
        <View style={styles.viewLinkWrap}>
          <Text style={styles.viewLink}>View</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Receipts</Text>
          <Text style={styles.subtitle}>Every payment receipt generated across all folios</Text>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by receipt # or guest name"
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      <View style={styles.kpiRow}>
        <KpiCard
          icon="wallet-outline"
          label="Total Collected"
          value={formatCurrency(totalCollected)}
          accent="#1E7A3D"
          note="Across all receipts"
        />
        <KpiCard
          icon="receipt-outline"
          label="Receipts Today"
          value={String(receiptsTodayCount)}
          accent={colors.primary}
          note="Payments recorded today"
        />
      </View>

      {!loading && !error && receipts.length > 0 && (
        <View style={styles.pageRow}>
          <Pagination
            currentPage={currentPage}
            totalItems={receipts.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : receipts.length === 0 ? (
        <Text style={styles.emptyText}>No receipts found.</Text>
      ) : (
        <FlatList
          data={pagedReceipts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: spacing.sm }}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: { fontFamily: fonts.headingBold, fontSize: 24, color: colors.primary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  searchInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.text,
    width: 260,
    maxWidth: '45%',
  },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  pageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  receiptNumber: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.accent, marginBottom: 2 },
  guestName: { fontFamily: fonts.headingSemiBold, fontSize: 16, color: colors.text },
  subInfo: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowSide: { alignItems: 'flex-end' },
  amount: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.text, marginBottom: 4 },
  viewLinkWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewLink: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primary },
  errorText: { fontFamily: fonts.body, color: '#B3261E', marginTop: spacing.xl, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xl, textAlign: 'center' },
});