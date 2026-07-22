import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import KpiCard from '../../components/dashboard/KpiCard';
import {
  subscribeToRooms,
  updateRoomStatus,
  statusMeta,
  ROOM_STATUS,
  CLEANING_WORKFLOW_STATUSES,
} from '../../utils/Roomsservice';

const MOBILE_BREAKPOINT = 900;

/**
 * HousekeepingScheduleScreen — a real-time task board for room cleaning
 * ASSIGNMENTS, distinct from (and complementary to) RoomCleaningStatusScreen.
 *
 * The distinction matters: RoomCleaningStatusScreen already tracks each
 * ROOM's own state machine (Inspect -> Start Cleaning -> In Progress ->
 * Vacant) via rooms.status — but nothing tracked WHO was assigned to
 * clean which room, or let staff see their own workload. That's what
 * this screen adds: a new housekeeping_tasks table (room + assigned
 * staff + status + priority + timestamps), with a 3-column board
 * (Assigned / In Progress / Completed) so staff and admin can see
 * exactly who's cleaning what, and manage room turnover as a checklist
 * instead of a plain status grid.
 *
 * Starting or completing a task here ALSO advances the underlying
 * room's own status via the same updateRoomStatus() used everywhere
 * else in the app — so a task moving through this board and a room
 * moving through RoomCleaningStatusScreen always stay in sync;
 * whichever screen a staff member happens to be on, the state is the
 * same state.
 *
 * "Assign Task" only offers rooms currently in the cleaning cycle
 * (CLEANING_WORKFLOW_STATUSES) as options — assigning a task for an
 * Occupied or Vacant-and-ready room wouldn't make sense here.
 *
 * ENHANCED: added a KPI row (Active Tasks, Completed Today, Avg.
 * Cleaning Time) using the same KpiCard component as
 * MaintenanceRequest.jsx and the dashboards — this screen previously had
 * no summary metrics at all, unlike its two Housekeeping siblings.
 *
 * Props:
 *  - staffUid, staffName: the signed-in user — used as assigned_by, and
 *    to highlight "My Tasks" if this staff member has assignments.
 */
export default function HousekeepingScheduleScreen({ staffUid, staffName }) {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;

  const [tasks, setTasks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignRoom, setAssignRoom] = useState(null);
  const [assignStaff, setAssignStaff] = useState(null);
  const [assignPriority, setAssignPriority] = useState('normal');
  const [assignNotes, setAssignNotes] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState('');

  const taskToCamel = (row) => ({
    id: row.id,
    roomNumber: row.room_number,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    assignedAt: row.assigned_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });

  // ── Load tasks (realtime) ───────────────────────────────────────────
  useEffect(() => {
    const loadTasks = async () => {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('*')
        .order('assigned_at', { ascending: false });
      if (error) {
        console.error('Failed to load housekeeping tasks:', error);
        setLoading(false);
        return;
      }
      setTasks((data || []).map(taskToCamel));
      setLoading(false);
    };
    loadTasks();

    const channel = supabase
      .channel('housekeeping-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_tasks' }, loadTasks)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── Rooms (for the Assign modal's room picker + task room-status meta) ──
  useEffect(() => {
    const unsubscribe = subscribeToRooms(setRooms, (err) => console.error('Failed to load rooms:', err));
    return unsubscribe;
  }, []);

  // ── Front desk staff (for the Assign modal's staff picker) ──────────
  useEffect(() => {
    const loadStaff = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, display_name')
        .eq('role', 'frontdesk')
        .eq('active', true)
        .order('first_name');
      if (error) {
        console.error('Failed to load staff list:', error);
        return;
      }
      setStaffList(
        (data || []).map((s) => ({
          id: s.id,
          name: s.display_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Staff',
        }))
      );
    };
    loadStaff();
  }, []);

  // Rooms eligible for a NEW assignment: only ones actually in the
  // cleaning cycle right now (mirrors RoomCleaningStatusScreen's own
  // eligibility logic, so this never offers a room that screen wouldn't
  // also treat as needing attention).
  const eligibleRooms = useMemo(
    () => rooms.filter((r) => CLEANING_WORKFLOW_STATUSES.includes(r.status)),
    [rooms]
  );

  const columns = useMemo(() => ({
    assigned: tasks.filter((t) => t.status === 'assigned'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    completed: tasks.filter((t) => t.status === 'completed'),
  }), [tasks]);

  // ── KPIs ───────────────────────────────────────────────────────────────
  const activeCount = columns.assigned.length + columns.in_progress.length;

  const completedTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return tasks.filter((t) => t.status === 'completed' && t.completedAt && new Date(t.completedAt).toDateString() === today).length;
  }, [tasks]);

  const avgCleaningLabel = useMemo(() => {
    const withBothTimes = tasks.filter((t) => t.status === 'completed' && t.startedAt && t.completedAt);
    if (withBothTimes.length === 0) return '—';
    const totalMins = withBothTimes.reduce((sum, t) => {
      const diffMs = new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime();
      return sum + diffMs / 60000;
    }, 0);
    const avgMins = totalMins / withBothTimes.length;
    return avgMins < 60 ? `${Math.round(avgMins)}m` : `${(avgMins / 60).toFixed(1)}h`;
  }, [tasks]);

  const roomStatusMeta = (roomNumber) => {
    const room = rooms.find((r) => r.roomNumber === roomNumber);
    return room ? statusMeta(room.status) : null;
  };

  const elapsedLabel = (isoString) => {
    if (!isoString) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
  };

  // ── Task lifecycle actions ───────────────────────────────────────────
  const startTask = async (task) => {
    setUpdatingId(task.id);
    try {
      const { error } = await supabase
        .from('housekeeping_tasks')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      // Keep the room's own state machine in sync — same transition
      // RoomCleaningStatusScreen's "advance" button would make.
      await updateRoomStatus(task.roomNumber, ROOM_STATUS.IN_PROGRESS).catch((err) =>
        console.error('Room status sync failed (task still updated):', err)
      );
    } catch (err) {
      console.error('Failed to start task:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const completeTask = async (task) => {
    setUpdatingId(task.id);
    try {
      const { error } = await supabase
        .from('housekeeping_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id);
      if (error) throw error;
      await updateRoomStatus(task.roomNumber, ROOM_STATUS.VACANT).catch((err) =>
        console.error('Room status sync failed (task still updated):', err)
      );
    } catch (err) {
      console.error('Failed to complete task:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Assign modal ─────────────────────────────────────────────────────
  const openAssignModal = () => {
    setAssignRoom(null);
    setAssignStaff(null);
    setAssignPriority('normal');
    setAssignNotes('');
    setAssignError('');
    setAssignModalOpen(true);
  };

  const submitAssign = async () => {
    if (!assignRoom) { setAssignError('Please select a room.'); return; }
    if (!assignStaff) { setAssignError('Please select a staff member.'); return; }

    setAssignSaving(true);
    setAssignError('');
    try {
      const { error } = await supabase.from('housekeeping_tasks').insert({
        room_number: assignRoom,
        assigned_to: assignStaff.id,
        assigned_to_name: assignStaff.name,
        assigned_by: staffUid || null,
        priority: assignPriority,
        notes: assignNotes.trim() || null,
      });
      if (error) throw error;
      setAssignModalOpen(false);
    } catch (err) {
      console.error('Failed to create task:', err);
      setAssignError('Could not create this task. Please try again.');
    } finally {
      setAssignSaving(false);
    }
  };

  // ── Task card ─────────────────────────────────────────────────────────
  const TaskCard = ({ task }) => {
    const isUpdating = updatingId === task.id;
    const meta = roomStatusMeta(task.roomNumber);
    const isMine = staffUid && task.assignedTo === staffUid;

    return (
      <View style={[styles.taskCard, task.priority === 'urgent' && styles.taskCardUrgent]}>
        <View style={styles.taskCardTop}>
          <View style={styles.roomBadge}>
            <Ionicons name="key-outline" size={12} color={colors.white} />
            <Text style={styles.roomBadgeText}>Room {task.roomNumber}</Text>
          </View>
          {task.priority === 'urgent' && (
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

        <View style={styles.assigneeRow}>
          <View style={styles.assigneeAvatar}>
            <Text style={styles.assigneeAvatarText}>
              {(task.assignedToName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.assigneeName} numberOfLines={1}>
            {task.assignedToName || 'Unassigned'}{isMine ? ' (You)' : ''}
          </Text>
        </View>

        {!!task.notes && <Text style={styles.taskNotes} numberOfLines={2}>{task.notes}</Text>}

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
            onPress={() => completeTask(task)}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-outline" size={14} color={colors.white} />
            <Text style={styles.taskActionBtnText}>Mark Complete</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.completedRow}>
            <Ionicons name="checkmark-circle" size={14} color="#1E7B34" />
            <Text style={styles.completedText}>Done</Text>
          </View>
        )}
      </View>
    );
  };

  const Column = ({ title, count, tasksInColumn, accentColor }) => (
    <View style={[styles.column, isMobile && styles.columnMobile]}>
      <View style={styles.columnHeader}>
        <View style={[styles.columnDot, { backgroundColor: accentColor }]} />
        <Text style={styles.columnTitle}>{title}</Text>
        <View style={styles.columnCount}>
          <Text style={styles.columnCountText}>{count}</Text>
        </View>
      </View>
      {tasksInColumn.length === 0 ? (
        <Text style={styles.columnEmpty}>No tasks here.</Text>
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
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Housekeeping Schedule</Text>
          <Text style={styles.subtitle}>Room cleaning assignments, updated in real time</Text>
        </View>
        <TouchableOpacity style={styles.assignBtn} onPress={openAssignModal} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.assignBtnText}>Assign Task</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.kpiRow}>
        <KpiCard
          icon="list-outline"
          label="Active Tasks"
          value={String(activeCount)}
          accent={activeCount > 0 ? '#C99400' : '#1E7B34'}
          note={`${columns.assigned.length} assigned, ${columns.in_progress.length} in progress`}
        />
        <KpiCard
          icon="checkmark-done-outline"
          label="Completed Today"
          value={String(completedTodayCount)}
          accent="#1E7B34"
          note="Tasks finished today"
        />
        <KpiCard
          icon="time-outline"
          label="Avg. Cleaning Time"
          value={avgCleaningLabel}
          accent={colors.primary}
          note="Start to completion"
        />
      </View>

      <ScrollView
        horizontal={isMobile}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.boardContent, !isMobile && styles.boardContentWide]}
      >
        <Column title="Assigned" count={columns.assigned.length} tasksInColumn={columns.assigned} accentColor="#9A7B00" />
        <Column title="In Progress" count={columns.in_progress.length} tasksInColumn={columns.in_progress} accentColor="#B3792A" />
        <Column title="Completed" count={columns.completed.length} tasksInColumn={columns.completed} accentColor="#1E7B34" />
      </ScrollView>

      {/* ── Assign Task modal ──────────────────────────────────────── */}
      <Modal visible={assignModalOpen} transparent animationType="fade" onRequestClose={() => setAssignModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign Cleaning Task</Text>

            <Text style={styles.fieldLabel}>Room</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
              {eligibleRooms.length === 0 ? (
                <Text style={styles.noEligibleText}>No rooms currently need cleaning.</Text>
              ) : (
                eligibleRooms.map((r) => (
                  <TouchableOpacity
                    key={r.roomNumber}
                    style={[styles.pickerChip, assignRoom === r.roomNumber && styles.pickerChipActive]}
                    onPress={() => setAssignRoom(r.roomNumber)}
                  >
                    <Text style={[styles.pickerChipText, assignRoom === r.roomNumber && styles.pickerChipTextActive]}>
                      Room {r.roomNumber}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <Text style={styles.fieldLabel}>Assign to</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
              {staffList.length === 0 ? (
                <Text style={styles.noEligibleText}>No active front desk staff found.</Text>
              ) : (
                staffList.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.pickerChip, assignStaff?.id === s.id && styles.pickerChipActive]}
                    onPress={() => setAssignStaff(s)}
                  >
                    <Text style={[styles.pickerChipText, assignStaff?.id === s.id && styles.pickerChipTextActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {['normal', 'urgent'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityChip, assignPriority === p && styles.priorityChipActive]}
                  onPress={() => setAssignPriority(p)}
                >
                  <Text style={[styles.priorityChipText, assignPriority === p && styles.priorityChipTextActive]}>
                    {p === 'urgent' ? 'Urgent' : 'Normal'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={assignNotes}
              onChangeText={setAssignNotes}
              placeholder="e.g. Guest requested extra towels"
              placeholderTextColor={colors.disabled}
              multiline
            />

            {!!assignError && <Text style={styles.assignError}>{assignError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAssignModalOpen(false)} disabled={assignSaving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, assignSaving && styles.modalSubmitBtnDisabled]}
                onPress={submitAssign}
                disabled={assignSaving}
              >
                {assignSaving
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.modalSubmitText}>Assign</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  assignBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.lg, paddingBottom: 0 },

  boardContent: { padding: spacing.lg, gap: spacing.md },
  boardContentWide: { flexDirection: 'row', alignItems: 'flex-start' },

  column: { width: 300 },
  columnMobile: { width: 300, marginRight: spacing.md },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  columnDot: { width: 8, height: 8, borderRadius: 4 },
  columnTitle: { fontSize: 13, fontFamily: fonts.headingSemiBold, color: colors.text, flex: 1 },
  columnCount: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  columnCountText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  columnEmpty: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', padding: spacing.sm },

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  roomBadgeText: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.white },

  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  urgentBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

  roomStatusPill: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 6, marginBottom: spacing.sm },
  roomStatusPillText: { fontSize: 10, fontFamily: fonts.bodySemiBold },

  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  assigneeAvatar: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accentTint,
    alignItems: 'center', justifyContent: 'center',
  },
  assigneeAvatarText: { fontSize: 11, fontFamily: fonts.headingBold, color: colors.accent },
  assigneeName: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, flexShrink: 1 },

  taskNotes: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.xs, fontStyle: 'italic' },
  taskTimestamp: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.xs },

  taskActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#B3792A',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm - 2,
    marginTop: spacing.xs,
  },
  taskActionBtnComplete: { backgroundColor: '#1E7B34' },
  taskActionBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  completedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 440, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.primary, marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.sm },

  pickerRow: { flexDirection: 'row' },
  pickerChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: spacing.md, marginRight: spacing.xs,
    backgroundColor: colors.cardAlt,
  },
  pickerChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickerChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text },
  pickerChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },
  noEligibleText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', paddingVertical: spacing.sm },

  priorityRow: { flexDirection: 'row', gap: spacing.sm },
  priorityChip: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  priorityChipActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  priorityChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  priorityChipTextActive: { color: colors.primary, fontFamily: fonts.bodySemiBold },

  notesInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 13, fontFamily: fonts.body, color: colors.text,
    minHeight: 60, textAlignVertical: 'top',
  },
  assignError: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', marginTop: spacing.sm },

  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  modalSubmitBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  modalSubmitBtnDisabled: { opacity: 0.7 },
  modalSubmitText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});