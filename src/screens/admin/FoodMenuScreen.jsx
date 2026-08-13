import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import AddFoodItemScreen from './AddFoodItemScreen';

const CATEGORY_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Main', 'Beverages', 'Dessert', 'Snacks'];
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
function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAGE_SIZE = 6;

// Chunks an array into pairs — [[a,b],[c,d],[e]] — for the two-column
// category layout below.
function pairUp(list) {
  const pairs = [];
  for (let i = 0; i < list.length; i += 2) pairs.push(list.slice(i, i + 2));
  return pairs;
}

/**
 * FoodMenuScreen — Admin's food menu management screen. Completes the
 * "Phase 4" plan noted since 001_food_service_phase1.sql's very first
 * comment: until now, creating or editing a menu item meant going into
 * Supabase's Table Editor directly. This is the actual in-app screen.
 *
 * Create/edit itself lives in AddFoodItemScreen.jsx (a real photo
 * upload to the food-menu-images Storage bucket, same pattern
 * AddRoomTypeScreen.jsx already established for room types). This
 * screen is the list + a quick availability toggle per card (admin
 * already has full UPDATE access via food_menu_items_admin_all from
 * 001, so this needs no new RLS) + delete + the entry point into the
 * create/edit form.
 *
 * Deleting a menu item is safe even if it's part of past orders —
 * food_order_items.menu_item_id is ON DELETE SET NULL, and every order
 * line already snapshots its own item_name/unit_price/subtotal at the
 * time it was ordered (see 001's own comment on that table), so order
 * history stays intact either way.
 */
export default function FoodMenuScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState('');
  const [toggleBusyId, setToggleBusyId] = useState(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadItems = async () => {
    const { data, error } = await supabase.from('food_menu_items').select('*').order('name');
    if (error) {
      console.error('Failed to load menu items:', error);
      setLoading(false);
      return;
    }
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
    const channel = supabase
      .channel('admin-food-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_menu_items' }, loadItems)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => { setPage(1); }, [activeCategory, searchQuery]);

  const categoryTabs = useMemo(() => {
    const present = new Set(items.map((i) => i.category || 'Main'));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extra = [...present].filter((c) => !CATEGORY_ORDER.includes(c));
    return ['All', ...ordered, ...extra];
  }, [items]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (activeCategory !== 'All') list = list.filter((i) => (i.category || 'Main') === activeCategory);
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((i) => (i.name || '').toLowerCase().includes(q));
    return list;
  }, [items, activeCategory, searchQuery]);

  // Pagination only applies when a specific category is selected — on
  // "All", every category should actually show, not get cut short
  // after PAGE_SIZE items regardless of how many categories those
  // happen to span.
  const paginating = activeCategory !== 'All';
  const totalPages = paginating ? Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE)) : 1;
  const currentPageItems = useMemo(() => {
    if (!paginating) return visibleItems;
    const start = (page - 1) * PAGE_SIZE;
    return visibleItems.slice(start, start + PAGE_SIZE);
  }, [visibleItems, page, paginating]);

  const groupedItems = useMemo(() => {
    const groups = {};
    for (const item of currentPageItems) {
      const cat = item.category || 'Main';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    const ordered = [...CATEGORY_ORDER, ...Object.keys(groups).filter((c) => !CATEGORY_ORDER.includes(c))];
    return ordered.filter((c) => groups[c]?.length).map((c) => ({ category: c, items: groups[c] }));
  }, [currentPageItems]);

  const availableCount = items.filter((i) => i.available).length;
  const unavailableCount = items.filter((i) => !i.available).length;

  const openCreate = () => { setEditingItem(null); setFormVisible(true); };
  const openEdit = (item) => { setEditingItem(item); setFormVisible(true); };

  const toggleAvailability = async (item) => {
    setToggleBusyId(item.id);
    setActionError('');
    const nextAvailable = !item.available;
    try {
      const { error } = await supabase.from('food_menu_items').update({ available: nextAvailable }).eq('id', item.id);
      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: nextAvailable } : i)));
    } catch (err) {
      console.error('Failed to update menu item availability:', err);
      setActionError(err?.message || `Could not update "${item.name}". Please try again.`);
    } finally {
      setToggleBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError('');
    try {
      const { error } = await supabase.from('food_menu_items').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete menu item:', err);
      setActionError(err?.message || `Could not delete "${deleteTarget.name}". Please try again.`);
    } finally {
      setDeleting(false);
    }
  };

  const renderMenuCard = (item) => {
    const isTogglingThis = toggleBusyId === item.id;
    return (
      <View key={item.id} style={[styles.itemCard, !item.available && styles.itemCardDim]}>
        <View style={styles.itemCardTop}>
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.itemThumb} />
          ) : (
            <View style={[styles.itemThumb, styles.itemThumbFallback]}>
              <Ionicons name={categoryIcon(item.category)} size={24} color={colors.primary} style={{ opacity: 0.5 }} />
            </View>
          )}
          <View style={styles.itemBody}>
            <View style={styles.itemNameRow}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <View style={styles.itemActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
                  <Ionicons name="pencil-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteTarget(item)}>
                  <Ionicons name="trash-outline" size={14} color="#B3261E" />
                </TouchableOpacity>
              </View>
            </View>
            {!!item.description && <Text style={styles.itemDescription} numberOfLines={2}>{item.description}</Text>}
            <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
          </View>
        </View>

        <View style={styles.availBadgeWrap}>
          <TouchableOpacity
            style={[styles.availBadge, item.available ? styles.availBadgeOn : styles.availBadgeOff]}
            onPress={() => toggleAvailability(item)}
            disabled={isTogglingThis}
            activeOpacity={0.8}
          >
            {isTogglingThis
              ? <ActivityIndicator color={item.available ? '#1E7B34' : '#B3261E'} size="small" />
              : (
                <Text style={[styles.availBadgeText, item.available ? styles.availBadgeTextOn : styles.availBadgeTextOff]}>
                  {item.available ? 'Available' : 'Unavailable'}
                </Text>
              )
            }
          </TouchableOpacity>
        </View>
      </View>
    );
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
          <Text style={styles.title}>Food Menu</Text>
          <Text style={styles.subtitle}>Create, edit, and remove dishes from Room Service.</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search menu items"
              placeholderTextColor={colors.disabled}
            />
            {!!searchQuery && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.disabled} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.addBtnText}>Add New Dish</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Summary strip ────────────────────────────────────────────── */}
      <View style={styles.summaryStrip}>
        <View style={[styles.summaryPill, styles.summaryPillNeutral]}>
          <Ionicons name="fast-food-outline" size={14} color={colors.primary} />
          <Text style={styles.summaryPillText}>Total Items: <Text style={styles.summaryPillNum}>{items.length}</Text></Text>
        </View>
        <View style={[styles.summaryPill, styles.summaryPillGreen]}>
          <Ionicons name="checkmark-circle" size={14} color="#1E7B34" />
          <Text style={[styles.summaryPillText, { color: '#1E7B34' }]}>Available: <Text style={styles.summaryPillNum}>{availableCount}</Text></Text>
        </View>
        <View style={[styles.summaryPill, styles.summaryPillRed]}>
          <Ionicons name="close-circle" size={14} color="#B3261E" />
          <Text style={[styles.summaryPillText, { color: '#B3261E' }]}>Unavailable: <Text style={styles.summaryPillNum}>{unavailableCount}</Text></Text>
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

      {/* ── Category filter tabs ─────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={styles.tabsRowContent}>
        {categoryTabs.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryTab, activeCategory === cat && styles.categoryTabActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.categoryTabText, activeCategory === cat && styles.categoryTabTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.bodyScroll} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.contentWrap}>
          {groupedItems.length === 0 ? (
            <Text style={styles.emptyText}>
              {searchQuery || activeCategory !== 'All' ? 'No menu items match this view.' : 'No menu items yet — add your first dish above.'}
            </Text>
          ) : (
            // Paired into rows of two categories side by side (Breakfast |
            // Lunch, Dinner | Main, ...) rather than one full-width
            // category section per row — uses the available width on a
            // wide admin screen instead of leaving half of it empty next
            // to a single narrow column of cards.
            pairUp(groupedItems).map((pair, i) => (
              <View key={i} style={styles.categoryRow}>
                {pair.map((group) => (
                  <View key={group.category} style={styles.categoryColumn}>
                    <Text style={styles.categoryLabel}>{group.category}</Text>
                    <View style={styles.itemGrid}>
                      {group.items.map((item) => renderMenuCard(item))}
                    </View>
                  </View>
                ))}
                {/* Odd number of categories on the last row — an empty
                    spacer keeps the single remaining column from
                    stretching to fill the whole row width. */}
                {pair.length === 1 && <View style={styles.categoryColumn} />}
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

      <AddFoodItemScreen
        visible={formVisible}
        editingItem={editingItem}
        onClose={() => setFormVisible(false)}
        onSaved={loadItems}
      />

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete Dish?"
        message={`Remove "${deleteTarget?.name}" from the menu? Past orders that included it aren't affected.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', padding: spacing.lg },

  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 21, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  headerRight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 9,
    minWidth: 200, maxWidth: 260,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text, padding: 0 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 9, paddingHorizontal: spacing.md,
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

  // ── Summary strip ─────────────────────────────────────────────────────
  summaryStrip: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  summaryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 999, paddingVertical: 7, paddingHorizontal: spacing.md, borderWidth: 1,
  },
  summaryPillNeutral: { backgroundColor: colors.cardAlt, borderColor: colors.border },
  summaryPillGreen: { backgroundColor: '#DFF5E1', borderColor: '#B7E4BE' },
  summaryPillRed: { backgroundColor: '#FBE7E7', borderColor: '#F0C4C4' },
  summaryPillText: { fontSize: 12.5, fontFamily: fonts.bodyMedium, color: colors.primary },
  summaryPillNum: { fontFamily: fonts.headingBold },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FBE7E7', marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: radius.md, padding: spacing.sm,
  },
  errorBannerText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodyMedium, color: '#B3261E' },

  // ── Category tabs ─────────────────────────────────────────────────────
  tabsRow: { flexGrow: 0, marginTop: spacing.sm },
  tabsRowContent: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  categoryTab: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: colors.cardAlt },
  categoryTabActive: { backgroundColor: colors.primary },
  categoryTabText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  categoryTabTextActive: { color: colors.white },

  bodyScroll: { flex: 1 },
  contentWrap: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: spacing.lg, paddingTop: 0 },

  categoryRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  categoryColumn: { flex: 1, minWidth: 0 },
  categoryLabel: {
    fontSize: 14, fontFamily: fonts.headingBold, color: colors.primary,
    marginBottom: spacing.sm, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },

  itemCard: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm + 2,
    flexGrow: 1, flexBasis: 300, maxWidth: 400,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  itemCardDim: { opacity: 0.6 },
  itemCardTop: { flexDirection: 'row', gap: spacing.sm },
  itemThumb: { width: 56, height: 56, borderRadius: 12 },
  itemThumbFallback: { backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1 },
  itemNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.xs },
  itemName: { flex: 1, fontSize: 13.5, fontFamily: fonts.headingSemiBold, color: colors.text },
  itemPrice: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.primary, marginTop: 4 },
  itemDescription: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  itemActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt,
  },

  // ── Availability badge (tappable — toggles on press) ────────────────
  availBadgeWrap: {
    alignItems: 'center', marginTop: spacing.sm + 2, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  availBadge: {
    minWidth: 90, alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.md,
  },
  availBadgeOn: { backgroundColor: '#DFF5E1' },
  availBadgeOff: { backgroundColor: '#FBE7E7' },
  availBadgeText: { fontSize: 12, fontFamily: fonts.bodySemiBold },
  availBadgeTextOn: { color: '#1E7B34' },
  availBadgeTextOff: { color: '#B3261E' },

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
});