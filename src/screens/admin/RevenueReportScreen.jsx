import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Platform, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

const LOGO_SOURCE = require('../../../assets/logo.png');

/**
 * RevenueReportScreen — SRS Module 6, Transaction 6.2: revenue reporting.
 *
 * MIGRATED TO SUPABASE. Reads the `reservations` table directly (same
 * schema every other screen maps — see ReservationsScreen.jsx's
 * reservationToCamel) instead of the old Firestore `reservations`
 * collection.
 *
 * UPGRADED into an interactive dashboard, on top of the original static
 * summary — the four KPI categories (Total/Confirmed/Pending/Declined ×
 * Revenue/Bookings) and their layout are UNCHANGED, everything below is
 * additive:
 *
 *  - Filters (date range / room type / booking source) recompute every
 *    metric and the Recent Bookings list live — nothing is faked, it's
 *    all derived from the same `reservations` fetch, just filtered.
 *
 *  - "Booking Source" is mapped from `payment_mode` ('online' vs
 *    'hotel') — that's the only real per-reservation channel field in
 *    this schema; there's no separate walk-in/OTA/front-desk-created
 *    booking path to distinguish yet, so this is the honest choice
 *    rather than inventing a channel dimension that doesn't exist in
 *    the data.
 *
 *  - Trend badges compare "last 7 days" vs "the 7 days before that",
 *    computed from the room-type/source-filtered dataset but
 *    deliberately NOT re-scoped by the date-range filter — if trend
 *    also shifted with the date filter, a card showing "All Time"
 *    totals next to a trend for some arbitrary sub-window would be
 *    confusing. "vs last week" stays a stable, consistently-labeled
 *    reference point no matter what date range is selected.
 *
 *  - Every KPI card is tappable ("Action Links") and opens a detail
 *    modal listing the actual bookings behind that number — no routing
 *    changes needed elsewhere, this screen is rendered with no nav
 *    props from AdminShell, so the drill-down is a self-contained
 *    modal (same pattern as ReceiptDetailModal / RecordPaymentModal
 *    elsewhere in the app) rather than a separate screen.
 *
 *  - Export: CSV downloads directly on web (Blob + anchor, no new
 *    dependency) and falls back to the OS share sheet on native. "PDF"
 *    export reuses the same print-a-branded-HTML-tab technique built
 *    for ReceiptDetailModal.jsx — the browser's print dialog already
 *    includes "Save as PDF", so no PDF-generation library was added.
 *    Native has no print primitive without adding one, so it shares a
 *    plain-text version instead, same fallback as the receipt.
 *
 *  - Currency formatting is a local, 2-decimal `formatCurrency`
 *    (₱152,217.00) — scoped to this file rather than changing the
 *    shared roomRates.js version, which other screens (room rate
 *    cards) intentionally show without decimals.
 */

// ── Currency / date formatting (2-decimal, this screen only) ──────────────
function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return withTime
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Status buckets (same three groupings the original screen used) ────────
const CONFIRMED_STATUSES = ['upcoming', 'checked-in', 'checked-out'];
const isConfirmedStatus = (s) => CONFIRMED_STATUSES.includes(s);
const isPendingStatus = (s) => s === 'pending';
const isDeclinedStatus = (s) => s === 'declined';

function computeMetrics(list) {
  const sum = (arr) => arr.reduce((acc, b) => acc + (b.totalAmount || 0), 0);
  const confirmed = list.filter((b) => isConfirmedStatus(b.status));
  const pending = list.filter((b) => isPendingStatus(b.status));
  const declined = list.filter((b) => isDeclinedStatus(b.status));
  return {
    all: list,
    confirmed, pending, declined,
    totalRevenue: sum(list),
    confirmedRevenue: sum(confirmed),
    pendingRevenue: sum(pending),
    declinedRevenue: sum(declined),
    totalBookings: list.length,
    confirmedBookings: confirmed.length,
    pendingBookings: pending.length,
    declinedBookings: declined.length,
  };
}

// Real assigned room numbers for a reservation, or null if it doesn't
// have any yet (e.g. still pending). Mirrors ReservationsScreen.jsx's
// getRoomNumbersDisplay() — deliberately returns null rather than a
// fake placeholder.
function getRoomNumbersDisplay(booking) {
  if (Array.isArray(booking.selectedRooms) && booking.selectedRooms.length > 0) {
    const numbers = booking.selectedRooms
      .map((r) => r.roomNumber || r.number || r.room)
      .filter(Boolean);
    if (numbers.length > 0) return numbers;
  }
  return null;
}

function guestNameFor(b) {
  const gd = b.guestDetails || {};
  const name = `${gd.firstName || ''} ${gd.lastName || ''}`.trim();
  return name || b.guestEmail || 'Guest';
}

function sourceLabel(paymentMode) {
  if (paymentMode === 'online') return 'Online Booking';
  if (paymentMode === 'hotel') return 'Pay at Hotel';
  return '—';
}

// ── Filter option constants ────────────────────────────────────────────
const DATE_RANGE_OPTIONS = [
  { key: 'all', label: 'All Time' },
  { key: '7d', label: 'Last 7 Days', days: 7 },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: '90d', label: 'Last 90 Days', days: 90 },
];
const SOURCE_OPTIONS = [
  { key: 'all', label: 'All Sources' },
  { key: 'online', label: 'Online Booking' },
  { key: 'hotel', label: 'Pay at Hotel' },
];

// ── Print/export brand palette — always light, same reasoning as the
// receipt modal: an exported report is meant to be read on paper/PDF,
// independent of the app's own dark-mode state. ─────────────────────────
const PRINT_COLORS = {
  background: '#F5EFE6', card: '#FDFAF4', cardAlt: '#EFE7D8', border: '#E2D6C1',
  primary: '#332B22', primaryTint: '#EFE7D8', onPrimary: '#FDFAF4',
  text: '#332B22', textMuted: '#8A7C64',
};

function resolveLogoUri() {
  try {
    const resolved = Image.resolveAssetSource(LOGO_SOURCE);
    return resolved?.uri || null;
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toCsvValue(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(list) {
  const header = ['Booking ID', 'Guest', 'Room Type', 'Room Number(s)', 'Status', 'Booking Source', 'Amount (PHP)', 'Date Created'];
  const rows = list.map((b) => [
    b.id,
    guestNameFor(b),
    b.roomType || '',
    (getRoomNumbersDisplay(b) || []).join(' | '),
    (b.status || '').toUpperCase(),
    sourceLabel(b.paymentMode),
    (b.totalAmount || 0).toFixed(2),
    b.createdAt ? new Date(b.createdAt).toISOString() : '',
  ]);
  return [header, ...rows].map((r) => r.map(toCsvValue).join(',')).join('\n');
}

function buildReportHtml({ filterSummary, metrics, list, logoUri }) {
  const kpiHtml = [
    ['Total Revenue', formatCurrency(metrics.totalRevenue)],
    ['Confirmed Revenue', formatCurrency(metrics.confirmedRevenue)],
    ['Pending Revenue', formatCurrency(metrics.pendingRevenue)],
    ['Declined Revenue', formatCurrency(metrics.declinedRevenue)],
    ['Total Bookings', String(metrics.totalBookings)],
    ['Confirmed Bookings', String(metrics.confirmedBookings)],
    ['Pending Bookings', String(metrics.pendingBookings)],
    ['Declined Bookings', String(metrics.declinedBookings)],
  ].map(([label, value]) => `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="kpi-value">${escapeHtml(value)}</div>
    </div>
  `).join('');

  const rowsHtml = list.slice(0, 100).map((b) => `
    <tr>
      <td>${escapeHtml(guestNameFor(b))}</td>
      <td>${escapeHtml(b.roomType || '—')}</td>
      <td>${escapeHtml((b.status || '').toUpperCase())}</td>
      <td>${escapeHtml(sourceLabel(b.paymentMode))}</td>
      <td>${escapeHtml(formatDate(b.createdAt))}</td>
      <td class="amount">${escapeHtml(formatCurrency(b.totalAmount))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>InnVision Revenue Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { background: ${PRINT_COLORS.background}; }
  body { font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; color: ${PRINT_COLORS.text}; padding: 32px; }
  .header { display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
  .logo { width: 44px; height: 44px; object-fit: contain; }
  .hotel-name { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 19px; color: ${PRINT_COLORS.primary}; }
  .hotel-sub { font-size: 11.5px; color: ${PRINT_COLORS.textMuted}; margin-top: 1px; }
  h1 { font-family: 'Baloo 2', sans-serif; font-size: 22px; margin: 22px 0 2px; color: ${PRINT_COLORS.primary}; }
  .meta { font-size: 12px; color: ${PRINT_COLORS.textMuted}; margin-bottom: 18px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
  .kpi { background: ${PRINT_COLORS.card}; border: 1px solid ${PRINT_COLORS.border}; border-radius: 10px; padding: 12px 14px; }
  .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: ${PRINT_COLORS.textMuted}; margin-bottom: 4px; }
  .kpi-value { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 17px; color: ${PRINT_COLORS.primary}; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: ${PRINT_COLORS.textMuted}; padding: 8px 6px; border-bottom: 1.5px solid ${PRINT_COLORS.border}; }
  td { padding: 7px 6px; border-bottom: 1px solid ${PRINT_COLORS.border}; }
  td.amount { text-align: right; font-weight: 600; }
  .footer { margin-top: 24px; text-align: center; font-size: 10.5px; color: ${PRINT_COLORS.textMuted}; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
  <div class="header">
    ${logoUri ? `<img class="logo" src="${logoUri}" alt="InnVision" />` : ''}
    <div>
      <div class="hotel-name">InnVision Training Hotel</div>
      <div class="hotel-sub">Consolatrix College of Toledo City, Inc.</div>
    </div>
  </div>

  <h1>Revenue Report</h1>
  <div class="meta">${escapeHtml(filterSummary)} · Generated ${escapeHtml(formatDate(new Date().toISOString(), true))}</div>

  <div class="kpi-grid">${kpiHtml}</div>

  <table>
    <thead>
      <tr><th>Guest</th><th>Room Type</th><th>Status</th><th>Source</th><th>Date</th><th style="text-align:right">Amount</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">InnVision Training Hotel — internal report, not for guest distribution.</div>
</body>
</html>`;
}

export default function RevenueReportScreen() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportError, setExportError] = useState(null);

  const [dateRangeKey, setDateRangeKey] = useState('all');
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  const [detailModal, setDetailModal] = useState(null); // { title, list } | null

  useEffect(() => {
    const reservationToCamel = (row) => ({
      id: row.id,
      roomType: row.room_type,
      selectedRooms: row.selected_rooms,
      totalAmount: row.total_amount,
      status: row.status,
      paymentMode: row.payment_mode,
      guestDetails: row.guest_details,
      guestEmail: row.guest_email,
      createdAt: row.created_at,
    });

    const loadReservations = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load reservations:', error);
        setLoading(false);
        return;
      }
      setReservations((data || []).map(reservationToCamel));
      setLoading(false);
    };
    loadReservations();

    const channel = supabase
      .channel('revenue-report-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadReservations)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Room type options are derived straight from real booking data
  // (comma-joined multi-room strings split into individual tokens) so
  // the filter never drifts out of sync with what's actually bookable.
  const roomTypeOptions = useMemo(() => {
    const set = new Set();
    reservations.forEach((r) => {
      (r.roomType || '').split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [reservations]);

  const matchesRoomType = (r, roomType) => {
    if (roomType === 'all') return true;
    const tokens = (r.roomType || '').split(',').map((t) => t.trim());
    return tokens.includes(roomType);
  };
  const matchesSource = (r, source) => source === 'all' || r.paymentMode === source;

  const filteredReservations = useMemo(() => {
    const rangeOpt = DATE_RANGE_OPTIONS.find((o) => o.key === dateRangeKey);
    const cutoff = rangeOpt?.days ? (() => { const d = new Date(); d.setDate(d.getDate() - rangeOpt.days); return d; })() : null;
    return reservations.filter((r) => {
      if (cutoff && (!r.createdAt || new Date(r.createdAt) < cutoff)) return false;
      if (!matchesRoomType(r, roomTypeFilter)) return false;
      if (!matchesSource(r, sourceFilter)) return false;
      return true;
    });
  }, [reservations, dateRangeKey, roomTypeFilter, sourceFilter]);

  const metrics = useMemo(() => computeMetrics(filteredReservations), [filteredReservations]);

  // Trend basis: last 7 days vs the 7 days before that, scoped to the
  // room-type/source filters but NOT the date-range filter — see file
  // header comment for why it's decoupled from dateRangeKey.
  const trendBase = useMemo(
    () => reservations.filter((r) => matchesRoomType(r, roomTypeFilter) && matchesSource(r, sourceFilter)),
    [reservations, roomTypeFilter, sourceFilter]
  );
  const { thisWeekMetrics, lastWeekMetrics } = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const thisWeek = trendBase.filter((r) => r.createdAt && new Date(r.createdAt) >= weekAgo);
    const lastWeek = trendBase.filter((r) => r.createdAt && new Date(r.createdAt) >= twoWeeksAgo && new Date(r.createdAt) < weekAgo);
    return { thisWeekMetrics: computeMetrics(thisWeek), lastWeekMetrics: computeMetrics(lastWeek) };
  }, [trendBase]);

  const filterSummary = useMemo(() => {
    const parts = [
      DATE_RANGE_OPTIONS.find((o) => o.key === dateRangeKey)?.label,
      roomTypeFilter === 'all' ? 'All Room Types' : roomTypeFilter,
      SOURCE_OPTIONS.find((o) => o.key === sourceFilter)?.label,
    ];
    return parts.join(' · ');
  }, [dateRangeKey, roomTypeFilter, sourceFilter]);

  const openDetail = (title, list) => setDetailModal({ title, list });
  const closeDetail = () => setDetailModal(null);

  const handleExportCsv = async () => {
    setExportError(null);
    const csv = buildCsv(filteredReservations);
    const filename = `innvision-revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('CSV export failed:', err);
        setExportError('Could not export the CSV file.');
      }
    } else {
      try {
        await Share.share({ title: filename, message: csv });
      } catch (err) {
        console.error('CSV share failed:', err);
        setExportError('Could not open the share sheet.');
      }
    }
  };

  const handleExportPdf = () => {
    setExportError(null);
    if (Platform.OS === 'web') {
      const html = buildReportHtml({ filterSummary, metrics, list: filteredReservations, logoUri: resolveLogoUri() });
      const win = window.open('', '_blank', 'width=900,height=1000');
      if (!win) {
        setExportError('Please allow pop-ups for this site to export as PDF.');
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 350);
    } else {
      const lines = [
        'InnVision Training Hotel — Revenue Report',
        filterSummary,
        '',
        `Total Revenue: ${formatCurrency(metrics.totalRevenue)}`,
        `Confirmed Revenue: ${formatCurrency(metrics.confirmedRevenue)}`,
        `Pending Revenue: ${formatCurrency(metrics.pendingRevenue)}`,
        `Declined Revenue: ${formatCurrency(metrics.declinedRevenue)}`,
        `Total Bookings: ${metrics.totalBookings}`,
        `Confirmed Bookings: ${metrics.confirmedBookings}`,
        `Pending Bookings: ${metrics.pendingBookings}`,
        `Declined Bookings: ${metrics.declinedBookings}`,
      ];
      Share.share({ title: 'InnVision Revenue Report', message: lines.join('\n') }).catch((err) => {
        console.error('PDF share fallback failed:', err);
        setExportError('Could not open the share sheet.');
      });
    }
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
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Revenue Report</Text>
          <Text style={styles.pageSubtitle}>
            Total revenue from reservations, plus pending and declined booking values.
          </Text>
        </View>
        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportButton} onPress={handleExportCsv} activeOpacity={0.85}>
            <Ionicons name="document-text-outline" size={14} color={colors.primary} />
            <Text style={styles.exportButtonText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportButton, styles.exportButtonPrimary]} onPress={handleExportPdf} activeOpacity={0.85}>
            <Ionicons name="print-outline" size={14} color={colors.white} />
            <Text style={[styles.exportButtonText, styles.exportButtonTextPrimary]}>Export PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!!exportError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.errorBannerText}>{exportError}</Text>
        </View>
      )}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <View style={styles.filterCard}>
        <FilterGroup label="Date Range">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <FilterChip key={opt.key} label={opt.label} active={dateRangeKey === opt.key} onPress={() => setDateRangeKey(opt.key)} />
          ))}
        </FilterGroup>
        <FilterGroup label="Room Type">
          <FilterChip label="All Room Types" active={roomTypeFilter === 'all'} onPress={() => setRoomTypeFilter('all')} />
          {roomTypeOptions.map((rt) => (
            <FilterChip key={rt} label={rt} active={roomTypeFilter === rt} onPress={() => setRoomTypeFilter(rt)} />
          ))}
        </FilterGroup>
        <FilterGroup label="Booking Source">
          {SOURCE_OPTIONS.map((opt) => (
            <FilterChip key={opt.key} label={opt.label} active={sourceFilter === opt.key} onPress={() => setSourceFilter(opt.key)} />
          ))}
        </FilterGroup>
      </View>

      <View style={styles.kpiGrid}>
        <ReportCard
          label="Total Revenue" value={formatCurrency(metrics.totalRevenue)} accent={colors.accent}
          current={thisWeekMetrics.totalRevenue} previous={lastWeekMetrics.totalRevenue}
          onPress={() => openDetail('Total Bookings', metrics.all)}
        />
        <ReportCard
          label="Confirmed Revenue" value={formatCurrency(metrics.confirmedRevenue)} accent={colors.primary}
          current={thisWeekMetrics.confirmedRevenue} previous={lastWeekMetrics.confirmedRevenue}
          onPress={() => openDetail('Confirmed Bookings', metrics.confirmed)}
        />
        <ReportCard
          label="Pending Revenue" value={formatCurrency(metrics.pendingRevenue)} accent={colors.accent}
          current={thisWeekMetrics.pendingRevenue} previous={lastWeekMetrics.pendingRevenue}
          onPress={() => openDetail('Pending Bookings', metrics.pending)}
        />
        <ReportCard
          label="Declined Revenue" value={formatCurrency(metrics.declinedRevenue)} accent={colors.danger}
          current={thisWeekMetrics.declinedRevenue} previous={lastWeekMetrics.declinedRevenue}
          onPress={() => openDetail('Declined Bookings', metrics.declined)}
        />
      </View>

      <View style={styles.kpiGrid}>
        <ReportCard
          label="Total Bookings" value={String(metrics.totalBookings)}
          current={thisWeekMetrics.totalBookings} previous={lastWeekMetrics.totalBookings}
          onPress={() => openDetail('Total Bookings', metrics.all)}
        />
        <ReportCard
          label="Confirmed Bookings" value={String(metrics.confirmedBookings)} accent={colors.primary}
          current={thisWeekMetrics.confirmedBookings} previous={lastWeekMetrics.confirmedBookings}
          onPress={() => openDetail('Confirmed Bookings', metrics.confirmed)}
        />
        <ReportCard
          label="Pending Bookings" value={String(metrics.pendingBookings)} accent={colors.accent}
          current={thisWeekMetrics.pendingBookings} previous={lastWeekMetrics.pendingBookings}
          onPress={() => openDetail('Pending Bookings', metrics.pending)}
        />
        <ReportCard
          label="Declined Bookings" value={String(metrics.declinedBookings)} accent={colors.danger}
          current={thisWeekMetrics.declinedBookings} previous={lastWeekMetrics.declinedBookings}
          onPress={() => openDetail('Declined Bookings', metrics.declined)}
        />
      </View>

      <Text style={styles.sectionTitle}>Recent Bookings</Text>
      <View style={styles.listCard}>
        {filteredReservations.length === 0 ? (
          <Text style={styles.emptyText}>No bookings match the selected filters.</Text>
        ) : (
          filteredReservations.slice(0, 8).map((booking) => {
            const roomNumbers = getRoomNumbersDisplay(booking);
            return (
              <View key={booking.id} style={styles.bookingRow}>
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <Text style={styles.bookingTitle}>{booking.roomType || 'Room booking'}</Text>
                  <Text style={styles.bookingMeta}>{booking.status?.toUpperCase() || 'UNKNOWN'}</Text>
                  {!!roomNumbers && (
                    <View style={styles.roomBadgeRow}>
                      {roomNumbers.map((rn) => (
                        <View key={rn} style={styles.roomBadge}>
                          <Ionicons name="key-outline" size={10} color={colors.white} />
                          <Text style={styles.roomBadgeText}>Room {rn}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <Text style={styles.bookingAmount}>{formatCurrency(booking.totalAmount)}</Text>
              </View>
            );
          })
        )}
      </View>

      <MetricDetailModal visible={!!detailModal} title={detailModal?.title} list={detailModal?.list || []} onClose={closeDetail} />
    </ScrollView>
  );
}

function FilterGroup({ label, children }) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterGroupLabel}>{label}</Text>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

function FilterChip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Trend badge: last 7 days vs the 7 days before — see file header for
// why this comparison window is fixed rather than tied to the active
// date-range filter.
function TrendBadge({ current, previous }) {
  if (!current && !previous) return null;
  if (!previous) {
    return (
      <View style={[styles.trendBadge, styles.trendBadgeUp]}>
        <Ionicons name="sparkles-outline" size={10} color="#1E7B34" />
        <Text style={[styles.trendText, styles.trendTextUp]}>New</Text>
      </View>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  const isUp = pct > 0.5;
  const isDown = pct < -0.5;
  const style = isUp ? styles.trendBadgeUp : isDown ? styles.trendBadgeDown : styles.trendBadgeFlat;
  const textStyle = isUp ? styles.trendTextUp : isDown ? styles.trendTextDown : styles.trendTextFlat;
  const icon = isUp ? 'arrow-up' : isDown ? 'arrow-down' : 'remove';
  const color = isUp ? '#1E7B34' : isDown ? '#B3261E' : colors.textMuted;
  return (
    <View style={[styles.trendBadge, style]}>
      <Ionicons name={icon} size={10} color={color} />
      <Text style={[styles.trendText, textStyle]}>{Math.abs(pct).toFixed(0)}%</Text>
    </View>
  );
}

function ReportCard({ label, value, accent, current, previous, onPress }) {
  return (
    <TouchableOpacity style={[styles.kpiCard, accent ? { borderColor: accent } : null]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.kpiTopRow}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
      </View>
      <View style={styles.kpiValueRow}>
        <Text style={[styles.kpiValue, accent ? { color: accent } : null]}>{value}</Text>
        <TrendBadge current={current} previous={previous} />
      </View>
      <Text style={styles.kpiTrendCaption}>vs last week</Text>
    </TouchableOpacity>
  );
}

function MetricDetailModal({ visible, title, list, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>{list.length} booking{list.length === 1 ? '' : 's'}</Text>

          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            {list.length === 0 ? (
              <Text style={styles.emptyText}>No bookings in this category.</Text>
            ) : (
              list.map((b) => {
                const roomNumbers = getRoomNumbersDisplay(b);
                return (
                  <View key={b.id} style={styles.modalRow}>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <Text style={styles.modalRowName}>{guestNameFor(b)}</Text>
                      <Text style={styles.modalRowMeta}>
                        {b.roomType || 'Room booking'} · {sourceLabel(b.paymentMode)} · {formatDate(b.createdAt)}
                      </Text>
                      {!!roomNumbers && (
                        <View style={styles.roomBadgeRow}>
                          {roomNumbers.map((rn) => (
                            <View key={rn} style={styles.roomBadge}>
                              <Ionicons name="key-outline" size={9} color={colors.white} />
                              <Text style={styles.roomBadgeText}>Room {rn}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <Text style={styles.modalRowAmount}>{formatCurrency(b.totalAmount)}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg, flexWrap: 'wrap', gap: spacing.md },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs },

  exportRow: { flexDirection: 'row', gap: spacing.sm },
  exportButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.white,
  },
  exportButtonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  exportButtonText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },
  exportButtonTextPrimary: { color: colors.white },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  errorBannerText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.danger },

  filterCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.xl, gap: spacing.md,
  },
  filterGroup: { gap: 6 },
  filterGroupLabel: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.cardAlt,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text },
  chipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  kpiCard: { width: 200, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  kpiTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  kpiLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textTransform: 'uppercase' },
  kpiValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  kpiValue: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.text, flexShrink: 1 },
  kpiTrendCaption: { fontSize: 9, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },

  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  trendBadgeUp: { backgroundColor: '#DFF5E1' },
  trendBadgeDown: { backgroundColor: '#FBE7E7' },
  trendBadgeFlat: { backgroundColor: colors.cardAlt },
  trendText: { fontSize: 10, fontFamily: fonts.bodySemiBold },
  trendTextUp: { color: '#1E7B34' },
  trendTextDown: { color: '#B3261E' },
  trendTextFlat: { color: colors.textMuted },

  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  listCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },

  bookingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  bookingTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  bookingMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs },
  roomBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  roomBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.primary, borderRadius: 999,
    paddingVertical: 2, paddingHorizontal: spacing.sm,
  },
  roomBadgeText: { fontSize: 10, fontFamily: fonts.headingSemiBold, color: colors.white },
  bookingAmount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.primary },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxWidth: 480, maxHeight: '80%' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontFamily: fonts.headingExtraBold, color: colors.primary },
  modalCloseBtn: { padding: 2 },
  modalSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  modalScroll: { maxHeight: 420 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalRowName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalRowMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  modalRowAmount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.primary },
});