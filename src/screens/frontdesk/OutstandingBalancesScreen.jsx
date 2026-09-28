// OutstandingBalancesScreen.jsx
// Front Desk / Admin view: every folio still owing money, independent of
// checkout date — the general case the checkout-time balance guard in
// ReservationsScreen.jsx doesn't cover (that one only fires at the exact
// moment someone clicks Check Out; a balance that reappears mid-stay, with
// no checkout scheduled for days, had no way to surface at all until now).
//
// Sits behind BillingManagementScreen.jsx's "Outstanding Balances" tab,
// replacing its old ComingSoonPanel placeholder. Modeled closely on its
// sibling BillingRecordsScreen.jsx — same KpiCard/search/filter/list
// language — pre-filtered server-side to unpaid + partially_paid via
// BillingService.js's existing getOutstandingBalances() (no new table,
// migration, or RLS policy needed; that query already existed and worked).
//
// Two additions beyond a filtered copy of Billing Records:
//  - A 4th KPI, "Oldest Balance" — the folio whose updated_at (its last
//    payment/charge activity) is furthest in the past, i.e. the balance
//    that's been sitting untouched longest. Same column
//    getOutstandingBalances() already orders by, just surfaced as a stat.
//  - A Sort toggle between Amount Owed and Days Outstanding, since the
//    plan for this screen specifically called out both as worth having.
//
// Per-row "Checks out in X days" / "Checked out X days ago" compares
// billing_records.check_out_date — the reservation's scheduled end date,
// NOT necessarily already in the past (a mid-stay balance's checkout can
// be days away) — as a calendar date, not a raw timestamp. A plain
// `new Date(checkOutDate) < new Date()` would reintroduce the exact
// timezone bug already found and fixed in ReservationsScreen.jsx's
// isDueTodayOrEarlier, so this compares calendar days the same
// timezone-safe way that fix does.
//
// "Days Outstanding" (the sort key and the Oldest Balance KPI) deliberately
// uses updated_at instead — a balance is just as real, and just as worth
// chasing, on a guest who hasn't checked out yet.

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
import { colors, spacing, fonts } from '../../utils/portalTheme';
import { getOutstandingBalances } from '../../utils/BillingService';
import Pagination from '../../components/shared/Pagination';
import KpiCard from '../../components/dashboard/KpiCard';

const PAGE_SIZE = 5;

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'partially_paid', label: 'Partially Paid' },
];

const STATUS_STYLE = {
  partially_paid: { bg: '#FCF1DC', text: '#8A5B00', accent: '#C99400', label: 'Partially Paid' },
  unpaid: { bg: '#FBE7E7', text: '#B3261E', accent: '#B3261E', label: 'Unpaid' },
};

const SORT_OPTIONS = [
  { key: 'amount', label: 'Amount Owed' },
  { key: 'days', label: 'Days Outstanding' },
];

// Calendar-day difference between a date and today (local time), not a raw
// ms subtraction — see file header. Positive = in the future, negative =
// in the past.
function calendarDaysUntil(dateValue) {
  if (!dateValue) return null;
  const target = new Date(dateValue);
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d0 = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((d0 - t0) / 86400000);
}

function stayLabel(checkOutDate) {
  const days = calendarDaysUntil(checkOutDate);
  if (days === null) return '';
  if (days > 1) return `Checks out in ${days} days`;
  if (days === 1) return 'Checks out tomorrow';
  if (days === 0) return 'Checks out today';
  const ago = Math.abs(days);
  return `Checked out ${ago} day${ago === 1 ? '' : 's'} ago`;
}

// Days since this folio's last activity — see file header for why this
// (not checkout date) is what "outstanding" duration means here.
function daysSinceUpdate(record) {
  const then = new Date(record?.updatedAt || record?.createdAt).getTime();
  if (isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

export default function OutstandingBalancesScreen({ onSelectRecord }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('amount');
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadRecords = useCallback(async () => {
    try {
      setError(null);
      const data = await getOutstandingBalances();
      setRecords(data);
    } catch (err) {
      console.error('Failed to load outstanding balances:', err);
      setError('Could not load outstanding balances. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadRecords();
  }, [loadRecords]);

  const onRefresh = () => {
    setRefreshing(true);
    loadRecords();
  };

  // ── KPIs — always computed from the full fetch, so they stay accurate
  // no matter what search/filter/sort is currently applied to the list
  // below (same principle BillingRecordsScreen's own KPI row follows). ──
  const totalOutstanding = useMemo(
    () => records.reduce((sum, r) => sum + (r.remainingBalance || 0), 0),
    [records]
  );
  const unpaidCount = useMemo(() => records.filter((r) => r.billingStatus === 'unpaid').length, [records]);
  const partialCount = useMemo(() => records.filter((r) => r.billingStatus === 'partially_paid').length, [records]);
  const oldest = useMemo(() => {
    if (records.length === 0) return null;
    return records.reduce((a, b) => (daysSinceUpdate(b) > daysSinceUpdate(a) ? b : a));
  }, [records]);

  // ── Search + filter + sort ──────────────────────────────────────────
  const visibleRecords = useMemo(() => {
    let list = records;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.billingStatus === statusFilter);
    }
    if (searchTerm.trim().length > 0) {
      const lower = searchTerm.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.folioNumber?.toLowerCase().includes(lower) ||
          r.guestName?.toLowerCase().includes(lower) ||
          r.roomNumbers?.some((rn) => String(rn).toLowerCase().includes(lower))
      );
    }
    const sorted = [...list];
    if (sortKey === 'amount') {
      sorted.sort((a, b) => (b.remainingBalance || 0) - (a.remainingBalance || 0));
    } else {
      sorted.sort((a, b) => daysSinceUpdate(b) - daysSinceUpdate(a));
    }
    return sorted;
  }, [records, statusFilter, searchTerm, sortKey]);

  // Search/filter/sort changing the result set shape can strand the user
  // on a page number that no longer exists — same fix BillingRecordsScreen
  // applies to its own pagination.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortKey]);

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRecords.slice(start, start + PAGE_SIZE);
  }, [visibleRecords, currentPage]);

  const toggleSort = () => setSortKey((k) => (k === 'amount' ? 'days' : 'amount'));

  const renderStatusBadge = (status) => {
    const style = STATUS_STYLE[status] || STATUS_STYLE.unpaid;
    return (
      <View style={[styles.badge, { backgroundColor: style.bg }]}>
        <Text style={[styles.badgeText, { color: style.text }]}>{style.label}</Text>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const statusStyle = STATUS_STYLE[item.billingStatus] || STATUS_STYLE.unpaid;
    const roomNumbers = Array.isArray(item.roomNumbers) ? item.roomNumbers : [item.roomNumbers].filter(Boolean);

    return (
      <TouchableOpacity
        style={[styles.row, { borderLeftColor: statusStyle.accent }]}
        activeOpacity={0.7}
        onPress={() => onSelectRecord?.(item)}
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

          <Text style={styles.subInfo}>{stayLabel(item.checkOutDate)}</Text>
        </View>
        <View style={styles.rowSide}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceAmount}>
            ₱{item.remainingBalance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          {renderStatusBadge(item.billingStatus)}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Outstanding Balances</Text>
          <Text style={styles.subtitle}>Every folio still owing money, independent of checkout date.</Text>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by folio #, guest name, or room number"
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      <View style={styles.kpiRow}>
        <KpiCard
          icon="cash-outline"
          label="Total Outstanding"
          value={`₱${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          accent={totalOutstanding > 0 ? '#B3261E' : '#1E7A3D'}
          note="Unpaid + partially paid"
        />
        <KpiCard
          icon="alert-circle-outline"
          label="Unpaid Folios"
          value={String(unpaidCount)}
          accent={unpaidCount > 0 ? '#B3261E' : '#1E7A3D'}
          note="No payment recorded yet"
        />
        <KpiCard
          icon="time-outline"
          label="Partially Paid"
          value={String(partialCount)}
          accent={partialCount > 0 ? '#C99400' : '#1E7A3D'}
          note="Balance left after a partial payment"
        />
        <KpiCard
          icon="hourglass-outline"
          label="Oldest Balance"
          value={oldest ? `${daysSinceUpdate(oldest)} day${daysSinceUpdate(oldest) === 1 ? '' : 's'}` : '—'}
          accent={colors.primary}
          note={
            oldest
              ? `${oldest.guestName} · Room ${Array.isArray(oldest.roomNumbers) ? oldest.roomNumbers.join(', ') : oldest.roomNumbers}`
              : 'No outstanding folios'
          }
        />
      </View>

      <View style={styles.filterAndPageRow}>
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.key)}
            >
              <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.sortControl} onPress={toggleSort}>
            <Ionicons name="swap-vertical-outline" size={13} color={colors.textMuted} />
            <Text style={styles.sortControlText}>
              Sort: <Text style={styles.sortControlValue}>{SORT_OPTIONS.find((s) => s.key === sortKey)?.label}</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {!loading && !error && visibleRecords.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={visibleRecords.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : visibleRecords.length === 0 ? (
        <Text style={styles.emptyText}>
          {records.length === 0
            ? 'Nothing outstanding — every folio is paid in full.'
            : 'No folios match the current search/filter.'}
        </Text>
      ) : (
        <FlatList
          data={pagedRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: spacing.sm }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
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
  title: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.primary,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
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
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  filterAndPageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  sortControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortControlText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  sortControlValue: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4, // color set inline per-row via STATUS_STYLE().accent
  },
  rowMain: {
    flex: 1,
    paddingRight: 10,
  },
  folioNumber: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.accent,
    marginBottom: 2,
  },
  guestName: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 16,
    color: colors.text,
  },
  subInfo: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
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
  rowSide: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  balanceAmount: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
  },
  errorText: {
    fontFamily: fonts.body,
    color: '#B3261E',
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});