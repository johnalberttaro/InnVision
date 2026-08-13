import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { supabase } from '../../services/supabase';
import KpiCard from '../../components/dashboard/KpiCard';

/**
 * HousekeepingPerformanceScreen — a staff member's own completion stats.
 * Same idea as the Admin dashboard's KPI cards, scoped to just this
 * person. Pulls directly from housekeeping_tasks (assigned_to = staffUid,
 * status = 'completed') rather than any admin-entered field — this is
 * real data, not the honest-placeholder "Customer Feedback"/"Error
 * Reports" fields on the Front Desk Roster (those are a different table,
 * staff_profile_details, and stay out of scope here — connecting the two
 * would be a reasonable follow-up, not something to fold in unasked).
 */
export default function HousekeepingPerformanceScreen({ staffUid }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!staffUid) return;

    const load = async () => {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('id, status, assigned_at, started_at, completed_at')
        .eq('assigned_to', staffUid)
        .eq('status', 'completed');
      if (!error) setTasks(data || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`housekeeping-performance-${staffUid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `assigned_to=eq.${staffUid}` },
        load
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const completedThisWeek = tasks.filter((t) => new Date(t.completed_at).getTime() >= weekAgo);
    const withDuration = tasks.filter((t) => t.started_at && t.completed_at);

    const avgMins = withDuration.length
      ? withDuration.reduce((sum, t) => sum + (new Date(t.completed_at) - new Date(t.started_at)) / 60000, 0) / withDuration.length
      : null;

    return {
      totalAllTime: tasks.length,
      completedThisWeek: completedThisWeek.length,
      avgLabel: avgMins == null ? '—' : avgMins > 0 && avgMins < 1 ? '<1m' : avgMins < 60 ? `${Math.round(avgMins)}m` : `${(avgMins / 60).toFixed(1)}h`,
    };
  }, [tasks]);

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
      <Text style={styles.subtitle}>Your own cleaning task stats.</Text>

      <View style={styles.kpiRow}>
        <KpiCard
          icon="checkmark-done-outline"
          label="Completed This Week"
          value={String(stats.completedThisWeek)}
          accent="#1E7B34"
          note="Last 7 days"
        />
        <KpiCard
          icon="time-outline"
          label="Avg. Cleaning Time"
          value={stats.avgLabel}
          accent={colors.primary}
          note="Start to completion"
        />
        <KpiCard
          icon="list-outline"
          label="Total Completed"
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