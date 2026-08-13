import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { supabase } from '../../services/supabase';
import KpiCard from '../../components/dashboard/KpiCard';

/**
 * MaintenancePerformanceScreen — a staff member's own resolution stats.
 * Same idea as HousekeepingPerformanceScreen.jsx.
 */
export default function MaintenancePerformanceScreen({ staffUid }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staffUid) return;

    const load = async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('id, status, started_at, resolved_at')
        .eq('assigned_to', staffUid)
        .eq('status', 'resolved');
      if (!error) setRequests(data || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`maintenance-performance-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_requests', filter: `assigned_to=eq.${staffUid}` },
        load
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const resolvedThisWeek = requests.filter((r) => new Date(r.resolved_at).getTime() >= weekAgo);
    const withDuration = requests.filter((r) => r.started_at && r.resolved_at);

    const avgMins = withDuration.length
      ? withDuration.reduce((sum, r) => sum + (new Date(r.resolved_at) - new Date(r.started_at)) / 60000, 0) / withDuration.length
      : null;

    return {
      totalAllTime: requests.length,
      resolvedThisWeek: resolvedThisWeek.length,
      avgLabel: avgMins == null ? '—' : avgMins < 60 ? `${Math.round(avgMins)}m` : `${(avgMins / 60).toFixed(1)}h`,
    };
  }, [requests]);

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>My Performance</Text>
      <Text style={styles.subtitle}>Your own maintenance request stats.</Text>

      <View style={styles.kpiRow}>
        <KpiCard
          icon="checkmark-done-outline"
          label="Resolved This Week"
          value={String(stats.resolvedThisWeek)}
          accent="#1E7B34"
          note="Last 7 days"
        />
        <KpiCard
          icon="time-outline"
          label="Avg. Resolution Time"
          value={stats.avgLabel}
          accent={colors.primary}
          note="Assigned to resolved"
        />
        <KpiCard
          icon="list-outline"
          label="Total Resolved"
          value={String(stats.totalAllTime)}
          accent="#6B46C1"
          note="All time"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});