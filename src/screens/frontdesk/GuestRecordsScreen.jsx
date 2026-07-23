import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatDate } from '../../utils/dateHelpers';
import { formatCurrency } from '../../utils/roomRates';

/**
 * GuestRecordsScreen — the master guest directory (Guest Management → Guest
 * Records). This is the single source of truth for "who is a guest of this
 * hotel," independent of any one reservation — but it also joins LIVE
 * against the "reservations" table so each card shows the guest's
 * current stay (status, room type, check-in/out) and running stats
 * (total stays, total reservations, lifetime spend, last stay) without
 * caching any of that on the guest row itself.
 *
 * MIGRATED TO SUPABASE. The join key is now guests.user_id (was
 * guests.linkedUid on Firestore) matched against reservations.user_id
 * (was reservations.uid) — same join logic, new field names. Because
 * guests.user_id has a real UNIQUE constraint now, the historical
 * duplicate-guest bug this screen used to surface as ghost "no
 * reservation on file" cards structurally can't happen anymore.
 *
 * UI NOTE: the "Source" badge and filter chips (Mobile App / Website /
 * Walk-In / Front Desk) that used to appear on each card and above the
 * list have been removed — that's internal-origin metadata, not something
 * front desk staff need at a glance when scanning guests day to day. The
 * `source` field is still captured on new guests via the Add Guest form
 * (kept as backend metadata for reporting), it's just no longer surfaced
 * as a badge or filter here. In its place, each card now leads with a
 * profile avatar — a real photo if `guest.photoURL` is set, otherwise the
 * guest's initials in a colored circle.
 *
 * Why compute stats live instead of storing them on `guests`:
 * a cached counter needs to be kept in sync from every place a
 * reservation's status can change (confirm, decline, check-in, check-out),
 * and any missed sync point means the number quietly drifts wrong. Since
 * every reservation already carries the booking guest's `user_id`, this
 * screen can just filter the live `reservations` feed by `user_id` and
 * derive everything fresh, every time. Nothing to keep in sync, nothing
 * to drift.
 *
 * KNOWN GAP: there is no per-unit room inventory/numbering system
 * reflected on this screen (reservations store `roomType`, e.g.
 * "Twin"/"King" — Room Management does have real room numbers via
 * selected_rooms, this screen just doesn't drill into them). So this
 * screen shows Room Type only.
 *
 * KNOWN GAP: walk-in guests added manually here have no `user_id`, and
 * there's currently no staff-side "book a room for this guest" flow — so
 * a walk-in's card will correctly show "No reservation on file" until
 * that flow exists. That's accurate, not a bug.
 *
 * DELETE NOTE: deleting a guest here removes ONLY the `guests` row —
 * it is a separate table from `reservations` and the two are never
 * cascade-deleted in either direction. If a guest still has reservation
 * rows pointed at their `user_id`, those rows are untouched; they'll
 * simply no longer join to a guest card here. Conversely, deleting a
 * reservation does NOT remove the guest record — staff must delete the
 * guest separately, which is what this button is for.
 *
 * Props:
 *  - onSelectGuest: (guest) => void
 *      Called when a guest card is tapped. Should navigate to the (future)
 *      Guest Profile detail screen for that guest.
 */

const SOURCE_OPTIONS = ['Mobile App', 'Website', 'Walk-In', 'Front Desk'];

const ACTIVE_RESERVATION_STATUSES = ['pending', 'upcoming', 'checked-in'];

// Internal status strings → PMS-friendly display labels + badge colors.
// (Internal values stay exactly as AdminBookingsScreen already uses them
// — pending / upcoming / checked-in / checked-out / declined — this is
// purely a display-layer relabeling to match standard PMS terminology.)
const RESERVATION_STATUS_META = {
  pending:       { label: 'Pending',      bg: '#FFF4D6',           text: '#9A7B00' },
  upcoming:      { label: 'Confirmed',    bg: colors.primaryTint,  text: colors.primary },
  'checked-in':  { label: 'Checked In',   bg: '#DFF5E1',           text: '#1E7B34' },
  'checked-out': { label: 'Checked Out',  bg: colors.cardAlt,      text: colors.textMuted },
  declined:      { label: 'Cancelled',    bg: '#FCE1E1',           text: '#B3261E' },
};

const emptyForm = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  source: 'Walk-In',
  nationality: '',
  idType: '',
  idNumber: '',
  staffNotes: '',
});

// ── Web-safe alert helper ───────────────────────────────────────────────
// Alert.alert is a no-op on react-native-web. (Duplicated from
// AdminBookingsScreen — worth extracting into a shared utils/webDialogs.js
// at some point rather than keeping two copies.)
function notifyDialog(title, message) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

// ── Web-safe confirm helper ─────────────────────────────────────────────
// Alert.alert's two-button confirm pattern doesn't work on web either;
// mirrors the confirmAction helper used for the admin confirm/decline
// buttons elsewhere in the app (window.confirm on web, Alert.alert with
// a destructive button everywhere else).
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

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function getInitials(firstName, lastName) {
  const a = (firstName || '').trim()[0] || '';
  const b = (lastName || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

export default function GuestRecordsScreen({ onSelectGuest }) {
  const [guests, setGuests] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Track which guest id is currently being deleted so we can show a
  // per-card spinner and disable that card's delete button without
  // blocking the rest of the list.
  const [deletingId, setDeletingId] = useState(null);

  // Maps a Postgres guests row to the same camelCase shape the Firestore
  // version used.
  const guestToCamel = (row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    linkedUid: row.user_id,
    nationality: row.nationality,
    idType: row.id_type,
    idNumber: row.id_number,
    vipTier: row.vip_tier,
    tags: row.tags,
    staffNotes: row.staff_notes,
    // FIXED BUG: prefers profiles.photo_url (where ProfileScreen.jsx's
    // avatar upload actually writes) over guests.photo_url, which
    // nothing ever populates.
    photoURL: row.profiles?.photo_url || row.photo_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  // Maps just the reservation fields this screen's join actually needs.
  const reservationToCamel = (row) => ({
    id: row.id,
    uid: row.user_id,
    status: row.status,
    roomType: row.room_type,
    checkIn: row.check_in,
    checkOut: row.check_out,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
  });

  useEffect(() => {
    const loadGuests = async () => {
      const { data, error } = await supabase
        .from('guests')
        .select('*, profiles(photo_url)')
        .order('last_name');
      if (error) {
        console.error('Failed to load guests:', error);
        setLoading(false);
        return;
      }
      setGuests((data || []).map(guestToCamel));
      setLoading(false);
    };
    loadGuests();
    const guestsChannel = supabase
      .channel('guest-records-guests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, loadGuests)
      .subscribe();

    // Reasonable cap for the join — same pattern as AdminDashboardScreen's
    // limit(200). Raise this if the hotel's reservation volume grows past
    // it; a missing older reservation would only affect historical stats,
    // never the current-reservation join (which always wants the most
    // recent records anyway).
    const loadReservations = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        console.error('Failed to load reservations for guest join:', error);
        return;
      }
      setReservations((data || []).map(reservationToCamel));
    };
    loadReservations();
    const reservationsChannel = supabase
      .channel('guest-records-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadReservations)
      .subscribe();

    return () => {
      supabase.removeChannel(guestsChannel);
      supabase.removeChannel(reservationsChannel);
    };
  }, []);

  // ── Live join: guest ⨝ reservations (by uid) ───────────────────────
  const joinedGuests = useMemo(() => {
    return guests.map((g) => {
      const linkUid = g.linkedUid || null;
      const guestReservations = linkUid
        ? reservations.filter((r) => r.uid === linkUid)
        : [];

      // reservations query is already ordered by createdAt desc, so the
      // first match in array order is already the most recent — no need
      // to re-sort.
      const currentReservation =
        guestReservations.find((r) => ACTIVE_RESERVATION_STATUSES.includes(r.status)) ||
        guestReservations[0] ||
        null;

      const completedStays = guestReservations.filter((r) => r.status === 'checked-out');
      const totalStays = completedStays.length;
      const totalReservations = guestReservations.length;
      const lifetimeSpend = completedStays.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
      const lastStayDate = completedStays.reduce((latest, r) => {
        if (!r.checkOut) return latest;
        if (!latest || new Date(r.checkOut) > new Date(latest)) return r.checkOut;
        return latest;
      }, null);

      return {
        ...g,
        _currentReservation: currentReservation,
        _isHistoricalOnly: currentReservation != null && !ACTIVE_RESERVATION_STATUSES.includes(currentReservation.status),
        _stats: { totalStays, totalReservations, lifetimeSpend, lastStayDate },
      };
    });
  }, [guests, reservations]);

  const filteredGuests = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return joinedGuests;
    return joinedGuests.filter((g) => {
      const haystack = [g.firstName, g.lastName, g.email, g.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [joinedGuests, searchText]);

  // ── Add Guest form ─────────────────────────────────────────────────
  const updateField = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }));
    if (formErrors[key]) setFormErrors((p) => ({ ...p, [key]: null }));
  };

  const validateForm = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required.';
    if (!form.lastName.trim())  e.lastName  = 'Last name is required.';
    if (!form.phone.trim() && !form.email.trim()) {
      e.phone = 'Provide at least a phone number or an email.';
      e.email = 'Provide at least a phone number or an email.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Enter a valid email address.';
    }
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetAndCloseModal = () => {
    setForm(emptyForm());
    setFormErrors({});
    setShowAddModal(false);
  };

  const handleSaveGuest = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      // Note: no `stats` field written here (or anywhere else) — Guest
      // Statistics are always computed live from the reservations join
      // above, never cached on the guest row.
      const { error } = await supabase.from('guests').insert({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        source: form.source,
        user_id: null, // manually created here → always a walk-in / staff-entered guest
        nationality: form.nationality.trim() || null,
        id_type: form.idType.trim() || null,
        id_number: form.idNumber.trim() || null,
        vip_tier: null,
        tags: [],
        staff_notes: form.staffNotes.trim() || null,
        created_by: 'admin',
      });
      if (error) throw error;

      resetAndCloseModal();
    } catch (err) {
      console.error('Failed to add guest:', err);
      notifyDialog('Error', 'Could not save this guest. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Guest ────────────────────────────────────────────────────
  // Deletes only the `guests` row. Does not touch `reservations` — see
  // the DELETE NOTE in the file header for why that's intentional.
  const performDeleteGuest = async (guestId) => {
    setDeletingId(guestId);
    try {
      const { error } = await supabase.from('guests').delete().eq('id', guestId);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to delete guest:', err);
      notifyDialog('Error', 'Could not delete this guest. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteGuest = (guest) => {
    const fullName = `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'this guest';
    const hasActiveStay =
      guest._currentReservation && ACTIVE_RESERVATION_STATUSES.includes(guest._currentReservation.status);

    const message = hasActiveStay
      ? `${fullName} has an active reservation on file. Deleting the guest record will not cancel that reservation, but it will remove them from Guest Records. Continue?`
      : `This will permanently remove ${fullName} from Guest Records. This does not delete any reservation history. Continue?`;

    confirmAction('Delete Guest', message, () => performDeleteGuest(guest.id));
  };

  // ── Render helpers ──────────────────────────────────────────────────
  const renderGuestCard = ({ item }) => {
    const isVip = !!item.vipTier;
    const reservation = item._currentReservation;
    const statusMeta = reservation ? RESERVATION_STATUS_META[reservation.status] : null;
    const { totalStays, totalReservations, lifetimeSpend, lastStayDate } = item._stats;
    const isDeleting = deletingId === item.id;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => onSelectGuest && onSelectGuest(item)}
        disabled={isDeleting}
      >
        {/* ── Guest Information ─────────────────────────────── */}
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            {item.photoURL ? (
              <Image source={{ uri: item.photoURL }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(item.firstName, item.lastName)}</Text>
            )}
          </View>

          <View style={styles.identityMain}>
            <View style={styles.nameLine}>
              <Text style={styles.guestName}>{item.firstName} {item.lastName}</Text>
              {isVip && (
                <View style={styles.vipBadge}>
                  <Ionicons name="star" size={10} color="#8A6D00" />
                  <Text style={styles.vipBadgeText}>
                    {typeof item.vipTier === 'string' ? item.vipTier.toUpperCase() : 'VIP'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.contactRow}>
              <View style={styles.contactItem}>
                <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                <Text style={styles.contactText}>{item.phone || '—'}</Text>
              </View>
              <View style={styles.contactItem}>
                <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
                <Text style={styles.contactText} numberOfLines={1}>{item.email || '—'}</Text>
              </View>
            </View>
          </View>

          {/* Delete button — stops propagation so it doesn't also
              trigger the card's onSelectGuest press. */}
          <TouchableOpacity
            style={styles.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={isDeleting}
            onPress={(e) => {
              e.stopPropagation?.();
              handleDeleteGuest(item);
            }}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            )}
          </TouchableOpacity>

          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>

        <View style={styles.divider} />

        {/* ── Current Reservation Information ───────────────── */}
        {reservation ? (
          <View style={styles.reservationRow}>
            <InfoChip label="Room Type" value={reservation.roomType || '—'} />
            {statusMeta && (
              <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusMeta.text }]}>
                  {statusMeta.label}
                </Text>
              </View>
            )}
            <InfoChip label="Check-in"  value={formatDateTime(reservation.checkIn)} />
            <InfoChip label="Check-out" value={formatDateTime(reservation.checkOut)} />
          </View>
        ) : (
          <Text style={styles.noReservationText}>No reservation on file</Text>
        )}

        <View style={styles.divider} />

        {/* ── Guest Statistics ───────────────────────────────── */}
        <View style={styles.statsRow}>
          <Stat label="Total Stays" value={String(totalStays)} />
          <Stat label="Total Reservations" value={String(totalReservations)} />
          <Stat label="Lifetime Spend" value={formatCurrency(lifetimeSpend)} />
          <Stat label="Last Stay" value={lastStayDate ? (() => { try { return formatDate(new Date(lastStayDate)); } catch { return '—'; } })() : '—'} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Guest Records</Text>
          <Text style={styles.subtitle}>
            {filteredGuests.length} guest{filteredGuests.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.addButtonText}>Add Guest</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search ─────────────────────────────────────────────── */}
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

      {/* ── List ───────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filteredGuests.length === 0 ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>
            {guests.length === 0
              ? 'No guests yet. Add your first guest to get started.'
              : 'No guests match your search.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredGuests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderGuestCard}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* ── Add Guest Modal ────────────────────────────────────── */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={resetAndCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Guest</Text>
              <TouchableOpacity onPress={resetAndCloseModal} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: spacing.lg }}>
              <View style={styles.nameRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>First Name <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={[styles.input, formErrors.firstName && styles.inputError]}
                    value={form.firstName}
                    onChangeText={(v) => updateField('firstName', v)}
                    placeholder="Juan"
                    placeholderTextColor={colors.disabled}
                  />
                  {formErrors.firstName && <Text style={styles.errorText}>{formErrors.firstName}</Text>}
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Last Name <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={[styles.input, formErrors.lastName && styles.inputError]}
                    value={form.lastName}
                    onChangeText={(v) => updateField('lastName', v)}
                    placeholder="dela Cruz"
                    placeholderTextColor={colors.disabled}
                  />
                  {formErrors.lastName && <Text style={styles.errorText}>{formErrors.lastName}</Text>}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[styles.input, formErrors.email && styles.inputError]}
                  value={form.email}
                  onChangeText={(v) => updateField('email', v)}
                  placeholder="user@domain.com"
                  placeholderTextColor={colors.disabled}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {formErrors.email && <Text style={styles.errorText}>{formErrors.email}</Text>}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={[styles.input, formErrors.phone && styles.inputError]}
                  value={form.phone}
                  onChangeText={(v) => updateField('phone', v)}
                  placeholder="+63 9XX XXX XXXX"
                  placeholderTextColor={colors.disabled}
                  keyboardType="phone-pad"
                />
                {formErrors.phone && <Text style={styles.errorText}>{formErrors.phone}</Text>}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Source <Text style={styles.required}>*</Text></Text>
                <View style={styles.sourcePickerRow}>
                  {SOURCE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.sourceOption, form.source === opt && styles.sourceOptionActive]}
                      onPress={() => updateField('source', opt)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.sourceOptionText, form.source === opt && styles.sourceOptionTextActive]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.nameRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Nationality</Text>
                  <TextInput
                    style={styles.input}
                    value={form.nationality}
                    onChangeText={(v) => updateField('nationality', v)}
                    placeholder="Filipino"
                    placeholderTextColor={colors.disabled}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>ID Type</Text>
                  <TextInput
                    style={styles.input}
                    value={form.idType}
                    onChangeText={(v) => updateField('idType', v)}
                    placeholder="Passport, Driver's License..."
                    placeholderTextColor={colors.disabled}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>ID Number</Text>
                <TextInput
                  style={styles.input}
                  value={form.idNumber}
                  onChangeText={(v) => updateField('idNumber', v)}
                  placeholder="Optional"
                  placeholderTextColor={colors.disabled}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Staff Notes</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.staffNotes}
                  onChangeText={(v) => updateField('staffNotes', v)}
                  placeholder="Internal notes about this guest (optional)"
                  placeholderTextColor={colors.disabled}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetAndCloseModal} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveGuest}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.saveBtnText}>Save Guest</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoChip({ label, value }) {
  return (
    <View style={styles.infoChip}>
      <Text style={styles.infoChipLabel}>{label}</Text>
      <Text style={styles.infoChipValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  addButtonText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

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

  listContent: { padding: spacing.lg },
  separator: { height: spacing.sm },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },

  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },

  identityMain: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  guestName: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text },

  vipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF4D6',
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  vipBadgeText: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: '#8A6D00', letterSpacing: 0.3 },

  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  reservationRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  noReservationText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic' },

  infoChip: { minWidth: 90 },
  infoChipLabel: { fontSize: 9, fontFamily: fonts.body, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoChipValue: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: 1 },

  statusBadge: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  statItem: { minWidth: 90 },
  statValue: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text },
  statLabel: { fontSize: 9, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: colors.overlayDim, justifyContent: 'center', padding: spacing.lg },
  modalSheet: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    maxHeight: '85%',
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.primary },
  modalCloseBtn: { padding: 4 },
  modalBody: { flexGrow: 0 },

  nameRow: { flexDirection: 'row', gap: spacing.sm },
  fieldGroup: { marginBottom: spacing.md },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginBottom: spacing.xs },
  required: { color: colors.danger },
  input: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  textArea: { minHeight: 70, textAlignVertical: 'top', paddingTop: spacing.sm },
  errorText: { fontFamily: fonts.body, fontSize: 11, color: colors.danger, marginTop: spacing.xs },

  sourcePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sourceOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  sourceOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  sourceOptionText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  sourceOptionTextActive: { color: colors.primary },

  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  saveBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.white },
});