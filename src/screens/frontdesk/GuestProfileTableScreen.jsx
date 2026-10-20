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
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

/**
 * GuestProfilesTableScreen — "Guest Profiles" sidebar section.
 *
 * A plain directory of every guest who has REGISTERED an InnVision
 * account, A–Z by name — whether or not they've ever booked. It reads the
 * accounts themselves (profiles + auth.users, through the
 * list_registered_guests() database function in
 * sql/registered_guests.sql), NOT the Guest Records list, so deleting
 * someone's record in Guest Records never removes them from here.
 *
 * Display only: no delete and no drill-down. Status shows whether the
 * account is Active or was deactivated by the admin.
 *
 * If that database function hasn't been added yet, it falls back to the
 * old source (guest records that belong to an account), so the screen
 * still works in the meantime.
 */
export default function GuestProfilesTableScreen() {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const nameOf = (g) => `${g.firstName || ''} ${g.lastName || ''}`.trim() || g.displayName || g.email || '';
    const sortAZ = (list) => [...list].sort((x, y) =>
      nameOf(x).localeCompare(nameOf(y), undefined, { sensitivity: 'base' }));

    const loadGuests = async () => {
      // Every registered guest account.
      const { data, error } = await supabase.rpc('list_registered_guests');
      if (!error && Array.isArray(data)) {
        setGuests(sortAZ(data.map((row) => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          displayName: row.display_name,
          email: row.email,
          phone: row.phone,
          photoURL: row.photo_url,
          active: row.active !== false,
          registeredAt: row.registered_at,
        }))));
        setLoading(false);
        return;
      }

      // Fallback until sql/registered_guests.sql is run.
      console.warn('list_registered_guests not available, using guest records instead:', error?.message);
      const { data: rows, error: e2 } = await supabase
        .from('guests')
        .select('*, profiles(active, photo_url)')
        .not('user_id', 'is', null);
      if (e2) {
        console.error('Failed to load guest accounts:', e2);
        setLoading(false);
        return;
      }
      setGuests(sortAZ((rows || []).map((row) => ({
        id: row.user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        photoURL: row.profiles?.photo_url || row.photo_url,
        active: row.profiles?.active ?? true,
        registeredAt: row.created_at,
      }))));
      setLoading(false);
    };
    loadGuests();

    // New sign-ups and admin deactivations show up live.
    const channel = supabase
      .channel('guest-profiles-table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadGuests)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const filteredGuests = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return guests;
    return guests.filter((g) => {
      const haystack = [g.firstName, g.lastName, g.displayName, g.email, g.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [guests, searchText]);

  const getInitials = (g) => {
    const a = (g.firstName || '').trim()[0] || '';
    const b = (g.lastName || '').trim()[0] || '';
    return (a + b).toUpperCase() || (g.displayName || g.email || '?').trim()[0].toUpperCase();
  };
  const displayName = (g) => `${g.firstName || ''} ${g.lastName || ''}`.trim() || g.displayName || '—';
  const formatRegistered = (v) => {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const renderRow = ({ item, index }) => {
    const active = item.active !== false;
    return (
      <View style={[styles.row, index % 2 === 1 && styles.rowAlt]}>
        {/* Name (with avatar) */}
        <View style={[styles.cell, styles.nameCell]}>
          <View style={styles.avatarWrap}>
            {item.photoURL ? (
              <Image source={{ uri: item.photoURL }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(item)}</Text>
            )}
          </View>
          <Text style={styles.nameText} numberOfLines={1}>{displayName(item)}</Text>
        </View>

        <View style={[styles.cell, styles.emailCell]}>
          <Text style={styles.cellText} numberOfLines={1}>{item.email || '—'}</Text>
        </View>

        <View style={[styles.cell, styles.phoneCell]}>
          <Text style={styles.cellText} numberOfLines={1}>{item.phone || '—'}</Text>
        </View>

        <View style={[styles.cell, styles.registeredCell]}>
          <Text style={styles.cellText} numberOfLines={1}>{formatRegistered(item.registeredAt)}</Text>
        </View>

        <View style={[styles.cell, styles.statusCell]}>
          <View style={[styles.statusBadge, active ? styles.statusActive : styles.statusInactive]}>
            <View style={[styles.statusDot, { backgroundColor: active ? '#1E7B34' : '#B3261E' }]} />
            <Text style={[styles.statusText, { color: active ? '#1E7B34' : '#B3261E' }]}>
              {active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Guest Profiles</Text>
          <Text style={styles.subtitle}>
            {filteredGuests.length} registered guest{filteredGuests.length !== 1 ? 's' : ''} · A–Z
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
            {guests.length === 0
              ? 'No registered guest accounts yet.'
              : 'No guests match your search.'}
          </Text>
        </View>
      ) : (
        <View style={styles.tableWrap}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.nameCell]}>Name</Text>
            <Text style={[styles.tableHeaderText, styles.emailCell]}>Email</Text>
            <Text style={[styles.tableHeaderText, styles.phoneCell]}>Contact Number</Text>
            <Text style={[styles.tableHeaderText, styles.registeredCell]}>Registered</Text>
            <Text style={[styles.tableHeaderText, styles.statusCell]}>Status</Text>
          </View>

          <FlatList
            data={filteredGuests}
            keyExtractor={(item) => String(item.id)}
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
  registeredCell: { flex: 1.1, minWidth: 0 },
  statusCell: { flex: 1, minWidth: 0 },
  // Fixed-width, same idea as `chevron` below it — a delete icon doesn't
  // need to grow with the row, just enough room to sit clear of Status.
  actionCell: { width: 32, paddingRight: 0, alignItems: 'center' },
  // Same bordered-ring treatment as GuestRecordsScreen's delete button,
  // just a touch smaller to fit a table row's tighter vertical rhythm.
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: 'rgba(179, 38, 30, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

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
