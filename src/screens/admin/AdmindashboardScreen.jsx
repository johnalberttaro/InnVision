import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { collection, query, orderBy, onSnapshot, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';
import { subscribeToRooms, isAvailable, ROOM_STATUS, statusMeta } from '../../utils/Roomsservice';
import { getOutstandingBalances } from '../../utils/BillingService';
import { resolveUserRole } from '../../utils/roleHelpers';

import KpiCard from '../../components/dashboard/KpiCard';
import OccupancyGauge from '../../components/dashboard/OccupancyGauge';
import ReservationsTrendChart from '../../components/dashboard/ReservationsTrendChart';
import GuestDossierModal from '../../components/dashboard/GuestDossierModal';

const CONFIRMED_STATUSES = ['upcoming', 'checked-in', 'checked-out'];

function toDate(value) {
  if (!value) return null;
  try {
    const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function isSameCalendarDay(a, b) {
  return a && b && a.toDateString() === b.toDateString();
}

function dayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Weekly-window helper: count/sum items whose createdAt falls in the window
// ending `daysAgoEnd` days ago and spanning 7 days back.
function windowStat(items, createdAtGetter, valueGetter, daysAgoEnd) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - daysAgoEnd);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  let sum = 0;
  items.forEach((it) => {
    const d = toDate(createdAtGetter(it));
    if (d && d >= start && d < end) sum += valueGetter(it);
  });
  return sum;
}

// Build a "vs last week" trend object comparing this week vs the prior week.
function buildTrend(current, previous, formatter) {
  if (previous === 0 && current === 0) {
    return { direction: 'flat', deltaLabel: 'No change' };
  }
  const diff = current - previous;
  const pct = previous === 0 ? 100 : Math.round((diff / previous) * 100);
  const arrow = diff > 0 ? '+' : '';
  return {
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
    deltaLabel: `${arrow}${pct}% vs last wk`,
  };
}

/**
 * AdminDashboardScreen — Admin Portal home. Combines the operational KPIs
 * the Front Desk sees with admin-only figures (outstanding balances,
 * active front-desk staff count, room-status breakdown). Reuses the shared
 * dashboard components (KpiCard with trend/sparkline, OccupancyGauge,
 * ReservationsTrendChart, GuestDossierModal) so the admin and front desk
 * visuals stay consistent.
 *
 * KPI cards show a "vs last week" trend delta and support drill-down
 * navigation via onNavigate (e.g. Outstanding Balances -> billing screen).
 */
export default function AdminDashboardScreen({ onNavigate }) {
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staffCount, setStaffCount] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dossierReservation, setDossierReservation] = useState(null);

  useEffect(() => {
    const bookingsQuery = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'), limit(200));
    const unsubBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load dashboard bookings:', error);
        setLoading(false);
      }
    );
    const unsubRooms = subscribeToRooms(setRooms, (error) =>
      console.error('Failed to load dashboard rooms:', error)
    );

    // Active front-desk staff (admin-only metric).
    const unsubStaff = onSnapshot(
      query(collection(db, 'guests'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const count = snapshot.docs
          .map((d) => d.data())
          .filter((g) => resolveUserRole(g) === 'frontdesk' && g.role !== 'inactive').length;
        setStaffCount(count);
      },
      (err) => console.error('Failed to load staff count:', err)
    );

    // Outstanding (unpaid / partially paid) balances — admin money view.
    getOutstandingBalances()
      .then((records) => {
        const total = records.reduce((sum, r) => sum + (r.remainingBalance || 0), 0);
        setOutstanding({ count: records.length, amount: total });
      })
      .catch((err) => console.error('Failed to load outstanding balances:', err));

    return () => {
      unsubBookings();
      unsubRooms();
      unsubStaff();
    };
  }, []);

  const confirmedBookings = bookings.filter((b) => CONFIRMED_STATUSES.includes(b.status));
  const totalReservations = bookings.length;
  const totalRevenue = confirmedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  const today = new Date();
  const todaysCheckIns = confirmedBookings.filter((b) =>
    isSameCalendarDay(toDate(b.checkIn), today)
  ).length;
  const todaysCheckOuts = confirmedBookings.filter((b) =>
    isSameCalendarDay(toDate(b.checkOut), today)
  ).length;

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === ROOM_STATUS.OCCUPIED).length;
  const occupancyPercent = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

  // ── "vs last week" trends (this 7-day window vs the previous 7-day window,
  // by createdAt). Revenue/staff use createdAt; check-ins/outs use their date.
  const revenueThisWeek = windowStat(confirmedBookings, (b) => b.createdAt, (b) => b.totalAmount || 0, 0);
  const revenueLastWeek = windowStat(confirmedBookings, (b) => b.createdAt, (b) => b.totalAmount || 0, 7);
  const bookingsThisWeek = windowStat(bookings, (b) => b.createdAt, () => 1, 0);
  const bookingsLastWeek = windowStat(bookings, (b) => b.createdAt, () => 1, 7);

  const revenueTrend = buildTrend(revenueThisWeek, revenueLastWeek);
  const bookingsTrend = buildTrend(bookingsThisWeek, bookingsLastWeek);

  // Weekly sparkline of new reservations per day (oldest -> newest), used by
  // the Total Reservations card.
  const sparklineDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const c = bookings.filter((b) => {
      const created = toDate(b.createdAt);
      return created && created >= d && created < next;
    }).length;
    sparklineDays.push(c);
  }

  // Room-status breakdown for the admin's inventory view.
  const statusCounts = {};
  rooms.forEach((r) => {
    const key = r.status || 'unknown';
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  // 7-day reservations trend (last 7 days by createdAt).
  const trendDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dayBookings = bookings.filter((b) => {
      const created = toDate(b.createdAt);
      return created && created >= d && created < next;
    });
    trendDays.push({
      label: dayLabel(d),
      upcoming: dayBookings.filter((b) => b.status === 'upcoming' || b.status === 'checked-in' || b.status === 'checked-out').length,
      pending: dayBookings.filter((b) => b.status === 'pending').length,
    });
  }

  const recentActivity = bookings.slice(0, 5);

  const getGuestName = (item) => {
    if (!item.guestDetails) return item.guestName || 'A guest';
    const { firstName, lastName } = item.guestDetails;
    return `${firstName || ''} ${lastName || ''}`.trim() || 'A guest';
  };

  const formatDateLabel = (value) => {
    const d = toDate(value);
    return d ? d.toLocaleDateString() : '—';
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
      <Text style={styles.pageTitle}>Admin Dashboard</Text>
      <Text style={styles.pageSubtitle}>Operations overview and administrative metrics</Text>

      <View style={styles.kpiGrid}>
        <KpiCard
          icon="card-outline"
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          accent={colors.accent}
          trend={revenueTrend}
          tooltip="Confirmed bookings (upcoming, checked-in, checked-out)."
          onPress={onNavigate ? () => onNavigate('reports:revenue') : undefined}
        />
        <KpiCard
          icon="calendar-outline"
          label="Total Reservations"
          value={String(totalReservations)}
          accent={colors.primary}
          trend={bookingsTrend}
          sparklineData={sparklineDays}
          tooltip="All reservations created in the system."
          onPress={onNavigate ? () => onNavigate('fd:reservations:all') : undefined}
        />
        <KpiCard
          icon="alert-circle-outline"
          label="Outstanding Balances"
          value={outstanding ? formatCurrency(outstanding.amount) : '—'}
          accent={colors.danger}
          note={outstanding ? `${outstanding.count} folio${outstanding.count !== 1 ? 's' : ''} unpaid` : 'Loading…'}
          tooltip="Unpaid and partially-paid billing folios."
          onPress={onNavigate ? () => onNavigate('fd:billing:outstanding') : undefined}
        />
        <KpiCard
          icon="people-outline"
          label="Front Desk Staff"
          value={staffCount === null ? '—' : String(staffCount)}
          accent={colors.primary}
          note="Active accounts"
          tooltip="Front desk accounts with an active role."
          onPress={onNavigate ? () => onNavigate('staff:frontdesk') : undefined}
        />
        <KpiCard
          icon="log-in-outline"
          label="Today's Check-ins"
          value={String(todaysCheckIns)}
          accent={colors.primary}
          onPress={onNavigate ? () => onNavigate('fd:reservations:checkins') : undefined}
        />
        <KpiCard
          icon="log-out-outline"
          label="Today's Check-outs"
          value={String(todaysCheckOuts)}
          accent={colors.accent}
          onPress={onNavigate ? () => onNavigate('fd:reservations:checkouts') : undefined}
        />
      </View>

      <View style={styles.twoCol}>
        {/* Occupancy gauge */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Current Occupancy</Text>
          <View style={styles.gaugeWrap}>
            <OccupancyGauge percent={occupancyPercent} occupied={occupiedRooms} total={totalRooms} color={colors.primary} />
          </View>
        </View>

        {/* Room status breakdown */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Room Inventory</Text>
          {totalRooms === 0 ? (
            <Text style={styles.emptyText}>No rooms yet.</Text>
          ) : (
            <View style={styles.statusList}>
              {Object.keys(statusCounts).map((status) => {
                const meta = statusMeta(status);
                return (
                  <View key={status} style={styles.statusRow}>
                    <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                    <Text style={styles.statusLabel}>{meta.label}</Text>
                    <Text style={styles.statusCount}>{statusCounts[status]}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* Reservations trend */}
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Reservations — Last 7 Days</Text>
        {totalReservations === 0 ? (
          <Text style={styles.emptyText}>No reservations to chart yet.</Text>
        ) : (
          <ReservationsTrendChart days={trendDays} />
        )}
      </View>

      {/* Recent activity */}
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityCard}>
        {recentActivity.length === 0 ? (
          <Text style={styles.emptyText}>No reservations yet.</Text>
        ) : (
          recentActivity.map((booking, index) => (
            <PressableRow
              key={booking.id}
              isLast={index === recentActivity.length - 1}
              onPress={() => setDossierReservation(booking)}
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
                  {booking.nights} night{booking.nights !== 1 ? 's' : ''} · {formatDateLabel(booking.checkIn)}
                </Text>
              </View>
              <Text style={styles.activityAmount}>
                {booking.totalAmount != null ? formatCurrency(booking.totalAmount) : '—'}
              </Text>
            </PressableRow>
          ))
        )}
      </View>

      <GuestDossierModal
        visible={!!dossierReservation}
        onClose={() => setDossierReservation(null)}
        reservation={dossierReservation}
      />
    </ScrollView>
  );
}

function PressableRow({ children, onPress, isLast }) {
  const [pressed, setPressed] = useState(false);
  return (
    <View
      style={[
        styles.activityRow,
        !isLast && styles.activityRowBorder,
        pressed && styles.activityRowPressed,
      ]}
      onStartShouldSetResponder={() => true}
      onResponderRelease={onPress}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.xl },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },

  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  panel: { flex: 1, minWidth: 260, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  panelTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.md },
  gaugeWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },

  statusList: { gap: spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  statusLabel: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: colors.text },
  statusCount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.text },

  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.md, marginTop: spacing.md },
  activityCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, padding: spacing.lg },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  activityRowPressed: { backgroundColor: colors.cardAlt },
  activityIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  activityIcon: { fontSize: 16 },
  activityTextWrap: { flex: 1 },
  activityTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  activitySubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  activityAmount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.accent },
});