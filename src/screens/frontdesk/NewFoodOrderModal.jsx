import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Modal,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

// Same per-category fallback icon OrderFoodScreen.jsx uses when a menu
// item has no photo_url yet, so an unphotographed dish still looks
// intentional here too rather than like a broken image — kept as its
// own small local copy rather than an import since OrderFoodScreen.jsx
// doesn't export this table.
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

/**
 * NewFoodOrderModal — lets a Front Desk staff member place a food order
 * on behalf of a guest who can't place one themselves.
 *
 * WHY THIS EXISTS: OrderFoodScreen.jsx (the guest-facing ordering
 * screen) requires a logged-in Supabase Auth user whose id matches a
 * checked-in reservation. A walk-in guest (see WalkInScreen.jsx) is
 * deliberately given no login/account at all — reservations.user_id is
 * null for them, by design — so that guest has no way to reach or use
 * OrderFoodScreen.jsx. FoodOrdersScreen.jsx already had a dormant
 * "Walk-in · " label on each order card (order.placedBy === 'frontdesk'),
 * with nothing anywhere in the app that ever produced that value — this
 * modal is what fills that gap in.
 *
 * Any currently checked-in reservation can be picked here, not only
 * walk-ins — a guest who'd rather just call the front desk than use the
 * app is a normal thing a hotel handles too, and the picker doesn't need
 * to know or care which case it is.
 *
 * Submits the same two inserts OrderFoodScreen.jsx's handlePlaceOrder
 * does (food_orders, then food_order_items), with placed_by: 'frontdesk'
 * instead of 'guest', and user_id carried over from the selected
 * reservation as-is (null for a walk-in, a real id otherwise — if that
 * guest later logs in and opens OrderFoodScreen.jsx themselves, this
 * order already shows up in their own order-status panel there, since
 * that panel queries food_orders by their user_id).
 *
 * Deliberately does NOT push the new order into any local list itself:
 * FoodOrdersScreen.jsx's own realtime subscription (food-orders-
 * frontdesk, already listening for '*' events on food_orders and
 * food_order_items) picks up the new rows on its own, the same way it
 * already picks up a guest's own order arriving from OrderFoodScreen.jsx.
 *
 * PRESENTATION: a plain RN <Modal> defaults to a fullscreen takeover,
 * which is the right call on a phone but reads as a bare, stretched
 * page on a wide/desktop viewport (search bar and room rows spanning
 * the full window width). Past WIDE_BREAKPOINT this renders instead as
 * a centered, max-width dialog card over a dimmed backdrop — the same
 * fullscreen-vs-dialog split other screens in this app make via
 * isWide, just applied to the modal's own presentation rather than an
 * inner grid.
 *
 * REQUIRES a one-time migration — see
 * 20261001_frontdesk_food_order_insert.sql — before this will work:
 * food_orders.user_id has to accept null, and a 'frontdesk'-role INSERT
 * policy has to exist on both food_orders and food_order_items. Without
 * it, handlePlaceOrder below will fail with an RLS/permission error,
 * same as any other screen whose write isn't yet covered by a policy.
 *
 * Props:
 *  - visible: boolean
 *  - onClose: () => void
 */
const WIDE_BREAKPOINT = 860;

export default function NewFoodOrderModal({ visible, onClose }) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [step, setStep] = useState('room'); // 'room' | 'cart' | 'confirmed'

  const [loadingReservations, setLoadingReservations] = useState(true);
  const [reservations, setReservations] = useState([]);
  const [roomSearch, setRoomSearch] = useState('');
  const [selectedReservation, setSelectedReservation] = useState(null);

  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState({}); // { [menuItemId]: quantity }
  const [notes, setNotes] = useState('');
  const [allergyInfo, setAllergyInfo] = useState('');

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  // Reset to a clean slate and reload both lists every time the modal
  // is (re)opened, rather than leaving the previous visit's picks and
  // possibly-stale room/menu data sitting there.
  useEffect(() => {
    if (!visible) return;
    setStep('room');
    setRoomSearch('');
    setSelectedReservation(null);
    setCart({});
    setNotes('');
    setAllergyInfo('');
    setError('');

    let cancelled = false;

    setLoadingReservations(true);
    supabase
      .from('reservations')
      .select('id, user_id, selected_rooms, guest_details, guest_email')
      .eq('status', 'checked-in')
      .order('checked_in_at', { ascending: false })
      .then(({ data, error: resError }) => {
        if (cancelled) return;
        if (resError) console.error('Failed to load checked-in reservations:', resError);
        setReservations(data || []);
        setLoadingReservations(false);
      });

    setLoadingMenu(true);
    supabase
      .from('food_menu_items')
      .select('*')
      .eq('available', true)
      .order('category', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data, error: menuError }) => {
        if (cancelled) return;
        if (menuError) console.error('Failed to load food menu:', menuError);
        setMenuItems(data || []);
        setLoadingMenu(false);
      });

    return () => { cancelled = true; };
  }, [visible]);

  // Same room-number / guest-name derivation OrderFoodScreen.jsx uses
  // for a guest's own reservation, applied here to whichever reservation
  // staff picked from the list.
  const roomNumberOf = (res) => {
    const rooms = res?.selected_rooms;
    if (Array.isArray(rooms) && rooms.length > 0) {
      return rooms.map((r) => r.roomNumber || r.number || r.room).filter(Boolean).join(', ');
    }
    return 'Unknown';
  };

  const guestNameOf = (res) => {
    if (res?.guest_details) {
      const name = `${res.guest_details.firstName || ''} ${res.guest_details.lastName || ''}`.trim();
      if (name) return name;
    }
    return res?.guest_email || 'Guest';
  };

  // WalkInScreen.jsx tags every walk-in reservation with
  // guest_details.walkIn: true — surfaced here only as a small label so
  // staff can tell at a glance, not used to restrict the list.
  const isWalkIn = (res) => !!res?.guest_details?.walkIn;

  const visibleReservations = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    if (!q) return reservations;
    return reservations.filter(
      (res) => roomNumberOf(res).toLowerCase().includes(q) || guestNameOf(res).toLowerCase().includes(q)
    );
  }, [reservations, roomSearch]);

  const categorized = useMemo(() => {
    const byCategory = {};
    menuItems.forEach((item) => {
      if (!byCategory[item.category]) byCategory[item.category] = [];
      byCategory[item.category].push(item);
    });
    return byCategory;
  }, [menuItems]);

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

  const formatCurrency = (amount) =>
    `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handlePlaceOrder = async () => {
    if (!selectedReservation || cartLines.length === 0) return;
    setPlacing(true);
    setError('');
    try {
      const { data: order, error: insertOrderError } = await supabase
        .from('food_orders')
        .insert({
          reservation_id: selectedReservation.id,
          user_id: selectedReservation.user_id || null,
          guest_name: guestNameOf(selectedReservation),
          room_number: roomNumberOf(selectedReservation),
          notes: notes.trim() || null,
          allergy_info: allergyInfo.trim() || null,
          total_amount: cartTotal,
          placed_by: 'frontdesk',
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

      setStep('confirmed');
    } catch (err) {
      console.error('Failed to place food order (frontdesk):', err);
      setError(err?.message || 'Could not place this order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  // A small 2-segment progress track — this really is a two-step flow
  // (pick a room, then build the order), so a lightweight "how far am I"
  // marker earns its place here rather than decorating for its own sake.
  const StepTrack = ({ current }) => (
    <View style={styles.stepTrack}>
      <View style={[styles.stepSegment, styles.stepSegmentActive]} />
      <View style={[styles.stepSegment, current === 'cart' && styles.stepSegmentActive]} />
    </View>
  );

  const stepContent = (
    <>
      {/* ── Step 1: pick a checked-in room ──────────────────────────── */}
      {step === 'room' && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Select a Room</Text>
              <Text style={styles.headerSubtitle}>Only currently checked-in rooms appear here.</Text>
            </View>
            <StepTrack current="room" />
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={roomSearch}
              onChangeText={setRoomSearch}
              placeholder="Search by room number or guest name"
              placeholderTextColor={colors.disabled}
            />
          </View>

          {loadingReservations ? (
            <View style={styles.centerWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              {reservations.length > 0 && (
                <Text style={styles.listSectionLabel}>
                  {visibleReservations.length} checked-in room{visibleReservations.length === 1 ? '' : 's'}
                </Text>
              )}
              <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.roomList}>
                {visibleReservations.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="bed-outline" size={28} color={colors.disabled} />
                    <Text style={styles.emptyText}>
                      {reservations.length === 0 ? 'No rooms are currently checked in.' : 'No checked-in rooms match.'}
                    </Text>
                  </View>
                ) : (
                  visibleReservations.map((res) => (
                    <TouchableOpacity
                      key={res.id}
                      style={styles.roomRow}
                      onPress={() => {
                        setSelectedReservation(res);
                        setStep('cart');
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.roomRowTopLine}>
                          <View style={styles.roomBadgePill}>
                            <Ionicons name="bed-outline" size={11} color={colors.white} />
                            <Text style={styles.roomBadgePillText}>Room {roomNumberOf(res)}</Text>
                          </View>
                          {isWalkIn(res) && (
                            <View style={styles.walkInTag}>
                              <Text style={styles.walkInTagText}>Walk-in</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.roomRowGuest}>{guestNameOf(res)}</Text>
                      </View>
                      <View style={styles.roomRowChevronWrap}>
                        <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </>
      )}

      {/* ── Step 2: build the order ─────────────────────────────────── */}
      {step === 'cart' && (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('room')} style={styles.headerBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Room {roomNumberOf(selectedReservation)}</Text>
              <Text style={styles.headerSubtitle}>{guestNameOf(selectedReservation)}</Text>
            </View>
            <StepTrack current="cart" />
          </View>

          {loadingMenu ? (
            <View style={styles.centerWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.cartScroll}>
              {Object.keys(categorized).length === 0 ? (
                <Text style={styles.emptyText}>No menu items are currently available.</Text>
              ) : (
                Object.entries(categorized).map(([category, items]) => (
                  <View key={category} style={styles.categoryBlock}>
                    <Text style={styles.categoryTitle}>{category}</Text>
                    {items.map((item) => {
                      const qty = cart[item.id] || 0;
                      return (
                        <View key={item.id} style={styles.menuRow}>
                          <View style={styles.menuThumbWrap}>
                            {item.photo_url ? (
                              <Image source={{ uri: item.photo_url }} style={styles.menuThumb} />
                            ) : (
                              <View style={[styles.menuThumb, styles.menuThumbFallback]}>
                                <Ionicons name={categoryIcon(item.category)} size={20} color={colors.primary} style={{ opacity: 0.5 }} />
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.menuRowName}>{item.name}</Text>
                            <Text style={styles.menuRowPrice}>{formatCurrency(item.price)}</Text>
                          </View>
                          {qty === 0 ? (
                            <TouchableOpacity style={styles.addBtn} onPress={() => adjustQty(item.id, 1)}>
                              <Ionicons name="add" size={16} color={colors.white} />
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.stepper}>
                              <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustQty(item.id, -1)}>
                                <Ionicons name="remove" size={14} color={colors.primary} />
                              </TouchableOpacity>
                              <Text style={styles.stepperValue}>{qty}</Text>
                              <TouchableOpacity style={styles.stepperBtn} onPress={() => adjustQty(item.id, 1)}>
                                <Ionicons name="add" size={14} color={colors.primary} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))
              )}

              <View style={styles.allergyFieldWrap}>
                <View style={styles.allergyFieldLabelRow}>
                  <Ionicons name="warning-outline" size={14} color="#B3792A" />
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

              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </ScrollView>
          )}

          {cartCount > 0 && (
            <TouchableOpacity
              style={[styles.placeBtn, placing && styles.placeBtnDisabled]}
              onPress={handlePlaceOrder}
              disabled={placing}
              activeOpacity={0.85}
            >
              {placing ? (
                <ActivityIndicator color={colors.white} size="small" style={{ flex: 1 }} />
              ) : (
                <>
                  <View style={styles.placeBtnIconWrap}>
                    <Ionicons name="checkmark" size={16} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.placeBtnText}>Place Order</Text>
                    <Text style={styles.placeBtnSubtext}>
                      {cartCount} item{cartCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text style={styles.placeBtnTotal}>{formatCurrency(cartTotal)}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── Step 3: confirmed ────────────────────────────────────────── */}
      {step === 'confirmed' && (
        <View style={styles.confirmWrap}>
          <View style={styles.confirmIconWrap}>
            <Ionicons name="checkmark" size={30} color={colors.white} />
          </View>
          <Text style={styles.confirmTitle}>Order placed</Text>
          <Text style={styles.confirmText}>
            Sent for Room {roomNumberOf(selectedReservation)} ({guestNameOf(selectedReservation)}). It'll appear in
            the list as a new order, ready to escalate to the kitchen.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType={isWide ? 'fade' : 'slide'}
      transparent={isWide}
      onRequestClose={onClose}
    >
      {isWide ? (
        <View style={styles.backdrop}>
          <View style={styles.dialogCard}>{stepContent}</View>
        </View>
      ) : (
        <View style={styles.screen}>{stepContent}</View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Mobile/narrow presentation — a plain fullscreen takeover.
  screen: { flex: 1, backgroundColor: colors.background },

  // Wide/desktop presentation — a centered, bounded dialog card over a
  // dimmed backdrop, instead of letting a 2-field form stretch across
  // the whole window.
  backdrop: { flex: 1, backgroundColor: 'rgba(15,15,17,0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  dialogCard: {
    width: '100%', maxWidth: 560, maxHeight: '88%',
    backgroundColor: colors.background, borderRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 40, elevation: 16,
  },

  scrollFlex: { flex: 1 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: {
    fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic',
    textAlign: 'center',
  },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.primary },
  headerSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },

  stepTrack: { flexDirection: 'row', gap: 4 },
  stepSegment: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepSegmentActive: { backgroundColor: colors.primary },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.white,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 13, fontFamily: fonts.body, color: colors.text },

  listSectionLabel: {
    fontSize: 11.5, fontFamily: fonts.bodySemiBold, color: colors.textMuted,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  roomList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  roomRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  roomRowTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  roomBadgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  roomBadgePillText: { fontSize: 11, fontFamily: fonts.headingSemiBold, color: colors.white },
  roomRowGuest: { fontSize: 14.5, fontFamily: fonts.headingSemiBold, color: colors.text },
  roomRowChevronWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  walkInTag: { backgroundColor: '#F5E9D6', borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm },
  walkInTagText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#B3792A' },

  cartScroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  categoryBlock: { marginBottom: spacing.md },
  categoryTitle: { fontSize: 13, fontFamily: fonts.headingSemiBold, color: colors.primary, marginBottom: spacing.xs },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  menuThumbWrap: { width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden' },
  menuThumb: { width: 52, height: 52 },
  menuThumbFallback: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  menuRowName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  menuRowPrice: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  addBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperBtn: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 13, fontFamily: fonts.headingSemiBold, color: colors.text, minWidth: 16, textAlign: 'center' },

  allergyFieldWrap: { marginTop: spacing.md, backgroundColor: '#FFF4D6', borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: '#F0D896' },
  allergyFieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  allergyFieldLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: '#7A5C00' },
  allergyInput: {
    borderWidth: 1, borderColor: '#F0D896', borderRadius: radius.sm, backgroundColor: colors.white,
    padding: spacing.sm, fontFamily: fonts.body, fontSize: 13, color: colors.text, minHeight: 50, textAlignVertical: 'top',
  },
  fieldLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  notesInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.cardAlt,
    padding: spacing.sm, fontFamily: fonts.body, fontSize: 13, color: colors.text, minHeight: 60, textAlignVertical: 'top',
  },
  errorText: { fontFamily: fonts.body, fontSize: 12, color: '#B3261E', marginTop: spacing.sm },

  placeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.lg,
    margin: spacing.lg, padding: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  placeBtnDisabled: { opacity: 0.6 },
  placeBtnIconWrap: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  placeBtnText: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.white },
  placeBtnSubtext: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  placeBtnTotal: { fontFamily: fonts.headingExtraBold, fontSize: 15, color: colors.white },

  confirmWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  confirmIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1E7B34', alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  confirmText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, maxWidth: 320 },
  doneBtn: {
    backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
    marginTop: spacing.lg,
  },
  doneBtnText: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.white },
});