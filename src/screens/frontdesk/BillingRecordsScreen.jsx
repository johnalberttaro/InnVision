// Billingrecordsscreen.jsx
// Front Desk / Admin view: list, search, and filter guest folios.
// Entry point into the Billing Management module — tapping a row calls
// onSelectRecord, which AdminShell uses to open the folio detail view
// (same pattern as onSelectGuest -> guests:profile).

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
import { colors, spacing, fonts } from '../../utils/theme';
import {
  getAllBillingRecords,
  searchBillingRecords,
  getBillingRecordsByStatus,
} from '../../utils/BillingService';
import Pagination from '../../components/shared/Pagination';

const PAGE_SIZE = 5;

// Reservation dates can arrive as Firestore Timestamps (have a .toDate()
// method), ISO strings, or already-formatted strings — normalize all
// three to a short readable date instead of showing raw ISO timestamps.
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

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'partially_paid', label: 'Partially Paid' },
  { key: 'paid', label: 'Paid' },
];

const STATUS_STYLE = {
  paid: { bg: '#E5F3EA', text: '#1E7A3D', label: 'Paid' },
  partially_paid: { bg: '#FCF1DC', text: '#8A5B00', label: 'Partially Paid' },
  unpaid: { bg: '#FBE7E7', text: '#B3261E', label: 'Unpaid' },
};

export default function BillingRecordsScreen({ onSelectRecord }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadRecords = useCallback(async () => {
    try {
      setError(null);
      let data;
      if (searchTerm.trim().length > 0) {
        data = await searchBillingRecords(searchTerm.trim());
      } else if (activeFilter !== 'all') {
        data = await getBillingRecordsByStatus(activeFilter);
      } else {
        data = await getAllBillingRecords();
      }
      setRecords(data);
    } catch (err) {
      setError('Could not load billing records. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchTerm, activeFilter]);

  useEffect(() => {
    setLoading(true);
    loadRecords();
  }, [loadRecords]);

  // Whenever the search term or filter changes, the underlying result set
  // changes shape — jump back to page 1 so the user isn't stranded on a
  // page number that may no longer exist for the new result set.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeFilter]);

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return records.slice(start, start + PAGE_SIZE);
  }, [records, currentPage]);

  const onRefresh = () => {
    setRefreshing(true);
    loadRecords();
  };

  const renderStatusBadge = (status) => {
    const style = STATUS_STYLE[status] || STATUS_STYLE.unpaid;
    return (
      <View style={[styles.badge, { backgroundColor: style.bg }]}>
        <Text style={[styles.badgeText, { color: style.text }]}>{style.label}</Text>
      </View>
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => onSelectRecord(item)}
    >
      <View style={styles.rowMain}>
        <Text style={styles.folioNumber}>{item.folioNumber}</Text>
        <Text style={styles.guestName}>{item.guestName}</Text>
        <Text style={styles.subInfo}>
          Room {Array.isArray(item.roomNumbers) ? item.roomNumbers.join(', ') : item.roomNumbers}
          {'  •  '}
          {item.checkInDate ? formatDate(item.checkInDate) : ''} – {item.checkOutDate ? formatDate(item.checkOutDate) : ''}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.balanceLabel}>Balance</Text>
        <Text style={styles.balanceAmount}>₱{item.remainingBalance?.toFixed(2)}</Text>
        {renderStatusBadge(item.billingStatus)}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Billing Records</Text>
          <Text style={styles.subtitle}>Guest folios created automatically at check-in</Text>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by folio #, guest name, or room number"
          placeholderTextColor={colors.textMuted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      <View style={styles.filterAndPageRow}>
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
              onPress={() => {
                setSearchTerm('');
                setActiveFilter(f.key);
              }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === f.key && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!loading && !error && records.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={records.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
          />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : records.length === 0 ? (
        <Text style={styles.emptyText}>No billing records found.</Text>
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