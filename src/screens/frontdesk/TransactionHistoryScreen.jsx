// TransactionHistoryScreen.jsx
// Admin view of every entry ever written to the `transactions` table:
// every payment collected, every "Charge to Room" posted, and every
// manual balance-settled override — the audit trail add_room_charge()
// (and record_payment()/mark_balance_settled() before it) has been
// writing all along, with no screen to actually read it back until now.
//
// Sits behind BillingManagementScreen.jsx's "Transaction History" tab,
// replacing its ComingSoonPanel placeholder. Modeled on its sibling
// OutstandingBalancesScreen.jsx — same KpiCard/search/filter/list
// language — backed entirely by BillingService.js's existing
// getTransactionHistory() / getTransactionsByDateRange() (no new
// table, migration, or RLS policy needed).
//
// ROUTING: in both Admin's and Front Desk's tabKeys (FrontDeskShell.jsx
// / AdminShell.jsx) — Admin's already listed 'transactions' before this
// screen existed (see BillingManagementScreen.jsx's ALL_TABS comment);
// Front Desk's didn't, same as it didn't list 'outstanding' until that
// one shipped, and got added here too once it was asked for.
//
// Three filters, one search box:
//  - Date range refetches from the server (getTransactionsByDateRange
//    for 7/30/90 days; "All Time" is getTransactionHistory()'s own
//    bounded default — the most recent transactions property-wide,
//    not literally every row ever logged, so this stays a screen you
//    can actually scroll rather than an unbounded export).
//  - Payment Type is a fixed, curated list (CURRENT_PAYMENT_TYPES,
//    below) of every payment method the app can currently produce —
//    shown in full regardless of what's actually in the loaded date
//    range, so a method like Card is filterable from day one instead
//    of only appearing after its first transaction. Deliberately not
//    the same set as PAYMENT_TYPE_LABELS: that one also has to label
//    retired values ('hotel', 'pay_at_hotel') on old rows, but those
//    shouldn't be offered as filters going forward. Staff Member is
//    the opposite — still built from whatever's actually present,
//    since there's no fixed roster to draw from here — and it doesn't
//    scale the same way either: Payment Type stays a handful of
//    values forever, but Staff grows with headcount, so it's capped
//    to the STAFF_CHIP_LIMIT most active names (by transaction count,
//    not alphabetically) with a "+N more" to expand — a property with
//    100 front desk staff over its lifetime gets a short, useful chip
//    row instead of a hundred-chip wall pushing the actual list
//    off-screen. Only entries with a real staffUid count as "staff"
//    here at all — see the comment on staffActivity below for why.
//  - The search box covers guest name, staff name, and the charge
//    note (e.g. "F&B Order #35 — Room 101") in one field — already the
//    general-purpose way to reach any staff member by name, capped
//    chips or not.
//
// KPIs deliberately don't sum a blended "total amount" across every
// type — a room charge (money owed, nothing collected) and an actual
// payment (money in hand) aren't the same kind of number, and a
// balance-settled override isn't real money at all (see
// add_room_charge.sql's comment on mark_balance_settled()). So the
// stats here are Total Transactions, Room Charges Posted (count + ₱ —
// the one type this screen exists to surface), Staff Active, and Most
// Recent — nothing that requires quietly deciding which types count
// as "revenue."

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
import { colors, spacing, fonts } from '../../utils/portalTheme';
import { getTransactionHistory, getTransactionsByDateRange } from '../../utils/BillingService';
import Pagination from '../../components/shared/Pagination';
import KpiCard from '../../components/dashboard/KpiCard';

const PAGE_SIZE = 5;

const DATE_RANGE_OPTIONS = [
  { key: 'all', label: 'All Time' },
  { key: '7d', label: 'Last 7 Days', days: 7 },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: '90d', label: 'Last 90 Days', days: 90 },
];

// Same labeling convention as ReceiptDetailModal.jsx's
// PAYMENT_METHOD_LABELS, plus 'room_charge' — with a graceful fallback
// (underscore->space, title case) for anything not listed, so a type
// this list doesn't know about (a new payment method, or whatever
// mark_balance_settled() logs) still reads as a normal label instead
// of a raw snake_case string.
const PAYMENT_TYPE_LABELS = {
  room_charge: 'Room Charge',
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

// The Type filter's chip list — a curated subset of what the app can
// produce, alphabetical by raw value. Two different reasons a type is
// left out here:
//  - 'hotel' / 'pay_at_hotel' are retired: RecordPaymentModal.jsx's own
//    header comment documents them as removed from the payment-method
//    picker, so nothing can produce them going forward. They stay in
//    PAYMENT_TYPE_LABELS only so an old row still gets a readable
//    label instead of "Unknown".
//  - 'gcash' / 'maya' / 'maribank' / 'gotyme' are still real, reachable
//    values — guest online checkout can produce any of them — just not
//    given their own chip here, by request. A transaction with one of
//    these types doesn't roll into "E-wallet"; that chip only matches
//    the literal 'online' value. It's just not filterable by its
//    specific provider from this row — "All Types" and the search box
//    still reach it.
const CURRENT_PAYMENT_TYPES = [
  'card',
  'cash',
  'online',
  'room_charge',
];

function paymentTypeLabel(type) {
  if (!type) return 'Unknown';
  if (PAYMENT_TYPE_LABELS[type]) return PAYMENT_TYPE_LABELS[type];
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Badge colors by type family: amber for a room charge (money owed,
// not collected — same accent RevenueReportScreen.jsx uses for its
// F&B Revenue card), blue for an actual payment method, neutral gray
// for anything unrecognized (covers a balance-settled override without
// needing to know its exact payment_type string).
const TYPE_STYLE = {
  room_charge: { bg: '#FCEEDC', text: '#8A5A16', accent: '#B3792A' },
  cash: { bg: '#E3F3E9', text: '#1E7B34', accent: '#1E7B34' },
  card: { bg: '#E3ECFB', text: '#2C5FB3', accent: '#2C5FB3' },
  gcash: { bg: '#E3ECFB', text: '#2C5FB3', accent: '#2C5FB3' },
  maya: { bg: '#E3ECFB', text: '#2C5FB3', accent: '#2C5FB3' },
  maribank: { bg: '#E3ECFB', text: '#2C5FB3', accent: '#2C5FB3' },
  gotyme: { bg: '#E3ECFB', text: '#2C5FB3', accent: '#2C5FB3' },
  online: { bg: '#E3ECFB', text: '#2C5FB3', accent: '#2C5FB3' },
  hotel: { bg: '#EFE7D8', text: '#8A7C64', accent: '#8A7C64' },
  pay_at_hotel: { bg: '#EFE7D8', text: '#8A7C64', accent: '#8A7C64' },
};
const DEFAULT_TYPE_STYLE = { bg: '#EFEFEF', text: '#6B6B6F', accent: '#8A7C64' };

// Payment Type is a small, fixed enum (a handful of methods, ever) — it
// can just render every value as a chip. Staff can't: a real property
// might have dozens of front desk staff over its lifetime, and a chip
// per person doesn't scale the same way (100 staff = 100 chips = a wall
// of wrapped buttons pushing the actual list off-screen before anyone
// reads it). So Staff chips are capped to the most active names in the
// current range, ranked by transaction count; everyone else is reachable
// through "+N more" (expands the full list) or the search box above
// (which already matches staff name), not by scrolling a giant chip
// grid looking for one person.
const STAFF_CHIP_LIMIT = 6;

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function relativeTime(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (isNaN(then)) return '—';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function TransactionHistoryScreen() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRangeKey, setDateRangeKey] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [staffChipsExpanded, setStaffChipsExpanded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const loadTransactions = useCallback(async (rangeKey) => {
    try {
      setError(null);
      const opt = DATE_RANGE_OPTIONS.find((o) => o.key === rangeKey);
      let data;
      if (!opt || opt.key === 'all') {
        data = await getTransactionHistory();
      } else {
        const end = new Date();
        const start = new Date(end.getTime() - opt.days * 86400000);
        data = await getTransactionsByDateRange(start.toISOString(), end.toISOString());
      }
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load transaction history:', err);
      setError('Could not load transaction history. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadTransactions(dateRangeKey);
  }, [dateRangeKey, loadTransactions]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTransactions(dateRangeKey);
  };

  // ── KPIs — computed from the full date-range fetch, before
  // search/type/staff filtering, so they describe "this date range"
  // rather than "whatever's currently on screen" (same principle
  // OutstandingBalancesScreen's KPI row follows). ──────────────────────
  const activeRangeLabel = DATE_RANGE_OPTIONS.find((o) => o.key === dateRangeKey)?.label;
  const totalCount = transactions.length;
  const roomChargeTxns = useMemo(() => transactions.filter((t) => t.paymentType === 'room_charge'), [transactions]);
  const roomChargeTotal = useMemo(() => roomChargeTxns.reduce((sum, t) => sum + (t.amount || 0), 0), [roomChargeTxns]);
  // staffUid-gated for the same reason the Staff filter chips are below
  // — a system-attributed row (Online Payment (Auto)) has a staffName
  // but isn't a staff member, and shouldn't inflate this count.
  const staffCount = useMemo(
    () => new Set(transactions.filter((t) => t.staffUid).map((t) => t.staffName).filter(Boolean)).size,
    [transactions]
  );
  // Both service functions already order by timestamp desc, so the
  // first row is the most recent one without re-sorting here.
  const mostRecent = transactions[0] || null;

  // ── Type filter options — the fixed CURRENT_PAYMENT_TYPES list, not
  // derived from what's loaded (see file header and that constant). ───
  const availableTypes = CURRENT_PAYMENT_TYPES;
  // Only entries with a real staff account behind them (staffUid) belong
  // in a "filter by staff" list. A system-attributed row — e.g. the
  // auto-settled online payment BillingService.js's createBillingRecord()
  // logs via recordPayment({ processedByUid: null, processedByName:
  // 'Online Payment (Auto)' }), explicitly "no staff member involved" —
  // has a staffName but no staffUid, and showing it as a staff chip
  // implies a person did this when nobody did.
  //
  // Ranked by transaction count (not alphabetical) so the capped
  // default view — see STAFF_CHIP_LIMIT above — surfaces whoever's
  // actually been busy in this range, not just whoever's name starts
  // with A.
  const staffActivity = useMemo(() => {
    const counts = new Map();
    transactions.forEach((t) => {
      if (!t.staffUid || !t.staffName) return;
      counts.set(t.staffName, (counts.get(t.staffName) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [transactions]);

  // The capped chip list, plus one exception: if a filter is already
  // active for someone outside the top STAFF_CHIP_LIMIT (selected
  // before the range changed, say), keep their chip visible rather than
  // silently hiding the one thing currently selected.
  const visibleStaffChips = useMemo(() => {
    const top = staffChipsExpanded ? staffActivity : staffActivity.slice(0, STAFF_CHIP_LIMIT);
    if (staffFilter !== 'all' && !top.includes(staffFilter) && staffActivity.includes(staffFilter)) {
      return [staffFilter, ...top];
    }
    return top;
  }, [staffActivity, staffChipsExpanded, staffFilter]);
  const hiddenStaffCount = staffActivity.length - visibleStaffChips.length;

  // ── Search + type + staff filter ────────────────────────────────────
  const visibleTransactions = useMemo(() => {
    let list = transactions;
    if (typeFilter !== 'all') list = list.filter((t) => t.paymentType === typeFilter);
    if (staffFilter !== 'all') list = list.filter((t) => t.staffName === staffFilter);
    if (searchTerm.trim().length > 0) {
      const lower = searchTerm.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.guestName?.toLowerCase().includes(lower) ||
          t.note?.toLowerCase().includes(lower) ||
          t.staffName?.toLowerCase().includes(lower)
      );
    }
    return list;
  }, [transactions, typeFilter, staffFilter, searchTerm]);

  // Search/filter/range changing the result set shape can strand the
  // user on a page number that no longer exists — same fix
  // OutstandingBalancesScreen applies to its own pagination.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateRangeKey, typeFilter, staffFilter]);

  const pagedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleTransactions.slice(start, start + PAGE_SIZE);
  }, [visibleTransactions, currentPage]);

  const renderItem = ({ item }) => {
    const typeStyle = TYPE_STYLE[item.paymentType] || DEFAULT_TYPE_STYLE;
    // Same "Room charge" fallback BillingRecordDetailScreen.jsx's Room
    // Charges card uses for a charge with no note — other transaction
    // types simply show nothing extra when there's no note, since a
    // plain cash/card payment having none is normal, not a gap.
    const noteText = item.note || (item.paymentType === 'room_charge' ? 'Room charge' : null);

    return (
      <View style={[styles.row, { borderLeftColor: typeStyle.accent }]}>
        <View style={styles.rowMain}>
          <View style={styles.rowTopLine}>
            <Text style={styles.guestName}>{item.guestName || 'Guest'}</Text>
            <View style={[styles.badge, { backgroundColor: typeStyle.bg }]}>
              <Text style={[styles.badgeText, { color: typeStyle.text }]}>{paymentTypeLabel(item.paymentType)}</Text>
            </View>
          </View>
          {!!noteText && <Text style={styles.noteText}>{noteText}</Text>}
          <Text style={styles.subInfo}>
            {formatDateTime(item.timestamp)}
            {item.staffName ? ` • ${item.staffName}` : ''}
          </Text>
        </View>
        <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Transaction History</Text>
          <Text style={styles.subtitle}>Every payment, room charge, and balance override, across all staff.</Text>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by guest, staff, or note"
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      <View style={styles.kpiRow}>
        <KpiCard
          icon="receipt-outline"
          label="Total Transactions"
          value={String(totalCount)}
          accent={colors.primary}
          note={activeRangeLabel}
        />
        <KpiCard
          icon="restaurant-outline"
          label="Room Charges Posted"
          value={String(roomChargeTxns.length)}
          accent="#B3792A"
          note={roomChargeTxns.length > 0 ? `${formatCurrency(roomChargeTotal)} added to rooms` : 'None posted in range'}
        />
        <KpiCard
          icon="people-outline"
          label="Staff Active"
          value={String(staffCount)}
          accent={colors.primary}
          note="Logged at least one transaction"
        />
        <KpiCard
          icon="time-outline"
          label="Most Recent"
          value={mostRecent ? relativeTime(mostRecent.timestamp) : '—'}
          accent={colors.primary}
          note={mostRecent ? `${mostRecent.guestName || 'Guest'} · ${paymentTypeLabel(mostRecent.paymentType)}` : 'No transactions yet'}
        />
      </View>

      <View style={styles.filterAndPageRow}>
        <View style={styles.filterRow}>
          {DATE_RANGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.filterChip, dateRangeKey === opt.key && styles.filterChipActive]}
              onPress={() => setDateRangeKey(opt.key)}
            >
              <Text style={[styles.filterChipText, dateRangeKey === opt.key && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!loading && !error && visibleTransactions.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={visibleTransactions.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        )}
      </View>

      {!loading && availableTypes.length > 0 && (
        <View style={styles.filterRow}>
          <Text style={styles.filterGroupLabel}>Type</Text>
          <TouchableOpacity
            style={[styles.filterChip, typeFilter === 'all' && styles.filterChipActive]}
            onPress={() => setTypeFilter('all')}
          >
            <Text style={[styles.filterChipText, typeFilter === 'all' && styles.filterChipTextActive]}>All Types</Text>
          </TouchableOpacity>
          {availableTypes.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.filterChip, typeFilter === t && styles.filterChipActive]}
              onPress={() => setTypeFilter(t)}
            >
              <Text style={[styles.filterChipText, typeFilter === t && styles.filterChipTextActive]}>
                {paymentTypeLabel(t)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!loading && staffActivity.length > 0 && (
        <View style={styles.filterRow}>
          <Text style={styles.filterGroupLabel}>Staff</Text>
          <TouchableOpacity
            style={[styles.filterChip, staffFilter === 'all' && styles.filterChipActive]}
            onPress={() => setStaffFilter('all')}
          >
            <Text style={[styles.filterChipText, staffFilter === 'all' && styles.filterChipTextActive]}>All Staff</Text>
          </TouchableOpacity>
          {visibleStaffChips.map((name) => (
            <TouchableOpacity
              key={name}
              style={[styles.filterChip, staffFilter === name && styles.filterChipActive]}
              onPress={() => setStaffFilter(name)}
            >
              <Text style={[styles.filterChipText, staffFilter === name && styles.filterChipTextActive]}>{name}</Text>
            </TouchableOpacity>
          ))}
          {hiddenStaffCount > 0 && (
            <TouchableOpacity style={styles.filterChipGhost} onPress={() => setStaffChipsExpanded(true)}>
              <Text style={styles.filterChipGhostText}>+{hiddenStaffCount} more</Text>
            </TouchableOpacity>
          )}
          {staffChipsExpanded && staffActivity.length > STAFF_CHIP_LIMIT && (
            <TouchableOpacity style={styles.filterChipGhost} onPress={() => setStaffChipsExpanded(false)}>
              <Text style={styles.filterChipGhostText}>Show less</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : visibleTransactions.length === 0 ? (
        <Text style={styles.emptyText}>
          {transactions.length === 0
            ? 'No transactions logged in this date range.'
            : 'No transactions match the current search/filter.'}
        </Text>
      ) : (
        <FlatList
          data={pagedTransactions}
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
    marginBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  filterGroupLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 2,
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
  // "+N more" / "Show less" — visually distinct (dashed, no fill) from
  // an actual selectable chip, since picking it doesn't filter anything
  // itself, it just reveals or collapses the rest of the staff list.
  filterChipGhost: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
    backgroundColor: 'transparent',
  },
  filterChipGhostText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
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
    borderLeftWidth: 4, // color set inline per-row via TYPE_STYLE
  },
  rowMain: {
    flex: 1,
    paddingRight: 10,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  guestName: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 15,
    color: colors.text,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10.5,
  },
  noteText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.text,
    marginTop: 3,
  },
  subInfo: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 3,
  },
  amount: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 15,
    color: colors.text,
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