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
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

// ── Web-safe confirm helper ─────────────────────────────────────────────
// Alert.alert is a no-op on react-native-web. Same helper GuestRecordsScreen
// uses for its own delete confirm (worth extracting into a shared
// utils/webDialogs.js at some point rather than a third copy).
function confirmAction(title, message, onConfirm) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

function notifyDialog(title, message) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

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
 * MIGRATED TO SUPABASE. FIXED BUG: the Active/Inactive status badge used
 * to read guest.accountStatus, a field that was NEVER written anywhere
 * in the app — meaning it always fell back to 'active', so the
 * "Inactive" state could never actually appear no matter what. Since
 * every guest here has a linked profiles row (that's the whole
 * criteria for showing up on this screen), and profiles.active is a
 * real, meaningful field already used elsewhere (e.g. the
 * prevent_role_self_escalation trigger), the status now reads the
 * actual profiles.active value via a joined query instead.
 *
 * Table columns: Name, Email, Contact Number, Status (Active/Inactive).
 *
 * Tapping a row calls onSelectGuest(guest) — same prop/pattern as
 * GuestRecordsScreen — so it can navigate into the existing
 * GuestProfileScreen detail view for that guest.
 *
 * DELETE: this is now the ONLY screen that can delete a registered
 * guest's record (GuestRecordsScreen's delete is scoped to walk-ins —
 * guests with no linkedUid — for exactly this reason). Deleting here
 * removes the same single `guests` row Guest Records would have, and
 * for the same reason: it's the guest DIRECTORY entry, not the
 * account. The guest's actual login (`profiles` / `auth.users`) is a
 * separate table this never touches, so they keep the ability to sign
 * in — they'd just no longer show up in Guest Profiles or Guest
 * Records unless someone re-adds them.
 *
 * Props:
 *  - onSelectGuest: (guest) => void
 */
export default function GuestProfilesTableScreen({ onSelectGuest }) {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  // Track which guest id is currently being deleted so we can show a
  // per-row spinner and disable that row's delete button without
  // blocking the rest of the table — same pattern as GuestRecordsScreen.
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const loadGuests = async () => {
      // Embeds the linked profiles row via the guests.user_id -> profiles.id
      // foreign key, so profiles.active AND profiles.photo_url come back
      // on each row — no separate lookup needed.
      //
      // FIXED BUG: photoURL used to read row.photo_url (the guests
      // table's own column), but ProfileScreen.jsx's avatar upload
      // writes to profiles.photo_url instead — a different column on a
      // different table. Nothing ever wrote to guests.photo_url, so no
      // uploaded photo could ever show here. Now prefers the real
      // profiles.photo_url, falling back to guests.photo_url only if
      // that's ever populated some other way.
      // Sorted by first_name (then last_name as a tiebreaker for two
      // guests sharing a first name) — the Name column displays
      // "FirstName LastName", so this is the order that actually reads
      // as alphabetical when scanning down the table. Sorting by
      // last_name alone (the old order) put rows in a sequence that was
      // technically alphabetical but not by the name each row leads with.
      const { data, error } = await supabase
        .from('guests')
        .select('*, profiles(active, photo_url)')
        .not('user_id', 'is', null)
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true });
      if (error) {
        console.error('Failed to load guests:', error);
        setLoading(false);
        return;
      }
      setGuests(
        (data || []).map((row) => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          phone: row.phone,
          linkedUid: row.user_id,
          photoURL: row.profiles?.photo_url || row.photo_url,
          active: row.profiles?.active ?? true,
        }))
      );
      setLoading(false);
    };
    loadGuests();

    const channel = supabase
      .channel('guest-profiles-table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, loadGuests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadGuests)
      .subscribe();

    return () => supabase.removeChannel(channel);
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

  const isActive = (g) => g.active !== false;

  // ── Delete guest ────────────────────────────────────────────────────
  // Removes only the `guests` row — same single-table delete
  // GuestRecordsScreen uses for walk-ins, just reached from here now for
  // registered guests specifically. Does not touch `profiles` or
  // `auth.users`, so the guest's login is untouched; they simply stop
  // appearing in Guest Profiles / Guest Records until someone re-adds
  // them (self-registration only creates this row on sign-up, not login,
  // so it doesn't come back on its own).
  const performDeleteGuest = async (guestId) => {
    setDeletingId(guestId);
    try {
      const { error } = await supabase.from('guests').delete().eq('id', guestId);
      if (error) throw error;
      // Drop it from local state immediately rather than waiting on the
      // postgres_changes round-trip — see GuestRecordsScreen.jsx for the
      // same fix and why it's needed regardless of realtime config.
      setGuests((prev) => prev.filter((g) => g.id !== guestId));
    } catch (err) {
      console.error('Failed to delete guest:', err);
      notifyDialog('Error', 'Could not delete this guest. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteGuest = (guest) => {
    const fullName = `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'this guest';
    const message = `This removes ${fullName} from Guest Profiles and Guest Records. It does not delete their login or reservation history.`;
    confirmAction('Delete Guest', message, () => performDeleteGuest(guest.id));
  };

  const renderRow = ({ item, index }) => {
    const active = isActive(item);
    const isDeleting = deletingId === item.id;
    return (
      <TouchableOpacity
        style={[styles.row, index % 2 === 1 && styles.rowAlt]}
        activeOpacity={0.7}
        onPress={() => onSelectGuest && onSelectGuest(item)}
        disabled={isDeleting}
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

        {/* Delete — stops propagation so it doesn't also trigger the
            row's onSelectGuest press. */}
        <View style={[styles.cell, styles.actionCell]}>
          <TouchableOpacity
            style={styles.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
            disabled={isDeleting}
            onPress={(e) => {
              e.stopPropagation?.();
              handleDeleteGuest(item);
            }}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
            )}
          </TouchableOpacity>
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
            <View style={styles.actionCell} />
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