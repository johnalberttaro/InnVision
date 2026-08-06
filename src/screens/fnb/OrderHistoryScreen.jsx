import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// Groups a list of orders under "Today" / "Yesterday" / an actual date
// heading, in that order — orders are already sorted newest-first, so
// this preserves that order within and across groups.
function groupByDate(items) {
  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
  const groups = [];
  const indexByLabel = {};

  for (const order of items) {
    const d = new Date(order.createdAt);
    const dStr = d.toDateString();
    let label;
    if (dStr === todayStr) label = `Today — ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    else if (dStr === yesterdayStr) label = `Yesterday — ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    if (!(label in indexByLabel)) {
      indexByLabel[label] = groups.length;
      groups.push({ label, orders: [] });
    }
    groups[indexByLabel[label]].orders.push(order);
  }
  return groups;
}

// Same branded bill layout KitchenOrdersScreen.jsx's own "Generate
// Bill" uses — kept here too (rather than importing it, since these
// two screens deliberately don't share a common file yet) so a
// delivered order's bill can still be reprinted for record-keeping.
function buildBillHTML(order) {
  const itemRows = order.items.map((i) => `
    <div class="row">
      <span class="label">${i.quantity}× ${escapeHtml(i.name)}</span>
      <span class="value">${formatCurrency(i.subtotal)}</span>
    </div>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Bill — Room ${escapeHtml(order.roomNumber)}</title>
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 40px; color: #1A1A1A; }
          .header { border-bottom: 3px solid #093173; padding-bottom: 16px; margin-bottom: 24px; }
          .hotel-name { font-size: 22px; font-weight: 800; color: #093173; }
          .bill-title { font-size: 14px; color: #734A09; font-weight: 600; margin-top: 4px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .label { color: #666; font-size: 13px; }
          .value { font-weight: 600; font-size: 13px; }
          .amount-row { margin-top: 16px; padding: 16px; background: #FAF6EF; border-radius: 8px; }
          .amount-value { font-size: 24px; font-weight: 800; color: #093173; }
          .note { margin-top: 24px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="hotel-name">InnVision</div>
          <div class="bill-title">Room Service Bill — Room ${escapeHtml(order.roomNumber)}</div>
        </div>
        <div class="row"><span class="label">Guest Name</span><span class="value">${escapeHtml(order.guestName) || '—'}</span></div>
        <div class="row"><span class="label">Order Placed</span><span class="value">${new Date(order.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
        ${itemRows}
        <div class="amount-row">
          <div class="label">Total Due</div>
          <div class="amount-value">${formatCurrency(order.totalAmount)}</div>
        </div>
        <div class="note">Reprinted from Order History.</div>
      </body>
    </html>
  `;
}

const CATEGORY_ICON = {
  Breakfast: 'sunny-outline',
  Lunch: 'partly-sunny-outline',
  Dinner: 'moon-outline',
  Main: 'restaurant-outline',
  Snacks: 'fast-food-outline',
  Dessert: 'ice-cream-outline',
  Beverages: 'cafe-outline',
};
function categoryIcon(category) {
  return CATEGORY_ICON[category] || 'restaurant-outline';
}

const STATUS_META = {
  delivered: { label: 'Delivered', color: '#1E7B34', bg: '#DFF5E1' },
  cancelled: { label: 'Cancelled', color: '#B3261E', bg: '#FBE7E7' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

// Quick date-range presets rather than a full custom calendar picker —
// covers the same real need (narrowing down a growing history list)
// without building a date-picker component from scratch.
const RANGE_FILTERS = [
  { key: 'all', label: 'All Time' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

const PAGE_SIZE = 8;

/**
 * OrderHistoryScreen — Food & Dining, Kitchen/F&B portal. A read-only
 * look back at completed work: every order that reached 'delivered' or
 * 'cancelled'. Split out from KitchenOrdersScreen.jsx (which used to
 * show this as a section at the bottom) into its own sidebar item, so
 * Kitchen Orders itself stays focused on the three active workflow
 * stages.
 *
 * Orders are grouped under "Today" / "Yesterday" / an actual date
 * heading, and paginated (PAGE_SIZE per page) — the flat, filtered
 * list is paginated FIRST, then only the current page's orders get
 * grouped into date headings, so a date group never gets silently
 * split awkwardly across two pages.
 *
 * No action buttons here on purpose — a delivered or cancelled order
 * has nothing left to DO, only to look back on. The one exception is
 * "Reprint Bill", kept available so a delivered order's bill can be
 * reprinted for record-keeping if needed. There's deliberately no
 * separate "View Details" button — every real detail an order has
 * (items, price, qty, status, who delivered it) is already visible
 * directly on the card; a details view would just repeat it.
 *
 * Props:
 *  - staffUid, staffName: the signed-in Kitchen/F&B user (kept for
 *    parity with KitchenOrdersScreen.jsx, not currently used directly).
 */
export default function OrderHistoryScreen({ staffUid, staffName }) {
  const { width } = useWindowDimensions();
  // Exactly three cards per row on desktop — below this, one column,
  // since three columns would be cramped on a tablet or phone.
  const isWide = width >= 860;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const orderToCamel = (row) => ({
    id: row.id,
    guestName: row.guest_name,
    roomNumber: row.room_number,
    status: row.status,
    notes: row.notes,
    totalAmount: row.total_amount,
    assignedToName: row.assigned_to_name,
    createdAt: row.created_at,
    items: (row.food_order_items || []).map((i) => ({
      id: i.id,
      name: i.item_name,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      subtotal: i.subtotal,
      photoUrl: i.food_menu_items?.photo_url || null,
      category: i.food_menu_items?.category || null,
    })),
  });

  useEffect(() => {
    const loadOrders = async () => {
      const { data, error } = await supabase
        .from('food_orders')
        .select('*, food_order_items(*, food_menu_items(photo_url, category))')
        .in('status', ['delivered', 'cancelled'])
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load order history:', error);
        setLoading(false);
        return;
      }
      setOrders((data || []).map(orderToCamel));
      setLoading(false);
    };
    loadOrders();

    const channel = supabase
      .channel('food-order-history-kitchen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_orders' }, loadOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_order_items' }, loadOrders)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Reset to page 1 whenever a filter actually changes what's visible
  // — otherwise you could land on, say, page 3 of a filtered view that
  // only has one page's worth of results.
  useEffect(() => { setPage(1); }, [historyFilter, rangeFilter, searchQuery]);

  const visibleOrders = useMemo(() => {
    let list = historyFilter === 'all' ? orders : orders.filter((o) => o.status === historyFilter);

    if (rangeFilter !== 'all') {
      const now = Date.now();
      const windowMs = rangeFilter === 'week' ? 7 * 86400000 : 30 * 86400000;
      list = list.filter((o) => now - new Date(o.createdAt).getTime() <= windowMs);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        (o.guestName || '').toLowerCase().includes(q) ||
        (o.roomNumber || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, historyFilter, rangeFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(visibleOrders.length / PAGE_SIZE));
  const currentPageOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleOrders.slice(start, start + PAGE_SIZE);
  }, [visibleOrders, page]);
  const dateGroups = useMemo(() => groupByDate(currentPageOrders), [currentPageOrders]);

  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length;

  const handlePrintBill = (order) => {
    if (Platform.OS !== 'web') {
      window?.alert
        ? window.alert('Printing is only available on web right now.')
        : console.warn('Printing is only available on web right now.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(buildBillHTML(order));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

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
          <Text style={styles.title}>Order History</Text>
          <Text style={styles.subtitle}>Review past orders that have been delivered or cancelled.</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.rangeRow}>
            {RANGE_FILTERS.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.rangeChip, rangeFilter === r.key && styles.rangeChipActive]}
                onPress={() => setRangeFilter(r.key)}
              >
                <Text style={[styles.rangeChipText, rangeFilter === r.key && styles.rangeChipTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by guest name or room"
              placeholderTextColor={colors.disabled}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.disabled} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <ScrollView style={styles.bodyScroll} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.contentWrap}>
          <View style={styles.filterRowContent}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, historyFilter === f.key && styles.filterChipActive]}
                onPress={() => setHistoryFilter(f.key)}
              >
                <Text style={[styles.filterChipText, historyFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {visibleOrders.length === 0 ? (
            <Text style={styles.emptyText}>No orders in this view.</Text>
          ) : (
            dateGroups.map((group) => (
              <View key={group.label} style={styles.dateGroup}>
                <Text style={styles.dateGroupLabel}>{group.label}</Text>
                <View style={styles.list}>
                  {group.orders.map((order) => {
                    const meta = STATUS_META[order.status] || STATUS_META.delivered;
                    return (
                      <View key={order.id} style={[styles.orderCard, isWide && styles.orderCardWide]}>
                        <View style={styles.orderTopRow}>
                          <View style={styles.roomBadge}>
                            <Ionicons name="bed-outline" size={12} color={colors.white} />
                            <Text style={styles.roomBadgeText}>Room {order.roomNumber}</Text>
                          </View>
                          <View style={styles.orderTopRight}>
                            <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                              <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                            </View>
                            <View style={styles.guestAvatar}>
                              <Text style={styles.guestAvatarText}>{(order.guestName || '?').charAt(0).toUpperCase()}</Text>
                            </View>
                          </View>
                        </View>

                        <Text style={styles.guestName}>{order.guestName}</Text>

                        <View style={styles.itemsList}>
                          {order.items.map((item) => (
                            <View key={item.id} style={styles.itemRow}>
                              {item.photoUrl ? (
                                <Image source={{ uri: item.photoUrl }} style={styles.itemThumb} />
                              ) : (
                                <View style={[styles.itemThumb, styles.itemThumbFallback]}>
                                  <Ionicons name={categoryIcon(item.category)} size={16} color={colors.primary} style={{ opacity: 0.5 }} />
                                </View>
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.itemMeta}>{formatCurrency(item.unitPrice)} · Qty: {item.quantity}</Text>
                              </View>
                            </View>
                          ))}
                        </View>

                        {!!order.notes && <Text style={styles.orderNotes}>"{order.notes}"</Text>}

                        {!!order.assignedToName && (
                          <View style={styles.assigneeRow}>
                            <Ionicons name="person-circle-outline" size={14} color={colors.textMuted} />
                            <Text style={styles.assigneeText}>Delivered by: {order.assignedToName}</Text>
                          </View>
                        )}

                        <View style={styles.orderBottomRow}>
                          <Text style={styles.orderMeta}>
                            ×{order.items.reduce((sum, i) => sum + i.quantity, 0)} items · {timeAgo(order.createdAt)}
                          </Text>
                          <Text style={styles.orderTotal}>{formatCurrency(order.totalAmount)}</Text>
                        </View>

                        {order.status === 'delivered' && (
                          <TouchableOpacity
                            style={styles.billBtn}
                            onPress={() => handlePrintBill(order)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="receipt-outline" size={16} color={colors.white} />
                            <Text style={styles.billBtnText}>Reprint Bill</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          {totalPages > 1 && (
            <View style={styles.paginationRow}>
              <TouchableOpacity
                style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <Ionicons name="chevron-back" size={16} color={page === 1 ? colors.disabled : colors.primary} />
              </TouchableOpacity>
              <Text style={styles.pageLabel}>Page {page} of {totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <Ionicons name="chevron-forward" size={16} color={page === totalPages ? colors.disabled : colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Summary footer ───────────────────────────────────────────── */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryBarTotal}>Total Orders <Text style={styles.summaryBarTotalNum}>{orders.length}</Text></Text>
        <View style={styles.summaryBarDivider} />
        <View style={styles.summaryBarItem}>
          <View style={[styles.summaryBarDot, { backgroundColor: '#1E7B34' }]} />
          <Text style={styles.summaryBarItemText}>Delivered {deliveredCount}</Text>
        </View>
        <View style={styles.summaryBarDivider} />
        <View style={styles.summaryBarItem}>
          <View style={[styles.summaryBarDot, { backgroundColor: '#B3261E' }]} />
          <Text style={styles.summaryBarItemText}>Cancelled {cancelledCount}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', padding: spacing.lg },

  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 21, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  headerRight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  rangeRow: { flexDirection: 'row', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 999, padding: 3 },
  rangeChip: { paddingVertical: 5, paddingHorizontal: spacing.sm + 2, borderRadius: 999 },
  rangeChipActive: { backgroundColor: colors.primary },
  rangeChipText: { fontSize: 11.5, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  rangeChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 9,
    minWidth: 220, maxWidth: 300,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text, padding: 0 },

  bodyScroll: { flex: 1 },
  contentWrap: { width: '100%', maxWidth: 1500, alignSelf: 'center', padding: spacing.lg },

  filterRowContent: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.md, backgroundColor: colors.white },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text },
  filterChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  dateGroup: { marginBottom: spacing.md },
  dateGroupLabel: {
    fontSize: 14, fontFamily: fonts.headingBold, color: colors.primary,
    marginBottom: spacing.sm, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },

  list: { gap: spacing.md, flexDirection: 'row', flexWrap: 'wrap' },

  orderCard: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  // Three columns — width is slightly under a third so, combined with
  // list's own gap, three cards plus their gaps fit exactly without
  // wrapping a 4th down. A plain percentage (not calc()) since calc()
  // strings only work on web, not the native iOS/Android build.
  orderCardWide: { width: '32%' },

  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  roomBadgeText: { fontSize: 11, fontFamily: fonts.headingSemiBold, color: colors.white },
  orderTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusBadge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold },
  guestAvatar: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  guestAvatarText: { fontSize: 11, fontFamily: fonts.headingBold, color: colors.primary },

  guestName: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text, marginTop: spacing.sm - 2 },

  itemsList: { marginTop: spacing.sm - 2, gap: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemThumb: { width: 36, height: 36, borderRadius: 10 },
  itemThumbFallback: { backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  itemMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },

  orderNotes: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', marginTop: 3 },

  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  assigneeText: { fontSize: 11.5, fontFamily: fonts.bodyMedium, color: colors.textMuted },

  orderBottomRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm, paddingTop: spacing.sm - 2, borderTopWidth: 1, borderTopColor: colors.border,
  },
  orderMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  orderTotal: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },

  billBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 999, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  billBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

  // ── Pagination ──────────────────────────────────────────────────────
  paginationRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md,
    marginTop: spacing.md, paddingVertical: spacing.sm,
  },
  pageBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },

  // ── Summary footer ────────────────────────────────────────────────────
  summaryBar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
  summaryBarTotal: { fontSize: 13.5, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  summaryBarTotalNum: { fontFamily: fonts.headingBold, color: colors.primary },
  summaryBarDivider: { width: 1, height: 16, backgroundColor: colors.border },
  summaryBarItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryBarDot: { width: 8, height: 8, borderRadius: 4 },
  summaryBarItemText: { fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.text },
});