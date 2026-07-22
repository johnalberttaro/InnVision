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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { subscribeToRooms, updateRoomStatus, statusMeta, ROOM_STATUS } from '../../utils/Roomsservice';
import KpiCard from '../../components/dashboard/KpiCard';

const MOBILE_BREAKPOINT = 900;

const CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing',   icon: 'water-outline' },
  { key: 'electrical', label: 'Electrical', icon: 'flash-outline' },
  { key: 'hvac',        label: 'HVAC',       icon: 'thermometer-outline' },
  { key: 'furniture',  label: 'Furniture',  icon: 'bed-outline' },
  { key: 'other',      label: 'Other',      icon: 'construct-outline' },
];

/**
 * MaintenanceRequestScreen — the last remaining unwired Housekeeping
 * sidebar item (housekeeping:maintenance had no route since the
 * original app; fell through to a placeholder).
 *
 * ROOM INTEGRATION (the actual point of this screen, not just a form):
 *  - Filing a request for a room that isn't currently OCCUPIED
 *    automatically sets that room to ROOM_STATUS.MAINTENANCE, with the
 *    request's own description written into rooms.maintenance_note —
 *    the same field RoomManagementScreen already reads and displays.
 *    A room with a guest in it is left alone status-wise (you can't
 *    pull an occupied room out of service), but the request is still
 *    tracked normally.
 *  - Resolving a request moves the room to
 *    ROOM_STATUS.NEEDS_CLEANING_AGAIN rather than straight back to
 *    Vacant — a room that just had maintenance work done should get
 *    inspected/cleaned before a guest goes back in, which feeds
 *    naturally into HousekeepingSchedule.jsx's board. Only does this if
 *    the room is STILL in Maintenance status (i.e. nothing else moved
 *    it in the meantime) — never overwrites an unrelated status change.
 *
 * KPIs: Open Requests (open + in_progress) and Average Resolution Time
 * (computed client-side from resolved requests' created_at -> 
 * resolved_at, not stored — always reflects the live data).
 *
 * Status board mirrors HousekeepingSchedule.jsx's 3-column pattern
 * (Open / In Progress / Resolved) for interaction consistency across
 * the Housekeeping section. "Assign" is the quick action that both
 * assigns AND starts a request in one tap — there's no separate
 * unassigned-but-in-progress state, keeping the lifecycle simple.
 *
 * Props:
 *  - staffUid, staffName: the signed-in user — used as reported_by on
 *    new requests and assigned_to when self-assigning.
 */
export default function MaintenanceRequestScreen({ staffUid, staffName }) {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;

  const [requests, setRequests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newRoom, setNewRoom] = useState(null);
  const [newCategory, setNewCategory] = useState('other');
  const [newPriority, setNewPriority] = useState('normal');
  const [newDescription, setNewDescription] = useState('');
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState('');

  const [assignModalRequest, setAssignModalRequest] = useState(null);
  const [assignStaff, setAssignStaff] = useState(null);
  const [assignSaving, setAssignSaving] = useState(false);

  const requestToCamel = (row) => ({
    id: row.id,
    roomNumber: row.room_number,
    category: row.category,
    description: row.description,
    priority: row.priority,
    status: row.status,
    reportedByName: row.reported_by_name,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
  });

  // ── Load requests (realtime) ─────────────────────────────────────────
  useEffect(() => {
    const loadRequests = async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load maintenance requests:', error);
        setLoading(false);
        return;
      }
      setRequests((data || []).map(requestToCamel));
      setLoading(false);
    };
    loadRequests();

    const channel = supabase
      .channel('maintenance-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_requests' }, loadRequests)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── Rooms (for the New Request room picker + room-status pills) ──────
  useEffect(() => {
    const unsubscribe = subscribeToRooms(setRooms, (err) => console.error('Failed to load rooms:', err));
    return unsubscribe;
  }, []);

  // ── Front desk staff (for the Assign picker) ──────────────────────────
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

  const roomByNumber = useMemo(() => {
    const map = {};
    rooms.forEach((r) => { map[r.roomNumber] = r; });
    return map;
  }, [rooms]);

  const columns = useMemo(() => ({
    open: requests.filter((r) => r.status === 'open'),
    in_progress: requests.filter((r) => r.status === 'in_progress'),
    resolved: requests.filter((r) => r.status === 'resolved'),
  }), [requests]);

  // ── KPIs ───────────────────────────────────────────────────────────────
  const openCount = columns.open.length + columns.in_progress.length;
  const urgentOpenCount = requests.filter(
    (r) => r.status !== 'resolved' && r.priority === 'urgent'
  ).length;

  const avgResolutionLabel = useMemo(() => {
    const withBothTimes = requests.filter((r) => r.status === 'resolved' && r.createdAt && r.resolvedAt);
    if (withBothTimes.length === 0) return '—';
    const totalHours = withBothTimes.reduce((sum, r) => {
      const diffMs = new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime();
      return sum + diffMs / 3600000;
    }, 0);
    const avgHours = totalHours / withBothTimes.length;
    return avgHours < 24 ? `${avgHours.toFixed(1)}h` : `${(avgHours / 24).toFixed(1)}d`;
  }, [requests]);

  const categoryMeta = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];

  const elapsedLabel = (isoString) => {
    if (!isoString) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  };

  // ── New Request ────────────────────────────────────────────────────────
  const openNewModal = () => {
    setNewRoom(null);
    setNewCategory('other');
    setNewPriority('normal');
    setNewDescription('');
    setNewError('');
    setNewModalOpen(true);
  };

  const submitNewRequest = async () => {
    if (!newRoom) { setNewError('Please select a room.'); return; }
    if (!newDescription.trim()) { setNewError('Please describe the issue.'); return; }

    setNewSaving(true);
    setNewError('');
    try {
      const { error } = await supabase.from('maintenance_requests').insert({
        room_number: newRoom,
        category: newCategory,
        priority: newPriority,
        description: newDescription.trim(),
        reported_by: staffUid || null,
        reported_by_name: staffName || null,
      });
      if (error) throw error;

      // Room integration: pull the room out of service, unless a guest
      // is currently staying there.
      const room = roomByNumber[newRoom];
      if (room && room.status !== ROOM_STATUS.OCCUPIED) {
        await updateRoomStatus(newRoom, ROOM_STATUS.MAINTENANCE, {
          maintenanceNote: newDescription.trim(),
        }).catch((err) => console.error('Room status sync failed (request still created):', err));
      }

      setNewModalOpen(false);
    } catch (err) {
      console.error('Failed to create maintenance request:', err);
      setNewError('Could not submit this request. Please try again.');
    } finally {
      setNewSaving(false);
    }
  };

  // ── Assign (quick action: assigns AND moves to in_progress) ────────────
  const openAssignModal = (request) => {
    setAssignStaff(null);
    setAssignModalRequest(request);
  };

  const submitAssign = async () => {
    if (!assignStaff || !assignModalRequest) return;
    setAssignSaving(true);
    try {
      const { error } = await supabase
        .from('maintenance_requests')
        .update({
          assigned_to: assignStaff.id,
          assigned_to_name: assignStaff.name,
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', assignModalRequest.id);
      if (error) throw error;
      setAssignModalRequest(null);
    } catch (err) {
      console.error('Failed to assign request:', err);
    } finally {
      setAssignSaving(false);
    }
  };

  // ── Resolve ───────────────────────────────────────────────────────────
  const resolveRequest = async (request) => {
    setUpdatingId(request.id);
    try {
      const { error } = await supabase
        .from('maintenance_requests')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', request.id);
      if (error) throw error;

      // Only advance the room if it's STILL in Maintenance status — never
      // overwrite a status something else already changed it to.
      const room = roomByNumber[request.roomNumber];
      if (room && room.status === ROOM_STATUS.MAINTENANCE) {
        await updateRoomStatus(request.roomNumber, ROOM_STATUS.NEEDS_CLEANING_AGAIN, {
          maintenanceNote: '',
        }).catch((err) => console.error('Room status sync failed (request still resolved):', err));
      }
    } catch (err) {
      console.error('Failed to resolve request:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Request card ─────────────────────────────────────────────────────
  const RequestCard = ({ request }) => {
    const isUpdating = updatingId === request.id;
    const cat = categoryMeta(request.category);
    const room = roomByNumber[request.roomNumber];
    const roomMeta = room ? statusMeta(room.status) : null;

    return (
      <View style={[styles.reqCard, request.priority === 'urgent' && styles.reqCardUrgent]}>
        <View style={styles.reqCardTop}>
          <View style={styles.roomBadge}>
            <Ionicons name="key-outline" size={12} color={colors.white} />
            <Text style={styles.roomBadgeText}>Room {request.roomNumber}</Text>
          </View>
          {request.priority === 'urgent' && (
            <View style={styles.urgentBadge}>
              <Ionicons name="alert-circle" size={11} color="#B3261E" />
              <Text style={styles.urgentBadgeText}>Urgent</Text>
            </View>
          )}
        </View>

        {roomMeta && (
          <View style={[styles.roomStatusPill, { backgroundColor: roomMeta.bg }]}>
            <Text style={[styles.roomStatusPillText, { color: roomMeta.color }]}>{roomMeta.label}</Text>
          </View>
        )}

        <View style={styles.categoryRow}>
          <Ionicons name={cat.icon} size={13} color={colors.textMuted} />
          <Text style={styles.categoryText}>{cat.label}</Text>
        </View>

        <Text style={styles.reqDescription} numberOfLines={3}>{request.description}</Text>

        {request.assignedToName ? (
          <View style={styles.assigneeRow}>
            <View style={styles.assigneeAvatar}>
              <Text style={styles.assigneeAvatarText}>{request.assignedToName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.assigneeName} numberOfLines={1}>{request.assignedToName}</Text>
          </View>
        ) : (
          <Text style={styles.unassignedText}>Unassigned</Text>
        )}

        <Text style={styles.reqTimestamp}>
          {request.status === 'resolved'
            ? `Resolved ${elapsedLabel(request.resolvedAt)}`
            : request.status === 'in_progress'
              ? `Started ${elapsedLabel(request.startedAt)}`
              : `Reported ${elapsedLabel(request.createdAt)}`}
          {request.reportedByName ? ` · by ${request.reportedByName}` : ''}
        </Text>

        {isUpdating ? (
          <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: spacing.sm }} />
        ) : request.status === 'open' ? (
          <TouchableOpacity style={styles.reqActionBtn} onPress={() => openAssignModal(request)} activeOpacity={0.85}>
            <Ionicons name="person-add-outline" size={14} color={colors.white} />
            <Text style={styles.reqActionBtnText}>Assign</Text>
          </TouchableOpacity>
        ) : request.status === 'in_progress' ? (
          <TouchableOpacity
            style={[styles.reqActionBtn, styles.reqActionBtnResolve]}
            onPress={() => resolveRequest(request)}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-outline" size={14} color={colors.white} />
            <Text style={styles.reqActionBtnText}>Mark Resolved</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.completedRow}>
            <Ionicons name="checkmark-circle" size={14} color="#1E7B34" />
            <Text style={styles.completedText}>Resolved</Text>
          </View>
        )}
      </View>
    );
  };

  const Column = ({ title, tasksInColumn, accentColor }) => (
    <View style={[styles.column, isMobile && styles.columnMobile]}>
      <View style={styles.columnHeader}>
        <View style={[styles.columnDot, { backgroundColor: accentColor }]} />
        <Text style={styles.columnTitle}>{title}</Text>
        <View style={styles.columnCount}>
          <Text style={styles.columnCountText}>{tasksInColumn.length}</Text>
        </View>
      </View>
      {tasksInColumn.length === 0 ? (
        <Text style={styles.columnEmpty}>No requests here.</Text>
      ) : (
        tasksInColumn.map((r) => <RequestCard key={r.id} request={r} />)
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Maintenance Requests</Text>
            <Text style={styles.subtitle}>Track and resolve room maintenance issues</Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={openNewModal} activeOpacity={0.85}>
            <Ionicons name="add" size={16} color={colors.white} />
            <Text style={styles.newBtnText}>New Request</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.kpiRow}>
          <KpiCard
            icon="build-outline"
            label="Open Requests"
            value={String(openCount)}
            accent={openCount > 0 ? '#C99400' : '#1E7B34'}
            note={urgentOpenCount > 0 ? `${urgentOpenCount} urgent` : 'None urgent'}
          />
          <KpiCard
            icon="time-outline"
            label="Avg. Resolution Time"
            value={avgResolutionLabel}
            accent={colors.primary}
            note="Based on resolved requests"
          />
        </View>

        <ScrollView
          horizontal={isMobile}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.boardContent, !isMobile && styles.boardContentWide]}
        >
          <Column title="Open" tasksInColumn={columns.open} accentColor="#C99400" />
          <Column title="In Progress" tasksInColumn={columns.in_progress} accentColor="#B3792A" />
          <Column title="Resolved" tasksInColumn={columns.resolved} accentColor="#1E7B34" />
        </ScrollView>
      </ScrollView>

      {/* ── New Request modal ──────────────────────────────────────── */}
      <Modal visible={newModalOpen} transparent animationType="fade" onRequestClose={() => setNewModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Maintenance Request</Text>

            <Text style={styles.fieldLabel}>Room</Text>
            <View style={styles.pickerWrapRow}>
              {rooms.map((r) => (
                <TouchableOpacity
                  key={r.roomNumber}
                  style={[styles.pickerChip, newRoom === r.roomNumber && styles.pickerChipActive]}
                  onPress={() => setNewRoom(r.roomNumber)}
                >
                  <Text style={[styles.pickerChipText, newRoom === r.roomNumber && styles.pickerChipTextActive]}>
                    Room {r.roomNumber}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.pickerWrapRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.pickerChip, newCategory === c.key && styles.pickerChipActive]}
                  onPress={() => setNewCategory(c.key)}
                >
                  <Ionicons name={c.icon} size={13} color={newCategory === c.key ? colors.white : colors.textMuted} />
                  <Text style={[styles.pickerChipText, newCategory === c.key && styles.pickerChipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {['low', 'normal', 'urgent'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityChip, newPriority === p && styles.priorityChipActive]}
                  onPress={() => setNewPriority(p)}
                >
                  <Text style={[styles.priorityChipText, newPriority === p && styles.priorityChipTextActive]}>
                    {p === 'low' ? 'Low' : p === 'urgent' ? 'Urgent' : 'Normal'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Describe the issue</Text>
            <TextInput
              style={styles.descriptionInput}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="e.g. Bathroom faucet leaking, AC not cooling…"
              placeholderTextColor={colors.disabled}
              multiline
            />

            {!!newError && <Text style={styles.formError}>{newError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNewModalOpen(false)} disabled={newSaving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, newSaving && styles.modalSubmitBtnDisabled]}
                onPress={submitNewRequest}
                disabled={newSaving}
              >
                {newSaving
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.modalSubmitText}>Submit Request</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Assign modal ───────────────────────────────────────────── */}
      <Modal visible={!!assignModalRequest} transparent animationType="fade" onRequestClose={() => setAssignModalRequest(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Assign Room {assignModalRequest?.roomNumber} Request
            </Text>
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

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAssignModalRequest(null)} disabled={assignSaving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, (assignSaving || !assignStaff) && styles.modalSubmitBtnDisabled]}
                onPress={submitAssign}
                disabled={assignSaving || !assignStaff}
              >
                {assignSaving
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.modalSubmitText}>Assign & Start</Text>
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
  scrollContent: { paddingBottom: spacing.xxl },
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
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 999,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
  },
  newBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

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

  reqCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  reqCardUrgent: { borderColor: '#B3261E', borderWidth: 1.5 },
  reqCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },

  roomBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 999,
    paddingVertical: 3, paddingHorizontal: spacing.sm, alignSelf: 'flex-start',
  },
  roomBadgeText: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.white },

  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  urgentBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

  roomStatusPill: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 6, marginTop: 6 },
  roomStatusPillText: { fontSize: 10, fontFamily: fonts.bodySemiBold },

  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  categoryText: { fontSize: 11, fontFamily: fonts.bodyMedium, color: colors.textMuted },

  reqDescription: { fontSize: 12.5, fontFamily: fonts.body, color: colors.text, marginTop: 6, marginBottom: spacing.sm, lineHeight: 18 },

  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  assigneeAvatar: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.accentTint, alignItems: 'center', justifyContent: 'center',
  },
  assigneeAvatarText: { fontSize: 10, fontFamily: fonts.headingBold, color: colors.accent },
  assigneeName: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, flexShrink: 1 },
  unassignedText: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.xs },

  reqTimestamp: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.xs },

  reqActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: '#B3792A', borderRadius: radius.sm, paddingVertical: spacing.sm - 2, marginTop: spacing.xs,
  },
  reqActionBtnResolve: { backgroundColor: '#1E7B34' },
  reqActionBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  completedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 460, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.primary, marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.sm },

  pickerRow: { flexDirection: 'row' },
  pickerWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pickerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
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

  descriptionInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    padding: spacing.sm, fontSize: 13, fontFamily: fonts.body, color: colors.text,
    minHeight: 80, textAlignVertical: 'top',
  },
  formError: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', marginTop: spacing.sm },

  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  modalSubmitBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  modalSubmitBtnDisabled: { opacity: 0.7 },
  modalSubmitText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});