import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { useRoomNames } from '../../utils/roomNames';

/**
 * InquiriesScreen — "Guest Management → Inquiries". Every message sent
 * through the public Contact Us form (contact_messages table).
 *
 * Layout:
 *  - Summary tiles: Open, Needs attention (open for STALE_DAYS+ days),
 *    Resolved. Tapping one filters the list.
 *  - Open inquiries first (oldest waiting at the top, so the longest-
 *    waiting guest gets answered first), then a separate "Resolved"
 *    section at the bottom (most recent first).
 *  - Each card shows the ROOM the guest booked (from their reservations),
 *    so Front Desk knows where to go, plus Mark resolved. Tapping the card
 *    expands the full message.
 *
 * "Open" is the stored status 'new'; it only changes when staff press
 * Mark resolved (or Reopen). RLS: staff need the contact_messages update
 * policy for that button to work — the failure is shown if it's missing.
 */

const STALE_DAYS = 3;
const STATUS_META = {
  open:     { label: 'Open',            bg: '#FFF4D6', text: '#8A6A00', icon: 'mail-unread-outline' },
  stale:    { label: 'Needs attention', bg: '#FCE1E1', text: '#B3261E', icon: 'alert-circle-outline' },
  resolved: { label: 'Resolved',        bg: '#DFF5E1', text: '#1E7B34', icon: 'checkmark-circle-outline' },
};

function daysSince(value) {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch {
    return '—';
  }
}

function formatRelative(value) {
  if (!value) return '';
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? 's' : ''} ago`;
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function showMessage(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

const metaFor = (m) => (m.status === 'resolved'
  ? STATUS_META.resolved
  : daysSince(m.createdAt) >= STALE_DAYS ? STATUS_META.stale : STATUS_META.open);

const DAY = 86400000;
const dayStart = (v) => { const d = new Date(v); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const shortDay = (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Which booking an inquiry is about, judged by WHEN it was sent:
 *  1. the stay the guest was in at that moment,
 *  2. else their next booking starting within 60 days after it,
 *  3. else a stay that ended within the 7 days before it.
 * Otherwise none (an old message isn't pinned to a newer, unrelated stay).
 */
function pickStay(reservations, sentAt) {
  if (!reservations || reservations.length === 0) return null;
  const sent = new Date(sentAt).getTime();
  const sentDay = dayStart(sentAt);
  const start = (r) => new Date(r.checked_in_at || r.check_in).getTime();
  const end = (r) => {
    if (r.status === 'checked-in') return Number.POSITIVE_INFINITY;
    return new Date(r.checked_out_at || r.check_out).getTime();
  };
  const during = reservations.find((r) => ['checked-in', 'checked-out'].includes(r.status)
    && start(r) <= sent && sent <= end(r) + DAY);
  if (during) return during;
  const next = reservations
    .filter((r) => dayStart(r.check_in) >= sentDay && dayStart(r.check_in) - sentDay <= 60 * DAY)
    .sort((x, y) => new Date(x.check_in) - new Date(y.check_in))[0];
  if (next) return next;
  return reservations
    .filter((r) => r.status === 'checked-out' && end(r) <= sent && sent - end(r) <= 7 * DAY)
    .sort((x, y) => end(y) - end(x))[0] || null;
}

function stayLabel(r) {
  if (!r) return '';
  const range = `${shortDay(r.check_in)} – ${shortDay(r.check_out)}`;
  switch (r.status) {
    case 'checked-in': return `Checked in · ${range}`;
    case 'checked-out': return `Stayed ${range}`;
    case 'upcoming': return `Booked ${range}`;
    case 'pending': return `Pending · ${range}`;
    default: return range;
  }
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'open',     label: 'Open' },
  { key: 'stale',    label: 'Needs attention' },
  { key: 'resolved', label: 'Resolved' },
];

export default function InquiriesScreen() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showAllResolved, setShowAllResolved] = useState(false);
  // user_id → that guest's reservations (to show which room they booked).
  const [staysByUser, setStaysByUser] = useState({});
  const roomNamesOf = useRoomNames();

  const messageToCamel = (row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status === 'resolved' ? 'resolved' : 'new',
    createdAt: row.created_at,
    userId: row.user_id || null,
  });

  useEffect(() => {
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('contact_messages')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load contact messages:', error);
        setLoading(false);
        return;
      }
      const list = (data || []).map(messageToCamel);
      setMessages(list);
      setLoading(false);

      // The guests' bookings, for the room name on each card.
      const userIds = [...new Set(list.map((m) => m.userId).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: res, error: resErr } = await supabase
          .from('reservations')
          .select('id, user_id, status, selected_rooms, room_type, check_in, check_out, checked_in_at, checked_out_at')
          .in('user_id', userIds)
          .in('status', ['pending', 'upcoming', 'checked-in', 'checked-out']);
        if (resErr) {
          console.warn('Could not load guest bookings for inquiries:', resErr.message);
        } else {
          const byUser = {};
          (res || []).forEach((r) => { (byUser[r.user_id] = byUser[r.user_id] || []).push(r); });
          setStaysByUser(byUser);
        }
      }
    };
    loadMessages();

    const channel = supabase
      .channel('inquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, loadMessages)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Room name + stay for each inquiry (null when the guest has no booking).
  const roomInfoFor = (m) => {
    const stay = pickStay(staysByUser[m.userId], m.createdAt);
    if (!stay) return null;
    const numbers = (Array.isArray(stay.selected_rooms) ? stay.selected_rooms : [])
      .map((x) => x?.roomNumber || x?.number || x?.room)
      .filter(Boolean);
    const names = numbers.length ? roomNamesOf(numbers).filter((n) => n !== 'Room') : [];
    const room = names.length ? names.join(', ') : (stay.room_type || 'Room');
    return { room, detail: stayLabel(stay), inHouse: stay.status === 'checked-in' };
  };

  const counts = useMemo(() => {
    const open = messages.filter((m) => m.status !== 'resolved');
    return {
      all: messages.length,
      open: open.length,
      stale: open.filter((m) => daysSince(m.createdAt) >= STALE_DAYS).length,
      resolved: messages.length - open.length,
    };
  }, [messages]);

  const searched = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((m) =>
      [m.name, m.email, m.phone, m.subject, m.message, roomInfoFor(m)?.room].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [messages, searchText, staysByUser, roomNamesOf]);

  // Open: oldest first (longest waiting on top). Resolved: newest first, at the bottom.
  const openList = useMemo(() => searched
    .filter((m) => m.status !== 'resolved')
    .filter((m) => filter !== 'stale' || daysSince(m.createdAt) >= STALE_DAYS)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [searched, filter]);
  const resolvedList = useMemo(() => searched
    .filter((m) => m.status === 'resolved')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [searched]);

  const showOpen = filter !== 'resolved';
  const showResolved = filter === 'all' || filter === 'resolved';
  const RESOLVED_PREVIEW = 5;
  const resolvedShown = showAllResolved || filter === 'resolved' ? resolvedList : resolvedList.slice(0, RESOLVED_PREVIEW);

  const toggleStatus = async (item) => {
    const nextStatus = item.status === 'resolved' ? 'new' : 'resolved';
    setUpdatingId(item.id);
    try {
      const { data, error } = await supabase
        .from('contact_messages')
        .update({ status: nextStatus })
        .eq('id', item.id)
        .select();
      if (error) {
        const isPermission = error.code === '42501' || /row-level security|permission denied/i.test(error.message || '');
        throw new Error(isPermission
          ? "Your account doesn't have permission to update inquiries yet. Ask your developer to add the contact_messages staff update policy."
          : (error.message || 'Please try again.'));
      }
      if (!data || data.length === 0) {
        throw new Error("The change didn't save. The contact_messages staff update policy is probably missing in Supabase.");
      }
      // Show it right away; realtime keeps everything else in sync.
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, status: nextStatus } : m)));
      if (nextStatus === 'resolved' && expandedId === item.id) setExpandedId(null);
    } catch (err) {
      console.error('Failed to update inquiry status:', err);
      showMessage('Could not update status', err.message || 'Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };


  const renderCard = (item) => (
    <InquiryCard
      key={item.id}
      item={item}
      meta={metaFor(item)}
      expanded={expandedId === item.id}
      isUpdating={updatingId === item.id}
      onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
      onToggleStatus={() => toggleStatus(item)}
      roomInfo={roomInfoFor(item)}
    />
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Inquiries</Text>
          <Text style={styles.subtitle}>Messages from the Contact Us page</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary tiles (tap to filter) */}
        <View style={styles.tiles}>
          <SummaryTile icon="mail-unread-outline" label="Open" value={counts.open} color="#8A6A00" bg="#FFF4D6"
            active={filter === 'open'} onPress={() => setFilter(filter === 'open' ? 'all' : 'open')} />
          <SummaryTile icon="alert-circle-outline" label="Needs attention" value={counts.stale} color="#B3261E" bg="#FCE1E1"
            note={`Open ${STALE_DAYS}+ days`} active={filter === 'stale'} onPress={() => setFilter(filter === 'stale' ? 'all' : 'stale')} />
          <SummaryTile icon="checkmark-done-outline" label="Resolved" value={counts.resolved} color="#1E7B34" bg="#DFF5E1"
            active={filter === 'resolved'} onPress={() => setFilter(filter === 'resolved' ? 'all' : 'resolved')} />
        </View>

        {/* Search + filter chips */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by name, room, email, subject or message"
            placeholderTextColor={colors.disabled}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.chips}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity key={f.key} style={[styles.chip, active && styles.chipActive]} onPress={() => setFilter(f.key)} activeOpacity={0.8}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{counts[f.key]}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : messages.length === 0 ? (
          <EmptyState icon="chatbubbles-outline" text="No inquiries yet. Messages from the Contact Us page will appear here." />
        ) : (
          <>
            {showOpen && (
              <>
                <SectionHeader title={filter === 'stale' ? 'Needs attention' : 'Open'} count={openList.length} color="#C99400"
                  hint="Oldest first" />
                {openList.length === 0 ? (
                  <EmptyState icon="checkmark-done-circle-outline" text={searchText ? 'No open inquiries match your search.' : 'All caught up — no open inquiries.'} small />
                ) : openList.map(renderCard)}
              </>
            )}

            {showResolved && (
              <>
                <SectionHeader title="Resolved" count={resolvedList.length} color="#1E7B34" hint="Newest first" />
                {resolvedList.length === 0 ? (
                  <EmptyState icon="file-tray-outline" text={searchText ? 'No resolved inquiries match your search.' : 'No resolved inquiries yet.'} small />
                ) : (
                  <>
                    {resolvedShown.map(renderCard)}
                    {filter !== 'resolved' && resolvedList.length > RESOLVED_PREVIEW && (
                      <TouchableOpacity style={styles.showMore} onPress={() => setShowAllResolved((v) => !v)} activeOpacity={0.8}>
                        <Text style={styles.showMoreText}>
                          {showAllResolved ? 'Show less' : `Show all resolved (${resolvedList.length})`}
                        </Text>
                        <Ionicons name={showAllResolved ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryTile({ icon, label, value, color, bg, note, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.tile, active && { borderColor: color }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.tileIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.tileValue, { color }]}>{value}</Text>
        <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
        {!!note && <Text style={styles.tileNote} numberOfLines={1}>{note}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({ title, count, color, hint }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionDot, { backgroundColor: color }]} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCount}><Text style={styles.sectionCountText}>{count}</Text></View>
      {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
    </View>
  );
}

function EmptyState({ icon, text, small }) {
  return (
    <View style={[styles.empty, small && styles.emptySmall]}>
      <Ionicons name={icon} size={small ? 20 : 28} color={colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function InquiryCard({ item, meta, expanded, isUpdating, onToggleExpand, onToggleStatus, roomInfo }) {
  const [hovered, setHovered] = useState(false);
  const resolved = item.status === 'resolved';
  const stop = (fn) => (e) => { e?.stopPropagation?.(); fn(); };

  return (
    <Pressable
      onPress={onToggleExpand}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.card, { borderLeftColor: meta.text }, resolved && styles.cardResolved, hovered && styles.cardHovered]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.avatarCircle, resolved && { opacity: 0.7 }]}>
          <Text style={styles.avatarText}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.subject, resolved && styles.subjectResolved]} numberOfLines={1}>{item.subject || '(No subject)'}</Text>
          <Text style={styles.fromLine} numberOfLines={1}>{item.name || 'Guest'}{item.email ? ` · ${item.email}` : ''}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={12} color={meta.text} />
          <Text style={[styles.statusBadgeText, { color: meta.text }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Which room the guest booked */}
      <View style={styles.roomRow}>
        {roomInfo ? (
          <>
            <View style={[styles.roomChip, roomInfo.inHouse && styles.roomChipInHouse]}>
              <Ionicons name="bed-outline" size={13} color={roomInfo.inHouse ? colors.white : colors.text} />
              <Text style={[styles.roomChipText, roomInfo.inHouse && { color: colors.white }]}>{roomInfo.room}</Text>
            </View>
            <Text style={styles.roomDetail} numberOfLines={1}>{roomInfo.detail}</Text>
          </>
        ) : (
          <Text style={styles.roomNone}>No booking on file</Text>
        )}
      </View>

      <Text style={[styles.messageText, resolved && styles.messageTextResolved]} numberOfLines={expanded ? undefined : 2}>
        {item.message || '—'}
      </Text>

      {expanded && !!item.phone && (
        <View style={styles.contactRow}>
          <Ionicons name="call-outline" size={12} color={colors.textMuted} />
          <Text style={styles.contactText}>{item.phone}</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.dateRow}>
          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
          <Text style={styles.dateText}>{formatDateTime(item.createdAt)}</Text>
          <Text style={styles.dateDot}>·</Text>
          <Text style={[styles.dateRelative, !resolved && daysSince(item.createdAt) >= STALE_DAYS && { color: '#B3261E' }]}>
            {formatRelative(item.createdAt)}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.statusBtn, resolved ? styles.reopenBtn : styles.resolveBtn]}
            onPress={stop(onToggleStatus)}
            disabled={isUpdating}
            activeOpacity={0.85}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color={resolved ? colors.text : colors.white} />
            ) : (
              <>
                <Ionicons name={resolved ? 'refresh-outline' : 'checkmark-circle-outline'} size={14} color={resolved ? colors.text : colors.white} />
                <Text style={[styles.statusBtnText, resolved && { color: colors.text }]}>{resolved ? 'Reopen' : 'Mark resolved'}</Text>
              </>
            )}
          </TouchableOpacity>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  content: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  tile: {
    flexGrow: 1, flexBasis: 200,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
  },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 22, fontFamily: fonts.headingExtraBold, lineHeight: 26 },
  tileLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  tileNote: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, height: 42,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingLeft: 12, paddingRight: 6,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  chipTextActive: { color: colors.white },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  chipCountText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  chipCountTextActive: { color: colors.white },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text },
  sectionCount: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  sectionCountText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  sectionHint: { marginLeft: 'auto', fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  centerWrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: {
    alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  emptySmall: { paddingVertical: spacing.lg },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4,
    padding: spacing.md, marginBottom: spacing.md,
    shadowColor: '#332B22', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardResolved: { backgroundColor: '#FBFBFC' },
  cardHovered: { borderColor: colors.textMuted },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  avatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontFamily: fonts.headingExtraBold, color: colors.text },

  subject: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text },
  subjectResolved: { color: colors.textMuted },
  fromLine: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  roomChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  roomChipInHouse: { backgroundColor: colors.primary, borderColor: colors.primary },
  roomChipText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  roomDetail: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  roomNone: { fontSize: 12, fontFamily: fonts.body, fontStyle: 'italic', color: colors.textMuted },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold },

  messageText: { fontSize: 13, fontFamily: fonts.body, color: colors.text, marginTop: spacing.sm, lineHeight: 19 },
  messageTextResolved: { color: colors.textMuted },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  contactText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  cardFooter: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  dateDot: { fontSize: 11, fontFamily: fonts.body, color: colors.disabled },
  dateRelative: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  ghostBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, minWidth: 92, justifyContent: 'center' },
  resolveBtn: { backgroundColor: '#1E7B34' },
  reopenBtn: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  statusBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  showMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: spacing.sm },
  showMoreText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },
});
