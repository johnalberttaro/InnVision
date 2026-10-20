import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import DateWeatherCluster from './DateWeatherCluster';

const LAST_SEEN_KEY_PREFIX = 'navbar-notifications-last-seen:';

// How many rows to pull, and how many to actually show in the panel —
// kept modest since this is a "what just happened" glance, not a full
// history (Reservation Management already exists for that).
const MAX_PER_SOURCE = 15;
const MAX_TOTAL = 20;

// Same convention TapeChartScreen.jsx uses for its own reservation
// query: cancelled/declined never really happened, so they don't get a
// notification either.
const EXCLUDED_RESERVATION_STATUSES = ['cancelled', 'declined'];

const NOTIF_META = {
  reservation: { icon: 'calendar-outline', color: '#2C5EA8', bg: '#E3ECF8', title: 'New reservation' },
  cancellation: { icon: 'close-circle-outline', color: '#B3261E', bg: '#FCE1E1', title: 'Reservation cancelled' },
  inquiry: { icon: 'mail-unread-outline', color: '#8A6A00', bg: '#FFF4D6', title: 'New inquiry' },
};
// Default set when a shell doesn't pass notificationTypes (Front Desk).
// 'inquiry' = new Contact Us messages.
const ALL_TYPES = ['reservation', 'inquiry'];

function timeAgo(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Same guest_details-first-then-guest_email fallback TapeChartScreen.jsx's
// own (unexported) getGuestName() uses for the exact same reservations
// shape — redefined locally rather than imported since that one isn't
// exported and the two screens don't otherwise share a module.
function reservationGuestName(row) {
  const d = row.guest_details;
  if (d) {
    const name = `${d.firstName || ''} ${d.lastName || ''}`.trim();
    if (name) return name;
  }
  return row.guest_email || 'Guest';
}

// Live clock + current weather (hardcoded to Cebu City — see
// DateWeatherCluster.jsx for why) lives in its own component.

/**
 * DashboardNavbar — shared top bar for FrontDeskShell.jsx and AdminShell.jsx.
 *
 * Shows the hamburger menu button only when !isWide (same condition each
 * shell already used), the shell's title, and a notification bell for new
 * reservations across the whole hotel — a live query + realtime
 * subscription on `reservations`, most recent first.
 *
 * The badge counts events since this staff member last opened the
 * panel — opening it clears the count immediately (the moment of
 * looking is what counts, not reading every row), the same "looking is
 * enough" convention HousekeepingShell.jsx's own new-assignment badge
 * uses for My Tasks. "Last seen" is a per-device, per-staff timestamp in
 * AsyncStorage (keyed by staffUid, so switching accounts on the same
 * device doesn't inherit someone else's seen state) — Admin has no
 * staffUid of its own (see AdminShell.jsx: "the admin isn't a
 * front-desk auth user"), so it falls back to a single shared 'shared'
 * key there.
 *
 * Tapping a row closes the panel and hands the item's type up to
 * onNotificationNavigate, which each shell maps to its own routes (the
 * two shells use different activeKey schemes — 'reservations:all' vs
 * 'fd:reservations:all' — so that mapping lives in the shells, not here).
 *
 * The panel renders through React Native's own <Modal> rather than an
 * absolutely-positioned View, because an ancestor in the shell layout
 * creates its own stacking context on React Native Web and would draw
 * the dashboard content on top of it. marginTop uses the navbar's own
 * measured height (barHeight, via onLayout) so it lines up under the bell.
 *
 * Also renders a live clock and current weather in the bar's right-hand
 * cluster via the shared DateWeatherCluster component. Hidden when
 * !isWide so the bar doesn't get cramped on a phone-width screen.
 *
 * Props:
 *  - title: string — e.g. "InnVision Front Desk" / "InnVision Admin"
 *  - isWide: boolean — whether to show the hamburger button
 *  - onMenuPress: () => void — opens the mobile sidebar
 *  - staffUid: string|null — for the per-staff "last seen" key
 *  - notificationTypes?: Array<'reservation'>
 *  - onNotificationNavigate?: (type) => void — called on row tap
 */
export default function DashboardNavbar({
  title,
  isWide,
  onMenuPress,
  staffUid,
  notificationTypes,
  onNotificationNavigate,
}) {
  const types = notificationTypes || ALL_TYPES;
  const wantReservations = types.includes('reservation');
  const wantInquiries = types.includes('inquiry');
  const [inquiryRows, setInquiryRows] = useState([]);


  const [reservationRows, setReservationRows] = useState([]);
  // Bookings guests cancelled, newest first (needs cancelled_at from
  // sql/cancel_notifications.sql; falls back to updated_at without it).
  const [cancelRows, setCancelRows] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(null);
  // Measured, not guessed — used to offset the Modal's panel down to just
  // below the real bar. 60 is a pre-measurement fallback, only ever
  // visible for one frame.
  const [barHeight, setBarHeight] = useState(60);

  const storageKey = `${LAST_SEEN_KEY_PREFIX}${staffUid || 'shared'}`;

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((v) => setLastSeenAt(v || null));
  }, [storageKey]);

  useEffect(() => {
    if (!wantReservations) return;
    const loadReservations = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('id, guest_details, guest_email, room_type, status, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_PER_SOURCE);
      if (error) {
        console.error('Failed to load reservation notifications:', error);
        return;
      }
      setReservationRows((data || []).filter((r) => !EXCLUDED_RESERVATION_STATUSES.includes(r.status)));
    };
    const loadCancellations = async () => {
      let res = await supabase
        .from('reservations')
        .select('id, guest_details, guest_email, room_type, status, refund_status, cancelled_at, updated_at')
        .eq('status', 'cancelled')
        .order('cancelled_at', { ascending: false, nullsFirst: false })
        .limit(MAX_PER_SOURCE);
      if (res.error) {
        // cancelled_at not added yet — use updated_at instead.
        res = await supabase
          .from('reservations')
          .select('id, guest_details, guest_email, room_type, status, refund_status, updated_at')
          .eq('status', 'cancelled')
          .order('updated_at', { ascending: false })
          .limit(MAX_PER_SOURCE);
      }
      if (res.error) {
        console.error('Failed to load cancellation notifications:', res.error);
        return;
      }
      setCancelRows(res.data || []);
    };
    const loadAll = () => { loadReservations(); loadCancellations(); };
    loadAll();

    const channel = supabase
      .channel('navbar-notifications-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [wantReservations]);

  // New Contact Us inquiries.
  useEffect(() => {
    if (!wantInquiries) return undefined;
    const loadInquiries = async () => {
      const { data, error } = await supabase
        .from('contact_messages')
        .select('id, name, subject, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_PER_SOURCE);
      if (error) {
        console.error('Failed to load inquiry notifications:', error);
        return;
      }
      setInquiryRows(data || []);
    };
    loadInquiries();
    const channel = supabase
      .channel('navbar-notifications-inquiries')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_messages' }, loadInquiries)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [wantInquiries]);

  const items = useMemo(() => {
    const inquiries = inquiryRows.map((m) => ({
      key: `inquiry-${m.id}`,
      type: 'inquiry',
      occurredAt: m.created_at,
      subtitle: `${m.name || 'Guest'}${m.subject ? ` · ${m.subject}` : ''}`,
    }));
    const created = reservationRows.map((r) => ({
      key: `reservation-${r.id}`,
      type: 'reservation',
      occurredAt: r.created_at,
      subtitle: `${reservationGuestName(r)}${r.room_type ? ` · ${r.room_type}` : ''}`,
    }));
    const cancelled = cancelRows
      .filter((r) => r.cancelled_at || r.updated_at)
      .map((r) => ({
        key: `cancellation-${r.id}`,
        // Opens Reservation Management like a new-reservation row does.
        type: 'reservation',
        meta: 'cancellation',
        occurredAt: r.cancelled_at || r.updated_at,
        subtitle: `${reservationGuestName(r)}${r.room_type ? ` · ${r.room_type}` : ''}${r.refund_status === 'pending' ? ' · Refund requested' : ''}`,
      }));
    return [...created, ...cancelled, ...inquiries]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, MAX_TOTAL);
  }, [reservationRows, cancelRows, inquiryRows]);

  const unseenCount = useMemo(() => {
    if (!lastSeenAt) return items.length; // never opened the panel on this device — everything's new
    const lastSeenMs = new Date(lastSeenAt).getTime();
    return items.filter((it) => new Date(it.occurredAt).getTime() > lastSeenMs).length;
  }, [items, lastSeenAt]);

  const closePanel = () => setPanelOpen(false);

  const togglePanel = () => {
    setPanelOpen((open) => {
      const next = !open;
      if (next) {
        const now = new Date().toISOString();
        setLastSeenAt(now);
        AsyncStorage.setItem(storageKey, now).catch(() => {});
      }
      return next;
    });
  };

  const handleItemPress = (item) => {
    closePanel();
    if (onNotificationNavigate) onNotificationNavigate(item.type);
  };

  return (
    <>
      <View style={styles.bar} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
        <View style={styles.left}>
          {!isWide && (
            <TouchableOpacity
              onPress={onMenuPress}
              style={styles.menuButton}
              accessibilityLabel="Open menu"
            >
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </TouchableOpacity>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {title.startsWith('InnVision') ? (
              <>Inn<Text style={styles.titleAccent}>Vision</Text>{title.slice('InnVision'.length)}</>
            ) : (
              title
            )}
          </Text>
        </View>

        <View style={styles.right}>
          <TouchableOpacity
            style={styles.notificationIconWrap}
            onPress={togglePanel}
            accessibilityLabel="View notifications"
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            {unseenCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unseenCount > 99 ? '99+' : unseenCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Hidden under the wide breakpoint, same reasoning as the
              header comment: keeps the bar from overflowing next to the
              hamburger button on a phone-width screen. */}
          {isWide && (
            <>
              <View style={styles.divider} />
              <DateWeatherCluster />
            </>
          )}
        </View>
      </View>

      <Modal visible={panelOpen} transparent animationType="fade" onRequestClose={closePanel}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closePanel}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[styles.panel, { marginTop: barHeight }]}
          >
            <Text style={styles.panelHeader}>Notifications</Text>
            {items.length === 0 ? (
              <Text style={styles.panelEmptyText}>Nothing new right now.</Text>
            ) : (
              <ScrollView style={styles.panelList} showsVerticalScrollIndicator={false}>
                {items.map((item) => {
                  const meta = NOTIF_META[item.meta || item.type];
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={styles.panelRow}
                      onPress={() => handleItemPress(item)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.panelRowIcon, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={18} color={meta.color} />
                      </View>
                      <View style={styles.panelRowBody}>
                        <View style={styles.panelRowTopLine}>
                          <Text style={styles.panelRowTitle}>{meta.title}</Text>
                          <Text style={styles.panelRowTime}>{timeAgo(item.occurredAt)}</Text>
                        </View>
                        <Text style={styles.panelRowSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  menuButton: { width: 24, height: 18, justifyContent: 'space-between' },
  menuLine: { height: 2, backgroundColor: colors.primary, borderRadius: 1 },

  title: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary, flexShrink: 1 },
  titleAccent: { color: '#E1A005' },

  notificationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: colors.white },

  // Divider before the date/weather cluster — DateWeatherCluster.jsx
  // owns a matching divider of its own, between the date and weather
  // blocks it renders. A plain 1px rule the height of the two text
  // lines beside it, not the full bar, so it reads as separating the
  // bell from the cluster rather than spanning the whole header.
  divider: { width: 1, height: 28, backgroundColor: colors.border },

  // The Modal's own overlay — transparent (a notification dropdown
  // shouldn't dim the whole screen the way a confirm dialog does) and
  // flex-aligned to the top-right instead of TapeChartScreen.jsx's
  // centered dialog look, so the panel below
  // lands under the bell rather than in the middle of the screen. A tap
  // anywhere in this overlay — including a sidebar item, not just blank
  // space, since Modal covers everything — closes the panel; the
  // panel's own TouchableOpacity stops that same tap from propagating
  // here when it lands inside the panel instead (same
  // stopPropagation() pairing TapeChartScreen.jsx's detail modal uses).
  modalOverlay: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: spacing.lg,
  },
  // Sized up from the original 320/440 pass per feedback that the panel
  // read too small/cramped — width, row height, icon size and every
  // font size here scale up together so it stays one proportioned
  // panel rather than just a wider box around the same tiny text.
  panel: {
    width: 360,
    maxHeight: 480,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  panelHeader: {
    fontSize: 14.5, fontFamily: fonts.headingBold, color: colors.primary,
    paddingHorizontal: spacing.md, paddingBottom: spacing.sm,
  },
  panelEmptyText: {
    fontSize: 13.5, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  panelList: { maxHeight: 440 },
  panelRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md - 2,
  },
  panelRowIcon: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  panelRowBody: { flex: 1 },
  panelRowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  panelRowTitle: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  panelRowTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  panelRowSubtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
});
