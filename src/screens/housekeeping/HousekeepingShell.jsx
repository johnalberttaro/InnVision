import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HousekeepingSidebar from './HousekeepingSidebar';
import HousekeepingMyTasksScreen from './HousekeepingMyTasksScreen';
import HousekeepingHistoryScreen from './HousekeepingHistoryScreen';
import HousekeepingPerformanceScreen from './HousekeepingPerformanceScreen';
import MyProfileScreen from '../frontdesk/MyProfileScreen';
import DashboardFooter from '../../components/shared/DashboardFooter';
import { supabase } from '../../services/supabase';
import { colors, spacing, fonts } from '../../utils/portalTheme';

const WIDE_BREAKPOINT = 1024;
const LAST_SEEN_KEY_PREFIX = 'housekeeping-tasks-last-seen:';

/**
 * HousekeepingShell — the Housekeeping staff portal. Same shape as
 * FnbShell.jsx (sidebar + top bar + content area + footer).
 *
 * Screens:
 *  - My Tasks — rooms assigned to this staff member.
 *  - My Performance — their own completion stats (new).
 *  - My Profile — reused directly from the Front Desk portal.
 *
 * NEW-ASSIGNMENT BADGE: Shell (not the My Tasks screen itself) owns this,
 * since the badge needs to update even while the staff member is on a
 * different screen (Performance, Profile) — it fetches+subscribes to
 * housekeeping_tasks the same way HousekeepingMyTasksScreen.jsx does,
 * independently, and compares each 'assigned' task's assigned_at against
 * a per-device "last seen" timestamp stored in AsyncStorage (keyed by
 * staffUid, so switching accounts on the same device doesn't mix up
 * whose badge is whose). Opening My Tasks marks everything seen — the
 * badge doesn't require actually completing anything, just looking.
 */
export default function HousekeepingShell({ onLoggedOut, staffName, staffUid }) {
  const [activeKey, setActiveKey] = useState('mytasks');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [staffPhotoUrl, setStaffPhotoUrl] = useState(null);
  useEffect(() => {
    if (!staffUid) return;

    let cancelled = false;
    const loadPhoto = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('photo_url')
        .eq('id', staffUid)
        .single();
      if (!cancelled && !error) setStaffPhotoUrl(data?.photo_url || null);
    };
    loadPhoto();

    const channel = supabase
      .channel(`housekeeping-sidebar-avatar-${staffUid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${staffUid}` },
        (payload) => setStaffPhotoUrl(payload.new?.photo_url || null)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [staffUid]);

  // ── New-assignment badge ────────────────────────────────────────────
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [lastSeenAt, setLastSeenAt] = useState(null);

  useEffect(() => {
    if (!staffUid) return;
    AsyncStorage.getItem(`${LAST_SEEN_KEY_PREFIX}${staffUid}`).then((v) => setLastSeenAt(v || null));
  }, [staffUid]);

  useEffect(() => {
    if (!staffUid) return;

    const loadAssigned = async () => {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('id, assigned_at')
        .eq('assigned_to', staffUid)
        .eq('status', 'assigned');
      if (!error) setAssignedTasks(data || []);
    };
    loadAssigned();

    const channel = supabase
      .channel(`housekeeping-badge-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `assigned_to=eq.${staffUid}` },
        loadAssigned
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  const newTaskCount = React.useMemo(() => {
    if (!lastSeenAt) return assignedTasks.length; // never opened My Tasks yet — everything's new
    return assignedTasks.filter((t) => new Date(t.assigned_at).getTime() > new Date(lastSeenAt).getTime()).length;
  }, [assignedTasks, lastSeenAt]);

  const handleNavigate = (key) => {
    setActiveKey(key);
    if (key === 'mytasks' && staffUid) {
      const now = new Date().toISOString();
      setLastSeenAt(now);
      AsyncStorage.setItem(`${LAST_SEEN_KEY_PREFIX}${staffUid}`, now).catch(() => {});
    }
  };

  return (
    <View style={styles.screen}>
      <HousekeepingSidebar
        activeKey={activeKey}
        onNavigate={handleNavigate}
        onLogout={onLoggedOut}
        staffName={staffName}
        staffPhotoUrl={staffPhotoUrl}
        collapsed={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        myTasksBadgeCount={newTaskCount}
      />

      <View style={styles.contentArea}>
        <View style={styles.topBar}>
          {!isWide && (
            <TouchableOpacity onPress={() => setMobileSidebarOpen(true)} style={styles.menuButton} accessibilityLabel="Open menu">
              <Ionicons name="menu" size={22} color={colors.primary} />
              {newTaskCount > 0 && (
                <View style={styles.topBarBadge}>
                  <Text style={styles.topBarBadgeText}>{newTaskCount > 9 ? '9+' : newTaskCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.topBarTitle}>InnVision Housekeeping</Text>
        </View>

        <View style={styles.screenContent}>
          {activeKey === 'profile:me' ? (
            <MyProfileScreen staffUid={staffUid} />
          ) : activeKey === 'myperformance' ? (
            <HousekeepingPerformanceScreen staffUid={staffUid} />
          ) : activeKey === 'history' ? (
            <HousekeepingHistoryScreen staffUid={staffUid} />
          ) : (
            <HousekeepingMyTasksScreen staffUid={staffUid} staffName={staffName} />
          )}
        </View>

        <DashboardFooter />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  contentArea: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  menuButton: { marginRight: spacing.md },
  topBarBadge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: '#B3261E', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
  },
  topBarBadgeText: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: '#FFFFFF' },
  topBarTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
  screenContent: { flex: 1 },
});