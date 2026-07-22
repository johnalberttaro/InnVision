// Paymentsscreen.jsx
// "Payments" sidebar item — a fast-access list of folios that still owe
// money, so front desk can find a guest and record a payment without
// going through Billing Records -> detail view first. Reuses
// Recordpaymentmodal.jsx, the same component Billingrecorddetailscreen
// uses for its "Record Payment" button.
//
// ENHANCED: added a KPI row (Total Outstanding, Folios Due), room
// numbers as colored badges instead of plain text, a status-colored
// left-border accent per row, and swapped the 💳 emoji Pay button for a
// real Ionicons icon — same design language as the rest of the app now.

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
import { getOutstandingBalances } from '../../utils/BillingService';
import RecordPaymentModal from './RecordPaymentModal';
import KpiCard from '../../components/dashboard/KpiCard';

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLE = {
  partially_paid: { bg: '#FFF4D6', text: '#9A7B00', accent: '#C99400', label: 'Partially Paid' },
  unpaid: { bg: '#FCE1E1', text: '#B3261E', accent: '#B3261E', label: 'Unpaid' },
};

/**
 * Props:
 *  - staffUid: string     passed straight through to RecordPaymentModal
 *  - staffName: string    passed straight through to RecordPaymentModal
 */
export default function PaymentsScreen({ staffUid, staffName }) {
  const [folios, setFolios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [selectedFolio, setSelectedFolio] = useState(null);

  const loadFolios = useCallback(async () => {
    try {
      setError(null);
      const data = await getOutstandingBalances();
      setFolios(data);
    } catch (err) {
      console.error('Failed to load outstanding folios:', err);
      setError('Could not load folios with a balance due. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadFolios();
  }, [loadFolios]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFolios();
  };

  const handlePaymentSuccess = () => {
    setSelectedFolio(null);
    loadFolios(); // refresh the list so a fully-paid folio drops off immediately
  };

  // ── KPIs ───────────────────────────────────────────────────────────────
  const totalOutstanding = useMemo(
    () => folios.reduce((sum, f) => sum + (f.remainingBalance || 0), 0),
    [folios]
  );
  const unpaidCount = useMemo(() => folios.filter((f) => f.billingStatus === 'unpaid').length, [folios]);
  const partiallyPaidCount = useMemo(
    () => folios.filter((f) => f.billingStatus === 'partially_paid').length,
    [folios]
  );

  const filteredFolios = folios.filter((f) => {
    if (!searchTerm.trim()) return true;
    const lower = searchTerm.toLowerCase();
    return (
      f.folioNumber?.toLowerCase().includes(lower) ||
      f.guestName?.toLowerCase().includes(lower) ||
      (Array.isArray(f.roomNumbers) ? f.roomNumbers.join(',') : String(f.roomNumbers))
        .toLowerCase()
        .includes(lower)
    );
  });

  const renderItem = ({ item }) => {
    const statusStyle = STATUS_STYLE[item.billingStatus] || STATUS_STYLE.unpaid;
    const roomNumbers = Array.isArray(item.roomNumbers) ? item.roomNumbers : [item.roomNumbers].filter(Boolean);

    return (
      <TouchableOpacity
        style={[styles.row, { borderLeftColor: statusStyle.accent }]}
        activeOpacity={0.7}
        onPress={() => setSelectedFolio(item)}
      >
        <View style={styles.rowMain}>
          <Text style={styles.folioNumber}>{item.folioNumber}</Text>
          <Text style={styles.guestName}>{item.guestName}</Text>
          <View style={styles.roomBadgeRow}>
            {roomNumbers.map((rn) => (
              <View key={rn} style={styles.roomBadge}>
                <Ionicons name="key-outline" size={11} color={colors.white} />
                <Text style={styles.roomBadgeText}>Room {rn}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.rowSide}>
          <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.badgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
          </View>
          <Text style={styles.balanceAmount}>{formatCurrency(item.remainingBalance)}</Text>
          <TouchableOpacity style={styles.payButton} onPress={() => setSelectedFolio(item)}>
            <Ionicons name="card-outline" size={13} color={colors.white} />
            <Text style={styles.payButtonText}>Pay</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payments</Text>
      <Text style={styles.subtitle}>Folios with a balance still due — tap to record a payment</Text>

      <View style={styles.kpiRow}>
        <KpiCard
          icon="cash-outline"
          label="Total Outstanding"
          value={formatCurrency(totalOutstanding)}
          accent={totalOutstanding > 0 ? '#B3261E' : '#1E7A3D'}
          note="Across all folios below"
        />
        <KpiCard
          icon="document-text-outline"
          label="Folios Due"
          value={String(folios.length)}
          accent={colors.primary}
          note={`${unpaidCount} unpaid, ${partiallyPaidCount} partial`}
        />
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by folio #, guest name, or room number"
        placeholderTextColor={colors.textMuted}
        value={searchTerm}
        onChangeText={setSearchTerm}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : filteredFolios.length === 0 ? (
        <Text style={styles.emptyText}>
          {folios.length === 0 ? 'No outstanding balances — everyone is paid up.' : 'No matches found.'}
        </Text>
      ) : (
        <FlatList
          data={filteredFolios}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />
      )}

      <RecordPaymentModal
        visible={!!selectedFolio}
        folio={selectedFolio}
        staffUid={staffUid}
        staffName={staffName}
        onClose={() => setSelectedFolio(null)}
        onSuccess={handlePaymentSuccess}
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
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
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
    borderLeftWidth: 4, // color set inline per-row via STATUS_STYLE().accent
  },
  rowMain: { flex: 1, paddingRight: 10 },
  folioNumber: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.secondary || '#734A09', marginBottom: 2 },
  guestName: { fontFamily: fonts.headingSemiBold, fontSize: 16, color: colors.text },
  subInfo: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  roomBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
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
  rowSide: { alignItems: 'flex-end', gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  balanceAmount: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.text },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    marginTop: 2,
  },
  payButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.white },
  errorText: { fontFamily: fonts.body, color: '#B3261E', marginTop: spacing.xl, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xl, textAlign: 'center' },
});