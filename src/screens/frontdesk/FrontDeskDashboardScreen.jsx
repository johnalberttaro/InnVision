import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';
import { subscribeToRooms, ROOM_STATUS } from '../../utils/Roomsservice';

import KpiCard from '../../components/dashboard/KpiCard';
import OccupancyGauge from '../../components/dashboard/OccupancyGauge';
import ReservationsTrendChart from '../../components/dashboard/ReservationsTrendChart';
import GuestDossierModal from '../../components/dashboard/GuestDossierModal';

/**
 * FrontDeskDashboardScreen — overview of hotel operations.
 *
 * MIGRATED TO SUPABASE. This screen was missed during the original
 * migration pass (AdminDashboardScreen.jsx got done, this sibling
 * screen — same data, different portal — did not), meaning it's been
 * running on stale/empty Firestore data since. Same reservationToCamel
 * mapping pattern as AdminDashboardScreen.jsx and the other migrated
 * screens.
 *
 * REDESIGNED KPI layout: previously 5 KPI cards sat in one flat row
 * with equal visual weight, which is exactly the "which number matters
 * right now?" confusion the redesign request called out. Split into two
 * clearly labeled groups instead:
 *   - "Today at a Glance" — Check-ins, Check-outs, Occupancy: the
 *     numbers that describe what's actually happening on THIS shift,
 *     right now, and what front desk needs to act on.
 *   - "This Week's Performance" — Total Reservations, Total Revenue:
 *     trend/reporting numbers, useful but not something front desk
 *     needs to act on in the next five minutes.
 * Today's operational numbers render first and larger — that's the
 * actual priority order for someone starting a shift.
 *
 * FIXED BUG (same class as the one found in MyReservationsScreen /
 * ReservationsScreen / AdminDashboardScreen): Recent Activity's room
 * count read booking.totals?.totalRooms, a field the current schema
 * doesn't have (only selectedRooms + guest_count) — now uses
 * selectedRooms.length.
 *
 * Reservation lifecycle: pending -> upcoming -> checked-in -> checked-out
 * (declined is a terminal dead-end from pending). A reservation counts
 * toward revenue as soon as it's been confirmed by front desk (i.e. any
 * status other than 'pending' or 'declined').
 *
 * Props:
 *  - onNavigate?: (key) => void       used for KPI-card drill-down; if
 *    omitted, cards render as non-clickable (safe default for anyone
 *    rendering this screen standalone without FrontDeskShell's router).
 */
const CONFIRMED_STATUSES = ['upcoming', 'checked-in', 'checked-out'];
const DAY_MS = 24 * 60 * 60 * 1000;

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

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export default function FrontDeskDashboardScreen({ onNavigate }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [lookBackDays, setLookBackDays] = useState(1);
  const [dossierReservation, setDossierReservation] = useState(null);

  // Maps a Postgres reservations row (snake_case) to the same camelCase
  // shape the Firestore version used, so every calculation/helper below
  // stayed unchanged.
  const reservationToCamel = (row) => ({
    id: row.id,
    guestDetails: row.guest_details,
    checkIn: row.check_in,
    checkOut: row.check_out,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    nights: row.nights,
    selectedRooms: row.selected_rooms,
    roomType: row.room_type,
    totalAmount: row.total_amount,
    status: row.status,
    guestCount: row.guest_count,
    createdAt: row.created_at,
  });

  useEffect(() => {
    const loadBookings = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        console.error('Failed to load dashboard data:', error);
        setLoading(false);
        return;
      }
      setBookings((data || []).map(reservationToCamel));
      setLoading(false);
    };
    loadBookings();

    const channel = supabase
      .channel('frontdesk-dashboard-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadBookings)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToRooms(
      (data) => {
        setRooms(data);
        setRoomsLoading(false);
      },
      () => setRoomsLoading(false)
    );
    return unsubscribe;
  }, []);

  const isSameDayAsToday = (value) => {
    const date = toDate(value);
    return date ? isSameCalendarDay(date, new Date()) : false;
  };

  const confirmedBookings = bookings.filter((b) => CONFIRMED_STATUSES.includes(b.status));

  const totalReservations = bookings.length;
  const totalRevenue = confirmedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  const todaysCheckIns = bookings.filter((b) => {
    if (b.status !== 'checked-in' && b.status !== 'checked-out') return false;
    return isSameDayAsToday(b.checkedInAt) || (!b.checkedInAt && isSameDayAsToday(b.checkIn));
  }).length;

  const todaysCheckOuts = bookings.filter((b) => {
    if (b.status !== 'checked-out') return false;
    return isSameDayAsToday(b.checkedOutAt) || (!b.checkedOutAt && isSameDayAsToday(b.checkOut));
  }).length;

  // ── Occupancy: occupied / total rooms, from the live "rooms" collection.
  // "Occupied" here means ROOM_STATUS.OCCUPIED specifically (a guest is
  // physically in the room right now) — reserved-but-not-arrived rooms are
  // intentionally excluded, since that's a different signal than occupancy.
  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === ROOM_STATUS.OCCUPIED).length;
  const occupancyPercent = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

  // ── "vs last week" trend helpers — compares this week's count/sum
  // against the prior 7-day window using createdAt.
  function weekWindowCount(getterPredicate, offsetWeeks) {
    const end = daysAgo(offsetWeeks * 7);
    const start = daysAgo(offsetWeeks * 7 + 7);
    return bookings.filter((b) => {
      const created = toDate(b.createdAt);
      if (!created) return false;
      if (created < start || created >= end) return false;
      return getterPredicate ? getterPredicate(b) : true;
    });
  }

  function trendFor(getterPredicate, valueFn) {
    const thisWeek = weekWindowCount(getterPredicate, 0);
    const lastWeek = weekWindowCount(getterPredicate, 1);
    const thisVal = valueFn ? thisWeek.reduce((s, b) => s + valueFn(b), 0) : thisWeek.length;
    const lastVal = valueFn ? lastWeek.reduce((s, b) => s + valueFn(b), 0) : lastWeek.length;
    if (lastVal === 0 && thisVal === 0) return { direction: 'flat', deltaLabel: 'No change' };
    if (lastVal === 0) return { direction: 'up', deltaLabel: 'New this week' };
    const pctChange = ((thisVal - lastVal) / lastVal) * 100;
    if (Math.abs(pctChange) < 1) return { direction: 'flat', deltaLabel: 'Flat vs last wk' };
    const direction = pctChange > 0 ? 'up' : 'down';
    return { direction, deltaLabel: `${pctChange > 0 ? '+' : ''}${Math.round(pctChange)}% vs last wk` };
  }

  // ── Sparkline data: last 7 days, oldest -> newest.
  function last7DaysSeries(getterPredicate, valueFn) {
    const series = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = daysAgo(i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const dayRows = bookings.filter((b) => {
        const created = toDate(b.createdAt);
        if (!created || created < dayStart || created >= dayEnd) return false;
        return getterPredicate ? getterPredicate(b) : true;
      });
      series.push(valueFn ? dayRows.reduce((s, b) => s + valueFn(b), 0) : dayRows.length);
    }
    return series;
  }

  const reservationsTrend = trendFor(null, null);
  const reservationsSparkline = last7DaysSeries(null, null);
  const revenueTrend = trendFor((b) => CONFIRMED_STATUSES.includes(b.status), (b) => b.totalAmount || 0);
  const revenueSparkline = last7DaysSeries((b) => CONFIRMED_STATUSES.includes(b.status), (b) => b.totalAmount || 0);

  // ── Reservations trend chart data: upcoming vs pending, per day, last 7 days.
  const trendChartDays = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = daysAgo(i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const dayRows = bookings.filter((b) => {
        const created = toDate(b.createdAt);
        return created && created >= dayStart && created < dayEnd;
      });
      out.push({
        label: dayStart.toLocaleDateString(undefined, { weekday: 'short' }),
        upcoming: dayRows.filter((b) => b.status === 'upcoming' || b.status === 'checked-in' || b.status === 'checked-out').length,
        pending: dayRows.filter((b) => b.status === 'pending').length,
      });
    }
    return out;
  }, [bookings]);

  // ── Recent activity: filtered to the selected look-back day (1-5 days ago).
  const activityForSelectedDay = useMemo(() => {
    const targetDate = daysAgo(lookBackDays - 1);
    return bookings
      .filter((b) => isSameCalendarDay(toDate(b.createdAt), targetDate))
      .slice(0, 20);
  }, [bookings, lookBackDays]);

  const getGuestName = (item) => {
    if (!item.guestDetails) return item.guestName || 'A guest';
    const { firstName, lastName } = item.guestDetails;
    return `${firstName || ''} ${lastName || ''}`.trim() || 'A guest';
  };

  const goTo = (key) => {
    if (onNavigate) onNavigate(key);
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

      {/* "Today at a Glance" — what's actually happening on THIS shift,
          right now. Comes first because these are the numbers front desk
          needs to act on immediately, not just track over time. */}
      <View style={styles.groupHeaderRow}>
        <Text style={styles.groupTitle}>Today at a Glance</Text>
        <Text style={styles.groupSubtitle}>What's happening right now</Text>
      </View>
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="log-in-outline"
          label="Today's Check-ins"
          value={String(todaysCheckIns)}
          accent="#1E7B34"
          tooltip="Guests checked in today."
          onPress={() => goTo('reservations:checkins')}
        />
        <KpiCard
          icon="log-out-outline"
          label="Today's Check-outs"
          value={String(todaysCheckOuts)}
          accent="#B3261E"
          tooltip="Guests checked out today."
          onPress={() => goTo('reservations:checkouts')}
        />
        <KpiCard
          icon="bed-outline"
          label="Occupancy Rate"
          accent={colors.primary}
          tooltip={roomsLoading ? 'Loading room data…' : 'Rooms currently occupied by a guest, out of total rooms on the property. Reserved-but-not-arrived rooms are not counted as occupied.'}
          onPress={() => goTo('rooms:availability')}
          customVisual={
            roomsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : (
              <OccupancyGauge percent={occupancyPercent} occupied={occupiedRooms} total={totalRooms} />
            )
          }
        />
      </View>

      {/* "This Week's Performance" — trend/reporting numbers. Useful
          context, but nothing here needs action in the next five
          minutes the way the group above does, so it sits second and
          reads as clearly secondary. */}
      <View style={[styles.groupHeaderRow, styles.groupHeaderRowSecondary]}>
        <Text style={styles.groupTitle}>This Week's Performance</Text>
        <Text style={styles.groupSubtitle}>Trends vs. last week</Text>
      </View>
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="calendar-outline"
          label="Total Reservations"
          value={String(totalReservations)}
          accent={colors.primary}
          trend={reservationsTrend}
          sparklineData={reservationsSparkline}
          tooltip="All reservations ever created, regardless of status."
          onPress={() => goTo('reservations:all')}
        />
        <KpiCard
          icon="cash-outline"
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          accent={colors.accent}
          trend={revenueTrend}
          sparklineData={revenueSparkline}
          note="Confirmed bookings only"
          tooltip="Sum of confirmed, checked-in, and checked-out bookings. Pending and declined are excluded."
          onPress={() => goTo('billing:records')}
        />
      </View>

      <Text style={styles.sectionTitle}>Reservations Trend</Text>
      <View style={styles.chartCard}>
        <ReservationsTrendChart days={trendChartDays} />
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityCard}>
        {activityForSelectedDay.length === 0 ? (
          <Text style={styles.emptyText}>
            No reservations were created {lookBackDays === 1 ? 'today' : `${lookBackDays} days ago`}.
          </Text>
        ) : (
          activityForSelectedDay.map((booking, index) => (
            <View
              key={booking.id}
              style={[styles.activityRow, index < activityForSelectedDay.length - 1 && styles.activityRowBorder]}
            >
              <View style={styles.activityIconBadge}>
                <Text style={styles.activityIcon}>🛏️</Text>
              </View>
              <Pressable style={styles.activityTextWrap} onPress={() => setDossierReservation(booking)}>
                <Text style={styles.activityTitle}>
                  {getGuestName(booking)} booked {booking.roomType || '(room pending)'}
                </Text>
                <Text style={styles.activitySubtitle}>
                  {booking.selectedRooms?.length ?? 0} Room{booking.selectedRooms?.length !== 1 ? 's' : ''} ·{' '}
                  {booking.nights} night{booking.nights !== 1 ? 's' : ''} · Tap to view guest
                </Text>
              </Pressable>
              <Text style={styles.activityAmount}>
                {booking.totalAmount != null ? formatCurrency(booking.totalAmount) : '—'}
              </Text>
            </View>
          ))
        )}

        {/* Look-back day selector, deliberately placed at the BOTTOM of the
            Recent Activity card (not above the list) per product direction. */}
        <View style={styles.lookBackRow}>
          <Text style={styles.lookBackLabel}>Look back:</Text>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setLookBackDays(n)}
              style={[styles.lookBackPill, lookBackDays === n && styles.lookBackPillActive]}
            >
              <Text style={[styles.lookBackPillText, lookBackDays === n && styles.lookBackPillTextActive]}>{n}</Text>
            </Pressable>
          ))}
          <Text style={styles.lookBackSuffix}>day{lookBackDays !== 1 ? 's' : ''} ago</Text>
        </View>
      </View>

      <GuestDossierModal
        visible={!!dossierReservation}
        reservation={dossierReservation}
        onClose={() => setDossierReservation(null)}
        onViewFullProfile={onNavigate ? (guest) => {
          setDossierReservation(null);
          // FrontDeskShell owns the actual guest-profile-open logic
          // (setSelectedGuestId etc.) — this screen only asks it to
          // navigate there via the shared onNavigate contract, passing
          // guest.id in the key isn't part of that contract today, so we
          // route to the Guest Records list as the safe default. Wire a
          // dedicated onOpenGuestProfile prop from FrontDeskShell if you
          // want this to jump straight to the guest's own detail screen.
          onNavigate('guests:records');
        } : undefined}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.xl },

  groupHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.sm },
  groupHeaderRowSecondary: { marginTop: spacing.xxl },
  groupTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text },
  groupSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xxl },

  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.md },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xxl,
  },

  activityCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, padding: spacing.lg },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  activityIcon: { fontSize: 16 },
  activityTextWrap: { flex: 1 },
  activityTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  activitySubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  activityAmount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.accent },

  lookBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lookBackLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginRight: spacing.xs },
  lookBackPill: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  lookBackPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  lookBackPillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  lookBackPillTextActive: { color: colors.white },
  lookBackSuffix: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginLeft: spacing.xs },
});