import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

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
 * user to select here; only the status UPDATE below is new (no policy
 * existed for it, since nothing ever needed to write from the staff
 * side before — added directly on the table below the STATUS_META
 * constant with the SQL needed).
 *
 * Props:
 *  - onBack: () => void  (optional — omit if this screen doesn't need
 *    its own back button in your shell's layout)
 */

const STATUS_META = {
  new:      { label: 'New',      bg: '#FFF4D6', text: '#9A7B00' },
  resolved: { label: 'Resolved', bg: '#DFF5E1', text: '#1E7B34' },
};

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
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

  const toggleStatus = async (item) => {
    const nextStatus = item.status === 'new' ? 'resolved' : 'new';
    setUpdatingId(item.id);
    try {
      const { error } = await supabase
        .from('contact_messages')
        .update({ status: nextStatus })
        .eq('id', item.id);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to update inquiry status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const renderItem = ({ item }) => {
    const meta = STATUS_META[item.status] || STATUS_META.new;
    const expanded = expandedId === item.id;
    const isUpdating = updatingId === item.id;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => setExpandedId(expanded ? null : item.id)}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.subject} numberOfLines={1}>{item.subject || '(No subject)'}</Text>
            <Text style={styles.fromLine} numberOfLines={1}>
              {item.name} · {item.email}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusBadgeText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>

        <Text style={styles.dateText}>{formatDateTime(item.createdAt)}</Text>

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

            <TouchableOpacity
              style={[styles.actionBtn, item.status === 'new' ? styles.resolveBtn : styles.reopenBtn]}
              onPress={() => toggleStatus(item)}
              disabled={isUpdating}
              activeOpacity={0.85}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.actionBtnText}>
                  {item.status === 'new' ? 'Mark Resolved' : 'Reopen'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inquiries</Text>
          <Text style={styles.subtitle}>
            {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
            {newCount > 0 ? ` · ${newCount} new` : ''}
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
  separator: { height: spacing.sm },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  subject: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text },
  fromLine: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  statusBadge: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, letterSpacing: 0.3 },

  dateText: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.sm },
  messagePreview: { fontSize: 13, fontFamily: fonts.body, color: colors.text, marginTop: spacing.xs, lineHeight: 18 },

  expandedBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  actionBtn: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, minWidth: 110, alignItems: 'center' },
  resolveBtn: { backgroundColor: '#1E7B34' },
  reopenBtn: { backgroundColor: colors.textMuted },
  actionBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },
});