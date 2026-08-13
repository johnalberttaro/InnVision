import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { subscribeToRooms, updateRoomStatus, statusMeta, ROOM_STATUS } from '../../utils/Roomsservice';

/**
 * HousekeepingMyTasksScreen — the one real screen in the new Housekeeping
 * staff portal. Shows only tasks assigned to the logged-in housekeeping
 * staff member (`assigned_to = staffUid`), grouped Assigned / In Progress
 * / Completed, with the same Start Cleaning / Mark Complete actions
 * HousekeepingSchedule.jsx (the Front Desk/Admin management view) already
 * has — same status transitions, same room-status sync side effect
 * (updateRoomStatus), just scoped to "my work" instead of the whole
 * hotel's board, and without the Assign Task capability (creating/
 * assigning tasks stays a Front Desk/Admin job).
 *
 * Deliberately a single flat list per status (not the Admin board's
 * responsive grid+pagination) — a housekeeping staffer's own task count
 * at any moment is inherently small (their current shift's rooms), so
 * the extra complexity that board needed for hotel-wide volume isn't
 * needed here.
 */
export default function HousekeepingMyTasksScreen({ staffUid, staffName }) {
  const [tasks, setTasks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  // "History" date filter — applies to the Completed section only.
  const [historyFilter, setHistoryFilter] = useState('all'); // 'today' | 'week' | 'month' | 'all'
  // Completion-note modal — opened by "Mark Complete" instead of
  // completing immediately, so staff can optionally leave a note for
  // Front Desk/Admin (e.g. "AC still making noise").
  const [completingTask, setCompletingTask] = useState(null);
  const [completionNoteText, setCompletionNoteText] = useState('');

  const taskToCamel = (row) => ({
    id: row.id,
    roomNumber: row.room_number,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    assignedAt: row.assigned_at,
    startedAt: row.started_at,
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
        .order('assigned_at', { ascending: false });
      if (error) {
        console.error('Failed to load my housekeeping tasks:', error);
        setLoading(false);
        return;
      }
      setTasks((data || []).map(taskToCamel));
      setLoading(false);
    };
    loadTasks();

    const channel = supabase
      .channel(`my-housekeeping-tasks-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `assigned_to=eq.${staffUid}` },
        loadTasks
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  useEffect(() => {
    const unsubscribe = subscribeToRooms(setRooms, (err) => console.error('Failed to load rooms:', err));
    return unsubscribe;
  }, []);

  const roomStatusMeta = (roomNumber) => {
    const room = rooms.find((r) => r.roomNumber === roomNumber);
    return room ? statusMeta(room.status) : null;
  };

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

  const startTask = async (task) => {
    setUpdatingId(task.id);
    try {
      const { error } = await supabase
        .from('housekeeping_tasks')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      await updateRoomStatus(task.roomNumber, ROOM_STATUS.IN_PROGRESS).catch((err) =>
        console.error('Room status sync failed (task still updated):', err)
      );
    } catch (err) {
      console.error('Failed to start task:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const completeTask = async (task, note) => {
    setUpdatingId(task.id);
    try {
      const { error } = await supabase
        .from('housekeeping_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completion_note: note?.trim() || null,
        })
        .eq('id', task.id);
      if (error) throw error;
      await updateRoomStatus(task.roomNumber, ROOM_STATUS.VACANT).catch((err) =>
        console.error('Room status sync failed (task still updated):', err)
      );
    } catch (err) {
      console.error('Failed to complete task:', err);
    } finally {
      setUpdatingId(null);
      setCompletingTask(null);
      setCompletionNoteText('');
    }
  };

  const HISTORY_FILTERS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All' },
  ];

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

  const columns = useMemo(() => ({
    assigned: tasks.filter((t) => t.status === 'assigned'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    completed: tasks.filter((t) => t.status === 'completed' && withinHistoryFilter(t.completedAt)),
  }), [tasks, historyFilter]);

  const TaskCard = ({ task }) => {
    const isUpdating = updatingId === task.id;
    const meta = roomStatusMeta(task.roomNumber);
    const isUrgent = task.priority === 'urgent' && task.status !== 'completed';

    return (
      <View style={[styles.taskCard, isUrgent && styles.taskCardUrgent]}>
        <View style={styles.taskCardTop}>
          <View style={styles.roomBadge}>
            <Ionicons name="key-outline" size={12} color={colors.white} />
            <Text style={styles.roomBadgeText}>Room {task.roomNumber}</Text>
          </View>
          {isUrgent && (
            <View style={styles.urgentBadge}>
              <Ionicons name="alert-circle" size={11} color="#B3261E" />
              <Text style={styles.urgentBadgeText}>Urgent</Text>
            </View>
          )}
        </View>

        {meta && (
          <View style={[styles.roomStatusPill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.roomStatusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        )}

        {!!task.notes && <Text style={styles.taskNotes} numberOfLines={3}>{task.notes}</Text>}

        <Text style={styles.taskTimestamp}>
          {task.status === 'completed'
            ? `Completed ${elapsedLabel(task.completedAt)}`
            : task.status === 'in_progress'
              ? `Started ${elapsedLabel(task.startedAt)}`
              : `Assigned ${elapsedLabel(task.assignedAt)}`}
        </Text>

        {isUpdating ? (
          <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: spacing.sm }} />
        ) : task.status === 'assigned' ? (
          <TouchableOpacity style={styles.taskActionBtn} onPress={() => startTask(task)} activeOpacity={0.85}>
            <Ionicons name="play-outline" size={14} color={colors.white} />
            <Text style={styles.taskActionBtnText}>Start Cleaning</Text>
          </TouchableOpacity>
        ) : task.status === 'in_progress' ? (
          <TouchableOpacity
            style={[styles.taskActionBtn, styles.taskActionBtnComplete]}
            onPress={() => setCompletingTask(task)}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-outline" size={14} color={colors.white} />
            <Text style={styles.taskActionBtnText}>Mark Complete</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <View style={styles.completedRow}>
              <Ionicons name="checkmark-circle" size={14} color="#1E7B34" />
              <Text style={styles.completedText}>Done</Text>
            </View>
            {!!task.completionNote && (
              <View style={styles.completionNoteWrap}>
                <Ionicons name="chatbox-ellipses-outline" size={12} color={colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={styles.completionNoteText}>{task.completionNote}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const Section = ({ title, tasksInColumn, accentColor }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionDot, { backgroundColor: accentColor }]} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionCount}>
          <Text style={styles.sectionCountText}>{tasksInColumn.length}</Text>
        </View>
      </View>
      {tasksInColumn.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="checkmark-done-outline" size={20} color={colors.disabled} />
          <Text style={styles.emptyText}>Nothing here</Text>
        </View>
      ) : (
        tasksInColumn.map((task) => <TaskCard key={task.id} task={task} />)
      )}
    </View>
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
      <Text style={styles.title}>My Tasks</Text>
      <Text style={styles.subtitle}>
        {staffName ? `Rooms assigned to you, ${staffName}.` : 'Rooms assigned to you.'}
      </Text>

      <Section title="Assigned" tasksInColumn={columns.assigned} accentColor="#9A7B00" />
      <Section title="In Progress" tasksInColumn={columns.in_progress} accentColor="#B3792A" />

      <View style={styles.historyFilterRow}>
        {HISTORY_FILTERS.map((f) => {
          const active = historyFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.historyFilterChip, active && styles.historyFilterChipActive]}
              onPress={() => setHistoryFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.historyFilterChipText, active && styles.historyFilterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Section title="Completed" tasksInColumn={columns.completed} accentColor="#1E7B34" />

      <Modal visible={!!completingTask} transparent animationType="fade" onRequestClose={() => setCompletingTask(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark Room {completingTask?.roomNumber} Complete</Text>
            <Text style={styles.modalSubtitle}>Add a note for Front Desk/Admin (optional).</Text>
            <TextInput
              style={styles.modalInput}
              value={completionNoteText}
              onChangeText={setCompletionNoteText}
              placeholder="e.g. Replaced towels, AC still making noise"
              placeholderTextColor={colors.disabled}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setCompletingTask(null); setCompletionNoteText(''); }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => completeTask(completingTask, completionNoteText)}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-outline" size={14} color={colors.white} />
                <Text style={styles.modalConfirmBtnText}>Mark Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

  section: { marginBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text, flex: 1 },
  sectionCount: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  sectionCountText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted },

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
  taskCardUrgent: { borderColor: '#B3261E', borderWidth: 1.5 },
  taskCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  roomBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 3, paddingHorizontal: spacing.sm,
  },
  roomBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  urgentBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

  roomStatusPill: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  roomStatusPillText: { fontSize: 10, fontFamily: fonts.bodySemiBold },

  taskNotes: { fontSize: 12, fontFamily: fonts.body, fontStyle: 'italic', color: colors.text, marginBottom: spacing.xs },
  taskTimestamp: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },

  taskActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: spacing.sm,
  },
  taskActionBtnComplete: { backgroundColor: '#1E7B34' },
  taskActionBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  completedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  completionNoteWrap: {
    flexDirection: 'row', gap: 5,
    backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.sm,
  },
  completionNoteText: { flex: 1, fontSize: 11, fontFamily: fonts.body, fontStyle: 'italic', color: colors.text, lineHeight: 15 },

  historyFilterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  historyFilterChip: {
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  historyFilterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  historyFilterChipText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.text },
  historyFilterChipTextActive: { color: colors.onPrimary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  modalTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text },
  modalSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.md, fontSize: 13, fontFamily: fonts.body, color: colors.text,
    minHeight: 80, textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalCancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  modalCancelBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalConfirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm + 2, borderRadius: radius.sm, backgroundColor: '#1E7B34',
  },
  modalConfirmBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});