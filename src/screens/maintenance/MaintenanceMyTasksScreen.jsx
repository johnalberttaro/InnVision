import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { subscribeToRooms, updateRoomStatus, statusMeta, ROOM_STATUS } from '../../utils/Roomsservice';

const CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing',   icon: 'water-outline' },
  { key: 'electrical', label: 'Electrical', icon: 'flash-outline' },
  { key: 'hvac',        label: 'HVAC',       icon: 'thermometer-outline' },
  { key: 'furniture',  label: 'Furniture',  icon: 'bed-outline' },
  { key: 'other',      label: 'Other',      icon: 'build-outline' },
];

/**
 * MaintenanceMyTasksScreen — the one real screen in the new Maintenance
 * staff portal. Same relationship to MaintenanceRequest.jsx (the Front
 * Desk/Admin management view) as HousekeepingMyTasksScreen.jsx has to
 * HousekeepingSchedule.jsx: shows only requests assigned to this staff
 * member, same Assign→Start→Resolve action lifecycle and room-status
 * sync, no ability to create/assign new requests (that stays Front
 * Desk/Admin's job).
 */
export default function MaintenanceMyTasksScreen({ staffUid, staffName }) {
  const [requests, setRequests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  // Resolution-note modal — opened by "Mark Resolved" instead of
  // resolving immediately, so staff can optionally leave a note. Once
  // resolved, the request moves off this screen entirely — see
  // MaintenanceHistoryScreen.jsx.
  const [resolvingRequest, setResolvingRequest] = useState(null);
  const [resolutionNoteText, setResolutionNoteText] = useState('');

  const requestToCamel = (row) => ({
    id: row.id,
    roomNumber: row.room_number,
    category: row.category,
    description: row.description,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
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
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load my maintenance requests:', error);
        setLoading(false);
        return;
      }
      setRequests((data || []).map(requestToCamel));
      setLoading(false);
    };
    loadRequests();

    const channel = supabase
      .channel(`my-maintenance-requests-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_requests', filter: `assigned_to=eq.${staffUid}` },
        loadRequests
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

  const resolveRequest = async (request, note) => {
    setUpdatingId(request.id);
    try {
      const { error } = await supabase
        .from('maintenance_requests')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_note: note?.trim() || null,
        })
        .eq('id', request.id);
      if (error) throw error;

      // Only advance the room if it's STILL in Maintenance status — never
      // overwrite a status something else already changed it to. And to
      // NEEDS_CLEANING_AGAIN (not straight to Vacant) — a room just out
      // of maintenance work still needs a cleaning pass before it's
      // guest-ready. Same guard/target as MaintenanceRequest.jsx's own
      // resolveRequest().
      const room = rooms.find((r) => r.roomNumber === request.roomNumber);
      if (room && room.status === ROOM_STATUS.MAINTENANCE) {
        await updateRoomStatus(request.roomNumber, ROOM_STATUS.NEEDS_CLEANING_AGAIN, {
          maintenanceNote: '',
        }).catch((err) => console.error('Room status sync failed (request still resolved):', err));
      }
    } catch (err) {
      console.error('Failed to resolve request:', err);
    } finally {
      setUpdatingId(null);
      setResolvingRequest(null);
      setResolutionNoteText('');
    }
  };

  // Only 'in_progress' is ever relevant here — a request only gets an
  // assigned_to (which is what makes it show up on this "my requests"
  // screen at all) at the exact moment Front Desk/Admin assigns it, and
  // that same assignment action sets status straight to 'in_progress'
  // (see MaintenanceRequest.jsx's submitAssign() — there's no separate
  // "started" step for maintenance the way housekeeping has one). So an
  // 'open' request is by definition never assigned to anyone yet, and
  // never appears here. Resolved requests no longer appear here at all
  // either — see MaintenanceHistoryScreen.jsx.
  const columns = useMemo(() => ({
    in_progress: requests.filter((r) => r.status === 'in_progress'),
  }), [requests]);

  const RequestCard = ({ request }) => {
    const isUpdating = updatingId === request.id;
    const cat = categoryMeta(request.category);
    const meta = roomStatusMeta(request.roomNumber);
    const isUrgent = request.priority === 'urgent' && request.status !== 'resolved';

    return (
      <View style={[styles.reqCard, isUrgent && styles.reqCardUrgent]}>
        <View style={styles.reqCardTop}>
          <View style={styles.roomBadge}>
            <Ionicons name="key-outline" size={12} color={colors.white} />
            <Text style={styles.roomBadgeText}>Room {request.roomNumber}</Text>
          </View>
          {isUrgent && (
            <View style={styles.urgentBadge}>
              <Ionicons name="alert-circle" size={11} color="#B3261E" />
              <Text style={styles.urgentBadgeText}>Urgent</Text>
            </View>
          )}
        </View>

        <View style={styles.categoryRow}>
          <Ionicons name={cat.icon} size={13} color={colors.textMuted} />
          <Text style={styles.categoryText}>{cat.label}</Text>
        </View>

        {meta && (
          <View style={[styles.roomStatusPill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.roomStatusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        )}

        {!!request.description && <Text style={styles.reqDescription} numberOfLines={3}>{request.description}</Text>}

        <Text style={styles.reqTimestamp}>
          {request.status === 'resolved'
            ? `Resolved ${elapsedLabel(request.resolvedAt)}`
            : request.status === 'in_progress'
              ? `Started ${elapsedLabel(request.startedAt)}`
              : `Reported ${elapsedLabel(request.createdAt)}`}
        </Text>

        {isUpdating ? (
          <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: spacing.sm }} />
        ) : request.status === 'in_progress' ? (
          <TouchableOpacity
            style={[styles.reqActionBtn, styles.reqActionBtnResolve]}
            onPress={() => setResolvingRequest(request)}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-outline" size={14} color={colors.white} />
            <Text style={styles.reqActionBtnText}>Mark Resolved</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <View style={styles.completedRow}>
              <Ionicons name="checkmark-circle" size={14} color="#1E7B34" />
              <Text style={styles.completedText}>Resolved</Text>
            </View>
            {!!request.resolutionNote && (
              <View style={styles.resolutionNoteWrap}>
                <Ionicons name="chatbox-ellipses-outline" size={12} color={colors.textMuted} style={{ marginTop: 1 }} />
                <Text style={styles.resolutionNoteText}>{request.resolutionNote}</Text>
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>My Requests</Text>
      <Text style={styles.subtitle}>
        {staffName ? `Maintenance requests assigned to you, ${staffName}.` : 'Maintenance requests assigned to you.'}
      </Text>

      <Section title="In Progress" tasksInColumn={columns.in_progress} accentColor="#B3792A" />

      <Modal visible={!!resolvingRequest} transparent animationType="fade" onRequestClose={() => setResolvingRequest(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark Room {resolvingRequest?.roomNumber} Resolved</Text>
            <Text style={styles.modalSubtitle}>Add a note for Front Desk/Admin (optional).</Text>
            <TextInput
              style={styles.modalInput}
              value={resolutionNoteText}
              onChangeText={setResolutionNoteText}
              placeholder="e.g. Replaced the faucet washer, tested no leaks"
              placeholderTextColor={colors.disabled}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setResolvingRequest(null); setResolutionNoteText(''); }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={() => resolveRequest(resolvingRequest, resolutionNoteText)}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-outline" size={14} color={colors.white} />
                <Text style={styles.modalConfirmBtnText}>Mark Resolved</Text>
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
    backgroundColor: colors.primary, borderRadius: radius.sm,
    paddingVertical: 3, paddingHorizontal: spacing.sm,
  },
  roomBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  urgentBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.xs },
  categoryText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },

  roomStatusPill: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  roomStatusPillText: { fontSize: 10, fontFamily: fonts.bodySemiBold },

  reqDescription: { fontSize: 12, fontFamily: fonts.body, color: colors.text, marginBottom: spacing.xs },
  reqTimestamp: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },

  reqActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: spacing.sm,
  },
  reqActionBtnResolve: { backgroundColor: '#1E7B34' },
  reqActionBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  completedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  resolutionNoteWrap: {
    flexDirection: 'row', gap: 5,
    backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.sm,
  },
  resolutionNoteText: { flex: 1, fontSize: 11, fontFamily: fonts.body, fontStyle: 'italic', color: colors.text, lineHeight: 15 },

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