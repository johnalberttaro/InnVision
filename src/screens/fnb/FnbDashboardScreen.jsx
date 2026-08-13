import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import FnbOrdersDonut from '../../components/dashboard/FnbOrdersDonut';

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const STATUS_META = {
  escalated: { label: 'To Prepare', color: '#2C5EA8', bg: '#E3ECF8' },
  preparing: { label: 'Preparing', color: '#8A5CB0', bg: '#EEE3F5' },
  out_for_delivery: { label: 'Delivery Assigned', color: '#B3792A', bg: '#F5E9D6' },
};

/**
 * FnbDashboardScreen — Kitchen/F&B portal. A lightweight "Today's
 * Summary" overview, rounding out the portal the same way Front Desk
 * and Admin already have their own dashboard — F&B never had one.
 *
 * Stats shown:
 *  - Orders today, Revenue today (delivered orders only — a cancelled
 *    order was never actually paid for)
 *  - Average time from escalated to delivered — real data, computed
 *    from escalated_at/delivered_at (see 011_food_service_status_timestamps.sql).
 *    Those columns only started being stamped once that migration and
 *    its app-side changes went in, so orders escalated or delivered
 *    BEFORE that point simply don't have timestamps to average — the
 *    stat quietly excludes them rather than guessing. It'll read "—"
 *    until enough post-migration orders have completed.
 *  - Top 3 items today, by quantity ordered
 *  - Orders Overview — a delivered/cancelled split donut, so today's
 *    outcome mix is visible at a glance alongside the raw counts above
 *  - Active Orders — everything currently in escalated/preparing/
 *    out_for_delivery, right on the dashboard so staff don't need to
 *    switch to Kitchen Orders just to see what's in flight
 *
 * "View Reports" (top right) navigates to Order History — the closest
 * real destination that already exists, rather than building a
 * separate reports screen with nothing behind it.
 *
 * All computed client-side from a single day-scoped fetch, rather than
 * a database aggregate query — consistent with how the rest of this
 * session avoided PostgREST query-syntax edge cases (see
 * OrderFoodScreen.jsx's own notification-fetch comment for the same
 * reasoning) in favor of fetching plainly and reducing in JS.
 */
export default function FnbDashboardScreen({ onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOrdersPage, setActiveOrdersPage] = useState(1);
  const ACTIVE_ORDERS_PAGE_SIZE = 3;

  useEffect(() => {
    const loadToday = async () => {
      const { data, error } = await supabase
        .from('food_orders')
        .select('id, status, guest_name, room_number, total_amount, created_at, escalated_at, delivered_at, food_order_items(item_name, quantity)')
        .gte('created_at', startOfToday().toISOString())
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load dashboard data:', error);
        setLoading(false);
        return;
      }
      setOrders(data || []);
      setLoading(false);
    };
    loadToday();

    const channel = supabase
      .channel('fnb-dashboard-today')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_orders' }, loadToday)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const stats = useMemo(() => {
    const delivered = orders.filter((o) => o.status === 'delivered');
    const cancelled = orders.filter((o) => o.status === 'cancelled');
    const revenue = delivered.reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const turnaroundMinutes = delivered
      .filter((o) => o.escalated_at && o.delivered_at)
      .map((o) => (new Date(o.delivered_at).getTime() - new Date(o.escalated_at).getTime()) / 60000);
    const avgTurnaround = turnaroundMinutes.length
      ? Math.round(turnaroundMinutes.reduce((a, b) => a + b, 0) / turnaroundMinutes.length)
      : null;

    const itemCounts = {};
    for (const order of orders) {
      for (const item of order.food_order_items || []) {
        itemCounts[item.item_name] = (itemCounts[item.item_name] || 0) + item.quantity;
      }
    }
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => ({ name, qty }));

    const activeOrders = orders.filter((o) => ['escalated', 'preparing', 'out_for_delivery'].includes(o.status));

    return {
      totalOrders: orders.length,
      revenue,
      avgTurnaround,
      turnaroundSampleSize: turnaroundMinutes.length,
      topItems,
      deliveredCount: delivered.length,
      cancelledCount: cancelled.length,
      activeOrders,
    };
  }, [orders]);

  useEffect(() => { setActiveOrdersPage(1); }, [stats.activeOrders.length]);

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
          <Text style={styles.title}>Today's Summary</Text>
          <Text style={styles.subtitle}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
        </View>
        {!!onNavigate && (
          <TouchableOpacity style={styles.reportsBtn} onPress={() => onNavigate('orderhistory')} activeOpacity={0.85}>
            <Ionicons name="bar-chart-outline" size={16} color={colors.white} />
            <Text style={styles.reportsBtnText}>View Reports</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.bodyScroll} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.contentWrap}>
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: '#E3ECF8' }]}>
                <Ionicons name="receipt-outline" size={20} color="#2C5EA8" />
              </View>
              <Text style={styles.statValue}>{stats.totalOrders}</Text>
              <Text style={styles.statLabel}>Orders Today</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: '#DFF5E1' }]}>
                <Ionicons name="cash-outline" size={20} color="#1E7B34" />
              </View>
              <Text style={styles.statValue}>{formatCurrency(stats.revenue)}</Text>
              <Text style={styles.statLabel}>Revenue Today</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: '#EEE3F5' }]}>
                <Ionicons name="time-outline" size={20} color="#8A5CB0" />
              </View>
              <Text style={styles.statValue}>{stats.avgTurnaround != null ? `${stats.avgTurnaround}m` : '—'}</Text>
              <Text style={styles.statLabel}>Avg. Escalated → Delivered</Text>
              {stats.avgTurnaround == null && (
                <Text style={styles.statHint}>No completed orders with timing data yet today.</Text>
              )}
            </View>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.topItemsCard}>
              <Text style={styles.topItemsTitle}>Top Items Today</Text>
              {stats.topItems.length === 0 ? (
                <Text style={styles.emptyText}>No orders yet today.</Text>
              ) : (
                stats.topItems.map((item, i) => (
                  <View key={item.name} style={styles.topItemRow}>
                    <View style={styles.topItemRank}>
                      <Text style={styles.topItemRankText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.topItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.topItemQty}>×{item.qty}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.donutCard}>
              <Text style={styles.topItemsTitle}>Orders Overview</Text>
              {stats.deliveredCount + stats.cancelledCount === 0 ? (
                <Text style={styles.emptyText}>No completed orders yet today.</Text>
              ) : (
                <FnbOrdersDonut delivered={stats.deliveredCount} cancelled={stats.cancelledCount} />
              )}
            </View>
          </View>

          <View style={styles.activeOrdersCard}>
            <Text style={styles.topItemsTitle}>Active Orders ({stats.activeOrders.length})</Text>
            {stats.activeOrders.length === 0 ? (
              <Text style={styles.emptyText}>Nothing currently in progress — all caught up.</Text>
            ) : (
              <>
                <View style={styles.activeOrderGrid}>
                  {stats.activeOrders
                    .slice((activeOrdersPage - 1) * ACTIVE_ORDERS_PAGE_SIZE, activeOrdersPage * ACTIVE_ORDERS_PAGE_SIZE)
                    .map((order) => {
                      const meta = STATUS_META[order.status] || STATUS_META.escalated;
                      const itemCount = (order.food_order_items || []).reduce((sum, i) => sum + i.quantity, 0);
                      return (
                        <View key={order.id} style={styles.activeOrderCard}>
                          <View style={styles.activeOrderTopRow}>
                            <View style={styles.activeOrderAvatar}>
                              <Text style={styles.activeOrderAvatarText}>{(order.guest_name || '?').charAt(0).toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.activeOrderName} numberOfLines={1}>{order.guest_name}</Text>
                              <Text style={styles.activeOrderMeta}>Room {order.room_number} · {itemCount} item{itemCount === 1 ? '' : 's'}</Text>
                            </View>
                          </View>
                          <View style={styles.activeOrderBottomRow}>
                            <View style={[styles.activeOrderBadge, { backgroundColor: meta.bg }]}>
                              <Text style={[styles.activeOrderBadgeText, { color: meta.color }]}>{meta.label}</Text>
                            </View>
                            <Text style={styles.activeOrderPrice}>{formatCurrency(order.total_amount)}</Text>
                          </View>
                        </View>
                      );
                    })}
                </View>

                {stats.activeOrders.length > ACTIVE_ORDERS_PAGE_SIZE && (
                  <View style={styles.paginationRow}>
                    <TouchableOpacity
                      style={[styles.pageBtn, activeOrdersPage === 1 && styles.pageBtnDisabled]}
                      onPress={() => setActiveOrdersPage((p) => Math.max(1, p - 1))}
                      disabled={activeOrdersPage === 1}
                    >
                      <Ionicons name="chevron-back" size={16} color={activeOrdersPage === 1 ? colors.disabled : colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.pageLabel}>
                      Page {activeOrdersPage} of {Math.ceil(stats.activeOrders.length / ACTIVE_ORDERS_PAGE_SIZE)}
                    </Text>
                    <TouchableOpacity
                      style={[styles.pageBtn, activeOrdersPage >= Math.ceil(stats.activeOrders.length / ACTIVE_ORDERS_PAGE_SIZE) && styles.pageBtnDisabled]}
                      onPress={() => setActiveOrdersPage((p) => Math.min(Math.ceil(stats.activeOrders.length / ACTIVE_ORDERS_PAGE_SIZE), p + 1))}
                      disabled={activeOrdersPage >= Math.ceil(stats.activeOrders.length / ACTIVE_ORDERS_PAGE_SIZE)}
                    >
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={activeOrdersPage >= Math.ceil(stats.activeOrders.length / ACTIVE_ORDERS_PAGE_SIZE) ? colors.disabled : colors.primary}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14.5, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 25, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  reportsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 10, paddingHorizontal: spacing.lg,
  },
  reportsBtnText: { fontSize: 14.5, fontFamily: fonts.bodySemiBold, color: colors.white },

  bodyScroll: { flex: 1 },
  contentWrap: { width: '100%', padding: spacing.lg, paddingTop: spacing.md },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: {
    flexGrow: 1, flexBasis: 220,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
  },
  statIconWrap: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  statValue: { fontSize: 28, fontFamily: fonts.headingExtraBold, color: colors.primary },
  statLabel: { fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 2 },
  statHint: { fontSize: 12, fontFamily: fonts.body, color: colors.disabled, marginTop: spacing.xs },

  bottomRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },

  topItemsCard: {
    flexGrow: 1, flexBasis: 320,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
  },
  donutCard: {
    flexGrow: 1, flexBasis: 280,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, alignItems: 'center',
  },
  topItemsTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.primary, marginBottom: spacing.md, alignSelf: 'flex-start' },
  topItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  topItemRank: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  topItemRankText: { fontSize: 13.5, fontFamily: fonts.headingBold, color: colors.primary },
  topItemName: { flex: 1, fontSize: 15, fontFamily: fonts.bodyMedium, color: colors.text },
  topItemQty: { fontSize: 14.5, fontFamily: fonts.headingSemiBold, color: colors.primary },

  activeOrdersCard: {
    marginTop: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
  },
  activeOrderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  activeOrderCard: {
    width: '32%',
    backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  activeOrderTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  activeOrderAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  activeOrderAvatarText: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
  activeOrderName: { fontSize: 15, fontFamily: fonts.bodySemiBold, color: colors.text },
  activeOrderMeta: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  activeOrderBottomRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm + 2, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  activeOrderBadge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: spacing.sm + 2 },
  activeOrderBadgeText: { fontSize: 11.5, fontFamily: fonts.bodySemiBold },
  activeOrderPrice: { fontSize: 15, fontFamily: fonts.headingSemiBold, color: colors.primary },

  paginationRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md,
    marginTop: spacing.lg, paddingTop: spacing.sm,
  },
  pageBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageLabel: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.text },
});