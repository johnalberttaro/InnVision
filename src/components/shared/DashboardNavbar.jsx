import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../services/supabase';
import { formatCurrency } from '../../utils/Roomsservice';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

const LAST_SEEN_KEY_PREFIX = 'navbar-notifications-last-seen:';

// How many rows to pull per source, and how many to actually show in the
// panel once all three are merged — kept modest since this is a "what
// just happened" glance, not a full history (Reservation Management /
// Food Orders / Billing → Transactions already exist for that).
const MAX_PER_SOURCE = 15;
const MAX_TOTAL = 20;

// Same convention TapeChartScreen.jsx uses for its own reservation
// query: cancelled/declined never really happened, so they don't get a
// notification either.
const EXCLUDED_RESERVATION_STATUSES = ['cancelled', 'declined'];

const NOTIF_META = {
  reservation: { icon: 'calendar-outline', color: '#2C5EA8', bg: '#E3ECF8', title: 'New reservation' },
  foodorder: { icon: 'restaurant-outline', color: '#B3792A', bg: '#F5E9D6', title: 'New food order' },
  roomcharge: { icon: 'receipt-outline', color: '#1E7B34', bg: '#DFF5E1', title: 'Charged to room' },
};
const ALL_TYPES = Object.keys(NOTIF_META);

// Same relative-time formatting KitchenOrdersScreen.jsx's order cards
// use, kept consistent rather than inventing a second version of it.
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

// add_room_charge() (see BillingService.js's chargeToRoom()) always
// writes its transactions.note as "…— Room {number}" — currently only
// ever called from KitchenOrdersScreen.jsx's Charge to Room action, with
// a note like "F&B Order #35 — Room 101". Pulls the room number back out
// of that free-text note since transactions has no room_number column of
// its own; returns null rather than guessing if the format ever changes.
function roomFromChargeNote(note) {
  const match = /Room\s+(\S+)\s*$/.exec(note || '');
  return match ? match[1] : null;
}

/**
 * DashboardNavbar — shared top bar for FrontDeskShell.jsx, AdminShell.jsx
 * (and, in principle, any other shell that wants it — see FnbShell.jsx's
 * own header comment for why it currently opts out instead).
 *
 * Shows the hamburger menu button only when !isWide (same condition each
 * shell already used), the shell's title, and a notification bell
 * covering three event types across the whole hotel: new reservations,
 * new food orders, and F&B Charge-to-Room postings. Each is its own
 * live query + realtime subscription (reservations / food_orders /
 * transactions where payment_type='room_charge'), merged and sorted by
 * however recently each happened, most recent first.
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
 * 'fd:reservations:all', etc. — so that mapping lives in the shells, not
 * here).
 *
 * The panel renders through React Native's own <Modal>, same as the
 * detail dialogs in TapeChartScreen.jsx/KitchenOrdersScreen.jsx — NOT a
 * manually `position:'absolute'`+zIndex View nested in the normal
 * layout. An earlier version tried that; it visually sat BEHIND the
 * dashboard content below it, because this navbar lives inside
 * FrontDeskShell/AdminShell's own layout tree, and something in that
 * tree (React Native Web routinely does this once Animated/Touchable
 * wrappers and their own positioning get involved) was quietly starting
 * a new stacking context above it — no amount of raising this
 * component's own zIndex can out-rank an ancestor's stacking context
 * from the inside. <Modal> sidesteps the whole question by rendering
 * outside this component's place in the tree entirely, guaranteed on
 * top regardless of what any ancestor does — the same reason the
 * existing dialogs elsewhere in this codebase already use it instead of
 * a plain positioned View. transparent + a custom flex-end/flex-start
 * overlay (rather than the centered dialog look those two screens use)
 * anchors the panel under the bell instead of in the middle of the
 * screen; marginTop uses the navbar's own measured height (barHeight,
 * via onLayout) rather than a guessed pixel offset, so it still lines
 * up if the bar's own padding/font metrics ever change.
 *
 * notificationTypes lets a shell narrow which sources it queries/shows
 * at all — Admin has no Food Orders screen (never has; it's not in
 * AdminSidebar.jsx's Front Desk Operations section either), so nothing
 * would be reachable if you tapped a "new food order" row there. Admin
 * passes ['reservation', 'roomcharge'] to leave that source out
 * entirely rather than showing a row that goes nowhere. Defaults to all
 * three.
 *
 * Props:
 *  - title: string — e.g. "InnVision Front Desk" / "InnVision Admin"
 *  - isWide: boolean — whether to show the hamburger button
 *  - onMenuPress: () => void — opens the mobile sidebar
 *  - staffUid: string|null — for the per-staff "last seen" key
 *  - notificationTypes?: Array<'reservation'|'foodorder'|'roomcharge'>
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
  const wantFoodOrders = types.includes('foodorder');
  const wantRoomCharges = types.includes('roomcharge');

  const [reservationRows, setReservationRows] = useState([]);
  const [foodOrderRows, setFoodOrderRows] = useState([]);
  const [roomChargeRows, setRoomChargeRows] = useState([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(null);
  // Measured, not guessed (same reasoning as TapeChartScreen.jsx's own
  // onLayout-based sizing) — used to offset the Modal's panel down to
  // just below the real bar, whatever its actual rendered height is.
  // 60 is a reasonable pre-measurement fallback (~spacing.md*2 padding
  // plus the 36px icon), only ever visible for one frame.
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
    loadReservations();

    const channel = supabase
      .channel('navbar-notifications-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, loadReservations)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [wantReservations]);

  useEffect(() => {
    if (!wantFoodOrders) return;
    const loadFoodOrders = async () => {
      const { data, error } = await supabase
        .from('food_orders')
        .select('id, guest_name, room_number, total_amount, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_PER_SOURCE);
      if (error) {
        console.error('Failed to load food order notifications:', error);
        return;
      }
      setFoodOrderRows(data || []);
    };
    loadFoodOrders();

    const channel = supabase
      .channel('navbar-notifications-foodorders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_orders' }, loadFoodOrders)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [wantFoodOrders]);

  useEffect(() => {
    if (!wantRoomCharges) return;
    const loadRoomCharges = async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, guest_name, amount, note, timestamp')
        .eq('payment_type', 'room_charge')
        .order('timestamp', { ascending: false })
        .limit(MAX_PER_SOURCE);
      if (error) {
        console.error('Failed to load room charge notifications:', error);
        return;
      }
      setRoomChargeRows(data || []);
    };
    loadRoomCharges();

    const channel = supabase
      .channel('navbar-notifications-roomcharges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, loadRoomCharges)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [wantRoomCharges]);

  const items = useMemo(() => {
    const fromReservations = reservationRows.map((r) => ({
      key: `reservation-${r.id}`,
      type: 'reservation',
      occurredAt: r.created_at,
      subtitle: `${reservationGuestName(r)}${r.room_type ? ` · ${r.room_type}` : ''}`,
    }));
    const fromFoodOrders = foodOrderRows.map((o) => ({
      key: `foodorder-${o.id}`,
      type: 'foodorder',
      occurredAt: o.created_at,
      subtitle: `${o.guest_name || 'Guest'} · Room ${o.room_number || '—'} · ${formatCurrency(o.total_amount)}`,
    }));
    const fromRoomCharges = roomChargeRows.map((t) => {
      const room = roomFromChargeNote(t.note);
      return {
        key: `roomcharge-${t.id}`,
        type: 'roomcharge',
        occurredAt: t.timestamp,
        subtitle: `${t.guest_name || 'Guest'}${room ? ` · Room ${room}` : ''} · ${formatCurrency(t.amount)}`,
      };
    });
    return [...fromReservations, ...fromFoodOrders, ...fromRoomCharges]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, MAX_TOTAL);
  }, [reservationRows, foodOrderRows, roomChargeRows]);

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
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>

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
                  const meta = NOTIF_META[item.type];
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

  menuButton: { width: 24, height: 18, justifyContent: 'space-between' },
  menuLine: { height: 2, backgroundColor: colors.primary, borderRadius: 1 },

  title: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary, flexShrink: 1 },

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

  // The Modal's own overlay — transparent (a notification dropdown
  // shouldn't dim the whole screen the way a confirm dialog does) and
  // flex-aligned to the top-right instead of TapeChartScreen.jsx's/
  // KitchenOrdersScreen.jsx's centered dialog look, so the panel below
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