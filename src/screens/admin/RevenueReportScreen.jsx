import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';

export default function RevenueReportScreen() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bookingsQuery = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setReservations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load reservations:', error);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const revenue = reservations.reduce((acc, booking) => acc + (booking.totalAmount || 0), 0);
  const confirmedRevenue = reservations
    .filter((booking) => booking.status === 'upcoming' || booking.status === 'checked-in' || booking.status === 'checked-out')
    .reduce((sum, booking) => sum + (booking.totalAmount || 0), 0);
  const pendingRevenue = reservations
    .filter((booking) => booking.status === 'pending')
    .reduce((sum, booking) => sum + (booking.totalAmount || 0), 0);
  const declinedRevenue = reservations
    .filter((booking) => booking.status === 'declined')
    .reduce((sum, booking) => sum + (booking.totalAmount || 0), 0);

  const totalBookings = reservations.length;
  const confirmedBookings = reservations.filter((booking) => booking.status === 'upcoming' || booking.status === 'checked-in' || booking.status === 'checked-out').length;
  const pendingBookings = reservations.filter((booking) => booking.status === 'pending').length;
  const declinedBookings = reservations.filter((booking) => booking.status === 'declined').length;

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Revenue Report</Text>
      <Text style={styles.pageSubtitle}>
        Total revenue from reservations, plus pending and declined booking values.
      </Text>

      <View style={styles.kpiGrid}>
        <ReportCard label="Total Revenue" value={formatCurrency(revenue)} accent={colors.accent} />
        <ReportCard label="Confirmed Revenue" value={formatCurrency(confirmedRevenue)} accent={colors.primary} />
        <ReportCard label="Pending Revenue" value={formatCurrency(pendingRevenue)} accent={colors.accent} />
        <ReportCard label="Declined Revenue" value={formatCurrency(declinedRevenue)} accent={colors.danger} />
      </View>

      <View style={styles.kpiGrid}>
        <ReportCard label="Total Bookings" value={String(totalBookings)} />
        <ReportCard label="Confirmed Bookings" value={String(confirmedBookings)} accent={colors.primary} />
        <ReportCard label="Pending Bookings" value={String(pendingBookings)} accent={colors.accent} />
        <ReportCard label="Declined Bookings" value={String(declinedBookings)} accent={colors.danger} />
      </View>

      <Text style={styles.sectionTitle}>Recent Bookings</Text>
      <View style={styles.listCard}>
        {reservations.slice(0, 8).map((booking) => (
          <View key={booking.id} style={styles.bookingRow}>
            <View>
              <Text style={styles.bookingTitle}>{booking.roomType || 'Room booking'}</Text>
              <Text style={styles.bookingMeta}>{booking.status?.toUpperCase() || 'UNKNOWN'}</Text>
            </View>
            <Text style={styles.bookingAmount}>{formatCurrency(booking.totalAmount)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ReportCard({ label, value, accent }) {
  return (
    <View style={[styles.kpiCard, accent ? { borderColor: accent } : null]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xl },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  kpiCard: { width: 180, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  kpiLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginBottom: spacing.xs, textTransform: 'uppercase' },
  kpiValue: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.text },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  listCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  bookingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  bookingTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  bookingMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs },
  bookingAmount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.primary },
});