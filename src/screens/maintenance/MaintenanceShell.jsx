import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaintenanceSidebar from './MaintenanceSidebar';
import MaintenanceMyTasksScreen from './MaintenanceMyTasksScreen';
import MaintenancePerformanceScreen from './MaintenancePerformanceScreen';
import MyProfileScreen from '../frontdesk/MyProfileScreen';
import DashboardFooter from '../../components/shared/DashboardFooter';
import { supabase } from '../../services/supabase';
import { colors, spacing, fonts } from '../../utils/portalTheme';

const WIDE_BREAKPOINT = 1024;
const LAST_SEEN_KEY_PREFIX = 'maintenance-requests-last-seen:';

/**
 * MaintenanceShell — the Maintenance staff portal. Same shape as
 * HousekeepingShell.jsx.
 *
 * NEW-ASSIGNMENT BADGE: unlike Housekeeping (which has a distinct
 * 'assigned' state before work starts), a maintenance request is
 * 'in_progress' from the moment it's assigned (see
 * MaintenanceMyTasksScreen.jsx's own note on this) — so "new" here means
 * an 'in_progress' request whose started_at (the same moment it was
 * assigned) is after the last-seen timestamp, not a separate 'assigned'
 * status the way Housekeeping's badge counts.
 */
export default function MaintenanceShell({ onLoggedOut, staffName, staffUid }) {
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
      .channel(`maintenance-sidebar-avatar-${staffUid}`)
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
  const [inProgressRequests, setInProgressRequests] = useState([]);
  const [lastSeenAt, setLastSeenAt] = useState(null);

  useEffect(() => {
    if (!staffUid) return;
    AsyncStorage.getItem(`${LAST_SEEN_KEY_PREFIX}${staffUid}`).then((v) => setLastSeenAt(v || null));
  }, [staffUid]);

  useEffect(() => {
    if (!staffUid) return;

    const loadInProgress = async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('id, started_at')
        .eq('assigned_to', staffUid)
        .eq('status', 'in_progress');
      if (!error) setInProgressRequests(data || []);
    };
    loadInProgress();

    const channel = supabase
      .channel(`maintenance-badge-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_requests', filter: `assigned_to=eq.${staffUid}` },
        loadInProgress
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  const newRequestCount = React.useMemo(() => {
    if (!lastSeenAt) return inProgressRequests.length;
    return inProgressRequests.filter((r) => new Date(r.started_at).getTime() > new Date(lastSeenAt).getTime()).length;
  }, [inProgressRequests, lastSeenAt]);

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
      <MaintenanceSidebar
        activeKey={activeKey}
        onNavigate={handleNavigate}
        onLogout={onLoggedOut}
        staffName={staffName}
        staffPhotoUrl={staffPhotoUrl}
        collapsed={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        myTasksBadgeCount={newRequestCount}
      />

      <View style={styles.contentArea}>
        <View style={styles.topBar}>
          {!isWide && (
            <TouchableOpacity onPress={() => setMobileSidebarOpen(true)} style={styles.menuButton} accessibilityLabel="Open menu">
              <Ionicons name="menu" size={22} color={colors.primary} />
              {newRequestCount > 0 && (
                <View style={styles.topBarBadge}>
                  <Text style={styles.topBarBadgeText}>{newRequestCount > 9 ? '9+' : newRequestCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.topBarTitle}>InnVision Maintenance</Text>
        </View>

        <View style={styles.screenContent}>
          {activeKey === 'profile:me' ? (
            <MyProfileScreen staffUid={staffUid} />
          ) : activeKey === 'myperformance' ? (
            <MaintenancePerformanceScreen staffUid={staffUid} />
          ) : (
            <MaintenanceMyTasksScreen staffUid={staffUid} staffName={staffName} />
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