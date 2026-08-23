import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaintenanceSidebar from './MaintenanceSidebar';
import MaintenanceMyTasksScreen from './MaintenanceMyTasksScreen';
import MaintenanceHistoryScreen from './MaintenanceHistoryScreen';
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
 * NEW-ASSIGNMENT BADGE: now genuinely mirrors Housekeeping's — "new"
 * means a request whose assigned_at is after the last-seen timestamp,
 * regardless of whether the staff member has tapped "Start Work" yet
 * (assignment and starting work are now two separate moments, same as
 * Housekeeping — see MaintenanceMyTasksScreen.jsx's own note on this).
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
        .select('id, assigned_at')
        .or(`assigned_to.eq.${staffUid},assigned_to_2.eq.${staffUid}`)
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_requests', filter: `assigned_to_2=eq.${staffUid}` },
        loadInProgress
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  const newRequestCount = React.useMemo(() => {
    if (!lastSeenAt) return inProgressRequests.length;
    return inProgressRequests.filter((r) => new Date(r.assigned_at).getTime() > new Date(lastSeenAt).getTime()).length;
  }, [inProgressRequests, lastSeenAt]);

  // ── Notification sound ──────────────────────────────────────────────
  // Same reasoning as HousekeepingShell.jsx: plays once whenever
  // newRequestCount goes UP, not on every render or just because it's
  // nonzero. Needs `npx expo install expo-audio` and a sound file at
  // assets/notification.mp3 — neither is provided here.
  const notificationPlayer = useAudioPlayer(require('../../../assets/notification.mp3'));
  const prevRequestCountRef = useRef(newRequestCount);
  useEffect(() => {
    if (newRequestCount > prevRequestCountRef.current) {
      try {
        notificationPlayer.seekTo(0);
        notificationPlayer.play();
      } catch (err) {
        console.error('Failed to play notification sound:', err);
      }
    }
    prevRequestCountRef.current = newRequestCount;
  }, [newRequestCount]);

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
          ) : activeKey === 'history' ? (
            <MaintenanceHistoryScreen staffUid={staffUid} />
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