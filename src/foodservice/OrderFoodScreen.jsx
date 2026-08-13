import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { submitFoodReview, fetchReviewedIds } from '../utils/ReviewsService';
import RatingModal from '../components/shared/RatingModal';
import { useTheme } from '../context/ThemeContext';

const LOGO_SOURCE = require('../../assets/logo.png');

// Per-category icon used both for the category selector and for the
// photo placeholder when a menu item has no photo_url yet — so a
// photo-less item still looks intentional and branded instead of a
// flat "missing image" box. Once real photos are uploaded (Supabase
// Storage, same pattern as profile avatars), photo_url takes over
// automatically and these never show.
const CATEGORY_STYLE = {
  All: { icon: 'grid-outline' },
  Breakfast: { icon: 'sunny-outline' },
  Lunch: { icon: 'partly-sunny-outline' },
  Dinner: { icon: 'moon-outline' },
  Main: { icon: 'restaurant-outline' },
  Snacks: { icon: 'fast-food-outline' },
  Dessert: { icon: 'ice-cream-outline' },
  Beverages: { icon: 'cafe-outline' },
};
function categoryIcon(category) {
  return CATEGORY_STYLE[category]?.icon || 'restaurant-outline';
}

// Explicit meal-flow order for the category selector — Breakfast, Lunch,
// Dinner, Main first (the actual meal periods/entrees, in the order a
// guest's day goes), then Beverages, Dessert, Snacks. Overrides the
// alphabetical order the database query itself returns.
const CATEGORY_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Main', 'Beverages', 'Dessert', 'Snacks'];

/**
 * OrderFoodScreen — Food & Dining, Phase 1 of the Food Service module.
 *
 * SCOPE (Phase 1 only): a guest with a checked-in reservation can browse
 * the menu, build a cart, and place an order. That's it. There is
 * deliberately no in-app payment step — see the note below.
 *
 * NOT YET BUILT (later phases, same module):
 *  - Phase 2: Front Desk sees incoming orders and escalates them to
 *    Kitchen/F&B (a new screen in the Front Desk Portal).
 *  - Phase 3: a brand new Kitchen/F&B portal (its own role, login
 *    routing, and sidebar — separate from Housekeeping) where staff
 *    prepare orders and assign a staff member to deliver.
 *  - Phase 4: an Admin screen to manage the food menu — for now, menu
 *    items are edited directly in Supabase's Table Editor (see
 *    supabase/migrations/001_food_service_phase1.sql for the seed data).
 * An order placed here will just sit at status 'pending' until Phase 2
 * exists — that's expected, not a bug.
 *
 * PAYMENT: orders are paid ON DELIVERY, not through the app. Once the
 * later phases exist, the staff member who delivers the order brings the
 * itemized bill and an e-wallet QR code, and the guest pays cash or
 * e-wallet right there. There is no payment gateway call in this screen —
 * that's intentional, not missing.
 *
 * ELIGIBILITY: only guests with a status = 'checked-in' reservation can
 * order — there needs to be a real, current room to deliver to. This is
 * enforced twice: here (for a clear message instead of a confusing
 * empty screen) and again by the database's own RLS policy on
 * food_orders, so it can't be bypassed by going around this screen.
 *
 * DESIGN: rebuilt to follow a hotel-room-service reference UI (branded
 * header with a personal greeting, an icon-based category selector
 * instead of text pills, full-width "Add to Order" buttons on each
 * card, and a richer bottom cart summary) — using InnVision's own
 * cream/charcoal palette and fonts rather than the reference's own
 * branding. Deliberately NOT included: star ratings and a favorite/heart
 * icon shown in the reference — there's no rating or favorites data
 * anywhere in this schema (no guest has ever rated a dish), and
 * fabricating numbers that look real but aren't would violate the
 * "real data or omit it" rule this whole app follows elsewhere
 * (see e.g. RevenueReportScreen.jsx's trend badges, or
 * getRoomNumbersDisplay() returning null rather than a placeholder).
 *
 * Props:
 *  - user: Supabase Auth user object (user.id, user.email)
 *  - onBackPress: () => void
 */
export default function OrderFoodScreen({ user, onBackPress }) {
  const { colors, spacing, radius, fonts } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const [loading, setLoading] = useState(true);
  const [checkedInReservation, setCheckedInReservation] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState({}); // { [menuItemId]: quantity }
  const [notes, setNotes] = useState('');
  const [allergyInfo, setAllergyInfo] = useState('');
  const [view, setView] = useState('menu'); // 'menu' | 'cart' | 'confirmed'
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  // ── Order status notifications ──────────────────────────────────────
  // The guest's own orders that are either still in flight, or wrapped
  // up recently enough to still be worth a confirmation notification
  // (delivered/cancelled within the last 2 hours) — older history isn't
  // "current" enough to belong in a notification panel.
  const [myOrders, setMyOrders] = useState([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  // Tracks "<orderId>:<status>" pairs already shown to the guest, so
  // the badge only lights up for a status the guest hasn't seen yet —
  // not every active order forever. In-memory only (per app session),
  // same pattern KitchenOrdersScreen.jsx's new-order chime uses to
  // avoid re-alerting on things already seen.
  const seenStatusKeysRef = useRef(new Set());

  // Which of this guest's delivered orders already have a food rating
  // submitted — hides the "Rate this order" prompt for those.
  const [reviewedOrderIds, setReviewedOrderIds] = useState(new Set());
  const [foodRatingTarget, setFoodRatingTarget] = useState(null); // order being rated

  useEffect(() => {
    if (!user?.id) return;
    fetchReviewedIds(user.id, 'food')
      .then(setReviewedOrderIds)
      .catch((err) => console.error('Failed to load reviewed orders:', err));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const ACTIVE_STATUSES = ['pending', 'escalated', 'preparing', 'out_for_delivery'];

    const loadMyOrders = async () => {
      // Fetch plainly (just this guest's own orders, most recent
      // first, capped at a reasonable count) and filter to "active or
      // recent" in JS rather than in the query itself — an .or()
      // combined with an .in() list is a known PostgREST parsing trap
      // (the commas inside the in-list can get mistaken for top-level
      // .or() separators), and this sidesteps that risk entirely
      // rather than fighting the exact escaping needed to make it work.
      const { data, error } = await supabase
        .from('food_orders')
        .select('id, status, room_number, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        console.error('Failed to load order notifications:', error);
        return;
      }
      const twoHoursAgoMs = Date.now() - 2 * 60 * 60 * 1000;
      const rows = (data || []).filter((o) =>
        ACTIVE_STATUSES.includes(o.status) || new Date(o.created_at).getTime() >= twoHoursAgoMs
      );
      setMyOrders(rows);
      const unseen = rows.filter((o) => !seenStatusKeysRef.current.has(`${o.id}:${o.status}`));
      setUnseenCount(unseen.length);
    };
    loadMyOrders();

    const channel = supabase
      .channel(`order-food-notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_orders', filter: `user_id=eq.${user.id}` }, loadMyOrders)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  const openNotifPanel = () => {
    setNotifPanelOpen(true);
    // Opening the panel acknowledges everything currently in it.
    myOrders.forEach((o) => seenStatusKeysRef.current.add(`${o.id}:${o.status}`));
    setUnseenCount(0);
  };

  const ORDER_STATUS_MESSAGE = {
    pending: { icon: 'time-outline', text: 'Order received — waiting for staff to review it.' },
    escalated: { icon: 'arrow-redo-outline', text: 'Your order has been sent to the kitchen.' },
    preparing: { icon: 'restaurant-outline', text: 'Your order is being prepared.' },
    out_for_delivery: { icon: 'bicycle-outline', text: "Your order is on its way!" },
    delivered: { icon: 'checkmark-done-outline', text: 'Delivered — enjoy your meal!' },
    cancelled: { icon: 'close-circle-outline', text: 'This order was cancelled.' },
  };

  // Runs a quick slide-in-from-the-right + fade every time the selected
  // category changes, so switching categories feels like a light swipe
  // instead of the menu list just instantly re-rendering.
  const categoryTransition = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    categoryTransition.setValue(0);
    Animated.timing(categoryTransition, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [activeCategory]);
  const menuTranslateX = categoryTransition.interpolate({ inputRange: [0, 1], outputRange: [48, 0] });

  // Find the guest's current checked-in stay — that's the room the order
  // gets delivered to. If there's more than one (rare — e.g. multiple
  // rooms on one trip), the first one found is used; a later phase can
  // add a room picker if that turns out to matter in practice.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('id, status, selected_rooms, guest_details, guest_email')
        .eq('user_id', user.id)
        .eq('status', 'checked-in')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled) {
        if (error) {
          console.error('Failed to load checked-in reservation:', error);
        } else if (data && data.length > 0) {
          setCheckedInReservation(data[0]);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Header avatar — fetched separately from the reservation (photo lives
  // on profiles, not reservations) and kept live via realtime, same
  // pattern as the staff photo sync in FrontDeskShell.jsx: if the guest
  // updates their photo elsewhere in the app while this screen is open,
  // it reflects here immediately without needing a reload.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadPhoto = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('photo_url')
        .eq('id', user.id)
        .single();
      if (!cancelled && !error) setProfilePhotoUrl(data?.photo_url || null);
    };
    loadPhoto();

    const channel = supabase
      .channel(`order-food-avatar-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => setProfilePhotoUrl(payload.new?.photo_url || null)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadMenu = async () => {
      // Fetches EVERY item, not just available = true, then filters to
      // available in JS — see 009_food_service_menu_select_all.sql for
      // why: filtering in the query itself means a dish transitioning
      // to unavailable no longer matches the RLS policy for this
      // guest's session at all, so Realtime has nothing it's allowed
      // to broadcast about that specific change. Fetching everything
      // and filtering client-side sidesteps that entirely.
      const { data, error } = await supabase
        .from('food_menu_items')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (!cancelled) {
        if (error) console.error('Failed to load food menu:', error);
        setMenuItems((data || []).filter((item) => item.available));
        setLoading(false);
      }
    };
    loadMenu();

    // Live-updates the menu as Kitchen/F&B toggles availability (see
    // MenuAvailabilityScreen.jsx) — a dish going unavailable should
    // disappear from a guest's screen right away if they happen to be
    // browsing at that moment, not only the next time they reload.
    // Requires 008_food_service_menu_realtime.sql — without it this
    // channel just sits idle, since the table was never enabled for
    // realtime broadcasting in the first place.
    const channel = supabase
      .channel('order-food-menu-availability')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_menu_items' }, loadMenu)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set(menuItems.map((m) => m.category));
    const known = CATEGORY_ORDER.filter((c) => set.has(c));
    // Any category not in the explicit list above (e.g. a brand-new one
    // added later via Table Editor) still shows up — just appended
    // alphabetically at the end — rather than silently disappearing.
    const unknown = Array.from(set).filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return ['All', ...known, ...unknown];
  }, [menuItems]);

  const visibleItems = useMemo(() => {
    if (activeCategory === 'All') return menuItems;
    return menuItems.filter((m) => m.category === activeCategory);
  }, [menuItems, activeCategory]);

  const roomNumber = useMemo(() => {
    const rooms = checkedInReservation?.selected_rooms;
    if (Array.isArray(rooms) && rooms.length > 0) {
      return rooms.map((r) => r.roomNumber || r.number || r.room).filter(Boolean).join(', ');
    }
    return null;
  }, [checkedInReservation]);

  // First name only, for the header greeting ("Good morning, Maria") —
  // falls back gracefully through what's actually on the reservation,
  // same fallback order used when the order itself is placed.
  const guestFirstName = useMemo(() => {
    const details = checkedInReservation?.guest_details;
    if (details?.firstName) return details.firstName;
    if (checkedInReservation?.guest_email) return checkedInReservation.guest_email.split('@')[0];
    if (user?.email) return user.email.split('@')[0];
    return 'Guest';
  }, [checkedInReservation, user]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const cartLines = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => {
        const item = menuItems.find((m) => m.id === id);
        return item ? { ...item, quantity: qty, subtotal: item.price * qty } : null;
      })
      .filter(Boolean);
  }, [cart, menuItems]);

  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);
  const cartTotal = cartLines.reduce((sum, l) => sum + l.subtotal, 0);

  const adjustQty = (itemId, delta) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] || 0) + delta);
      return { ...prev, [itemId]: next };
    });
  };

  const formatCurrency = (amount) => `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const timeAgo = (dateString) => {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  };

  const handlePlaceOrder = async () => {
    if (!checkedInReservation || cartLines.length === 0) return;
    setPlacingOrder(true);
    setOrderError('');
    try {
      const guestName = checkedInReservation.guest_details
        ? `${checkedInReservation.guest_details.firstName || ''} ${checkedInReservation.guest_details.lastName || ''}`.trim()
        : (checkedInReservation.guest_email || user.email || 'Guest');

      const { data: order, error: insertOrderError } = await supabase
        .from('food_orders')
        .insert({
          reservation_id: checkedInReservation.id,
          user_id: user.id,
          guest_name: guestName,
          room_number: roomNumber || 'Unknown',
          notes: notes.trim() || null,
          allergy_info: allergyInfo.trim() || null,
          total_amount: cartTotal,
          placed_by: 'guest',
        })
        .select()
        .single();
      if (insertOrderError) throw insertOrderError;

      const orderItemsPayload = cartLines.map((l) => ({
        order_id: order.id,
        menu_item_id: l.id,
        item_name: l.name,
        unit_price: l.price,
        quantity: l.quantity,
        subtotal: l.subtotal,
      }));
      const { error: itemsError } = await supabase.from('food_order_items').insert(orderItemsPayload);
      if (itemsError) throw itemsError;

      setView('confirmed');
    } catch (err) {
      console.error('Failed to place food order:', err);
      setOrderError('Could not place your order. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  // Not checked in — nothing to deliver to yet. Same rule the database
  // enforces on its own via RLS, so this is a friendly message, not the
  // only line of defense.
  if (!checkedInReservation) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <Ionicons name="restaurant-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Food ordering isn't available yet</Text>
          <Text style={styles.emptyText}>
            Room service becomes available once you've checked in. If you've just checked in, this may take a moment to update.
          </Text>
          {!!onBackPress && (
            <TouchableOpacity style={styles.backLinkBtn} onPress={onBackPress}>
              <Text style={styles.backLinkText}>Go back</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'confirmed') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.confirmScrollContent}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="checkmark" size={32} color={colors.onPrimary} />
          </View>
          <Text style={styles.emptyTitle}>Order placed!</Text>
          <Text style={styles.emptyText}>
            Your order for Room {roomNumber} has been sent to our staff. When it's delivered, we'll bring an itemized bill and a QR code — you can pay by cash or e-wallet at that time.
          </Text>

          {cartLines.length > 0 && (
            <View style={styles.confirmSummaryCard}>
              <Text style={styles.confirmSummaryTitle}>What you ordered</Text>
              {cartLines.map((line) => (
                <View key={line.id} style={styles.confirmSummaryRow}>
                  <Text style={styles.confirmSummaryItemText} numberOfLines={1}>{line.quantity}× {line.name}</Text>
                  <Text style={styles.confirmSummaryItemPrice}>{formatCurrency(line.subtotal)}</Text>
                </View>
              ))}
              <View style={styles.confirmSummaryDivider} />
              <View style={styles.confirmSummaryRow}>
                <Text style={styles.confirmSummaryTotalLabel}>Total</Text>
                <Text style={styles.confirmSummaryTotalValue}>{formatCurrency(cartTotal)}</Text>
              </View>
              {!!allergyInfo.trim() && (
                <View style={styles.confirmAllergyNote}>
                  <Ionicons name="warning-outline" size={13} color="#B3792A" />
                  <Text style={styles.confirmAllergyNoteText}>Allergy/Dietary note included</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setCart({});
              setNotes('');
              setAllergyInfo('');
              setView('menu');
            }}
          >
            <Text style={styles.primaryBtnText}>Order More</Text>
          </TouchableOpacity>
          {!!onBackPress && (
            <TouchableOpacity style={styles.backLinkBtn} onPress={onBackPress}>
              <Text style={styles.backLinkText}>Back to Profile</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {view === 'menu' ? (
        <>
          {/* ── Branded header + personal greeting ─────────────────── */}
          <View style={styles.heroHeader}>
            <View style={styles.heroTopRow}>
              <TouchableOpacity onPress={onBackPress} style={styles.heroBackBtn}>
                <Ionicons name="chevron-back" size={20} color={colors.onPrimary} />
              </TouchableOpacity>
              <View style={styles.heroTopRowRight}>
                <View style={styles.heroRoomBadge}>
                  <Text style={styles.heroRoomBadgeText}>Room {roomNumber}</Text>
                </View>
                <TouchableOpacity style={styles.heroBellBtn} accessibilityLabel="Notifications" onPress={openNotifPanel}>
                  <Ionicons name="notifications-outline" size={18} color={colors.onPrimary} />
                  {unseenCount > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>{unseenCount > 9 ? '9+' : unseenCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.heroBrandRow}>
              <Image source={LOGO_SOURCE} style={styles.heroLogo} resizeMode="contain" />
              <Text style={styles.heroWordmark}>
                Inn<Text style={styles.heroWordmarkAccent}>Vision</Text>
              </Text>
            </View>

            <View style={styles.heroGreetingRow}>
              <View style={styles.heroAvatar}>
                {profilePhotoUrl ? (
                  <Image source={{ uri: profilePhotoUrl }} style={styles.heroAvatarImage} />
                ) : (
                  <Text style={styles.heroAvatarText}>{guestFirstName.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroGreetingText}>{greeting},</Text>
                <Text style={styles.heroGuestName}>{guestFirstName}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Room Service</Text>
              <Text style={styles.sectionSubtitle}>Delicious meals, delivered to your door.</Text>
            </View>
          </View>

          {/* ── Icon-based category selector ────────────────────────── */}
          <View style={styles.categoryGrid}>
            {categories.map((cat) => {
              const active = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={styles.categoryTile}
                  onPress={() => setActiveCategory(cat)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.categoryIconWrap, active && styles.categoryIconWrapActive]}>
                    <Ionicons name={categoryIcon(cat)} size={20} color={active ? colors.onPrimary : colors.primary} />
                  </View>
                  <Text style={[styles.categoryTileText, active && styles.categoryTileTextActive]} numberOfLines={1}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Animated.ScrollView
            style={{ opacity: categoryTransition, transform: [{ translateX: menuTranslateX }] }}
            contentContainerStyle={[styles.menuGrid, isWide && styles.menuGridWide]}
            showsVerticalScrollIndicator={false}
          >
            {visibleItems.map((item) => {
              const qty = cart[item.id] || 0;
              return (
                <View key={item.id} style={[styles.menuCard, isWide && styles.menuCardWide]}>
                  <View style={styles.menuPhotoWrap}>
                    {item.photo_url ? (
                      <Image source={{ uri: item.photo_url }} style={styles.menuPhoto} />
                    ) : (
                      <View style={[styles.menuPhoto, styles.menuPhotoFallback]}>
                        <Ionicons name={categoryIcon(item.category)} size={40} color={colors.primary} style={{ opacity: 0.5 }} />
                      </View>
                    )}
                  </View>

                  <View style={styles.menuCardBody}>
                    <Text style={styles.menuName} numberOfLines={1}>{item.name}</Text>
                    {!!item.description && <Text style={styles.menuDesc} numberOfLines={2}>{item.description}</Text>}
                    <Text style={styles.menuPrice}>{formatCurrency(item.price)}</Text>

                    {qty === 0 ? (
                      <TouchableOpacity style={styles.addToOrderBtn} onPress={() => adjustQty(item.id, 1)} activeOpacity={0.85}>
                        <Text style={styles.addToOrderBtnText}>Add to Order</Text>
                        <Ionicons name="add" size={16} color={colors.onPrimary} />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.inlineStepper}>
                        <TouchableOpacity style={styles.inlineStepperBtn} onPress={() => adjustQty(item.id, -1)}>
                          <Ionicons name="remove" size={16} color={colors.onPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.inlineStepperValue}>{qty}</Text>
                        <TouchableOpacity style={styles.inlineStepperBtn} onPress={() => adjustQty(item.id, 1)}>
                          <Ionicons name="add" size={16} color={colors.onPrimary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
            <View style={{ height: cartCount > 0 ? 110 : 24 }} />
          </Animated.ScrollView>

          {/* ── Rich bottom cart summary ─────────────────────────────── */}
          {cartCount > 0 && (
            <TouchableOpacity style={styles.cartBar} onPress={() => setView('cart')} activeOpacity={0.9}>
              <View style={styles.cartBarIconWrap}>
                <Ionicons name="bag-handle-outline" size={20} color={colors.onPrimary} />
                <View style={styles.cartBarCountBadge}>
                  <Text style={styles.cartBarCountText}>{cartCount}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartBarText}>View Cart</Text>
                <Text style={styles.cartBarSubtext}>{cartCount} item{cartCount === 1 ? '' : 's'} • {formatCurrency(cartTotal)}</Text>
              </View>
              <Text style={styles.cartBarTotal}>{formatCurrency(cartTotal)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onPrimary} />
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={() => setView('menu')} style={styles.headerBackBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Your Order</Text>
              <Text style={styles.headerSubtitle}>Delivering to Room {roomNumber}</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.cartScroll}>
            {cartLines.map((line) => (
              <View key={line.id} style={styles.cartLine}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartLineName}>{line.name}</Text>
                  <Text style={styles.cartLineUnitPrice}>{formatCurrency(line.price)} each</Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustQty(line.id, -1)}>
                    <Ionicons name="remove" size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{line.quantity}</Text>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustQty(line.id, 1)}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cartLineSubtotal}>{formatCurrency(line.subtotal)}</Text>
              </View>
            ))}

            <View style={styles.allergyFieldWrap}>
              <View style={styles.allergyFieldLabelRow}>
                <Ionicons name="warning-outline" size={15} color="#B3792A" />
                <Text style={styles.allergyFieldLabel}>Allergies or dietary restrictions? (optional)</Text>
              </View>
              <TextInput
                style={styles.allergyInput}
                value={allergyInfo}
                onChangeText={setAllergyInfo}
                placeholder="e.g. Shellfish allergy, no peanuts"
                placeholderTextColor={colors.disabled}
                multiline
              />
            </View>

            <Text style={styles.fieldLabel}>Notes for the kitchen (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. No onions, extra spicy"
              placeholderTextColor={colors.disabled}
              multiline
            />

            <View style={styles.paymentNote}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <Text style={styles.paymentNoteText}>
                Payment is collected when your order is delivered — our staff will bring the bill and a QR code so you can pay by cash or e-wallet.
              </Text>
            </View>

            {!!orderError && <Text style={styles.errorText}>{orderError}</Text>}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(cartTotal)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (placingOrder || cartLines.length === 0) && styles.primaryBtnDisabled]}
              onPress={handlePlaceOrder}
              disabled={placingOrder || cartLines.length === 0}
            >
              {placingOrder ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryBtnText}>Place Order</Text>}
            </TouchableOpacity>
          </ScrollView>
        </>
      )}

      {/* ── Order status notifications ────────────────────────────────── */}
      <Modal visible={notifPanelOpen} animationType="slide" onRequestClose={() => setNotifPanelOpen(false)}>
        <SafeAreaView style={styles.notifScreen}>
          <View style={styles.notifPanelHeader}>
            <TouchableOpacity onPress={() => setNotifPanelOpen(false)} style={styles.notifBackBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.notifPanelTitle}>Your Orders</Text>
            <View style={styles.notifBackBtn} />
          </View>
          <ScrollView style={styles.notifList} contentContainerStyle={styles.notifListContent}>
            {myOrders.length === 0 ? (
              <Text style={styles.notifEmptyText}>No recent orders to show.</Text>
            ) : (
              myOrders.map((o) => {
                const meta = ORDER_STATUS_MESSAGE[o.status] || ORDER_STATUS_MESSAGE.pending;
                return (
                  <View key={o.id} style={styles.notifRow}>
                    <View style={styles.notifIconWrap}>
                      <Ionicons name={meta.icon} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifRowText}>{meta.text}</Text>
                      <Text style={styles.notifRowMeta}>Room {o.room_number} · {timeAgo(o.created_at)}</Text>
                      {o.status === 'delivered' && (
                        reviewedOrderIds.has(o.id) ? (
                          <View style={styles.notifRatedBadge}>
                            <Ionicons name="checkmark-circle" size={13} color={colors.text} />
                            <Text style={styles.notifRatedText}>Rated</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.notifRateBtn}
                            onPress={() => setFoodRatingTarget(o)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="star-outline" size={13} color={colors.onPrimary} />
                            <Text style={styles.notifRateBtnText}>Rate this order</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <RatingModal
        visible={!!foodRatingTarget}
        onClose={() => setFoodRatingTarget(null)}
        subjectTitle={foodRatingTarget ? `Order — Room ${foodRatingTarget.room_number}` : ''}
        subjectSubtitle={foodRatingTarget ? timeAgo(foodRatingTarget.created_at) : ''}
        onSubmit={async (rating, comment) => {
          const guestNameForReview = checkedInReservation?.guest_details
            ? `${checkedInReservation.guest_details.firstName || ''} ${checkedInReservation.guest_details.lastName || ''}`.trim()
            : (checkedInReservation?.guest_email || user?.email || 'Guest');
          await submitFoodReview({
            userId: user.id,
            guestName: guestNameForReview,
            orderId: foodRatingTarget.id,
            subjectLabel: `Order — Room ${foodRatingTarget.room_number}`,
            rating,
            comment,
          });
          setReviewedOrderIds((prev) => new Set(prev).add(foodRatingTarget.id));
        }}
      />
    </SafeAreaView>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    confirmScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

    confirmSummaryCard: {
      width: '100%', maxWidth: 380, backgroundColor: colors.cardAlt, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.lg, marginTop: spacing.lg,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    confirmSummaryTitle: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.text, marginBottom: spacing.sm },
    confirmSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: spacing.sm },
    confirmSummaryItemText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.text },
    confirmSummaryItemPrice: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textMuted },
    confirmSummaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    confirmSummaryTotalLabel: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.text },
    confirmSummaryTotalValue: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.primary },
    confirmAllergyNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
    confirmAllergyNoteText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: '#7A5C00' },
    emptyTitle: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.text, marginTop: spacing.md, textAlign: 'center' },
    emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, maxWidth: 320 },
    backLinkBtn: { marginTop: spacing.lg },
    backLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primary },

    confirmIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1E7B34', alignItems: 'center', justifyContent: 'center' },

    // Simple header, used only for the Cart sub-view.
    headerBar: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerBackBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
    headerTitle: { fontFamily: fonts.headingExtraBold, fontSize: 18, color: colors.primary },
    headerSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },

    // Branded hero header for the menu view — uses heroBackground, which
    // stays a dark band in BOTH light and dark app themes (same token
    // the home screen's hero section uses), so this reads as a strong
    // brand statement regardless of the guest's theme setting.
    heroHeader: { backgroundColor: '#3F3F46', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },

    heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroBackBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
    heroTopRowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    heroRoomBadge: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: spacing.sm },
    heroRoomBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.onPrimary },
    heroBellBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', position: 'relative' },
    notifBadge: {
      position: 'absolute', top: -3, right: -3,
      backgroundColor: '#B3261E', borderRadius: 999, minWidth: 16, height: 16,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
      borderWidth: 1.5, borderColor: '#3F3F46',
    },
    notifBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: '#fff' },

    notifScreen: { flex: 1, backgroundColor: colors.background },
    notifBackBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    notifPanelHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    notifPanelTitle: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.primary },
    notifList: { flex: 1 },
    notifListContent: { padding: spacing.lg, gap: spacing.sm },
    notifEmptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, fontStyle: 'italic', padding: spacing.lg, textAlign: 'center' },
    notifRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
      backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
      padding: spacing.md,
    },
    notifIconWrap: {
      width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint,
      alignItems: 'center', justifyContent: 'center',
    },
    notifRowText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
    notifRowMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 3 },
    notifRateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      marginTop: spacing.sm,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.primary,
    },
    notifRateBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.onPrimary },
    notifRatedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: spacing.sm,
    },
    notifRatedText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.text },


    // Brand row sits on its own, directly above the greeting — the
    // wordmark reads as "whose hotel this is" before "who's being
    // greeted", same ordering as the reference layout.
    heroBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.lg },
    heroLogo: { width: 26, height: 26 },
    heroWordmark: { fontFamily: fonts.headingBold, fontSize: 22, color: colors.onPrimary, letterSpacing: 0.5 },
    heroWordmarkAccent: { color: '#E0A83C' },

    heroGreetingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    heroAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    heroAvatarImage: { width: 44, height: 44 },
    heroAvatarText: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.onPrimary },
    heroGreetingText: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
    heroGuestName: { fontFamily: fonts.headingBold, fontSize: 19, color: colors.onPrimary, marginTop: 1 },

    sectionHeaderRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    sectionTitle: { fontFamily: fonts.headingExtraBold, fontSize: 19, color: colors.primary },
    sectionSubtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },

    // Icon-based category selector — replaces the old text-pill row.
    // Fixed columnGap + flex-start (rather than space-between) so a
    // second row with fewer than 4 items (e.g. only Beverages, Dessert,
    // Snacks) still lands in the SAME columns as the row above it —
    // space-between was spreading an incomplete row across the full
    // width instead, which threw off alignment between rows.
    categoryGrid: {
      flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start',
      rowGap: spacing.lg, columnGap: '2.3%',
      paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    },
    categoryTile: { width: '23%', alignItems: 'center', gap: 6 },
    categoryIconWrap: {
      width: 52, height: 52, borderRadius: radius.lg,
      backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center',
    },
    categoryIconWrapActive: { backgroundColor: colors.primary },
    categoryTileText: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textMuted, textAlign: 'center' },
    categoryTileTextActive: { fontFamily: fonts.bodySemiBold, color: colors.primary },

    // Photo-forward, food-app-style grid: single column on phones (big,
    // tempting images), a wrapping multi-column grid on tablet/desktop.
    menuGrid: { padding: spacing.lg, paddingTop: 0, gap: spacing.lg },
    menuGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
    menuCard: {
      backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    },
    menuCardWide: { width: '31%' },

    menuPhotoWrap: { position: 'relative', width: '100%', height: 148 },
    menuPhoto: { width: '100%', height: '100%' },
    menuPhotoFallback: { backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },

    menuCardBody: { padding: spacing.md },
    menuName: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.text },
    menuDesc: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, marginTop: 3, lineHeight: 15, minHeight: 30 },
    menuPrice: { fontFamily: fonts.headingExtraBold, fontSize: 16, color: colors.primary, marginTop: spacing.xs },

    // Full-width "Add to Order" button per card, matching the reference
    // UI — replaces the old floating circular button.
    addToOrderBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 9,
      marginTop: spacing.sm,
    },
    addToOrderBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.onPrimary },
    inlineStepper: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6,
      marginTop: spacing.sm,
    },
    inlineStepperBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
    inlineStepperValue: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.onPrimary },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stepperBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    stepperValue: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.text, minWidth: 18, textAlign: 'center' },

    // Richer bottom cart summary bar.
    cartBar: {
      position: 'absolute', bottom: spacing.lg, left: spacing.lg, right: spacing.lg,
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.md,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
    },
    cartBarIconWrap: { position: 'relative' },
    cartBarCountBadge: {
      position: 'absolute', top: -6, right: -8,
      backgroundColor: colors.onPrimary, borderRadius: 999, minWidth: 16, height: 16,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    },
    cartBarCountText: { fontFamily: fonts.bodySemiBold, fontSize: 9.5, color: colors.primary },
    cartBarText: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.onPrimary },
    cartBarSubtext: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
    cartBarTotal: { fontFamily: fonts.headingExtraBold, fontSize: 14, color: colors.onPrimary },

    cartScroll: { padding: spacing.lg },
    cartLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    cartLineName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
    cartLineUnitPrice: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 1 },
    cartLineSubtotal: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.primary, minWidth: 70, textAlign: 'right' },

    fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
    notesInput: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.cardAlt,
      padding: spacing.sm, fontFamily: fonts.body, fontSize: 13, color: colors.text, minHeight: 70, textAlignVertical: 'top',
    },

    // Deliberately styled to stand apart from the plain notes field
    // above — this is a safety field, not a preference, and should
    // read that way even before anyone types anything into it.
    allergyFieldWrap: { marginTop: spacing.md, backgroundColor: '#FFF4D6', borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: '#F0D896' },
    allergyFieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
    allergyFieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: '#7A5C00' },
    allergyInput: {
      borderWidth: 1, borderColor: '#F0D896', borderRadius: radius.sm, backgroundColor: colors.white,
      padding: spacing.sm, fontFamily: fonts.body, fontSize: 13, color: colors.text, minHeight: 50, textAlignVertical: 'top',
    },

    paymentNote: {
      flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.md,
      padding: spacing.sm, marginTop: spacing.md,
    },
    paymentNoteText: { flex: 1, fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },

    errorText: { fontFamily: fonts.body, fontSize: 12, color: '#B3261E', marginTop: spacing.sm },

    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
    totalLabel: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.text },
    totalValue: { fontFamily: fonts.headingExtraBold, fontSize: 20, color: colors.primary },

    primaryBtn: {
      backgroundColor: colors.primary, borderRadius: 999,
      paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
      minWidth: 180,
      alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.onPrimary },
  });
}