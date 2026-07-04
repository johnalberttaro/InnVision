import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';

/**
 * AdminDashboardScreen — overview of hotel operations: KPI cards, revenue
 * summary, and recent activity, computed live from the Firestore
 * "reservations" collection (same data AdminBookingsScreen reads).
 *
 * Revenue is summed only from CONFIRMED ('upcoming') reservations using
 * totalAmount (subtotal + tax), since 'pending' reservations don't have
 * totalAmount yet (it's null until ReviewPayScreen confirms).
 */
export default function AdminDashboardScreen() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bookingsQuery = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'), limit(200));
    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load dashboard data:', error);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const confirmedBookings = bookings.filter((b) => b.status === 'upcoming');

  const totalReservations = bookings.length;
  const totalRevenue = confirmedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  const todayStr = new Date().toDateString();
  const todaysCheckIns = confirmedBookings.filter((b) => {
    try {
      return new Date(b.checkIn).toDateString() === todayStr;
    } catch {
      return false;
    }
  }).length;
  const todaysCheckOuts = confirmedBookings.filter((b) => {
    try {
      return new Date(b.checkOut).toDateString() === todayStr;
    } catch {
      return false;
    }
  }).length;

  const recentActivity = bookings.slice(0, 5);

  const getGuestName = (item) => {
    if (!item.guestDetails) return item.guestName || 'A guest';
    const { firstName, lastName } = item.guestDetails;
    return `${firstName || ''} ${lastName || ''}`.trim() || 'A guest';
  };

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Dashboard</Text>
      <Text style={styles.pageSubtitle}>Overview of hotel operations</Text>

      <View style={styles.kpiGrid}>
        <KpiCard icon="📅" label="Total Reservations" value={String(totalReservations)} accent={colors.primary} />
        <KpiCard icon="💰" label="Total Revenue" value={formatCurrency(totalRevenue)} accent={colors.accent} note="Confirmed bookings only" />
        <KpiCard icon="🛎️" label="Today's Check-ins" value={String(todaysCheckIns)} accent={colors.primary} />
        <KpiCard icon="🚪" label="Today's Check-outs" value={String(todaysCheckOuts)} accent={colors.accent} />
        <KpiCard icon="🏨" label="Occupancy Rate" value="—" accent={colors.textMuted} note="Needs room inventory data" />
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityCard}>
        {recentActivity.length === 0 ? (
          <Text style={styles.emptyText}>No reservations yet.</Text>
        ) : (
          recentActivity.map((booking, index) => (
            <View
              key={booking.id}
              style={[styles.activityRow, index < recentActivity.length - 1 && styles.activityRowBorder]}
            >
              <View style={styles.activityIconBadge}>
                <Text style={styles.activityIcon}>🛏️</Text>
              </View>
              <View style={styles.activityTextWrap}>
                <Text style={styles.activityTitle}>
                  {getGuestName(booking)} booked {booking.roomType || '(room pending)'}
                </Text>
                <Text style={styles.activitySubtitle}>
                  {booking.totals?.totalRooms ?? 0} Room{booking.totals?.totalRooms !== 1 ? 's' : ''} ·{' '}
                  {booking.nights} night{booking.nights !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={styles.activityAmount}>
                {booking.totalAmount != null ? formatCurrency(booking.totalAmount) : '—'}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function KpiCard({ icon, label, value, accent, note }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconBadge, { backgroundColor: `${accent}1A` }]}>
        <Text style={styles.kpiIcon}>{icon}</Text>
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
      {note ? <Text style={styles.kpiNote}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.xl },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xxl },
  kpiCard: { width: 200, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  kpiIconBadge: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  kpiIcon: { fontSize: 18 },
  kpiLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  kpiValue: { fontSize: 22, fontFamily: fonts.headingExtraBold },
  kpiNote: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.md },
  activityCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, padding: spacing.lg },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  activityIcon: { fontSize: 16 },
  activityTextWrap: { flex: 1 },
  activityTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  activitySubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  activityAmount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.accent },
});