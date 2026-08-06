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
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

// Same category ordering OrderFoodScreen.jsx's guest-facing menu grid
// uses — kept consistent rather than inventing a different order here.
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

const AVAILABILITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'unavailable', label: 'Unavailable' },
];

const PAGE_SIZE = 9;

// A real sliding switch (track + thumb that animates left/right)
// rather than a plain button — React Native's built-in Switch renders
// very differently across iOS/Android/Web, so this is a small custom
// one instead, kept visually consistent with the rest of the app.
function AvailabilitySwitch({ value, onToggle, busy }) {
  const anim = React.useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 150, useNativeDriver: false }).start();
  }, [value]);

  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: ['#B3261E', '#1E7B34'] });
  const thumbLeft = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 27] });

  return (
    <TouchableOpacity onPress={onToggle} disabled={busy} activeOpacity={0.8} style={styles.switchRow}>
      <Animated.View style={[styles.switchTrack, { backgroundColor: trackColor }]}>
        {busy
          ? <ActivityIndicator color={colors.white} size="small" style={styles.switchSpinner} />
          : <Animated.View style={[styles.switchThumb, { left: thumbLeft }]} />
        }
      </Animated.View>
      <Text style={[styles.switchLabel, { color: value ? '#1E7B34' : '#B3261E' }]}>
        {value ? 'Available' : 'Unavailable'}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * MenuAvailabilityScreen — Kitchen/F&B portal. Lets F&B staff flip a
 * dish's available flag off when they're out of an ingredient or the
 * recipe can't be made right now, and back on once it's sorted —
 * guests stop seeing that dish the moment it's off, since
 * OrderFoodScreen.jsx's own menu query already filters to
 * available = true (that filter already existed; this screen is what
 * was missing — a way for staff to actually change the flag from
 * inside the app instead of Supabase's Table Editor).
 *
 * LAYOUT: category tabs (Breakfast / Lunch / Dinner / ...) rather than
 * one long scrolling list with every category stacked — one category
 * at a time, paginated within it, so a growing menu stays scannable
 * instead of requiring endless scrolling.
 *
 * Deliberately scoped to ONLY the available toggle — not a full menu
 * editor. Creating items, changing prices/photos/descriptions stays
 * admin-only for now, per the original Phase 4 plan noted in
 * 001_food_service_phase1.sql's own comments. Requires
 * 007_food_service_menu_availability.sql to have been run — without
 * it, this screen would load with zero items visible (RLS would
 * silently filter out anything not already available, and every
 * update attempt would be rejected).
 *
 * Props:
 *  - staffUid, staffName: the signed-in Kitchen/F&B user.
 */
export default function MenuAvailabilityScreen({ staffUid, staffName }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const loadItems = async () => {
      const { data, error } = await supabase
        .from('food_menu_items')
        .select('*')
        .order('name');
      if (error) {
        console.error('Failed to load menu items:', error);
        setLoading(false);
        return;
      }
      setItems(data || []);
      setLoading(false);
    };
    loadItems();

    const channel = supabase
      .channel('menu-availability-fnb')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_menu_items' }, loadItems)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => { setPage(1); }, [activeCategory, availabilityFilter, searchQuery]);

  // Only show tabs for categories that actually have items, in the
  // same fixed order the guest-facing menu uses, plus an "All" tab.
  const categoryTabs = useMemo(() => {
    const present = new Set(items.map((i) => i.category || 'Main'));
    const ordered = CATEGORY_ORDER.filter((c) => present.has(c));
    const extra = [...present].filter((c) => !CATEGORY_ORDER.includes(c));
    return ['All', ...ordered, ...extra];
  }, [items]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (activeCategory !== 'All') list = list.filter((i) => (i.category || 'Main') === activeCategory);
    if (availabilityFilter === 'available') list = list.filter((i) => i.available);
    else if (availabilityFilter === 'unavailable') list = list.filter((i) => !i.available);

    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((i) => (i.name || '').toLowerCase().includes(q));
    return list;
  }, [items, activeCategory, availabilityFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleItems.slice(start, start + PAGE_SIZE);
  }, [visibleItems, page]);

  const availableCount = items.filter((i) => i.available).length;
  const unavailableCount = items.filter((i) => !i.available).length;

  const toggleAvailability = async (item) => {
    setBusyId(item.id);
    setActionError('');
    const nextAvailable = !item.available;
    try {
      const { error } = await supabase
        .from('food_menu_items')
        .update({ available: nextAvailable })
        .eq('id', item.id);
      if (error) throw error;
      // Update our own view immediately rather than waiting for the
      // realtime round-trip.
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available: nextAvailable } : i)));
    } catch (err) {
      console.error('Failed to update menu item availability:', err);
      setActionError(err?.message || `Could not update "${item.name}". Please try again.`);
    } finally {
      setBusyId(null);
    }
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
          <Text style={styles.title}>Menu Availability</Text>
          <Text style={styles.subtitle}>Mark a dish unavailable when you're out of an ingredient — guests stop seeing it right away.</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.availabilityRow}>
            {AVAILABILITY_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.availabilityChip, availabilityFilter === f.key && styles.availabilityChipActive]}
                onPress={() => setAvailabilityFilter(f.key)}
              >
                <Text style={[styles.availabilityChipText, availabilityFilter === f.key && styles.availabilityChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
          <Text style={styles.categoryLabel}>{activeCategory}</Text>

          {currentPageItems.length === 0 ? (
            <Text style={styles.emptyText}>No menu items in this view.</Text>
          ) : (
            <View style={styles.itemGrid}>
              {currentPageItems.map((item) => {
                const isBusy = busyId === item.id;
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
                      <View style={{ flex: 1 }}>
                        <View style={styles.itemNameRow}>
                          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                        </View>
                        {!!item.description && <Text style={styles.itemDescription} numberOfLines={2}>{item.description}</Text>}
                      </View>
                    </View>

                    <AvailabilitySwitch
                      value={item.available}
                      busy={isBusy}
                      onToggle={() => toggleAvailability(item)}
                    />
                  </View>
                );
              })}
            </View>
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
        <Text style={styles.summaryBarTotal}>Total Items <Text style={styles.summaryBarTotalNum}>{items.length}</Text></Text>
        <View style={styles.summaryBarDivider} />
        <View style={styles.summaryBarItem}>
          <View style={[styles.summaryBarDot, { backgroundColor: '#1E7B34' }]} />
          <Text style={styles.summaryBarItemText}>Available {availableCount}</Text>
        </View>
        <View style={styles.summaryBarDivider} />
        <View style={styles.summaryBarItem}>
          <View style={[styles.summaryBarDot, { backgroundColor: '#B3261E' }]} />
          <Text style={styles.summaryBarItemText}>Unavailable {unavailableCount}</Text>
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
  subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, maxWidth: 460 },

  headerRight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  availabilityRow: { flexDirection: 'row', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 999, padding: 3 },
  availabilityChip: { paddingVertical: 5, paddingHorizontal: spacing.sm + 2, borderRadius: 999 },
  availabilityChipActive: { backgroundColor: colors.primary },
  availabilityChipText: { fontSize: 11.5, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  availabilityChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 9,
    minWidth: 220, maxWidth: 300,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text, padding: 0 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FBE7E7', marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: radius.md, padding: spacing.sm,
  },
  errorBannerText: { flex: 1, fontSize: 12.5, fontFamily: fonts.bodyMedium, color: '#B3261E' },

  // ── Category tabs ─────────────────────────────────────────────────────
  tabsRow: { flexGrow: 0, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabsRowContent: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  categoryTab: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: colors.cardAlt },
  categoryTabActive: { backgroundColor: colors.primary },
  categoryTabText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  categoryTabTextActive: { color: colors.white },

  bodyScroll: { flex: 1 },
  contentWrap: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: spacing.lg },

  categoryLabel: {
    fontSize: 14, fontFamily: fonts.headingBold, color: colors.primary,
    marginBottom: spacing.sm, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },

  itemGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },

  itemCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md + 4,
    flexGrow: 1, flexBasis: 340, maxWidth: 440, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  itemCardDim: { opacity: 0.7 },
  itemCardTop: { flexDirection: 'row', gap: spacing.md },
  itemThumb: { width: 76, height: 76, borderRadius: 18 },
  itemThumbFallback: { backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  itemNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.xs },
  itemName: { flex: 1, fontSize: 16, fontFamily: fonts.headingSemiBold, color: colors.text },
  itemPrice: { fontSize: 14.5, fontFamily: fonts.bodySemiBold, color: colors.primary },
  itemDescription: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 3 },

  // ── Availability switch ─────────────────────────────────────────────
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.sm + 2, borderTopWidth: 1, borderTopColor: colors.border,
  },
  switchTrack: { width: 52, height: 26, borderRadius: 13, justifyContent: 'center' },
  switchThumb: {
    position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  switchSpinner: { alignSelf: 'center' },
  switchLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold },

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