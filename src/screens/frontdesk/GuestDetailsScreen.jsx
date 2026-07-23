import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatDate } from '../../utils/dateHelpers';
import { formatCurrency } from '../../utils/roomRates';

/**
 * GuestDetailScreen — opened by tapping a card in Guest Records (or Guest
 * Profiles). Shows ONE guest's reservation summary (every reservation
 * that guest has made, live from Supabase) and each reservation's
 * special request notes.
 *
 * This is intentionally separate from GuestProfilesTableScreen, which
 * lists registered system users — that screen has a different purpose
 * (accounts) and must not be reused here (see AdminShell history: it
 * previously was aliased to that file by mistake, which is what caused
 * Guest Records to redirect into the Profiles table instead of a detail
 * view).
 *
 * MIGRATED TO SUPABASE.
 *  - guests/{guestId} → guests table row by id
 *  - reservations where uid == guest.linkedUid → reservations where
 *    user_id == guest.linkedUid (linkedUid is guests.user_id under the
 *    hood, same camelCase mapping GuestRecordsScreen uses)
 *
 * If the guest has no linkedUid (a walk-in / staff-entered guest with no
 * account), there is nothing to join against, so the reservation list is
 * simply empty — same "No reservation on file" gap already documented in
 * GuestRecordsScreen.
 *
 * Props:
 *  - guestId: string — the guests table row's id (uuid)
 *  - onBack: () => void
 */

const STATUS_META = {
  pending:       { label: 'Pending',      bg: '#FFF4D6',           text: '#9A7B00' },
  upcoming:      { label: 'Confirmed',    bg: colors.primaryTint,  text: colors.primary },
  'checked-in':  { label: 'Checked In',   bg: '#DFF5E1',           text: '#1E7B34' },
  'checked-out': { label: 'Checked Out',  bg: colors.cardAlt,      text: colors.textMuted },
  declined:      { label: 'Cancelled',    bg: '#FCE1E1',           text: '#B3261E' },
};

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

export default function GuestDetailScreen({ guestId, onBack }) {
  const [guest, setGuest] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [guestLoading, setGuestLoading] = useState(true);
  const [reservationsLoading, setReservationsLoading] = useState(true);

  const guestToCamel = (row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    linkedUid: row.user_id,
    // FIXED BUG: prefers profiles.photo_url (where the avatar upload
    // actually writes) over guests.photo_url, which nothing populates.
    photoURL: row.profiles?.photo_url || row.photo_url,
  });

  const reservationToCamel = (row) => ({
    id: row.id,
    status: row.status,
    roomType: row.room_type,
    checkIn: row.check_in,
    checkOut: row.check_out,
    totalAmount: row.total_amount,
    guestDetails: row.guest_details,
    createdAt: row.created_at,
  });

  // ── Load guest identity ─────────────────────────────────────────────
  useEffect(() => {
    if (!guestId) return;
    setGuestLoading(true);

    const loadGuest = async () => {
      const { data, error } = await supabase
        .from('guests')
        .select('*, profiles(photo_url)')
        .eq('id', guestId)
        .maybeSingle();
      if (error) {
        console.error('Failed to load guest:', error);
        setGuestLoading(false);
        return;
      }
      setGuest(data ? guestToCamel(data) : null);
      setGuestLoading(false);
    };
    loadGuest();

    const channel = supabase
      .channel(`guest-detail-${guestId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests', filter: `id=eq.${guestId}` }, loadGuest)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [guestId]);

  // ── Load this guest's reservations (once we know linkedUid) ────────
  useEffect(() => {
    const linkUid = guest?.linkedUid || null;
    if (!linkUid) {
      setReservations([]);
      setReservationsLoading(false);
      return;
    }
    setReservationsLoading(true);

    const loadReservations = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('user_id', linkUid)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load reservations for guest detail:', error);
        setReservationsLoading(false);
        return;
      }
      setReservations((data || []).map(reservationToCamel));
      setReservationsLoading(false);
    };
    loadReservations();

    const channel = supabase
      .channel(`guest-detail-reservations-${linkUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `user_id=eq.${linkUid}` }, loadReservations)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [guest?.linkedUid]);

  const stats = useMemo(() => {
    const completedStays = reservations.filter((r) => r.status === 'checked-out');
    const totalStays = completedStays.length;
    const totalReservations = reservations.length;
    const lifetimeSpend = completedStays.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    return { totalStays, totalReservations, lifetimeSpend };
  }, [reservations]);

  if (guestLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!guest) {
    return (
      <View style={styles.screen}>
        <Header onBack={onBack} title="Guest not found" />
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>This guest record no longer exists.</Text>
        </View>
      </View>
    );
  }

  const fullName = `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Guest';

  return (
    <View style={styles.screen}>
      <Header onBack={onBack} title={fullName} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Identity card ────────────────────────────────────── */}
        <View style={styles.identityCard}>
          <View style={styles.avatarWrap}>
            {guest.photoURL ? (
              <Image source={{ uri: guest.photoURL }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(guest.firstName, guest.lastName)}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guestName}>{fullName}</Text>
            <View style={styles.contactRow}>
              <View style={styles.contactItem}>
                <Ionicons name="call-outline" size={12} color={colors.textMuted} />
                <Text style={styles.contactText}>{guest.phone || '—'}</Text>
              </View>
              <View style={styles.contactItem}>
                <Ionicons name="mail-outline" size={12} color={colors.textMuted} />
                <Text style={styles.contactText}>{guest.email || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Stats ────────────────────────────────────────────── */}
        <View style={styles.statsCard}>
          <Stat label="Total Stays" value={String(stats.totalStays)} />
          <Stat label="Total Reservations" value={String(stats.totalReservations)} />
          <Stat label="Lifetime Spend" value={formatCurrency(stats.lifetimeSpend)} />
        </View>

        {/* ── Reservation summary ─────────────────────────────── */}
        <Text style={styles.sectionTitle}>Reservation Summary</Text>

        {reservationsLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
        ) : reservations.length === 0 ? (
          <Text style={styles.noReservationText}>No reservations on file for this guest.</Text>
        ) : (
          reservations.map((r) => {
            const meta = STATUS_META[r.status] || null;
            return (
              <View key={r.id} style={styles.reservationCard}>
                <View style={styles.reservationHeaderRow}>
                  <Text style={styles.roomType}>{r.roomType || 'Room'}</Text>
                  {meta && (
                    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: meta.text }]}>{meta.label}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.reservationInfoRow}>
                  <InfoChip label="Check-in" value={formatDateTime(r.checkIn)} />
                  <InfoChip label="Check-out" value={formatDateTime(r.checkOut)} />
                  <InfoChip label="Amount" value={formatCurrency(r.totalAmount || 0)} />
                </View>

                {/* ── Special request — stored nested at guestDetails.specialRequests
                    (set in ReviewPayScreen.jsx's addDoc call), NOT as a
                    top-level field on the reservation doc. ── */}
                <View style={styles.specialRequestWrap}>
                  <Text style={styles.specialRequestLabel}>Special Request</Text>
                  <Text style={styles.specialRequestText}>
                    {r.guestDetails?.specialRequests && String(r.guestDetails.specialRequests).trim()
                      ? r.guestDetails.specialRequests
                      : 'None'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function Header({ onBack, title }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={20} color={colors.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
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

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.primary, flexShrink: 1 },

  scrollContent: { padding: spacing.lg },

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.primary },
  guestName: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  statsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statItem: { flex: 1 },
  statValue: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
  statLabel: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  sectionTitle: {
    fontSize: 14,
    fontFamily: fonts.headingBold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  noReservationText: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontStyle: 'italic',
  },

  reservationCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reservationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  roomType: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text },
  statusBadge: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },

  reservationInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  infoChip: { minWidth: 90 },
  infoChipLabel: { fontSize: 9, fontFamily: fonts.body, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoChipValue: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: 1 },

  specialRequestWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  specialRequestLabel: {
    fontSize: 9,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  specialRequestText: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.text,
  },
});