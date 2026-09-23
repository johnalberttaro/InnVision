import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

/**
 * InquiriesScreen — "Guest Management → Inquiries". Shows every message
 * submitted through the public Contact Us form (contact_messages table),
 * newest first, with a quick way to mark one resolved once staff have
 * followed up.
 *
 * This is the missing read-side for a table that's existed since the
 * Contact Us migration: ContactUsScreen.jsx has always written here
 * correctly, but nothing ever displayed these back to staff — this
 * screen closes that gap.
 *
 * RLS: contact_messages_staff_read already allows any admin/frontdesk
 * user to select here, but there is currently NO update policy on this
 * table — nothing ever needed to write from the staff side before this
 * screen existed, so toggleStatus() below silently fails until
 * contact_messages_staff_update is added in Supabase (run the SQL from
 * project notes / the delivery message that shipped with this file).
 *
 * Props:
 *  - onBack: () => void  (optional — omit if this screen doesn't need
 *    its own back button in your shell's layout)
 */

// RESOLVED: "New" is a MANUAL status here, not a freshness timer — it's
// set once on insert (ContactUsScreen.jsx writes status: 'new') and only
// ever changes when staff press "Mark Resolved" below (toggleStatus).
// Nothing in this file ever looked at createdAt to decide the badge, so a
// message from seven weeks ago reads "New" for exactly as long as nobody
// has closed it out — same as an "Open" ticket in any inbox/ticketing
// system staying open indefinitely until someone resolves it.
//
// That's the right behavior to KEEP, not remove: silently dropping the
// badge once a message ages past some cutoff would make an actually
// unresolved guest complaint (the "Broken Fauct" inquiry below is 7+
// weeks old and still unactioned) look like nothing needs doing, which is
// worse than a confusing label. What actually changes here:
//  1. Label renamed 'New' → 'Open' — the word "New" is what read as wrong
//     next to an August date; "Open" says what the status actually means
//     (not yet resolved) regardless of age.
//  2. A relative-time string (formatRelative below) now sits next to the
//     date, so staff can see AT A GLANCE how stale an open inquiry is
//     ("7 weeks ago") instead of having to do the date math themselves.
//  3. An inquiry left open past STALE_DAYS gets a stronger red "Needs
//     Attention" badge instead of the calmer amber "Open" one — so an
//     old unresolved message stands out MORE, not less. Still the exact
//     same underlying status: 'new' value; only the display escalates.
const STATUS_META = {
  new:      { label: 'Open',     bg: '#FFF4D6', text: '#9A7B00' },
  resolved: { label: 'Resolved', bg: '#DFF5E1', text: '#1E7B34' },
};
const STALE_META = { label: 'Needs Attention', bg: '#FCE1E1', text: '#B3261E' };
const STALE_DAYS = 3;

function daysSince(value) {
  if (!value) return 0;
  const ms = Date.now() - new Date(value).getTime();
  return Math.floor(ms / 86400000);
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

// NEW: companion to formatDateTime — the absolute date/time already shown
// doesn't by itself tell staff how long ago that was without doing the
// math themselves, which is exactly what made an August message reads as
// "New" feel wrong. This spells it out directly.
function formatRelative(value) {
  if (!value) return '';
  const days = daysSince(value);
  if (days <= 0) return 'today';
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

export default function InquiriesScreen({ onBack }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const messageToCamel = (row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
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
      setMessages((data || []).map(messageToCamel));
      setLoading(false);
    };
    loadMessages();

    const channel = supabase
      .channel('inquiries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, loadMessages)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const filteredMessages = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((m) => {
      const haystack = [m.name, m.email, m.subject, m.message].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [messages, searchText]);

  const newCount = messages.filter((m) => m.status === 'new').length;

  // RESOLVED: the stopPropagation fix (InquiryCard's action button, below)
  // was real but wasn't the whole story. This call was written to assume
  // "no error thrown" means "the row changed" — but Postgres RLS doesn't
  // throw when it blocks an UPDATE with no matching policy, it just
  // matches zero rows and reports success. Since contact_messages only
  // ever had an INSERT policy (guests) and a SELECT policy (staff read —
  // see the file header), staff clicking "Mark Resolved" was hitting
  // exactly that: a silent, 0-row "success" with nothing in the console
  // and nothing visibly different on screen. Adding .select() plus a
  // rows-changed check turns that invisible failure into a real one the
  // user can see and report, instead of a button that looks broken for no
  // reason. The actual fix is a database-side UPDATE policy — see the SQL
  // note delivered alongside this file — this change only makes the
  // failure visible until that policy exists.
  const toggleStatus = async (item) => {
    const nextStatus = item.status === 'new' ? 'resolved' : 'new';
    setUpdatingId(item.id);
    try {
      const { data, error } = await supabase
        .from('contact_messages')
        .update({ status: nextStatus })
        .eq('id', item.id)
        .select();

      if (error) {
        const isPermission =
          error.code === '42501' ||
          /row-level security|permission denied/i.test(error.message || '');
        throw new Error(
          isPermission
            ? "Your account doesn't have permission to update inquiries yet. Ask your developer to add the missing contact_messages_staff_update database policy."
            : (error.message || 'Please try again.')
        );
      }
      if (!data || data.length === 0) {
        throw new Error(
          "The update didn't reach the database — this usually means the " +
          'contact_messages_staff_update policy has not been added in ' +
          'Supabase yet, so the database is silently refusing the change.'
        );
      }
    } catch (err) {
      console.error('Failed to update inquiry status:', err);
      Alert.alert('Could not update status', err.message || 'Please try again.');
    } finally {
      setUpdatingId(null);
    }
  };

  const renderItem = ({ item }) => {
    const isStale = item.status === 'new' && daysSince(item.createdAt) >= STALE_DAYS;
    const meta = isStale ? STALE_META : (STATUS_META[item.status] || STATUS_META.new);
    const expanded = expandedId === item.id;
    const isUpdating = updatingId === item.id;

    return (
      <InquiryCard
        item={item}
        meta={meta}
        expanded={expanded}
        isUpdating={isUpdating}
        onToggleExpand={() => setExpandedId(expanded ? null : item.id)}
        onToggleStatus={() => toggleStatus(item)}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inquiries</Text>
          <Text style={styles.subtitle}>
            {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
            {newCount > 0 ? ` · ${newCount} open` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search by name, email, or subject"
          placeholderTextColor={colors.disabled}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : filteredMessages.length === 0 ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyText}>
            {messages.length === 0 ? 'No inquiries yet.' : 'No inquiries match your search.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

// Pressable (not TouchableOpacity) so hover works on the desktop-web
// portal — same GuestTabButton/ReservationTabButton/FilterChip pattern
// used elsewhere in this app. This card genuinely is clickable (it
// expands/collapses), unlike e.g. GuestRatingsScreen's review cards, so
// hover feedback here is honest, not decorative.
function InquiryCard({ item, meta, expanded, isUpdating, onToggleExpand, onToggleStatus }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onToggleExpand}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.card, { borderLeftColor: meta.text }, hovered && styles.cardHovered]}
    >
      <View style={styles.cardHeader}>
        {/* NEW: initials avatar — same fallback treatment Guest Records
            and Guest Ratings already use, giving every "person card" in
            Guest Management the same visual language. contact_messages
            has no photo, so this is initials-only, no new data needed. */}
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials(item.name)}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.subject} numberOfLines={1}>{item.subject || '(No subject)'}</Text>
          <Text style={styles.fromLine} numberOfLines={1}>
            {item.name} · {item.email}
          </Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusBadgeText, { color: meta.text }]}>{meta.label}</Text>
        </View>

        {/* NEW: chevron signals the row is expandable — previously
            nothing on the card hinted that tapping it did anything. */}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
          style={styles.expandChevron}
        />
      </View>

      {/* NEW: relative time ("7 weeks ago") alongside the absolute date —
          this is what actually answers "how old is this," rather than
          making staff do the date math from the timestamp alone. */}
      <View style={styles.dateRow}>
        <Text style={styles.dateText}>{formatDateTime(item.createdAt)}</Text>
        <Text style={styles.dateDot}>·</Text>
        <Text style={styles.dateRelative}>{formatRelative(item.createdAt)}</Text>
      </View>

      <Text style={styles.messagePreview} numberOfLines={expanded ? undefined : 2}>
        {item.message}
      </Text>

      {expanded && (
        <View style={styles.expandedBlock}>
          {item.phone ? (
            <View style={styles.contactRow}>
              <Ionicons name="call-outline" size={12} color={colors.textMuted} />
              <Text style={styles.contactText}>{item.phone}</Text>
            </View>
          ) : null}

          {/* RESOLVED: "Mark Resolved" wasn't actually broken underneath —
              it's nested inside this whole card's own Pressable (the one
              that expands/collapses on tap), and on web a click here
              bubbles up to that parent after firing here. The status
              update did fire, but the card also immediately collapsed out
              from under it (the parent's onToggleExpand running right
              after), closing the expanded block before there was any
              visible confirmation — indistinguishable from the button
              doing nothing. Guest Records' delete button already solves
              this exact problem the same way: stop the click from
              reaching the card underneath it. */}
          <TouchableOpacity
            style={[styles.actionBtn, item.status === 'new' ? styles.resolveBtn : styles.reopenBtn]}
            onPress={(e) => {
              e.stopPropagation?.();
              onToggleStatus();
            }}
            disabled={isUpdating}
            activeOpacity={0.85}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <View style={styles.actionBtnContent}>
                <Ionicons
                  name={item.status === 'new' ? 'checkmark-circle-outline' : 'refresh-outline'}
                  size={14}
                  color={colors.white}
                />
                <Text style={styles.actionBtnText}>
                  {item.status === 'new' ? 'Mark Resolved' : 'Reopen'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    height: 40,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },

  listContent: { padding: spacing.lg },
  // Bumped sm→md, same reasoning as the Guest Records/Guest Ratings
  // spacing passes — a bit more breathing room between cards.
  separator: { height: spacing.md },

  // Added a left accent stripe (color set inline to the badge's own
  // color — amber Open, green Resolved, red Needs Attention) and a
  // shadow, matching every other card style in Guest Management now
  // (Guest Records, Guest Ratings) instead of the flat bordered box this
  // was before.
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.md,
    shadowColor: '#332B22',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHovered: { borderColor: colors.textMuted },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  // Same initials-avatar treatment Guest Records/Guest Ratings use.
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 13, fontFamily: fonts.headingExtraBold, color: colors.text },

  subject: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text },
  fromLine: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  statusBadge: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },
  expandChevron: { marginLeft: 2 },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  dateText: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  dateDot: { fontSize: 11, fontFamily: fonts.body, color: colors.disabled },
  dateRelative: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted },

  messagePreview: { fontSize: 13, fontFamily: fonts.body, color: colors.text, marginTop: spacing.xs, lineHeight: 18 },

  expandedBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  actionBtn: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, minWidth: 110, alignItems: 'center' },
  resolveBtn: { backgroundColor: '#1E7B34' },
  reopenBtn: { backgroundColor: colors.textMuted },
  actionBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },
});
