import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors as headerColors } from '../../utils/theme';
import { useTheme } from '../../context/ThemeContext';
import {
  checkMyDeadlines,
  fetchMyNotifications,
  markNotificationsRead,
  subscribeToMyNotifications,
  fetchBookingSummary,
  notificationMeta,
} from '../../utils/NotificationService';

// How often to re-check deadlines while the app stays open (the database
// also checks on its own every 15 minutes when pg_cron is enabled).
const RECHECK_MS = 5 * 60 * 1000;
const WIDE_BREAKPOINT = 768;

/**
 * GuestNotificationBell — bell + unread badge for signed-in guests, shown in
 * HomeHeader. Opens a panel listing the guest's notifications: deadline
 * reminders (sql/guest_deadline_notifications.sql) plus the booking updates
 * Front Desk already sends (confirmed, checked in, refund, extension…).
 *
 * Tapping a notification opens its details and the booking it is about,
 * and marks it read. "Mark all as read" clears the badge.
 *
 * The bell button itself uses the header's fixed cream palette (theme.js
 * `colors`, like the rest of HomeHeader); the panel follows the app's
 * light/dark theme (useTheme), like the other guest dialogs.
 *
 * Props:
 *  - onViewBooking: (reservationId) => void — open My Reservations at that
 *    booking (it scrolls to it, expands it and highlights it)
 *  - iconColor / badgeBorderColor: optional, for darker headers (defaults
 *    match the cream home header)
 */
export default function GuestNotificationBell({ onViewBooking, iconColor, badgeBorderColor }) {
  const { colors, spacing, radius, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts, isWide), [colors, spacing, radius, fonts, isWide]);

  const [userId, setUserId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mountedRef.current) setUserId(data?.session?.user?.id || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mountedRef.current) setUserId(session?.user?.id || null);
    });
    return () => {
      mountedRef.current = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await fetchMyNotifications();
      if (mountedRef.current) { setItems(list); setError(''); }
    } catch (err) {
      console.error('Failed to load notifications:', err);
      if (mountedRef.current) setError('Could not load notifications.');
    }
  }, [userId]);

  // Check deadlines, then load — on sign-in, every few minutes, and live.
  useEffect(() => {
    if (!userId) { setItems([]); return undefined; }
    let cancelled = false;
    const refresh = async () => {
      try {
        await checkMyDeadlines();
      } catch (err) {
        // Not fatal: the scheduled job still creates them.
        console.error('Deadline check failed:', err);
      }
      if (!cancelled) await load();
    };
    setLoading(true);
    refresh().finally(() => { if (!cancelled) setLoading(false); });
    const timer = setInterval(refresh, RECHECK_MS);
    const unsubscribe = subscribeToMyNotifications(userId, () => load());
    return () => { cancelled = true; clearInterval(timer); unsubscribe(); };
  }, [userId, load]);

  const unread = items.filter((n) => !n.read).length;

  const openItem = async (n) => {
    setSelected(n);
    setBooking(null);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markNotificationsRead([n.id]).catch((err) => console.error('Failed to mark read:', err));
    }
    if (n.reservationId) {
      setBookingLoading(true);
      try {
        const b = await fetchBookingSummary(n.reservationId);
        if (mountedRef.current) setBooking(b);
      } catch (err) {
        console.error('Failed to load booking for notification:', err);
      } finally {
        if (mountedRef.current) setBookingLoading(false);
      }
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    try {
      await markNotificationsRead();
    } catch (err) {
      console.error('Failed to mark all read:', err);
      load();
    }
  };

  const close = () => { setOpen(false); setSelected(null); };

  if (!userId) return null;

  return (
    <>
      <TouchableOpacity
        style={[styles.bellButton, badgeBorderColor && { marginRight: 0 }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={20} color={iconColor || headerColors.primary} />
        {unread > 0 && (
          <View style={[styles.badge, badgeBorderColor && { borderColor: badgeBorderColor }]}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close}>
          {/* A plain View that claims the touch, so taps inside the panel
              don't reach the overlay (which closes it) while the list
              can still scroll on phones. */}
          <View style={styles.panel} onStartShouldSetResponder={() => true}>
            {selected ? (
              <Detail
                n={selected}
                booking={booking}
                bookingLoading={bookingLoading}
                styles={styles}
                colors={colors}
                onBack={() => setSelected(null)}
                onClose={close}
                onViewBooking={() => { const id = selected.reservationId; close(); onViewBooking && onViewBooking(id); }}
              />
            ) : (
              <>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelTitle}>Notifications</Text>
                  {unread > 0 && (
                    <TouchableOpacity onPress={markAll} accessibilityRole="button">
                      <Text style={styles.markAll}>Mark all as read</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={close} style={styles.iconBtn} accessibilityLabel="Close notifications">
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                {loading && items.length === 0 ? (
                  <View style={styles.empty}><ActivityIndicator color={colors.primary} /></View>
                ) : items.length === 0 ? (
                  <View style={styles.empty}>
                    <Ionicons name="notifications-off-outline" size={26} color={colors.textMuted} />
                    <Text style={styles.emptyText}>No notifications yet. Booking reminders and updates will show up here.</Text>
                  </View>
                ) : (
                  <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: spacing.sm }}>
                    {items.map((n) => (
                      <Row key={n.id} n={n} styles={styles} colors={colors} onPress={() => openItem(n)} />
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function Row({ n, styles, colors, onPress }) {
  const meta = notificationMeta(n.type);
  const preview = (n.message || '').split('\n').filter(Boolean).slice(-1)[0] || '';
  return (
    <TouchableOpacity style={[styles.row, !n.read && styles.rowUnread]} onPress={onPress} accessibilityRole="button">
      <View style={[styles.rowIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, !n.read && styles.rowTitleUnread]} numberOfLines={1}>{n.title}</Text>
          {!n.read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.rowPreview} numberOfLines={2}>{preview}</Text>
        <View style={styles.rowMeta}>
          {meta.kind !== 'info' && (
            <View style={[styles.chip, { backgroundColor: meta.bg }]}>
              <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          )}
          <Text style={styles.rowTime}>{timeAgo(n.createdAt)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function Detail({ n, booking, bookingLoading, styles, colors, onBack, onClose, onViewBooking }) {
  const meta = notificationMeta(n.type);
  const deadlinePassed = n.deadlineAt && new Date(n.deadlineAt).getTime() <= Date.now();
  return (
    <>
      <View style={styles.panelHeader}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} accessibilityLabel="Back to notifications">
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.panelTitle, { flex: 1 }]} numberOfLines={1}>Notification</Text>
        <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityLabel="Close notifications">
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }}>
        <View style={[styles.detailBanner, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailTitle, { color: meta.color }]}>{n.title}</Text>
            {!!n.deadlineAt && (
              <Text style={[styles.detailDeadline, { color: meta.color }]}>
                {meta.kind === 'pending'
                  ? 'Waiting for the front desk to confirm'
                  : meta.kind === 'checkin'
                  ? (deadlinePassed ? 'You can check in any time' : `Check-in from ${formatDateTime(n.deadlineAt)}`)
                  : `${deadlinePassed ? 'Deadline was ' : 'Deadline: '}${formatDateTime(n.deadlineAt)}`}
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.detailMessage}>{n.message}</Text>
        <Text style={styles.detailTime}>Received {formatDateTime(n.createdAt)}</Text>

        {!!n.reservationId && (
          <View style={styles.bookingCard}>
            <Text style={styles.bookingLabel}>Related booking</Text>
            {bookingLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
            ) : booking ? (
              <>
                <View style={styles.bookingRow}>
                  <Text style={styles.bookingRef}>{booking.reference}</Text>
                  <Text style={styles.bookingStatus}>{statusLabel(booking.status)}</Text>
                </View>
                <Text style={styles.bookingLine}>
                  {booking.rooms.length ? `Room ${booking.rooms.join(', ')}` : booking.roomType || 'Room'}
                  {booking.roomType && booking.rooms.length ? ` · ${booking.roomType}` : ''}
                </Text>
                <Text style={styles.bookingLine}>
                  {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}
                  {booking.nights ? ` · ${booking.nights} night${booking.nights === 1 ? '' : 's'}` : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.bookingLine}>This booking is no longer available.</Text>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={onViewBooking} accessibilityRole="button">
              <Ionicons name="calendar-outline" size={15} color={colors.onPrimary} />
              <Text style={styles.primaryBtnText}>View in My Reservations</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </>
  );
}

function statusLabel(status) {
  switch (status) {
    case 'pending': return 'Pending confirmation';
    case 'upcoming': return 'Confirmed';
    case 'checked-in': return 'Checked in';
    case 'checked-out': return 'Checked out';
    case 'cancelled': return 'Cancelled';
    case 'declined': return 'Declined';
    case 'no-show': return 'No show';
    default: return status || '—';
  }
}

function formatDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function timeAgo(v) {
  if (!v) return '';
  const mins = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(v);
}

function getStyles(colors, spacing, radius, fonts, isWide) {
  return StyleSheet.create({
    bellButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs,
    },
    badge: {
      position: 'absolute',
      top: 3,
      right: 2,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      backgroundColor: '#B3261E',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: headerColors.background,
    },
    badgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#FFFFFF' },

    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: isWide ? 'flex-end' : 'stretch',
      justifyContent: isWide ? 'flex-start' : 'flex-end',
      paddingTop: isWide ? 72 : 0,
      paddingRight: isWide ? spacing.lg : 0,
    },
    panel: {
      backgroundColor: colors.card,
      width: isWide ? 400 : '100%',
      maxHeight: isWide ? '80%' : '85%',
      borderRadius: radius.lg,
      borderBottomLeftRadius: isWide ? radius.lg : 0,
      borderBottomRightRadius: isWide ? radius.lg : 0,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingBottom: isWide ? spacing.md : spacing.xl,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 8,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: spacing.sm,
    },
    panelTitle: { flex: 1, fontSize: 17, fontFamily: fonts.headingBold, color: colors.text },
    markAll: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },
    iconBtn: { padding: 4 },
    list: { flexGrow: 0 },
    errorText: { fontSize: 12, fontFamily: fonts.body, color: colors.danger, marginBottom: spacing.sm },
    empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
    emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', maxWidth: 280 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radius.md,
      marginBottom: 6,
    },
    rowUnread: { backgroundColor: colors.cardAlt },
    rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowTitle: { flex: 1, fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.text },
    rowTitleUnread: { fontFamily: fonts.bodySemiBold },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B3261E' },
    rowPreview: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 17, marginTop: 2 },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
    chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    chipText: { fontSize: 10, fontFamily: fonts.bodySemiBold },
    rowTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

    detailBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    },
    detailTitle: { fontSize: 15, fontFamily: fonts.bodySemiBold },
    detailDeadline: { fontSize: 12, fontFamily: fonts.bodyMedium, marginTop: 2 },
    detailMessage: { fontSize: 14, fontFamily: fonts.body, color: colors.text, lineHeight: 21 },
    detailTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.sm },
    bookingCard: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardAlt,
      gap: 4,
    },
    bookingLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    bookingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    bookingRef: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text },
    bookingStatus: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
    bookingLine: { fontSize: 13, fontFamily: fonts.body, color: colors.text },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
    },
    primaryBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
  });
}
