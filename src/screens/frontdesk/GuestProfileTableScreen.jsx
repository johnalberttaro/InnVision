import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

/**
 * GuestProfilesTableScreen — "Guest Profiles" sidebar section.
 *
 * Unlike GuestRecordsScreen (which lists EVERY guest — walk-ins added
 * manually by staff as well as guests who registered through the app),
 * this screen only shows guests who actually have an InnVision account:
 * i.e. `guest.linkedUid` is set. Walk-in guests (linkedUid: null, added
 * via GuestRecordsScreen's "Add Guest" form) never appear here — that's
 * intentional, since a walk-in has no account to have a "profile" for.
 *
 * Table columns: Name, Email, Contact Number, Status (Active/Inactive,
 * mirrors the accountStatus field GuestProfileScreen already edits —
 * defaults to "active" when the field is missing, same fallback used
 * there).
 *
 * Tapping a row calls onSelectGuest(guest) — same prop/pattern as
 * GuestRecordsScreen — so it can navigate into the existing
 * GuestProfileScreen detail view for that guest.
 *
 * Props:
 *  - onSelectGuest: (guest) => void
 */
export default function GuestProfilesTableScreen({ onSelectGuest }) {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const guestsQuery = query(collection(db, 'guests'), orderBy('lastName'));
    const unsub = onSnapshot(
      guestsQuery,
      (snapshot) => {
        setGuests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load guests:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  // Only guests who registered an account — i.e. have a linkedUid.
  // Walk-ins created via GuestRecordsScreen's Add Guest form always have
  // linkedUid: null, so they're excluded here by design.
  const registeredGuests = useMemo(
    () => guests.filter((g) => !!g.linkedUid),
    [guests]
  );

  const filteredGuests = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return registeredGuests;
    return registeredGuests.filter((g) => {
      const haystack = [g.firstName, g.lastName, g.email, g.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [registeredGuests, searchText]);

  const getInitials = (firstName, lastName) => {
    const a = (firstName || '').trim()[0] || '';
    const b = (lastName || '').trim()[0] || '';
    return (a + b).toUpperCase() || '?';
  };

  const isActive = (g) => (g.accountStatus || 'active') === 'active';

  const renderRow = ({ item, index }) => {
    const active = isActive(item);
    return (
      <TouchableOpacity
        style={[styles.row, index % 2 === 1 && styles.rowAlt]}
        activeOpacity={0.7}
        onPress={() => onSelectGuest && onSelectGuest(item)}
      >
        {/* Name (with avatar) */}
        <View style={[styles.cell, styles.nameCell]}>
          <View style={styles.avatarWrap}>
            {item.photoURL ? (
              <Image source={{ uri: item.photoURL }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(item.firstName, item.lastName)}</Text>
            )}
          </View>
          <Text style={styles.nameText} numberOfLines={1}>
            {item.firstName} {item.lastName}
          </Text>
        </View>

        {/* Email */}
        <View style={[styles.cell, styles.emailCell]}>
          <Text style={styles.cellText} numberOfLines={1}>{item.email || '—'}</Text>
        </View>

        {/* Contact number */}
        <View style={[styles.cell, styles.phoneCell]}>
          <Text style={styles.cellText} numberOfLines={1}>{item.phone || '—'}</Text>
        </View>

        {/* Status */}
        <View style={[styles.cell, styles.statusCell]}>
          <View style={[styles.statusBadge, active ? styles.statusActive : styles.statusInactive]}>
            <View style={[styles.statusDot, { backgroundColor: active ? '#1E7B34' : '#B3261E' }]} />
            <Text style={[styles.statusText, { color: active ? '#1E7B34' : '#B3261E' }]}>
              {active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Guest Profiles</Text>
          <Text style={styles.subtitle}>
            {filteredGuests.length} registered guest{filteredGuests.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search by name, email, or phone"
          placeholderTextColor={colors.disabled}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Table */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filteredGuests.length === 0 ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>
            {registeredGuests.length === 0
              ? 'No registered guest accounts yet.'
              : 'No guests match your search.'}
          </Text>
        </View>
      ) : (
        <View style={styles.tableWrap}>
          {/* Column headers */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.nameCell]}>Name</Text>
            <Text style={[styles.tableHeaderText, styles.emailCell]}>Email</Text>
            <Text style={[styles.tableHeaderText, styles.phoneCell]}>Contact Number</Text>
            <Text style={[styles.tableHeaderText, styles.statusCell]}>Status</Text>
            <View style={styles.chevron} />
          </View>

          <FlatList
            data={filteredGuests}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    height: 40,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },

  tableWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flex: 1,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardAlt,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderText: {
    fontSize: 11,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  listContent: { flexGrow: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowAlt: { backgroundColor: colors.background },

  cell: { paddingRight: spacing.sm },
  nameCell: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0 },
  emailCell: { flex: 2, minWidth: 0 },
  phoneCell: { flex: 1.4, minWidth: 0 },
  statusCell: { flex: 1, minWidth: 0 },

  avatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 11, fontFamily: fonts.headingBold, color: colors.primary },

  nameText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, flexShrink: 1 },
  cellText: { fontSize: 12, fontFamily: fonts.body, color: colors.text },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  statusActive: { backgroundColor: '#DFF5E1' },
  statusInactive: { backgroundColor: '#FCE1E1' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: fonts.bodySemiBold },

  chevron: { width: 16, marginLeft: spacing.xs },
});