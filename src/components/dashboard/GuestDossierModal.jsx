import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Image, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';

/**
 * GuestDossierModal — quick-view panel opened from a Recent Activity row.
 *
 * ASSUMPTION (flagged for the team, not silently invented): the `guests`
 * collection has no loyaltyStatus/preferences/lastStayNotes fields today.
 * "Loyalty status" here is COMPUTED from real total-stays count (a simple
 * tier, not stored data) so nothing shown is fabricated. Preferences and
 * dedicated "last stay notes" aren't tracked anywhere yet, so that
 * section is shown explicitly as "Not tracked yet" rather than guessed.
 * The most recent reservation's special request is shown instead, since
 * that's the closest real data we have to a stay note.
 *
 * Props:
 *  - visible: boolean
 *  - onClose: () => void
 *  - reservation: the activity-row reservation doc that triggered this
 *    (used for uid lookup + as an immediate fallback while the guests
 *    collection query resolves)
 */
function loyaltyTier(totalStays) {
  if (totalStays >= 5) return { label: 'VIP', color: '#B08D2B', bg: '#FBF1D6' };
  if (totalStays >= 2) return { label: 'Returning Guest', color: colors.primary, bg: colors.primaryTint };
  return { label: 'New Guest', color: colors.textMuted, bg: colors.cardAlt };
}

function getInitials(first, last) {
  const a = (first || '').trim()[0] || '';
  const b = (last || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

export default function GuestDossierModal({ visible, onClose, reservation, onViewFullProfile }) {
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(null);
  const [reservations, setReservations] = useState([]);

  useEffect(() => {
    if (!visible || !reservation) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const uid = reservation.uid;
        if (!uid) {
          if (!cancelled) {
            setGuest(null);
            setReservations([]);
          }
          return;
        }
        const guestsQ = query(collection(db, 'guests'), where('linkedUid', '==', uid));
        const resQ = query(collection(db, 'reservations'), where('uid', '==', uid));
        const [guestSnap, resSnap] = await Promise.all([getDocs(guestsQ), getDocs(resQ)]);
        if (cancelled) return;

        const guestDoc = guestSnap.docs[0] ? { id: guestSnap.docs[0].id, ...guestSnap.docs[0].data() } : null;
        const resRows = resSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        resRows.sort((a, b) => {
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return bTime - aTime;
        });

        setGuest(guestDoc);
        setReservations(resRows);
      } catch (e) {
        console.error('Failed to load guest dossier:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [visible, reservation]);

  if (!visible) return null;

  const firstName = guest?.firstName || reservation?.guestDetails?.firstName || '';
  const lastName = guest?.lastName || reservation?.guestDetails?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim() || reservation?.guestName || 'Guest';
  const photoURL = guest?.photoURL;
  const totalStays = reservations.filter((r) => r.status === 'checked-out').length;
  const lifetimeSpend = reservations
    .filter((r) => r.status === 'checked-out')
    .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const tier = loyaltyTier(totalStays);
  const latestRequest = reservations.find((r) => r.guestDetails?.specialRequests)?.guestDetails?.specialRequests;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Guest Dossier</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.body}>
              <View style={styles.identityRow}>
                <View style={styles.avatar}>
                  {photoURL ? (
                    <Image source={{ uri: photoURL }} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarInitials}>{getInitials(firstName, lastName)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guestName}>{fullName}</Text>
                  <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
                    <Text style={[styles.tierText, { color: tier.color }]}>{tier.label}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.statsRow}>
                <Stat label="Total Stays" value={String(totalStays)} />
                <Stat label="Reservations" value={String(reservations.length)} />
                <Stat label="Lifetime Spend" value={formatCurrency(lifetimeSpend)} />
              </View>

              <Text style={styles.sectionLabel}>Preferences</Text>
              <Text style={styles.notTracked}>Not tracked yet</Text>

              <Text style={styles.sectionLabel}>Last Stay Notes</Text>
              <Text style={latestRequest ? styles.bodyText : styles.notTracked}>
                {latestRequest || 'No special requests on file'}
              </Text>

              {!guest && (
                <Text style={styles.warningText}>
                  No matching guest profile found — this may be a walk-in without an account.
                </Text>
              )}

              {guest && onViewFullProfile && (
                <Pressable style={styles.fullProfileBtn} onPress={() => onViewFullProfile(guest)}>
                  <Text style={styles.fullProfileBtnText}>View Full Guest Profile</Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.white} />
                </Pressable>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(30,24,16,0.45)', padding: spacing.lg },
  panel: { width: '100%', maxWidth: 400, maxHeight: '85%', backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text },
  loadingWrap: { padding: spacing.xxl, alignItems: 'center' },
  body: { padding: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryTint,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.primary },
  guestName: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: 6 },
  tierBadge: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  tierText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },
  statsRow: {
    flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.lg,
  },
  statValue: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text },
  statLabel: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  sectionLabel: {
    fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, marginTop: spacing.sm,
  },
  bodyText: { fontSize: 13, fontFamily: fonts.body, color: colors.text, marginBottom: spacing.sm },
  notTracked: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.sm },
  warningText: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.sm },
  fullProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, marginTop: spacing.lg,
  },
  fullProfileBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});