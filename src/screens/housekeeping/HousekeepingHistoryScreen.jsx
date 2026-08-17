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

/**
 * HousekeepingHistoryScreen — completed tasks only, with a date filter.
 * Split out of HousekeepingMyTasksScreen.jsx (which now only shows
 * active work — Assigned/In Progress) into its own sidebar entry, so
 * "what's still open" and "what did I already finish" are two separate
 * places instead of one long scrolling screen with everything on it.
 *
 * Read-only — no Start/Complete actions here, since everything shown is
 * already done. Completion notes (see HousekeepingMyTasksScreen.jsx's
 * Mark Complete modal) are shown on each card.
 */
export default function HousekeepingHistoryScreen({ staffUid }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState('all');

  const taskToCamel = (row) => ({
    id: row.id,
    roomNumber: row.room_number,
    notes: row.notes,
    completedAt: row.completed_at,
    completionNote: row.completion_note,
  });

  useEffect(() => {
    if (!staffUid) return;

    const loadTasks = async () => {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('*')
        .eq('assigned_to', staffUid)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });
      if (error) {
        console.error('Failed to load housekeeping history:', error);
        setLoading(false);
        return;
      }
      setTasks((data || []).map(taskToCamel));
      setLoading(false);
    };
    loadTasks();

    const channel = supabase
      .channel(`housekeeping-history-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `assigned_to=eq.${staffUid}` },
        loadTasks
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

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
    const completedAt = new Date(isoString).getTime();
    const now = Date.now();
    if (historyFilter === 'today') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      return completedAt >= startOfToday.getTime();
    }
    if (historyFilter === 'week') return now - completedAt <= 7 * 24 * 60 * 60 * 1000;
    if (historyFilter === 'month') return now - completedAt <= 30 * 24 * 60 * 60 * 1000;
    return true;
  };

  const filteredTasks = useMemo(
    () => tasks.filter((t) => withinHistoryFilter(t.completedAt)),
    [tasks, historyFilter]
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
      <Text style={styles.subtitle}>Rooms you've already completed.</Text>

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

      {filteredTasks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done-outline" size={22} color={colors.disabled} />
          <Text style={styles.emptyText}>Nothing here.</Text>
        </View>
      ) : (
        filteredTasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskCardTop}>
              <View style={styles.roomBadge}>
                <Ionicons name="key-outline" size={12} color={colors.white} />
                <Text style={styles.roomBadgeText}>Room {task.roomNumber}</Text>
              </View>
              <View style={styles.completedRow}>
                <Ionicons name="checkmark-circle" size={14} color="#1E7B34" />
                <Text style={styles.completedText}>Done</Text>
              </View>
            </View>

            <Text style={styles.taskTimestamp}>Completed {elapsedLabel(task.completedAt)}</Text>

            {!!task.completionNote && (
              <View style={styles.completionNoteWrap}>
                <Ionicons name="chatbox-ellipses-outline" size={12} color={colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={styles.completionNoteText}>{task.completionNote}</Text>
              </View>
            )}
          </View>
        ))
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

  taskCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  taskCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  roomBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 3, paddingHorizontal: spacing.sm,
  },
  roomBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  completedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  taskTimestamp: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  completionNoteWrap: {
    flexDirection: 'row', gap: 5,
    backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.sm,
  },
  completionNoteText: { flex: 1, fontSize: 11, fontFamily: fonts.body, fontStyle: 'italic', color: colors.text, lineHeight: 15 },
});