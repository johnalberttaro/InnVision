import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import KpiCard from '../../components/dashboard/KpiCard';
import ConfirmDialog from '../../components/shared/ConfirmDialog';

/**
 * FoodOrdersScreen — Food & Dining, Phase 2 of the Food Service module.
 *
 * Phase 1 (OrderFoodScreen.jsx) let a guest place a food order, but
 * nothing after that existed — every order just sat at status =
 * 'pending' forever, invisible to staff. This screen is that missing
 * piece for Front Desk: see every incoming order in real time, and
 * ESCALATE it to Kitchen/F&B.
 *
 * "Escalate" is the key action here — it's what hands the order off to
 * the next stage of the real workflow (Phase 3: a Kitchen/F&B portal,
 * a new role, not built yet). Escalating just flips
 * food_orders.status from 'pending' to 'escalated' — there's nothing
 * beyond that status change for Front Desk to do; once it's escalated,
 * Kitchen/F&B takes over (or will, once Phase 3 exists — until then,
 * escalated orders simply sit at that status, same as pending orders
 * did before this screen existed).
 *
 * RLS note: the food_orders policies were written forward-looking back
 * in Phase 1's migration (001_food_service_phase1.sql) specifically so
 * Front Desk could read/update orders as soon as this screen existed —
 * no new migration was needed to build this.
 *
 * "Cancel Order" is included too (a front desk staff member fielding a
 * phone call — "guest wants to cancel" — needs a way to actually do
 * that) and goes through the shared ConfirmDialog component, since
 * cancelling is a real, slightly consequential action worth a
 * confirmation step, same reasoning as the logout confirmation
 * elsewhere in the app.
 *
 * Props:
 *  - staffUid, staffName: the signed-in front desk user (not currently
 *    stored on the order itself, but kept for parity with the other
 *    Front Desk screens and for a future "escalated by" field if that
 *    turns out to matter).
 */
const STATUS_META = {
  pending: { label: 'New Order', color: '#B3792A', bg: '#F5E9D6' },
  escalated: { label: 'Sent to Kitchen', color: '#2C5EA8', bg: '#E3ECF8' },
  preparing: { label: 'Preparing', color: '#8A5CB0', bg: '#EEE3F5' },
  out_for_delivery: { label: 'Out for Delivery', color: '#B3792A', bg: '#F5E9D6' },
  delivered: { label: 'Delivered', color: '#1E7B34', bg: '#DFF5E1' },
  cancelled: { label: 'Cancelled', color: '#B3261E', bg: '#FBE7E7' },
};

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'New' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'payment_pending', label: 'Payment Pending' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FoodOrdersScreen({ staffUid, staffName }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('active');
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null); // order being confirmed for cancellation
  const [actionError, setActionError] = useState('');

  const orderToCamel = (row) => ({
    id: row.id,
    reservationId: row.reservation_id,
    guestName: row.guest_name,
    roomNumber: row.room_number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    notes: row.notes,
    totalAmount: row.total_amount,
    placedBy: row.placed_by,
    createdAt: row.created_at,
    items: (row.food_order_items || []).map((i) => ({
      id: i.id,
      name: i.item_name,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      subtotal: i.subtotal,
    })),
  });

  useEffect(() => {
    const loadOrders = async () => {
      const { data, error } = await supabase
        .from('food_orders')
        .select('*, food_order_items(*)')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load food orders:', error);
        setLoading(false);
        return;
      }
      setOrders((data || []).map(orderToCamel));
      setLoading(false);
    };
    loadOrders();

    const channel = supabase
      .channel('food-orders-frontdesk')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_orders' }, loadOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_order_items' }, loadOrders)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── KPIs ─────────────────────────────────────────────────────────────
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const escalatedCount = orders.filter((o) => o.status === 'escalated').length;
  const paymentPendingCount = orders.filter((o) => o.status === 'delivered' && o.paymentStatus === 'pending_confirmation').length;
  const deliveredTodayCount = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter((o) => o.status === 'delivered' && new Date(o.createdAt).toDateString() === today).length;
  }, [orders]);

  // ── Filtering ────────────────────────────────────────────────────────
  const visibleOrders = useMemo(() => {
    if (activeFilter === 'all') return orders;
    if (activeFilter === 'active') return orders.filter((o) => ['pending', 'escalated', 'preparing', 'out_for_delivery'].includes(o.status));
    if (activeFilter === 'payment_pending') return orders.filter((o) => o.status === 'delivered' && o.paymentStatus === 'pending_confirmation');
    return orders.filter((o) => o.status === activeFilter);
  }, [orders, activeFilter]);

  const handleEscalate = async (order) => {
    setBusyOrderId(order.id);
    setActionError('');
    try {
      const { error } = await supabase.from('food_orders').update({ status: 'escalated' }).eq('id', order.id);
      if (error) throw error;
      // Update our own view immediately rather than waiting on the
      // realtime round-trip — this succeeded, no reason to wait to see
      // it reflected on the very screen that just did it.
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'escalated' } : o)));
    } catch (err) {
      console.error('Failed to escalate order:', err);
      setActionError(err?.message || 'Could not escalate this order. Please try again.');
    } finally {
      setBusyOrderId(null);
    }
  };

  // Cash orders are marked paid by F&B directly on delivery — nothing
  // to reconcile. E-wallet orders land here at payment_status =
  // 'pending_confirmation' (see KitchenOrdersScreen.jsx's
  // submitDelivered) because that money goes into the hotel's actual
  // account, which Front Desk verifies, same as e-wallet payments for
  // room bookings already go through this kind of check rather than
  // being self-reported by whoever collected it.
  const handleConfirmPayment = async (order) => {
    setBusyOrderId(order.id);
    setActionError('');
    try {
      const { error } = await supabase.from('food_orders').update({ payment_status: 'paid' }).eq('id', order.id);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, paymentStatus: 'paid' } : o)));
    } catch (err) {
      console.error('Failed to confirm payment:', err);
      setActionError(err?.message || 'Could not confirm this payment. Please try again.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setBusyOrderId(cancelTarget.id);
    setActionError('');
    try {
      const { error } = await supabase.from('food_orders').update({ status: 'cancelled' }).eq('id', cancelTarget.id);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => (o.id === cancelTarget.id ? { ...o, status: 'cancelled' } : o)));
    } catch (err) {
      console.error('Failed to cancel order:', err);
      setActionError(err?.message || 'Could not cancel this order. Please try again.');
    } finally {
      setBusyOrderId(null);
      setCancelTarget(null);
    }
  };

  const itemsSummary = (items) => items.map((i) => `${i.quantity}× ${i.name}`).join(', ');

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
          <Text style={styles.title}>Food Orders</Text>
          <Text style={styles.subtitle}>Incoming room service orders — escalate them to Kitchen/F&B.</Text>
        </View>
      </View>

      {!!actionError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#B3261E" />
          <Text style={styles.errorBannerText}>{actionError}</Text>
          <TouchableOpacity onPress={() => setActionError('')}>
            <Ionicons name="close" size={16} color="#B3261E" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.kpiRow}>
        <KpiCard icon="restaurant-outline" label="New Orders" value={String(pendingCount)} accent="#B3792A" />
        <KpiCard icon="arrow-redo-outline" label="Sent to Kitchen" value={String(escalatedCount)} accent="#2C5EA8" />
        <KpiCard icon="wallet-outline" label="Payment Pending" value={String(paymentPendingCount)} accent="#B3261E" />
        <KpiCard icon="checkmark-done-outline" label="Delivered Today" value={String(deliveredTodayCount)} accent="#1E7B34" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.list, isWide && styles.listWide]}>
        {visibleOrders.length === 0 ? (
          <Text style={styles.emptyText}>No orders in this view.</Text>
        ) : (
          visibleOrders.map((order) => {
            const meta = STATUS_META[order.status] || STATUS_META.pending;
            const isBusy = busyOrderId === order.id;
            return (
              <View key={order.id} style={[styles.orderCard, isWide && styles.orderCardWide]}>
                <View style={styles.orderTopRow}>
                  <View style={styles.roomBadge}>
                    <Ionicons name="bed-outline" size={12} color={colors.white} />
                    <Text style={styles.roomBadgeText}>Room {order.roomNumber}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                <Text style={styles.guestName}>{order.guestName}</Text>
                <Text style={styles.itemsSummary} numberOfLines={2}>{itemsSummary(order.items)}</Text>
                {!!order.notes && <Text style={styles.orderNotes}>"{order.notes}"</Text>}

                <View style={styles.orderBottomRow}>
                  <Text style={styles.orderMeta}>
                    {order.placedBy === 'frontdesk' ? 'Walk-in · ' : ''}{timeAgo(order.createdAt)}
                  </Text>
                  <Text style={styles.orderTotal}>{formatCurrency(order.totalAmount)}</Text>
                </View>

                {order.status === 'delivered' && order.paymentStatus === 'pending_confirmation' && (
                  <>
                    <View style={styles.paymentPendingBadge}>
                      <Ionicons name="wallet-outline" size={12} color="#B3261E" />
                      <Text style={styles.paymentPendingText}>E-wallet — awaiting confirmation</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.confirmPaymentBtn}
                      onPress={() => handleConfirmPayment(order)}
                      disabled={isBusy}
                      activeOpacity={0.85}
                    >
                      {isBusy
                        ? <ActivityIndicator color={colors.white} size="small" />
                        : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={14} color={colors.white} />
                            <Text style={styles.escalateBtnText}>Confirm Payment Received</Text>
                          </>
                        )
                      }
                    </TouchableOpacity>
                  </>
                )}

                {order.status === 'pending' && (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setCancelTarget(order)}
                      disabled={isBusy}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.escalateBtn}
                      onPress={() => handleEscalate(order)}
                      disabled={isBusy}
                      activeOpacity={0.85}
                    >
                      {isBusy
                        ? <ActivityIndicator color={colors.white} size="small" />
                        : (
                          <>
                            <Text style={styles.escalateBtnText}>Escalate to Kitchen</Text>
                            <Ionicons name="arrow-redo-outline" size={14} color={colors.white} />
                          </>
                        )
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!cancelTarget}
        title="Cancel this order?"
        message={cancelTarget ? `This will cancel the order for Room ${cancelTarget.roomNumber} (${cancelTarget.guestName}). This can't be undone.` : ''}
        confirmLabel="Yes, Cancel Order"
        cancelLabel="No"
        destructive
        onCancel={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', padding: spacing.lg },

  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FBE7E7', marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: radius.md, padding: spacing.sm,
  },
  errorBannerText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodyMedium, color: '#B3261E' },

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.lg, paddingBottom: 0 },

  filterRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexGrow: 0 },
  filterRowContent: { flexDirection: 'row', gap: spacing.xs },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.md, backgroundColor: colors.cardAlt },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text },
  filterChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  list: { padding: spacing.lg, paddingTop: 0, gap: spacing.md },
  listWide: { flexDirection: 'row', flexWrap: 'wrap' },

  orderCard: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  orderCardWide: { width: '32%' },

  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  roomBadgeText: { fontSize: 11, fontFamily: fonts.headingSemiBold, color: colors.white },
  statusBadge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold },

  guestName: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text, marginTop: spacing.sm },
  itemsSummary: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  orderNotes: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs },

  orderBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  orderMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  orderTotal: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.primary },

  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.sm - 2, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  escalateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.sm - 2,
  },
  escalateBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  paymentPendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FBE7E7', borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start', marginTop: spacing.sm,
  },
  paymentPendingText: { fontSize: 10.5, fontFamily: fonts.bodySemiBold, color: '#B3261E' },
  confirmPaymentBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#1E7B34', borderRadius: 999, paddingVertical: spacing.sm - 2, marginTop: spacing.sm,
  },
});