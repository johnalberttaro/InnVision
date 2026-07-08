import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatDate } from '../../utils/dateHelpers';

/**
 * GuestProfileScreen — clean Front Desk guest information page.
 *
 * Redesigned layout:
 *   1. Guest Information Card (photo, name, email, phone, account status)
 *   2. Reservation Statistics (Total / Pending / Confirmed / Completed / Cancelled)
 *   3. Quick Reservation Overview (most recent reservation only — full
 *      history intentionally lives in Reservation Management, not here)
 *   4. Special Requests Summary (count + most recent — full list intentionally
 *      lives in the Special Requests module, not here)
 *   5. Additional Details (VIP tier, gender, staff notes) — unchanged from
 *      before, just relocated below the primary front-desk info.
 *
 * Data sources:
 *   - guests/{guestId}                         → personal/contact/status/VIP/notes
 *   - reservations where uid == guest.linkedUid → stats + most recent reservation
 *
 * NOTE on accountStatus: guests/{id} docs don't have this field yet in
 * existing data, so it defaults to "active" when missing. Editable here.
 *
 * NOTE on navigation: "View Reservations" and "View Special Requests" call
 * onViewReservations(guestUid) / onViewSpecialRequests(guestId) props if
 * provided. AdminBookingsScreen currently only supports filterKey presets
 * (no per-guest filter yet) and there's no dedicated guestRequests module
 * yet, so wiring the actual navigation/filter is left to whatever renders
 * this screen (e.g. AdminShell) rather than modifying those modules here.
 *
 * INTERIM: "Special Requests" still reads each reservation's
 * `guestDetails.specialRequests` text field, same as before, because the
 * dedicated `guestRequests` collection doesn't exist yet. Swap this section
 * to query `guestRequests` by guestId once that collection exists.
 *
 * Props:
 *  - guestId: string                        Firestore doc id in "guests" to display
 *  - onBack: () => void                      return to Guest Records
 *  - onViewReservations?: (guestUid) => void navigate to Reservation Management, filtered
 *  - onViewSpecialRequests?: (guestId) => void navigate to Special Requests module
 */

const ACTIVE_RESERVATION_STATUSES = ['pending', 'upcoming', 'checked-in'];

const RESERVATION_STATUS_META = {
  pending:       { label: 'Pending',      bg: '#FFF4D6',           text: '#9A7B00' },
  upcoming:      { label: 'Confirmed',    bg: colors.primaryTint,  text: colors.primary },
  'checked-in':  { label: 'Checked In',   bg: '#DFF5E1',           text: '#1E7B34' },
  'checked-out': { label: 'Checked Out',  bg: colors.cardAlt,      text: colors.textMuted },
  declined:      { label: 'Cancelled',    bg: '#FCE1E1',           text: '#B3261E' },
};

const SOURCE_STYLE = {
  'Mobile App': { bg: colors.primaryTint, text: colors.primary },
  Website:      { bg: '#E4E9FF', text: '#3947A6' },
  'Walk-In':    { bg: '#FFF4D6', text: '#9A7B00' },
  'Front Desk': { bg: '#DFF5E1', text: '#1E7B34' },
};

const VIP_TIERS = ['None', 'Silver', 'Gold', 'Platinum'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const ACCOUNT_STATUS_OPTIONS = ['active', 'inactive'];
const TWO_COL_BREAKPOINT = 900;

// Same reasoning as GuestRecordsScreen/AdminBookingsScreen — Alert.alert
// is a no-op on react-native-web.
function notifyDialog(title, message) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function safeFormatDate(value) {
  if (!value) return '—';
  try {
    return formatDate(new Date(value));
  } catch {
    return '—';
  }
}

function getInitials(firstName, lastName) {
  const a = (firstName || '').trim()[0] || '';
  const b = (lastName || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

export default function GuestProfileScreen({ guestId, onBack, onViewReservations, onViewSpecialRequests }) {
  const { width } = useWindowDimensions();
  const isTwoCol = width >= TWO_COL_BREAKPOINT;

  const [guest, setGuest] = useState(null);
  const [guestLoading, setGuestLoading] = useState(true);
  const [reservations, setReservations] = useState([]);

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // ── Live guest doc ───────────────────────────────────────────────
  useEffect(() => {
    if (!guestId) return;
    const unsub = onSnapshot(
      doc(db, 'guests', guestId),
      (snap) => {
        setGuest(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setGuestLoading(false);
      },
      (err) => {
        console.error('Failed to load guest profile:', err);
        setGuestLoading(false);
      }
    );
    return unsub;
  }, [guestId]);

  // ── Live reservation history for this guest ─────────────────────
  useEffect(() => {
    if (!guest?.linkedUid) {
      setReservations([]);
      return;
    }
    const q = query(
      collection(db, 'reservations'),
      where('uid', '==', guest.linkedUid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setReservations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error('Failed to load reservation history:', err);
    });
    return unsub;
  }, [guest?.linkedUid]);

  // Most recently *created* reservation — used for the Quick Reservation Overview.
  const mostRecentReservation = reservations.length > 0 ? reservations[0] : null;

  const reservationStats = useMemo(() => {
    const stats = { total: reservations.length, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    reservations.forEach((r) => {
      switch (r.status) {
        case 'pending':
          stats.pending += 1;
          break;
        case 'upcoming':
        case 'checked-in':
          stats.confirmed += 1;
          break;
        case 'checked-out':
          stats.completed += 1;
          break;
        case 'declined':
          stats.cancelled += 1;
          break;
        default:
          break;
      }
    });
    return stats;
  }, [reservations]);

  // INTERIM — see file header comment. Swap for a guestRequests query once
  // that collection exists.
  const specialRequests = useMemo(() => {
    return reservations
      .filter((r) => r.guestDetails?.specialRequests?.trim())
      .map((r) => ({
        reservationId: r.id,
        text: r.guestDetails.specialRequests.trim(),
        roomType: r.roomType,
        checkIn: r.checkIn,
        createdAt: r.createdAt,
      }));
  }, [reservations]);

  const mostRecentRequest = specialRequests.length > 0 ? specialRequests[0] : null;

  // ── Edit form ────────────────────────────────────────────────────
  const startEdit = () => {
    setForm({
      firstName: guest.firstName || '',
      lastName: guest.lastName || '',
      email: guest.email || '',
      phone: guest.phone || '',
      gender: guest.gender || '',
      vipTier: guest.vipTier || 'None',
      staffNotes: guest.staffNotes || '',
      accountStatus: guest.accountStatus || 'active',
    });
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setForm(null);
  };

  const updateField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      notifyDialog('Missing info', 'First and last name are required.');
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, 'guests', guest.id), {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        email:     form.email.trim() || null,
        phone:     form.phone.trim() || null,
        gender:    form.gender || null,
        vipTier:     form.vipTier === 'None' ? null : form.vipTier,
        staffNotes:  form.staffNotes.trim() || null,
        accountStatus: form.accountStatus || 'active',
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setEditMode(false);
      setForm(null);
    } catch (err) {
      console.error('Failed to save guest profile:', err);
      notifyDialog('Error', 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleViewReservations = () => {
    if (typeof onViewReservations === 'function') {
      onViewReservations(guest.linkedUid);
    } else {
      notifyDialog('Not connected yet', 'Reservation Management filtering by guest is not wired up yet.');
    }
  };

  const handleViewSpecialRequests = () => {
    if (typeof onViewSpecialRequests === 'function') {
      onViewSpecialRequests(guest.id);
    } else {
      notifyDialog('Not connected yet', 'The Special Requests module is not wired up yet.');
    }
  };

  if (guestLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!guest) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.emptyText}>This guest record could not be found.</Text>
        <TouchableOpacity onPress={onBack} style={{ marginTop: spacing.md }}>
          <Text style={styles.backLinkText}>← Back to Guest Records</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sourceStyle = SOURCE_STYLE[guest.source] || { bg: colors.cardAlt, text: colors.textMuted };
  const isActive = (guest.accountStatus || 'active') === 'active';
  const mostRecentMeta = mostRecentReservation
    ? (RESERVATION_STATUS_META[mostRecentReservation.status] || { label: mostRecentReservation.status || 'Unknown', bg: colors.cardAlt, text: colors.textMuted })
    : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={styles.backBtnText}>Guest Records</Text>
        </TouchableOpacity>

        {!editMode ? (
          <TouchableOpacity style={styles.editBtn} onPress={startEdit} activeOpacity={0.85}>
            <Ionicons name="create-outline" size={14} color={colors.white} />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.editActionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Text style={styles.saveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── 1. Guest Information Card ─────────────────────────────── */}
      <View style={styles.guestCard}>
        <View style={styles.guestCardAvatarCol}>
          <View style={styles.avatarWrap}>
            {guest.photoURL ? (
              <Image source={{ uri: guest.photoURL }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(guest.firstName, guest.lastName)}</Text>
            )}
          </View>
        </View>

        <View style={styles.guestCardInfoCol}>
          <View style={styles.guestCardTopRow}>
            <Text style={styles.guestName}>{guest.firstName} {guest.lastName}</Text>
            {guest.vipTier && (
              <View style={styles.vipBadge}>
                <Ionicons name="star" size={11} color="#8A6D00" />
                <Text style={styles.vipBadgeText}>{guest.vipTier.toUpperCase()}</Text>
              </View>
            )}
            <View style={[styles.sourceBadge, { backgroundColor: sourceStyle.bg }]}>
              <Text style={[styles.sourceBadgeText, { color: sourceStyle.text }]}>
                {guest.source || 'Unknown'}
              </Text>
            </View>
          </View>

          {!editMode ? (
            <>
              <View style={styles.guestCardDetailRow}>
                <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                <Text style={styles.guestCardDetailText}>{guest.email || '—'}</Text>
              </View>
              <View style={styles.guestCardDetailRow}>
                <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                <Text style={styles.guestCardDetailText}>{guest.phone || '—'}</Text>
              </View>
              <View style={styles.guestCardDetailRow}>
                <View style={[styles.statusDot, { backgroundColor: isActive ? '#1E7B34' : '#B3261E' }]} />
                <Text style={[styles.accountStatusText, { color: isActive ? '#1E7B34' : '#B3261E' }]}>
                  {isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.guestCardEditFields}>
              <View style={styles.nameRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput style={styles.input} value={form.firstName} onChangeText={(v) => updateField('firstName', v)} />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput style={styles.input} value={form.lastName} onChangeText={(v) => updateField('lastName', v)} />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput style={styles.input} value={form.email} onChangeText={(v) => updateField('email', v)} keyboardType="email-address" autoCapitalize="none" />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Phone Number</Text>
                <TextInput style={styles.input} value={form.phone} onChangeText={(v) => updateField('phone', v)} keyboardType="phone-pad" />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Account Status</Text>
                <View style={styles.sourcePickerRow}>
                  {ACCOUNT_STATUS_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.sourceOption, form.accountStatus === opt && styles.sourceOptionActive]}
                      onPress={() => updateField('accountStatus', opt)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.sourceOptionText, form.accountStatus === opt && styles.sourceOptionTextActive]}>
                        {opt === 'active' ? 'Active' : 'Inactive'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── 2. Reservation Statistics ─────────────────────────────── */}
      <Text style={styles.sectionHeading}>Reservation Statistics</Text>
      <View style={styles.statsRow}>
        <StatCard icon="albums-outline"       label="Total"     value={reservationStats.total}     accent={colors.primary} />
        <StatCard icon="time-outline"         label="Pending"   value={reservationStats.pending}   accent="#9A7B00" bg="#FFF4D6" />
        <StatCard icon="checkmark-circle-outline" label="Confirmed" value={reservationStats.confirmed} accent="#1E7B34" bg="#DFF5E1" />
        <StatCard icon="flag-outline"         label="Completed" value={reservationStats.completed} accent={colors.textMuted} bg={colors.cardAlt} />
        <StatCard icon="close-circle-outline" label="Cancelled" value={reservationStats.cancelled} accent="#B3261E" bg="#FCE1E1" />
      </View>

      <View style={isTwoCol ? styles.twoCol : styles.oneCol}>

        {/* ── 3. Quick Reservation Overview ───────────────────────── */}
        <View style={[styles.panel, isTwoCol && { flex: 1 }]}>
          <Text style={styles.panelTitle}>Quick Reservation Overview</Text>
          {mostRecentReservation ? (
            <>
              <InfoRow label="Room Type" value={mostRecentReservation.roomType || '—'} />
              <InfoRow label="Check-in"  value={formatDateTime(mostRecentReservation.checkIn)} />
              <InfoRow label="Check-out" value={formatDateTime(mostRecentReservation.checkOut)} />
              <View style={styles.statusInfoRow}>
                <Text style={styles.infoLabel}>Status</Text>
                {mostRecentMeta && (
                  <View style={[styles.statusBadge, { backgroundColor: mostRecentMeta.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: mostRecentMeta.text }]}>{mostRecentMeta.label}</Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No reservations on file.</Text>
          )}

          <TouchableOpacity style={styles.linkBtn} onPress={handleViewReservations} activeOpacity={0.85}>
            <Text style={styles.linkBtnText}>View Reservations</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* ── 4. Special Requests Summary ─────────────────────────── */}
        <View style={[styles.panel, isTwoCol && { flex: 1 }]}>
          <Text style={styles.panelTitle}>Special Requests Summary</Text>
          <InfoRow label="Number of Special Requests" value={String(specialRequests.length)} />

          {mostRecentRequest ? (
            <View style={styles.requestPreview}>
              <Text style={styles.infoLabel}>Most Recent Request</Text>
              <Text style={styles.requestText}>{mostRecentRequest.text}</Text>
              <Text style={styles.requestMeta}>
                {mostRecentRequest.roomType || '—'} · {safeFormatDate(mostRecentRequest.checkIn)}
              </Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>No special requests on file.</Text>
          )}

          <TouchableOpacity style={styles.linkBtn} onPress={handleViewSpecialRequests} activeOpacity={0.85}>
            <Text style={styles.linkBtnText}>View Special Requests</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 5. Additional Details ─────────────────────────────────── */}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Additional Details</Text>

        <Text style={[styles.subheading]}>VIP Status</Text>
        {!editMode ? (
          <Text style={styles.readonlyValue}>{guest.vipTier || 'Not VIP'}</Text>
        ) : (
          <View style={styles.sourcePickerRow}>
            {VIP_TIERS.map((tier) => (
              <TouchableOpacity
                key={tier}
                style={[styles.sourceOption, form.vipTier === tier && styles.sourceOptionActive]}
                onPress={() => updateField('vipTier', tier)}
                activeOpacity={0.8}
              >
                <Text style={[styles.sourceOptionText, form.vipTier === tier && styles.sourceOptionTextActive]}>
                  {tier}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={[styles.subheading, styles.subheadingSpaced]}>Gender</Text>
        {!editMode ? (
          <Text style={styles.readonlyValue}>{guest.gender || '—'}</Text>
        ) : (
          <View style={styles.sourcePickerRow}>
            {GENDER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.sourceOption, form.gender === opt && styles.sourceOptionActive]}
                onPress={() => updateField('gender', opt)}
                activeOpacity={0.8}
              >
                <Text style={[styles.sourceOptionText, form.gender === opt && styles.sourceOptionTextActive]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={[styles.subheading, styles.subheadingSpaced]}>Staff Notes</Text>
        {!editMode ? (
          <Text style={styles.readonlyValue}>{guest.staffNotes || 'No notes on file.'}</Text>
        ) : (
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.staffNotes}
            onChangeText={(v) => updateField('staffNotes', v)}
            multiline
            numberOfLines={4}
            placeholder="Internal notes about this guest"
            placeholderTextColor={colors.disabled}
          />
        )}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, accent, bg }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statCardIconWrap, { backgroundColor: bg || colors.primaryTint }]}>
        <Ionicons name={icon} size={16} color={accent} />
      </View>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },
  backLinkText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.primary },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.primary },

  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  editBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },
  editActionsRow: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt },
  cancelBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  saveBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', minWidth: 110 },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  // ── Guest Information Card ──────────────────────────────────────
  guestCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  guestCardAvatarCol: { flexShrink: 0 },
  guestCardInfoCol: { flex: 1, minWidth: 0 },
  guestCardTopRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },

  avatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 26, fontFamily: fonts.headingBold, color: colors.primary },

  guestName: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },

  vipBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF4D6', paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  vipBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#8A6D00', letterSpacing: 0.3 },
  sourceBadge: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  sourceBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },

  guestCardDetailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  guestCardDetailText: { fontSize: 13, fontFamily: fonts.body, color: colors.text },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  accountStatusText: { fontSize: 12, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },

  guestCardEditFields: { marginTop: spacing.xs },

  // ── Section heading ──────────────────────────────────────────────
  sectionHeading: {
    fontSize: 13,
    fontFamily: fonts.headingBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },

  // ── Reservation Statistics ───────────────────────────────────────
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  statCard: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  statCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statCardValue: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.text },
  statCardLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  twoCol: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start', marginBottom: spacing.lg },
  oneCol: { flexDirection: 'column', gap: spacing.lg, marginBottom: spacing.lg },

  panel: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  panelTitle: {
    fontSize: 12,
    fontFamily: fonts.headingBold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  subheading: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.text },
  subheadingSpaced: { marginTop: spacing.lg },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs + 2, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  infoLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  infoValue: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, flexShrink: 1, textAlign: 'right', marginLeft: spacing.sm },
  readonlyValue: { fontSize: 13, fontFamily: fonts.body, color: colors.text, lineHeight: 19, marginTop: spacing.xs },

  nameRow: { flexDirection: 'row', gap: spacing.sm },
  fieldGroup: { marginBottom: spacing.md },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginBottom: spacing.xs },
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
  textArea: { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.sm },

  sourcePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  sourceOption: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt },
  sourceOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  sourceOptionText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  sourceOptionTextActive: { color: colors.primary },

  statusInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs + 2 },
  statusBadge: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },

  noDataText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs },

  requestPreview: { marginTop: spacing.sm },
  requestText: { fontSize: 12, fontFamily: fonts.body, color: colors.text, lineHeight: 17, marginTop: spacing.xs },
  requestMeta: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
  },
  linkBtnText: { fontSize: 13, fontFamily: fonts.headingSemiBold, color: colors.primary, letterSpacing: 0.2 },
});