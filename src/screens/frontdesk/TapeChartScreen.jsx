import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { subscribeToRoomTypes, subscribeToRooms, joinRoomsWithTypes, ROOM_STATUS, statusMeta, formatCurrency } from '../../utils/Roomsservice';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

const WINDOW_DAYS = 14;
const ROOM_COL_WIDTH = 168;
const STATUS_COL_WIDTH = 44;
const OCC_COL_WIDTH = 44;
// Floors below which text genuinely stops being legible — if the
// screen is too small or there are too many rooms to fit everything
// above these, the chart falls back to scrolling rather than shrinking
// further into something unreadable. On an actual 1920×1080 desktop
// with a realistic room count, this floor is not expected to be hit.
const MIN_DAY_WIDTH = 62;
const MIN_ROW_HEIGHT = 38;

// Reservation-level statuses (not the same as rooms.status — see this
// file's own header comment for why those are two different things).
// cancelled/declined are deliberately absent here: they're excluded
// from the chart entirely rather than drawn in some "cancelled" color,
// since they never actually occupied the room.
const RES_STATUS_META = {
  pending:       { label: 'Pending',      color: '#d97706' },
  upcoming:      { label: 'Confirmed',    color: '#2563eb' },
  'checked-in':  { label: 'Checked In',   color: '#16a34a' },
  'checked-out': { label: 'Checked Out',  color: '#6b7280' },
};
const EXCLUDED_STATUSES = ['cancelled', 'declined'];

// A compact icon per current room status, for the new dedicated Status
// column — separate from the reservation bars, since (as this file's
// own header comment explains) rooms.status and reservation dates are
// two different questions. This column answers "what's this room's
// housekeeping/availability state right now."
const ROOM_STATUS_ICON = {
  [ROOM_STATUS.VACANT]:               { icon: 'checkmark-circle', color: '#16a34a' },
  [ROOM_STATUS.OCCUPIED]:              { icon: 'moon', color: '#dc2626' },
  [ROOM_STATUS.RESERVED]:              { icon: 'star', color: '#7c3aed' },
  [ROOM_STATUS.MAINTENANCE]:           { icon: 'build', color: '#d97706' },
  [ROOM_STATUS.INSPECT]:               { icon: 'search', color: '#7c3aed' },
  [ROOM_STATUS.NEEDS_CLEANING_AGAIN]:  { icon: 'alert-circle', color: '#dc2626' },
  [ROOM_STATUS.START_CLEANING]:        { icon: 'water', color: '#d97706' },
  [ROOM_STATUS.IN_PROGRESS]:           { icon: 'sparkles', color: '#d97706' },
};

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function daysBetween(a, b) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}
function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function getGuestName(res) {
  if (!res.guestDetails) return res.guestEmail || 'Guest';
  const { firstName, lastName } = res.guestDetails;
  return `${firstName || ''} ${lastName || ''}`.trim() || res.guestEmail || 'Guest';
}

// The Occ column answers "is a guest actually in this room right now,
// today" — distinct from both the reservation bars (which show the
// whole date range) and the Status column (rooms.status, a
// housekeeping state with no guest-presence concept at all). Derived
// from whichever of today's reservations (if any) covers this room.
function getOccMeta(todayStatus) {
  if (todayStatus === 'checked-in') return { color: '#dc2626', label: 'Occupied' };
  if (todayStatus) return { color: '#d97706', label: 'Arriving Today' };
  return { color: '#16a34a', label: 'Available' };
}

// Same defensive fallback ReservationsScreen.jsx already uses for this
// exact field — selected_rooms entries aren't a strictly uniform
// shape, so this checks the same few possible keys it does.
function getRoomNumbers(res) {
  if (Array.isArray(res.selectedRooms) && res.selectedRooms.length > 0) {
    return res.selectedRooms.map((r) => r.roomNumber || r.number || r.room || String(r)).filter(Boolean);
  }
  return [];
}

/**
 * TapeChartScreen — the classic hotel front-office view: every room down
 * the left side, a rolling window of dates across the top, and a
 * colored bar for each reservation spanning the nights it actually
 * covers. Lets staff see occupancy, gaps, and overlaps at a glance,
 * rather than reading reservations one at a time as a list.
 *
 * IMPORTANT DISTINCTION: rooms.status (from Roomsservice.js — vacant /
 * occupied / inspect / maintenance / etc.) is a LIVE, CURRENT-MOMENT
 * field with no date-range concept at all — it only ever describes
 * "right now." The bars on this chart come entirely from the
 * reservations table instead (check_in/check_out/selected_rooms),
 * which is the only place date-based occupancy actually lives. A room
 * showing "Vacant" in Room Management can still show a future
 * reservation bar here — that's not a contradiction, it's two
 * different questions (housekeeping state right now vs. who's booked
 * when).
 *
 * The one place rooms.status DOES show up here: a room currently
 * flagged 'maintenance' gets a small wrench indicator on its row label,
 * since that's a real "don't book this" signal regardless of what the
 * reservation data says.
 *
 * Reservation bars are clipped to the visible window — a stay that
 * started before or extends past the current 14-day view still shows,
 * just cut off at the edge, with a small arrow indicating it continues
 * off-screen.
 *
 * Sticky headers/room column use CSS `position: sticky`, which React
 * Native Web maps directly to real browser sticky positioning — this
 * works correctly on web (this app's primary surface) but has no
 * effect on native iOS/Android, where the table will still scroll and
 * display correctly, just without the pinned row/column.
 *
 * SIZING: date-column width and room-row height are both computed at
 * runtime from measured screen space (see dayWidth/rowHeight below),
 * not hardcoded — the goal is fitting every room and all 14 date
 * columns on one standard 1920×1080 screen with no scrolling needed at
 * all, on the current room count. Each has a legibility floor
 * (MIN_DAY_WIDTH / MIN_ROW_HEIGHT); if the actual screen is smaller or
 * the room count grows enough that even the floor can't fit everything
 * on screen, the surrounding ScrollViews still work as a fallback
 * rather than clipping content — but at that point scrolling becomes
 * unavoidable again, which is the honest outcome rather than shrinking
 * text past the point of being readable.
 */
export default function TapeChartScreen() {
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [reservations, setReservations] = useState([]);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [windowStart, setWindowStart] = useState(startOfDay(new Date()));
  const [selectedBar, setSelectedBar] = useState(null);
  const [hoveredBarKey, setHoveredBarKey] = useState(null);
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [todayReservations, setTodayReservations] = useState([]);

  // ── Dynamic sizing — measured, not guessed ──────────────────────────
  // Rather than assume exact pixel values for header/legend/summary/
  // filter padding (which would be fragile if the theme's spacing
  // values ever change), this measures what's actually rendered at
  // runtime via onLayout, then sizes the grid to use whatever space is
  // genuinely left — so the whole chart fits on one 1920×1080 screen
  // without scrolling, for real, rather than by coincidence.
  const [chromeHeight, setChromeHeight] = useState(0);       // header+legend+summary+filters, measured
  const [dateHeaderHeight, setDateHeaderHeight] = useState(0); // the sticky date row itself, measured
  const [gridAreaWidth, setGridAreaWidth] = useState(0);      // available width for the grid, measured
  const [screenHeight, setScreenHeight] = useState(0);        // THIS component's own allotted height, measured

  useEffect(() => {
    const unsubTypes = subscribeToRoomTypes(setRoomTypes);
    const unsubRooms = subscribeToRooms((data) => {
      setRooms(data);
      setLoadingRooms(false);
    });
    return () => {
      unsubTypes && unsubTypes();
      unsubRooms && unsubRooms();
    };
  }, []);

  const windowEnd = useMemo(() => addDays(windowStart, WINDOW_DAYS), [windowStart]);
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    let cancelled = false;
    const loadReservations = async () => {
      setLoadingReservations(true);
      // Only simple, single-condition filters here (.lt/.gt) — status
      // exclusion happens client-side below rather than as a .in()/.or()
      // filter, which is a known PostgREST parsing trap when combined
      // with other conditions (see KitchenOrdersScreen.jsx's own notes
      // on this from earlier in the project).
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .lt('check_in', windowEnd.toISOString())
        .gt('check_out', windowStart.toISOString());
      if (cancelled) return;
      if (error) {
        console.error('Failed to load reservations for tape chart:', error);
        setLoadingReservations(false);
        return;
      }
      const mapped = (data || [])
        .map((row) => ({
          id: row.id,
          guestEmail: row.guest_email,
          guestDetails: row.guest_details,
          checkIn: row.check_in,
          checkOut: row.check_out,
          nights: row.nights,
          selectedRooms: row.selected_rooms,
          roomType: row.room_type,
          status: row.status,
          totalAmount: row.total_amount,
        }))
        .filter((r) => !EXCLUDED_STATUSES.includes(r.status));
      setReservations(mapped);
      setLoadingReservations(false);
    };
    loadReservations();

    const channel = supabase
      .channel('tape-chart-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadReservations)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [windowStart, windowEnd]);

  // Independent of the window above — today's occupancy needs to stay
  // accurate even while browsing a future or past date range, so this
  // is its own fetch/subscription rather than derived from the
  // window-scoped reservations state.
  useEffect(() => {
    let cancelled = false;
    const loadTodayOccupancy = async () => {
      // Uses < tomorrow-midnight (not <= today-midnight) for check_in so
      // a same-day check-in at any time of day — e.g. a walk-in checked
      // in at 2:30 PM — still counts as "occupies today." Guest bookings
      // always store check_in as midnight of the arrival date, so this
      // widened range doesn't change their result; it only fixes
      // same-day walk-ins, which previously fell outside the old
      // <= today-midnight cutoff and never showed as Occupied here even
      // though rooms.status (the Status column) was already correct.
      const { data, error } = await supabase
        .from('reservations')
        .select('selected_rooms, status')
        .lt('check_in', addDays(today, 1).toISOString())
        .gt('check_out', today.toISOString());
      if (cancelled) return;
      if (error) {
        console.error('Failed to load today\'s occupancy for tape chart:', error);
        return;
      }
      setTodayReservations(
        (data || [])
          .filter((r) => !EXCLUDED_STATUSES.includes(r.status))
          .map((row) => ({ selectedRooms: row.selected_rooms, status: row.status }))
      );
    };
    loadTodayOccupancy();

    const channel = supabase
      .channel('tape-chart-today-occupancy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadTodayOccupancy)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [today]);

  const sortedRooms = useMemo(() => {
    const joined = joinRoomsWithTypes(rooms, roomTypes);
    // Purely numeric by room number — no floor grouping. Floor used to
    // sort first, which meant a room whose floor label happened to
    // sort alphabetically ahead of the others (e.g. "109" on a
    // differently-labeled floor) would jump to the very top of the
    // list, well out of numeric order, even though every room number
    // itself was sorting correctly within its own floor group.
    return [...joined].sort((a, b) =>
      (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true })
    );
  }, [rooms, roomTypes]);

  const occupancyByRoom = useMemo(() => {
    const map = {};
    for (const res of todayReservations) {
      for (const roomNumber of getRoomNumbers(res)) {
        // checked-in wins over a same-day pending/upcoming entry for
        // the same room, if that combination were ever to occur.
        if (!map[roomNumber] || res.status === 'checked-in') map[roomNumber] = res.status;
      }
    }
    return map;
  }, [todayReservations]);

  const roomTypeOptions = useMemo(() => {
    const seen = new Map();
    for (const room of sortedRooms) {
      if (room.roomTypeId && !seen.has(room.roomTypeId)) seen.set(room.roomTypeId, room.roomTypeName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [sortedRooms]);

  const filteredRooms = useMemo(() => {
    return sortedRooms.filter((room) => {
      if (roomTypeFilter !== 'all' && room.roomTypeId !== roomTypeFilter) return false;
      if (statusFilter !== 'all' && room.status !== statusFilter) return false;
      return true;
    });
  }, [sortedRooms, roomTypeFilter, statusFilter]);

  // Width: whatever's left in the measured grid area after the three
  // fixed label columns, split evenly across the 14 date columns.
  const dayWidth = useMemo(() => {
    if (!gridAreaWidth) return MIN_DAY_WIDTH; // before first measurement
    const remaining = gridAreaWidth - ROOM_COL_WIDTH - STATUS_COL_WIDTH - OCC_COL_WIDTH;
    return Math.max(MIN_DAY_WIDTH, Math.floor(remaining / WINDOW_DAYS));
  }, [gridAreaWidth]);

  // Height: whatever's left in the window after the measured chrome
  // (header/legend/summary/filters) and the measured date-header row,
  // split evenly across however many rooms are currently shown.
  const rowHeight = useMemo(() => {
    if (!screenHeight || !chromeHeight || !dateHeaderHeight || filteredRooms.length === 0) return MIN_ROW_HEIGHT;
    const remaining = screenHeight - chromeHeight - dateHeaderHeight;
    return Math.max(MIN_ROW_HEIGHT, Math.floor(remaining / filteredRooms.length));
  }, [screenHeight, chromeHeight, dateHeaderHeight, filteredRooms.length]);

  const summaryStats = useMemo(() => {
    const total = filteredRooms.length;
    const occupied = filteredRooms.filter((r) => occupancyByRoom[r.roomNumber] === 'checked-in').length;
    const available = filteredRooms.filter((r) => r.status === ROOM_STATUS.VACANT && !occupancyByRoom[r.roomNumber]).length;
    const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { total, occupied, available, rate };
  }, [filteredRooms, occupancyByRoom]);

  const dateColumns = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i)),
    [windowStart]
  );

  const barsByRoom = useMemo(() => {
    const map = {};
    for (const room of filteredRooms) map[room.roomNumber] = [];
    for (const res of reservations) {
      const checkIn = startOfDay(new Date(res.checkIn));
      const checkOut = startOfDay(new Date(res.checkOut));
      const clippedStart = checkIn < windowStart ? windowStart : checkIn;
      const clippedEnd = checkOut > windowEnd ? windowEnd : checkOut;
      const startOffset = daysBetween(windowStart, clippedStart);
      const endOffset = daysBetween(windowStart, clippedEnd);
      if (endOffset <= startOffset) continue;

      for (const roomNumber of getRoomNumbers(res)) {
        if (!(roomNumber in map)) continue; // reservation references a room not currently in the room list
        map[roomNumber].push({
          reservation: res,
          roomNumber,
          left: startOffset * dayWidth,
          width: (endOffset - startOffset) * dayWidth,
          continuesLeft: checkIn < windowStart,
          continuesRight: checkOut > windowEnd,
        });
      }
    }
    return map;
  }, [filteredRooms, reservations, windowStart, windowEnd, dayWidth]);

  const loading = loadingRooms || loadingReservations;
  const gridWidth = WINDOW_DAYS * dayWidth;

  return (
    <View style={styles.screen} onLayout={(e) => setScreenHeight(e.nativeEvent.layout.height)}>
      <View onLayout={(e) => setChromeHeight(e.nativeEvent.layout.height)}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tape Chart</Text>
          <Text style={styles.subtitle}>Every room and reservation across a rolling {WINDOW_DAYS}-day window.</Text>
        </View>
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setWindowStart((d) => addDays(d, -WINDOW_DAYS))} accessibilityLabel="Jump back 2 weeks">
            <Ionicons name="play-back" size={14} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setWindowStart((d) => addDays(d, -1))} accessibilityLabel="Previous day">
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.todayBtn} onPress={() => setWindowStart(startOfDay(new Date()))}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setWindowStart((d) => addDays(d, 1))} accessibilityLabel="Next day">
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => setWindowStart((d) => addDays(d, WINDOW_DAYS))} accessibilityLabel="Jump forward 2 weeks">
            <Ionicons name="play-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.legendRow}>
        {Object.entries(RES_STATUS_META).map(([key, meta]) => (
          <View key={key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: meta.color }]} />
            <Text style={styles.legendText}>{meta.label}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <Ionicons name="build-outline" size={12} color="#d97706" />
          <Text style={styles.legendText}>Room under maintenance</Text>
        </View>
      </View>

      {/* ── Summary panel — reflects whichever rooms the filters below are currently showing ── */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryStatValue}>{summaryStats.total}</Text>
          <Text style={styles.summaryStatLabel}>Total Rooms</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={[styles.summaryStatValue, { color: '#dc2626' }]}>{summaryStats.occupied}</Text>
          <Text style={styles.summaryStatLabel}>Occupied Now</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={[styles.summaryStatValue, { color: '#16a34a' }]}>{summaryStats.available}</Text>
          <Text style={styles.summaryStatLabel}>Available Now</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryStat}>
          <Text style={styles.summaryStatValue}>{summaryStats.rate}%</Text>
          <Text style={styles.summaryStatLabel}>Occupancy Rate</Text>
        </View>
      </View>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Room Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
          <TouchableOpacity style={[styles.filterChip, roomTypeFilter === 'all' && styles.filterChipActive]} onPress={() => setRoomTypeFilter('all')}>
            <Text style={[styles.filterChipText, roomTypeFilter === 'all' && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {roomTypeOptions.map((rt) => (
            <TouchableOpacity key={rt.id} style={[styles.filterChip, roomTypeFilter === rt.id && styles.filterChipActive]} onPress={() => setRoomTypeFilter(rt.id)}>
              <Text style={[styles.filterChipText, roomTypeFilter === rt.id && styles.filterChipTextActive]}>{rt.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.filterLabel, { marginLeft: spacing.md }]}>Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
          <TouchableOpacity style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]} onPress={() => setStatusFilter('all')}>
            <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {Object.values(ROOM_STATUS).map((s) => (
            <TouchableOpacity key={s} style={[styles.filterChip, statusFilter === s && styles.filterChipActive]} onPress={() => setStatusFilter(s)}>
              <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>{statusMeta(s).label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : sortedRooms.length === 0 ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>No rooms set up yet — add rooms from Room Management first.</Text>
        </View>
      ) : filteredRooms.length === 0 ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>No rooms match the current filters.</Text>
        </View>
      ) : (
        <ScrollView style={styles.gridOuterScroll} onLayout={(e) => setGridAreaWidth(e.nativeEvent.layout.width)}>
          <ScrollView horizontal style={styles.gridInnerScroll} contentContainerStyle={{ minWidth: ROOM_COL_WIDTH + STATUS_COL_WIDTH + OCC_COL_WIDTH + gridWidth }}>
            <View>
              {/* ── Date header row (sticky top) ─────────────────────── */}
              <View style={styles.dateHeaderRow} onLayout={(e) => setDateHeaderHeight(e.nativeEvent.layout.height)}>
                <View style={styles.roomColHeaderCell}>
                  <Text style={styles.roomColHeaderText}>Room</Text>
                </View>
                <View style={styles.statusColHeaderCell}>
                  <Text style={styles.roomColHeaderText}>Status</Text>
                </View>
                <View style={styles.occColHeaderCell}>
                  <Text style={styles.roomColHeaderText}>Occ</Text>
                </View>
                {dateColumns.map((d) => {
                  const isToday = isSameDay(d, today);
                  return (
                    <View key={d.toISOString()} style={[styles.dateHeaderCell, { width: dayWidth }, isToday && styles.dateHeaderCellToday]}>
                      <Text style={[styles.dateHeaderWeekday, isToday && styles.dateHeaderTextToday]}>
                        {d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </Text>
                      <Text style={[styles.dateHeaderDay, isToday && styles.dateHeaderTextToday]}>
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* ── Room rows ─────────────────────────────────────────── */}
              {filteredRooms.map((room) => {
                const isMaintenance = room.status === ROOM_STATUS.MAINTENANCE;
                const statusIcon = ROOM_STATUS_ICON[room.status];
                return (
                  <View key={room.roomNumber} style={[styles.roomRow, { height: rowHeight }]}>
                    <View style={[styles.roomLabelCell, isMaintenance && styles.roomLabelCellMaintenance]}>
                      <Text style={styles.roomNumberText}>Room {room.roomNumber}</Text>
                      <Text style={styles.roomTypeText} numberOfLines={1}>{room.roomTypeName}</Text>
                    </View>

                    <View style={styles.statusCell}>
                      {statusIcon && <Ionicons name={statusIcon.icon} size={16} color={statusIcon.color} />}
                    </View>

                    <View style={styles.occCell}>
                      <View style={[styles.occDot, { backgroundColor: getOccMeta(occupancyByRoom[room.roomNumber]).color }]} />
                    </View>

                    <View style={[styles.roomTimelineTrack, { width: gridWidth, height: rowHeight }]}>
                      {dateColumns.map((d, i) => (
                        <View
                          key={i}
                          style={[
                            styles.gridCell,
                            { left: i * dayWidth, width: dayWidth },
                            isSameDay(d, today) && styles.gridCellToday,
                          ]}
                        />
                      ))}
                      {(barsByRoom[room.roomNumber] || []).map((bar, i) => {
                        const meta = RES_STATUS_META[bar.reservation.status] || RES_STATUS_META.pending;
                        // Per-night rate — derived from the reservation's own
                        // totalAmount/nights (what this guest is actually
                        // paying), not the room type's list price, so a
                        // discounted or multi-room booking still shows an
                        // honest number rather than the generic rate.
                        const nightlyRate = bar.reservation.totalAmount && bar.reservation.nights
                          ? Math.round(bar.reservation.totalAmount / bar.reservation.nights)
                          : null;
                        const barKey = `${bar.reservation.id}-${i}`;
                        const isHovered = hoveredBarKey === barKey;
                        return (
                          <TouchableOpacity
                            key={barKey}
                            style={[
                              styles.reservationBar,
                              { left: bar.left + 3, width: Math.max(bar.width - 6, 24), backgroundColor: meta.color },
                              isHovered && styles.reservationBarHovered,
                            ]}
                            onPress={() => setSelectedBar(bar)}
                            onMouseEnter={() => setHoveredBarKey(barKey)}
                            onMouseLeave={() => setHoveredBarKey(null)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.reservationBarTopRow}>
                              {bar.continuesLeft && <Ionicons name="chevron-back" size={10} color={colors.white} />}
                              <Text style={styles.reservationBarText} numberOfLines={1}>
                                {getGuestName(bar.reservation)}
                                {nightlyRate != null && (
                                  <Text style={styles.reservationBarRateInline}> | {formatCurrency(nightlyRate)}/night</Text>
                                )}
                              </Text>
                              {bar.continuesRight && <Ionicons name="chevron-forward" size={10} color={colors.white} />}
                            </View>

                            {isHovered && (
                              <View style={styles.barTooltip} pointerEvents="none">
                                <Text style={styles.tooltipGuestName}>{getGuestName(bar.reservation)}</Text>
                                <Text style={styles.tooltipDetail}>
                                  {new Date(bar.reservation.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {' – '}
                                  {new Date(bar.reservation.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {bar.reservation.nights ? ` · ${bar.reservation.nights} night${bar.reservation.nights === 1 ? '' : 's'}` : ''}
                                </Text>
                                {nightlyRate != null && <Text style={styles.tooltipDetail}>{formatCurrency(nightlyRate)}/night</Text>}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* ── Reservation detail modal ──────────────────────────────────── */}
      <Modal visible={!!selectedBar} transparent animationType="fade" onRequestClose={() => setSelectedBar(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedBar(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {!!selectedBar && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{getGuestName(selectedBar.reservation)}</Text>
                  <TouchableOpacity onPress={() => setSelectedBar(null)}>
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.modalStatusBadge}>
                  <View style={[styles.modalStatusDot, { backgroundColor: (RES_STATUS_META[selectedBar.reservation.status] || RES_STATUS_META.pending).color }]} />
                  <Text style={[styles.modalStatusText, { color: (RES_STATUS_META[selectedBar.reservation.status] || RES_STATUS_META.pending).color }]}>
                    {(RES_STATUS_META[selectedBar.reservation.status] || RES_STATUS_META.pending).label}
                  </Text>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>Room</Text>
                  <Text style={styles.modalRowValue}>{selectedBar.roomNumber} · {selectedBar.reservation.roomType}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalRowLabel}>Dates</Text>
                  <Text style={styles.modalRowValue}>
                    {new Date(selectedBar.reservation.checkIn).toLocaleDateString()} – {new Date(selectedBar.reservation.checkOut).toLocaleDateString()}
                  </Text>
                </View>
                {!!selectedBar.reservation.nights && (
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>Nights</Text>
                    <Text style={styles.modalRowValue}>{selectedBar.reservation.nights}</Text>
                  </View>
                )}
                {!!selectedBar.reservation.totalAmount && (
                  <View style={styles.modalRow}>
                    <Text style={styles.modalRowLabel}>Total</Text>
                    <Text style={styles.modalRowValue}>{formatCurrency(selectedBar.reservation.totalAmount)}</Text>
                  </View>
                )}
                <Text style={styles.modalHint}>Manage this reservation from Reservation Management.</Text>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },

  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 21, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  navBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt,
  },
  todayBtn: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.md, backgroundColor: colors.primary },
  todayBtnText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.white },

  legendRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.cardAlt, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontFamily: fonts.bodyMedium, color: colors.textMuted },

  // ── Summary panel ────────────────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  summaryStat: { alignItems: 'center', paddingHorizontal: spacing.lg },
  summaryStatValue: { fontSize: 18, fontFamily: fonts.headingExtraBold, color: colors.primary },
  summaryStatLabel: { fontSize: 10.5, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 1 },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.border },

  // ── Filters ─────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.cardAlt, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  filterLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginRight: spacing.xs },
  filterChipRow: { flexDirection: 'row', gap: 6 },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 5, paddingHorizontal: spacing.sm, backgroundColor: colors.white },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 11, fontFamily: fonts.bodyMedium, color: colors.text },
  filterChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  gridOuterScroll: { flex: 1 },
  gridInnerScroll: { flex: 1 },

  dateHeaderRow: {
    flexDirection: 'row',
    position: 'sticky', top: 0, zIndex: 3,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  roomColHeaderCell: {
    width: ROOM_COL_WIDTH, position: 'sticky', left: 0, zIndex: 4,
    backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border,
    justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  roomColHeaderText: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.primary },
  statusColHeaderCell: {
    width: STATUS_COL_WIDTH, position: 'sticky', left: ROOM_COL_WIDTH, zIndex: 4,
    backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border,
    alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm,
  },
  occColHeaderCell: {
    width: OCC_COL_WIDTH, position: 'sticky', left: ROOM_COL_WIDTH + STATUS_COL_WIDTH, zIndex: 4,
    backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border,
    alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm,
  },
  dateHeaderCell: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm,
    borderLeftWidth: 1, borderLeftColor: colors.border,
  },
  dateHeaderCellToday: { backgroundColor: colors.primaryTint },
  dateHeaderWeekday: { fontSize: 10, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  dateHeaderDay: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginTop: 1 },
  dateHeaderTextToday: { color: colors.primary },

  roomRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  roomLabelCell: {
    width: ROOM_COL_WIDTH, position: 'sticky', left: 0, zIndex: 2,
    backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border,
    justifyContent: 'center', paddingHorizontal: spacing.md,
  },
  roomLabelCellMaintenance: { backgroundColor: '#fef3c7' },
  roomNumberText: { fontSize: 13, fontFamily: fonts.headingSemiBold, color: colors.text },
  roomTypeText: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  statusCell: {
    width: STATUS_COL_WIDTH, position: 'sticky', left: ROOM_COL_WIDTH, zIndex: 2,
    backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  occCell: {
    width: OCC_COL_WIDTH, position: 'sticky', left: ROOM_COL_WIDTH + STATUS_COL_WIDTH, zIndex: 2,
    backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  occDot: { width: 12, height: 12, borderRadius: 6 },

  roomTimelineTrack: { position: 'relative' },
  gridCell: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: 1, borderLeftColor: colors.border },
  gridCellToday: { backgroundColor: 'rgba(9,49,115,0.03)' },

  reservationBar: {
    position: 'absolute', top: 8, bottom: 8,
    borderRadius: radius.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs, paddingVertical: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1,
  },
  reservationBarHovered: { zIndex: 20, shadowOpacity: 0.25, shadowRadius: 6 },
  reservationBarTopRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reservationBarText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white, flexShrink: 1 },
  reservationBarRateInline: { fontSize: 10, fontFamily: fonts.bodyMedium, color: 'rgba(255,255,255,0.9)' },

  // Hover-only tooltip (web) — supplements the tap-to-open detail modal
  // rather than replacing it, since hover has no equivalent on
  // tablet/touch, which is this screen's other real usage context.
  barTooltip: {
    position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, zIndex: 30,
    backgroundColor: '#1f2937', borderRadius: radius.sm, padding: spacing.sm,
    minWidth: 160, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 6,
  },
  tooltipGuestName: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.white, marginBottom: 2 },
  tooltipDetail: { fontSize: 10.5, fontFamily: fonts.body, color: 'rgba(255,255,255,0.85)' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  modalTitle: { flex: 1, fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
  modalStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 4, paddingHorizontal: spacing.sm,
    marginTop: spacing.xs, marginBottom: spacing.md,
  },
  modalStatusDot: { width: 7, height: 7, borderRadius: 3.5 },
  modalStatusText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  modalRowLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  modalRowValue: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalHint: { fontSize: 11, fontFamily: fonts.body, color: colors.disabled, fontStyle: 'italic', marginTop: spacing.md, textAlign: 'center' },
});