import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatDate } from '../../utils/dateHelpers';

/**
 * ProfileScreen — Guest profile dashboard for InnVision.
 * Reads reservations live from Firestore using the logged-in user's uid.
 *
 * Props:
 *  - user:          Firebase user object
 *  - onBookNow:     () => void
 *  - onLogout:      () => void
 *  - onEditProfile: () => void
 *  - onBackPress:   () => void
 */
export default function ProfileScreen({ user, onBookNow, onLogout, onEditProfile, onBackPress }) {
  const { width } = useWindowDimensions();
  const isWide    = width >= 768;

  const displayName = user?.displayName || 'Guest';
  const email       = user?.email || '—';
  const initials    = displayName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // ── Firestore: live reservations ─────────────────────────────────
  const [reservations, setReservations] = useState([]);
  const [loadingRes, setLoadingRes]     = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoadingRes(false); return; }

    const q = query(
      collection(db, 'reservations'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReservations(docs);
      setLoadingRes(false);
    }, (err) => {
      console.error('Firestore reservations error:', err);
      setLoadingRes(false);
    });

    return unsubscribe;
  }, [user?.uid]);

  // ── Derived summary counts ────────────────────────────────────────
  const totalRes     = reservations.length;
  const upcoming     = reservations.filter(r => r.status === 'pending' || r.status === 'upcoming').length;
  const completed    = reservations.filter(r => r.status === 'completed').length;
  const cancelled    = reservations.filter(r => r.status === 'cancelled').length;

  const currentRes   = reservations.filter(r => r.status === 'pending' || r.status === 'upcoming');
  const historyRes   = reservations.filter(r => r.status === 'completed' || r.status === 'cancelled');

  const summaryCards = [
    { label: 'Total',     value: totalRes,  color: colors.primary, bg: colors.primaryTint },
    { label: 'Upcoming',  value: upcoming,  color: colors.accent,  bg: colors.accentTint  },
    { label: 'Completed', value: completed, color: '#2e7d32',      bg: '#e8f5e9'          },
    { label: 'Cancelled', value: cancelled, color: colors.danger,  bg: colors.dangerBg    },
  ];

  const statusBadge = (status) => {
    const map = {
      'pending':   { color: colors.accent,   bg: colors.accentTint  },
      'upcoming':  { color: colors.primary,  bg: colors.primaryTint },
      'completed': { color: '#2e7d32',       bg: '#e8f5e9'          },
      'cancelled': { color: colors.danger,   bg: colors.dangerBg    },
    };
    return map[status] || { color: colors.textMuted, bg: colors.cardAlt };
  };

  const formatResDate = (iso) => {
    if (!iso) return '—';
    try { return formatDate(new Date(iso)); }
    catch { return iso; }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back button ─────────────────────────────────────── */}
        <TouchableOpacity style={styles.backBtn} onPress={onBackPress} activeOpacity={0.7}>
          <Ionicons name="arrow-back-outline" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>Back to Home</Text>
        </TouchableOpacity>

        {/* ── Profile Header ──────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <TouchableOpacity style={styles.avatarEdit}>
                <Ionicons name="camera-outline" size={13} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.headerInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
                <View style={[styles.badge, { backgroundColor: '#e8f5e9' }]}>
                  <Ionicons name="checkmark-circle" size={11} color="#2e7d32" />
                  <Text style={[styles.badgeText, { color: '#2e7d32' }]}>Verified</Text>
                </View>
              </View>
              <Text style={styles.emailText} numberOfLines={1}>{email}</Text>
              <Text style={styles.welcomeText}>Welcome back! Your account is active.</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.btnPrimary} onPress={onEditProfile} activeOpacity={0.85}>
              <Ionicons name="create-outline" size={15} color={colors.white} />
              <Text style={styles.btnPrimaryText}>Edit profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnOutline} onPress={onLogout} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={15} color={colors.danger} />
              <Text style={[styles.btnOutlineText, { color: colors.danger }]}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Quick Actions ───────────────────────────────────── */}
        <SectionTitle title="Quick actions" />
        <View style={styles.quickGrid}>
          {[
            { icon: 'bed-outline',      label: 'Book a room',  onPress: onBookNow     },
            { icon: 'person-outline',   label: 'Edit profile', onPress: onEditProfile },
          ].map((q, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={q.onPress} activeOpacity={0.8}>
              <Ionicons name={q.icon} size={22} color={colors.primary} />
              <Text style={styles.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Reservation Summary ─────────────────────────────── */}
        <SectionTitle title="Reservation summary" />
        <View style={styles.summaryGrid}>
          {summaryCards.map((s, i) => (
            <View key={i} style={[styles.summaryCard, { backgroundColor: s.bg }]}>
              <Text style={[styles.summaryValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.summaryLabel, { color: s.color }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Personal Information ────────────────────────────── */}
        <SectionTitle title="Personal information" />
        <View style={styles.card}>
          <InfoRow label="Full name" value={displayName} />
          <InfoRow label="Email"     value={email} />
          <InfoRow label="Contact"   value="Not set" muted />
          <InfoRow label="Gender"    value="Not set" muted />
          <InfoRow label="Address"   value="Not set" muted last />
        </View>

        {/* ── Account Information ─────────────────────────────── */}
        <SectionTitle title="Account information" />
        <View style={styles.card}>
          <InfoRow label="Username"        value={email.split('@')[0]} />
          <InfoRow label="Date registered" value={
            user?.metadata?.creationTime
              ? new Date(user.metadata.creationTime).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
              : '—'
          } />
          <InfoRow label="Last login" value={
            user?.metadata?.lastSignInTime
              ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
              : '—'
          } />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <View style={[styles.badge, { backgroundColor: '#e8f5e9' }]}>
              <Ionicons name="checkmark-circle" size={11} color="#2e7d32" />
              <Text style={[styles.badgeText, { color: '#2e7d32' }]}>Active</Text>
            </View>
          </View>
        </View>

        {/* ── Current Reservations ────────────────────────────── */}
        <SectionTitle title="Current reservations" />
        {loadingRes ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.lg }} />
        ) : currentRes.length === 0 ? (
          <EmptyState icon="calendar-outline" message="No current reservations." />
        ) : currentRes.map((r, i) => {
          const s = statusBadge(r.status);
          return (
            <View key={r.id} style={styles.resCard}>
              <View style={styles.resHeader}>
                <Text style={styles.resId}>#{r.id.slice(0, 10).toUpperCase()}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{r.status}</Text>
                </View>
              </View>
              <View style={styles.resGrid}>
                <ResItem label="Room type" value={r.roomType || 'Not selected'} />
                <ResItem label="Check-in"  value={formatResDate(r.checkIn)} />
                <ResItem label="Check-out" value={formatResDate(r.checkOut)} />
                <ResItem label="Nights"    value={r.nights ? `${r.nights} night${r.nights > 1 ? 's' : ''}` : '—'} />
                <ResItem label="Rooms"     value={r.totals?.totalRooms ? `${r.totals.totalRooms}` : '—'} />
                <ResItem label="Guests"    value={r.totals?.totalGuests ? `${r.totals.totalGuests}` : '—'} />
              </View>
            </View>
          );
        })}

        {/* ── Reservation History ─────────────────────────────── */}
        <SectionTitle title="Reservation history" />
        {loadingRes ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.lg }} />
        ) : historyRes.length === 0 ? (
          <EmptyState icon="time-outline" message="No reservation history yet." />
        ) : historyRes.map((r, i) => {
          const s = statusBadge(r.status);
          return (
            <View key={r.id} style={styles.resCard}>
              <View style={styles.resHeader}>
                <Text style={styles.resId}>#{r.id.slice(0, 10).toUpperCase()}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{r.status}</Text>
                </View>
              </View>
              <View style={styles.resGrid}>
                <ResItem label="Room type" value={r.roomType || '—'} />
                <ResItem label="Duration"  value={r.nights ? `${r.nights} night${r.nights > 1 ? 's' : ''}` : '—'} />
                <ResItem label="Total"     value={r.totalAmount ? `₱${r.totalAmount.toLocaleString()}` : '—'} />
              </View>
            </View>
          );
        })}

        {/* ── Security Settings ───────────────────────────────── */}
        <SectionTitle title="Security settings" />
        <View style={styles.card}>
          {[
            { icon: 'lock-closed-outline',      label: 'Password',      sub: 'Change your password',     action: 'Change' },
            { icon: 'mail-outline',             label: 'Email address', sub: email,                       action: 'Update' },
            { icon: 'shield-checkmark-outline', label: '2FA',           sub: 'Two-factor authentication', action: 'Enable' },
          ].map((sec, i, arr) => (
            <View key={i} style={[styles.secRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.secLeft}>
                <Ionicons name={sec.icon} size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.secLabel}>{sec.label}</Text>
                  <Text style={styles.secSub} numberOfLines={1}>{sec.sub}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.btnSm, sec.action === 'Enable' && styles.btnSmAccent]}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnSmText, sec.action === 'Enable' && { color: colors.primary }]}>
                  {sec.action}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */
function SectionTitle({ title }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function InfoRow({ label, value, muted, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, muted && { color: colors.textMuted }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ResItem({ label, value }) {
  return (
    <View style={styles.resItem}>
      <Text style={styles.resItemLabel}>{label}</Text>
      <Text style={styles.resItemValue}>{value}</Text>
    </View>
  );
}

function EmptyState({ icon, message }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={32} color={colors.disabled} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.cardAlt },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  contentWide: { paddingHorizontal: spacing.xxl * 2, maxWidth: 800, alignSelf: 'center', width: '100%' },

  backBtn:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  backBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },

  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },

  headerRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primaryTint,
    borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontFamily: fonts.headingBold, fontSize: 22, color: colors.primary },
  avatarEdit: {
    position: 'absolute', bottom: 0, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 0.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerInfo:  { flex: 1 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', marginBottom: 2 },
  displayName: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.text },
  emailText:   { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: 3 },
  welcomeText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  headerActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

  btnPrimary:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  btnPrimaryText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
  btnOutline:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.dangerBg },
  btnOutlineText: { fontFamily: fonts.headingSemiBold, fontSize: 13 },

  badge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  quickBtn:  { flex: 1, minWidth: 120, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border, padding: spacing.md, alignItems: 'flex-start', gap: spacing.sm },
  quickLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, minWidth: 70, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  summaryValue: { fontFamily: fonts.headingExtraBold, fontSize: 24 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11, marginTop: 2 },

  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle:     { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.6, flexShrink: 0 },
  sectionLine:      { flex: 1, height: 0.5, backgroundColor: colors.border },

  infoRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: spacing.sm },
  infoLabel:  { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, minWidth: 110, flexShrink: 0 },
  infoValue:  { fontFamily: fonts.body, fontSize: 13, color: colors.text, flex: 1, textAlign: 'right' },

  resCard:   { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  resHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  resId:     { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  resGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  resItem:   { flex: 1, minWidth: 80 },
  resItemLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  resItemValue: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },

  emptyState: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, marginBottom: spacing.lg },
  emptyText:  { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },

  secRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: spacing.sm },
  secLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  secLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  secSub:   { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, maxWidth: 180 },
  btnSm:       { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.card, flexShrink: 0 },
  btnSmAccent: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  btnSmText:   { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
});