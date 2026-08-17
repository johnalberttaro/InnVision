import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

const HISTORY_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All' },
];

const CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing',   icon: 'water-outline' },
  { key: 'electrical', label: 'Electrical', icon: 'flash-outline' },
  { key: 'hvac',        label: 'HVAC',       icon: 'thermometer-outline' },
  { key: 'furniture',  label: 'Furniture',  icon: 'bed-outline' },
  { key: 'other',      label: 'Other',      icon: 'build-outline' },
];

/**
 * MaintenanceHistoryScreen — resolved requests only, with a date filter.
 * Split out of MaintenanceMyTasksScreen.jsx (which now only shows active
 * work — In Progress) into its own sidebar entry. Same relationship as
 * HousekeepingHistoryScreen.jsx has to HousekeepingMyTasksScreen.jsx.
 *
 * Read-only — no actions here, since everything shown is already
 * resolved. Resolution notes (see MaintenanceMyTasksScreen.jsx's Mark
 * Resolved modal) are shown on each card.
 */
export default function MaintenanceHistoryScreen({ staffUid }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState('all');

  const requestToCamel = (row) => ({
    id: row.id,
    roomNumber: row.room_number,
    category: row.category,
    description: row.description,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
  });

  useEffect(() => {
    if (!staffUid) return;

    const loadRequests = async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('assigned_to', staffUid)
        .eq('status', 'resolved')
        .order('resolved_at', { ascending: false });
      if (error) {
        console.error('Failed to load maintenance history:', error);
        setLoading(false);
        return;
      }
      setRequests((data || []).map(requestToCamel));
      setLoading(false);
    };
    loadRequests();

    const channel = supabase
      .channel(`maintenance-history-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_requests', filter: `assigned_to=eq.${staffUid}` },
        loadRequests
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  const categoryMeta = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

  const elapsedLabel = (isoString) => {
    if (!isoString) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.round(days / 7)}w ago`;
  };

  const withinHistoryFilter = (isoString) => {
    if (historyFilter === 'all') return true;
    if (!isoString) return false;
    const resolvedAt = new Date(isoString).getTime();
    const now = Date.now();
    if (historyFilter === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return resolvedAt >= startOfToday.getTime();
    }
    if (historyFilter === 'week') return now - resolvedAt <= 7 * 24 * 60 * 60 * 1000;
    if (historyFilter === 'month') return now - resolvedAt <= 30 * 24 * 60 * 60 * 1000;
    return true;
  };

  const filteredRequests = useMemo(
    () => requests.filter((r) => withinHistoryFilter(r.resolvedAt)),
    [requests, historyFilter]
  );

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>History</Text>
      <Text style={styles.subtitle}>Requests you've already resolved.</Text>

      <View style={styles.filterRow}>
        {HISTORY_FILTERS.map((f) => {
          const active = historyFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setHistoryFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filteredRequests.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done-outline" size={22} color={colors.disabled} />
          <Text style={styles.emptyText}>Nothing here.</Text>
        </View>
      ) : (
        filteredRequests.map((request) => {
          const cat = categoryMeta(request.category);
          return (
            <View key={request.id} style={styles.reqCard}>
              <View style={styles.reqCardTop}>
                <View style={styles.roomBadge}>
                  <Ionicons name="key-outline" size={12} color={colors.white} />
                  <Text style={styles.roomBadgeText}>Room {request.roomNumber}</Text>
                </View>
                <View style={styles.completedRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#1E7B34" />
                  <Text style={styles.completedText}>Resolved</Text>
                </View>
              </View>

              <View style={styles.categoryRow}>
                <Ionicons name={cat.icon} size={13} color={colors.textMuted} />
                <Text style={styles.categoryText}>{cat.label}</Text>
              </View>

              {!!request.description && <Text style={styles.reqDescription} numberOfLines={3}>{request.description}</Text>}

              <Text style={styles.reqTimestamp}>Resolved {elapsedLabel(request.resolvedAt)}</Text>

              {!!request.resolutionNote && (
                <View style={styles.resolutionNoteWrap}>
                  <Ionicons name="chatbox-ellipses-outline" size={12} color={colors.textMuted} style={{ marginTop: 1 }} />
                  <Text style={styles.resolutionNoteText}>{request.resolutionNote}</Text>
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  filterChip: {
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.text },
  filterChipTextActive: { color: colors.onPrimary },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  reqCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reqCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  roomBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 3, paddingHorizontal: spacing.sm,
  },
  roomBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  completedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.xs },
  categoryText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },

  reqDescription: { fontSize: 12, fontFamily: fonts.body, color: colors.text, marginBottom: spacing.xs },
  reqTimestamp: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  resolutionNoteWrap: {
    flexDirection: 'row', gap: 5,
    backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.sm,
  },
  resolutionNoteText: { flex: 1, fontSize: 11, fontFamily: fonts.body, fontStyle: 'italic', color: colors.text, lineHeight: 15 },
});