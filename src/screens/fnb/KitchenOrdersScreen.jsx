import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TextInput,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A short two-note chime for new escalated orders, synthesized with
// the Web Audio API rather than bundling an actual sound file — no
// audio asset needed, and nothing to worry about licensing-wise. Web
// only (Platform.OS check below); there's no equivalent here for the
// native app without adding an audio library, so it silently does
// nothing there rather than failing.
// Reused across calls rather than creating a brand-new AudioContext
// every time — browsers cap how many contexts can exist, and reusing
// one that was already created (and hopefully resumed) after an
// earlier click is far more likely to actually be in a 'running'
// state by the time a chime needs to play.
let sharedAudioContext = null;

function playNewOrderChime() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.AudioContext) return;
  try {
    if (!sharedAudioContext) sharedAudioContext = new window.AudioContext();
    const ctx = sharedAudioContext;

    const scheduleTones = () => {
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const now = ctx.currentTime;
      playTone(880, now, 0.15);
      playTone(1175, now + 0.15, 0.2);
    };

    // A freshly-created (or previously suspended) context reports
    // state 'suspended' until explicitly resumed — scheduling tones
    // against a suspended context produces no error AND no sound,
    // which is exactly what was happening. resume() returns a promise
    // that resolves once actually running; only schedule after that.
    if (ctx.state === 'suspended') {
      ctx.resume().then(scheduleTones).catch((err) => console.warn('Could not resume audio context:', err));
    } else {
      scheduleTones();
    }
  } catch (err) {
    console.warn('Could not play new-order chime:', err);
  }
}

// Called once on this screen's very first click/keydown, well before
// any chime is actually needed — creates the shared context (or
// resumes it if it already exists) directly inside a real user
// gesture handler, which is the most reliable way to satisfy the
// browser's autoplay policy. By the time an order actually escalates,
// the context should already be sitting in 'running' state.
function primeAudioContext() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.AudioContext) return;
  try {
    if (!sharedAudioContext) sharedAudioContext = new window.AudioContext();
    if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume().catch(() => {});
  } catch (err) {
    console.warn('Could not prime audio context:', err);
  }
}

function formatCurrency(amount) {
  return `₱${(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Relative time ("5m ago") — the preferred format for the card header.
// Falls back to an actual date once something is old enough that
// "N hours ago" stops being useful information.
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

// Minutes elapsed since an order started preparing — real, derived
// data (createdAt vs now), used for the "how long has this been
// cooking" progress indicator. Deliberately NOT a countdown: a
// countdown needs an estimated prep duration, which doesn't exist
// anywhere in this data model (no per-dish prep-time field). Faking
// one would mean showing a number with no basis in reality.
function minutesElapsed(dateString) {
  if (!dateString) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / 60000));
}

// Itemized bill for a food order — meant to be printed and physically
// delivered together with the food, per the original plan ("the
// assigned staff should bring the QR of the e-wallet and also the
// bill"). Same branded HTML-print pattern ReceiptDetailModal.jsx
// already uses for payment receipts (hotel name, colored header rule,
// row/label/value layout) — kept visually consistent with that rather
// than inventing a different look for this one bill.
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
        <div class="note">Please pay by cash or scan the e-wallet QR code provided by the delivering staff member.</div>
      </body>
    </html>
  `;
}

// Fallback icon for an order item with no real photo (menu item never
// had one, or was later deleted) — same category→icon mapping
// OrderFoodScreen.jsx's own menu grid uses, kept consistent rather
// than inventing a different fallback style here.
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

// Status badge labels form a deliberate chain that mirrors the action
// that produced each state: tap "Start Preparing" → badge reads
// "Preparing"; tap "Assign Delivery" → badge reads "Delivery Assigned"
// (not the more generic "Out for Delivery" this used to say) → tap
// "Mark Delivered" → badge reads "Delivered". Every stage name is
// readable as "the thing that was just done", not just a category.
const STATUS_META = {
  escalated: { label: 'To Prepare', color: '#2C5EA8', bg: '#E3ECF8' },
  preparing: { label: 'Preparing', color: '#8A5CB0', bg: '#EEE3F5' },
  out_for_delivery: { label: 'Delivery Assigned', color: '#B3792A', bg: '#F5E9D6' },
  delivered: { label: 'Delivered', color: '#1E7B34', bg: '#DFF5E1' },
  cancelled: { label: 'Cancelled', color: '#B3261E', bg: '#FBE7E7' },
};

// The three active-workflow columns of the Kanban board — order
// matters, this is left-to-right reading order on screen. Column
// titles stay as category names ("Out for Delivery" describes WHAT'S
// in this column), distinct from the per-card status badge above,
// which describes the state that specific order is in right now.
const BOARD_COLUMNS = [
  { status: 'escalated', title: 'To Prepare', color: '#2C5EA8', icon: 'flame-outline', emptyIcon: 'checkmark-done-circle-outline' },
  { status: 'preparing', title: 'Preparing', color: '#8A5CB0', icon: 'restaurant-outline', emptyIcon: 'cafe-outline' },
  { status: 'out_for_delivery', title: 'Out for Delivery', color: '#B3792A', icon: 'bicycle-outline', emptyIcon: 'bicycle-outline' },
];

// ── Hover-aware button ────────────────────────────────────────────────
// React Native Web forwards onMouseEnter/onMouseLeave through to the
// underlying DOM node, so a plain TouchableOpacity can track its own
// hover state — there's no separate ":hover" concept in RN itself.
// On native (phone/tablet) these events simply never fire, so this
// safely does nothing there rather than breaking anything.
function HoverButton({ style, hoverStyle, children, ...props }) {
  const [hovered, setHovered] = useState(false);
  return (
    <TouchableOpacity
      {...props}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={[style, hovered && (hoverStyle || styles.hoverDefault)]}
    >
      {children}
    </TouchableOpacity>
  );
}

/**
 * KitchenOrdersScreen — Food & Dining, Phase 3 of the Food Service
 * module. This is where the workflow Front Desk escalated to
 * (FoodOrdersScreen.jsx, Phase 2) actually gets carried out.
 *
 * Status flow this screen drives (food_orders.status):
 *   escalated  →  [Start Preparing]  →  preparing
 *   preparing  →  [Assign Delivery]  →  out_for_delivery
 *                 (picks a staff member from the F&B roster;
 *                  assigned_to / assigned_to_name get set)
 *   out_for_delivery  →  [Mark Delivered]  →  delivered
 *                 (records HOW it was paid — cash or e-wallet — since
 *                  payment is collected on delivery, not through the
 *                  app; see OrderFoodScreen.jsx's own header comment
 *                  for why there's no in-app payment step at all)
 *
 * LAYOUT: a 3-column Kanban board (To Prepare / Preparing / Out for
 * Delivery) — lets kitchen staff see every stage of the workflow at
 * once instead of switching tabs. Delivered/Cancelled orders live in
 * OrderHistoryScreen.jsx, its own separate sidebar item — this screen
 * only ever shows active work.
 *
 * "Preparing" cards show an elapsed-time bar (see minutesElapsed()
 * above) — deliberately real data (time since escalation), not a fake
 * countdown to an estimated-ready time that doesn't exist anywhere in
 * this schema.
 *
 * RLS note: food_orders/food_order_items policies were widened to
 * include the 'fnb' role in 004_food_service_fnb_setup.sql — without
 * that migration, this screen would load with zero orders visible no
 * matter how many actually exist, since the database would silently
 * filter everything out rather than error.
 *
 * Props:
 *  - staffUid, staffName: the signed-in Kitchen/F&B user.
 */
export default function KitchenOrdersScreen({ staffUid, staffName }) {
  const [orders, setOrders] = useState([]);
  const [fnbStaff, setFnbStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyOrderId, setBusyOrderId] = useState(null);

  const [assignTarget, setAssignTarget] = useState(null);
  const [assignStaffId, setAssignStaffId] = useState(null);
  const [assignSaving, setAssignSaving] = useState(false);

  const [deliverTarget, setDeliverTarget] = useState(null);
  const [deliverSaving, setDeliverSaving] = useState(false);
  const [deliverError, setDeliverError] = useState('');

  // ── New-order alert (sound + badge pulse + tab title) ────────────────
  // Tracks which escalated order IDs we've already alerted on, so a
  // page refresh or the very first load doesn't treat every existing
  // order as "new" — only orders that escalate WHILE this screen is
  // open should ever trigger the chime/pulse/flash.
  const seenEscalatedIdsRef = useRef(null); // null until first load completes
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : '');
  const unseenCountRef = useRef(0);
  const flashIntervalRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const triggerNewOrderPulse = () => {
    pulseAnim.setValue(1);
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.35, duration: 200, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const startTabFlash = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (flashIntervalRef.current) return; // already flashing
    let showAlert = false;
    flashIntervalRef.current = setInterval(() => {
      document.title = showAlert
        ? `(${unseenCountRef.current}) New Order${unseenCountRef.current > 1 ? 's' : ''} — InnVision`
        : originalTitleRef.current;
      showAlert = !showAlert;
    }, 1200);
  };

  const stopTabFlash = () => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }
    unseenCountRef.current = 0;
    if (typeof document !== 'undefined') document.title = originalTitleRef.current;
  };

  // Returning to the tab acknowledges whatever's new — stop flashing
  // the title, but sound/pulse for genuinely new arrivals still fire
  // normally while the tab IS focused.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisibilityChange = () => { if (!document.hidden) stopTabFlash(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopTabFlash();
    };
  }, []);

  // Primes the chime's audio context on the very first click or
  // keypress anywhere on the page — see primeAudioContext()'s own
  // comment above for why this matters. Removes itself after firing
  // once; no need to keep listening after the context is created.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onFirstInteraction = () => {
      primeAudioContext();
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('keydown', onFirstInteraction);
    };
    document.addEventListener('click', onFirstInteraction);
    document.addEventListener('keydown', onFirstInteraction);
    return () => {
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('keydown', onFirstInteraction);
    };
  }, []);

  const orderToCamel = (row) => ({
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    guestName: row.guest_name,
    roomNumber: row.room_number,
    status: row.status,
    notes: row.notes,
    totalAmount: row.total_amount,
    assignedTo: row.assigned_to,
    assignedToName: row.assigned_to_name,
    createdAt: row.created_at,
    guestPhotoUrl: null, // filled in by the guest-photo lookup pass below
    items: (row.food_order_items || []).map((i) => ({
      id: i.id,
      name: i.item_name,
      description: i.food_menu_items?.description || null,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      subtotal: i.subtotal,
      // Real photo/category, pulled from the menu item this line was
      // ordered from — not a stock image. If that menu item was later
      // deleted, menu_item_id (and this join) comes back null and the
      // card falls back to a category-style icon, same fallback
      // OrderFoodScreen.jsx's own menu grid uses.
      photoUrl: i.food_menu_items?.photo_url || null,
      category: i.food_menu_items?.category || null,
    })),
  });

  useEffect(() => {
    const loadOrders = async () => {
      const { data, error } = await supabase
        .from('food_orders')
        .select('*, food_order_items(*, food_menu_items(photo_url, category, description))')
        // Oldest first — a kitchen works through orders in the order
        // they came in (FIFO), so whichever order has been waiting
        // longest in a given column should always show at the top,
        // not whichever was placed most recently.
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Failed to load food orders:', error);
        setLoading(false);
        return;
      }
      const mapped = (data || []).map(orderToCamel);
      setOrders(mapped);
      setLoading(false);

      // Detect orders that are newly escalated since the last load —
      // skipped entirely on the very first load (seenEscalatedIdsRef
      // starts at null), so opening this screen with existing orders
      // already in "To Prepare" doesn't trigger a false alarm.
      const currentEscalatedIds = new Set(mapped.filter((o) => o.status === 'escalated').map((o) => o.id));
      if (seenEscalatedIdsRef.current !== null) {
        const newlyEscalated = [...currentEscalatedIds].filter((id) => !seenEscalatedIdsRef.current.has(id));
        if (newlyEscalated.length > 0) {
          playNewOrderChime();
          triggerNewOrderPulse();
          if (typeof document !== 'undefined' && document.hidden) {
            unseenCountRef.current += newlyEscalated.length;
            startTabFlash();
          }
        }
      }
      seenEscalatedIdsRef.current = currentEscalatedIds;

      // Guest photos live on profiles, not on the order itself — a
      // separate lookup (rather than a join) since food_orders.user_id
      // references auth.users, not public.profiles directly, so
      // PostgREST can't auto-embed it the way it does for menu items.
      const userIds = [...new Set(mapped.map((o) => o.userId).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, photo_url')
          .in('id', userIds);
        if (!profileError && profileRows) {
          const photoById = Object.fromEntries(profileRows.map((p) => [p.id, p.photo_url]));
          setOrders((prev) => prev.map((o) => (
            o.userId && photoById[o.userId] ? { ...o, guestPhotoUrl: photoById[o.userId] } : o
          )));
        }
      }
    };
    loadOrders();

    const channel = supabase
      .channel('food-orders-kitchen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_orders' }, loadOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_order_items' }, loadOrders)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    const loadStaff = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, display_name')
        .eq('role', 'fnb')
        .eq('active', true)
        .order('first_name');
      if (error) {
        console.error('Failed to load F&B staff list:', error);
        return;
      }
      setFnbStaff(
        (data || []).map((s) => ({
          id: s.id,
          name: s.display_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Staff',
        }))
      );
    };
    loadStaff();
  }, []);

  // ── Search (applies to both the board and the history list) ────────────
  const matchesSearch = (o) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (o.guestName || '').toLowerCase().includes(q) || (o.roomNumber || '').toLowerCase().includes(q);
  };

  // ── Board columns ────────────────────────────────────────────────────
  const boardColumns = useMemo(() => {
    return BOARD_COLUMNS.map((col) => ({
      ...col,
      orders: orders.filter((o) => o.status === col.status && matchesSearch(o)),
    }));
  }, [orders, searchQuery]);

  const totalOrders = orders.length;

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

  const handleStartPreparing = async (order) => {
    setBusyOrderId(order.id);
    try {
      const { error } = await supabase.from('food_orders').update({ status: 'preparing' }).eq('id', order.id);
      if (error) throw error;
      // Update our own view immediately rather than waiting for the
      // realtime round-trip — this succeeded, no reason to wait to see
      // it reflected on the very screen that just did it.
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'preparing' } : o)));
    } catch (err) {
      console.error('Failed to start preparing order:', err);
      const message = err?.message || 'Could not start preparing this order. Please try again.';
      window?.alert ? window.alert(message) : console.warn(message);
    } finally {
      setBusyOrderId(null);
    }
  };

  const openAssignModal = (order) => {
    // If there's only one active F&B staff member, there's no real
    // choice to make — pre-select them instead of making the person
    // tap their own name in a list of one before they can confirm.
    setAssignStaffId(fnbStaff.length === 1 ? fnbStaff[0].id : null);
    setAssignTarget(order);
  };

  const submitAssign = async () => {
    if (!assignTarget || !assignStaffId) return;
    const staff = fnbStaff.find((s) => s.id === assignStaffId);
    setAssignSaving(true);
    try {
      const { error } = await supabase
        .from('food_orders')
        .update({ status: 'out_for_delivery', assigned_to: assignStaffId, assigned_to_name: staff?.name || null })
        .eq('id', assignTarget.id);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => (
        o.id === assignTarget.id
          ? { ...o, status: 'out_for_delivery', assignedTo: assignStaffId, assignedToName: staff?.name || null }
          : o
      )));
      setAssignTarget(null);
    } catch (err) {
      console.error('Failed to assign delivery:', err);
      const message = err?.message || 'Could not assign delivery for this order. Please try again.';
      window?.alert ? window.alert(message) : console.warn(message);
    } finally {
      setAssignSaving(false);
    }
  };

  const submitDelivered = async (paymentMethod) => {
    if (!deliverTarget) return;
    setDeliverSaving(true);
    setDeliverError('');
    try {
      // Cash is confirmed on the spot — whoever delivered it physically
      // holds the money, nothing left to verify. E-wallet money lands in
      // the hotel's own account, not something F&B can confirm cleared
      // just by looking at a guest's phone screen — that gets verified
      // by Front Desk instead, same as e-wallet payments for room
      // bookings already go through their reconciliation. So this only
      // marks payment_status = 'paid' immediately for cash; e-wallet
      // orders land at 'pending_confirmation' until Front Desk clears
      // them (see FoodOrdersScreen.jsx's "Payment Pending" tab).
      const paymentStatus = paymentMethod === 'cash' ? 'paid' : 'pending_confirmation';
      const { error } = await supabase
        .from('food_orders')
        .update({ status: 'delivered', payment_status: paymentStatus, payment_method: paymentMethod })
        .eq('id', deliverTarget.id);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => (
        o.id === deliverTarget.id
          ? { ...o, status: 'delivered', paymentStatus, paymentMethod }
          : o
      )));
      setDeliverTarget(null);
    } catch (err) {
      console.error('Failed to mark order delivered:', err);
      setDeliverError(err?.message || 'Could not mark this order as delivered. Please try again.');
    } finally {
      setDeliverSaving(false);
    }
  };

  // Shared card renderer — used by both the Kanban columns and the
  // history list below, so the two never drift out of sync with each
  // other visually.
  const renderOrderCard = (order) => {
    const meta = STATUS_META[order.status] || STATUS_META.escalated;
    const isBusy = busyOrderId === order.id;
    const elapsed = order.status === 'preparing' ? minutesElapsed(order.createdAt) : 0;
    // Purely visual — fills up over a 20-minute reference window and
    // caps at full, so it reads as "getting long" without claiming to
    // know an actual target time.
    const elapsedPct = Math.min(100, Math.round((elapsed / 20) * 100));

    return (
      <View key={order.id} style={styles.orderCard}>
        <View style={styles.orderTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderNumber}>Order #{order.orderNumber ?? '—'}</Text>
            <Text style={styles.orderDateTime}>{timeAgo(order.createdAt)}</Text>
          </View>
          {order.guestPhotoUrl ? (
            <Image source={{ uri: order.guestPhotoUrl }} style={styles.guestAvatarImage} />
          ) : (
            <View style={styles.guestAvatar}>
              <Text style={styles.guestAvatarText}>{(order.guestName || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.orderSubRow}>
          <View style={styles.roomBadge}>
            <Ionicons name="bed-outline" size={12} color={colors.white} />
            <Text style={styles.roomBadgeText}>Room {order.roomNumber}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        <Text style={styles.guestName}>{order.guestName}</Text>

        {order.status === 'preparing' && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${elapsedPct}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{elapsed}m preparing</Text>
          </View>
        )}

        <View style={styles.itemsList}>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.itemThumb} />
              ) : (
                <View style={[styles.itemThumb, styles.itemThumbFallback]}>
                  <Ionicons name={categoryIcon(item.category)} size={22} color={colors.primary} style={{ opacity: 0.5 }} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                {!!item.description && <Text style={styles.itemDescription} numberOfLines={1}>{item.description}</Text>}
                <View style={styles.itemPriceQtyRow}>
                  <Text style={styles.itemPrice}>{formatCurrency(item.unitPrice)}</Text>
                  <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {!!order.notes && <Text style={styles.orderNotes}>"{order.notes}"</Text>}

        {!!order.assignedToName && (
          <View style={styles.assigneeRow}>
            <Ionicons name="person-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.assigneeText}>Delivering: {order.assignedToName}</Text>
          </View>
        )}

        <View style={styles.orderBottomRow}>
          <Text style={styles.orderMeta}>
            ×{order.items.reduce((sum, i) => sum + i.quantity, 0)} Items
          </Text>
          <Text style={styles.orderTotal}>{formatCurrency(order.totalAmount)}</Text>
        </View>

        {order.status === 'escalated' && (
          <HoverButton
            style={[styles.primaryActionBtn, styles.primaryActionBtnLarge]}
            hoverStyle={styles.primaryActionBtnHover}
            onPress={() => handleStartPreparing(order)}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            {isBusy
              ? <ActivityIndicator color={colors.white} size="small" />
              : (
                <>
                  <Ionicons name="flame" size={18} color={colors.white} />
                  <Text style={styles.primaryActionBtnTextLarge}>Start Preparing</Text>
                </>
              )
            }
          </HoverButton>
        )}

        {order.status === 'preparing' && (
          <HoverButton
            style={[styles.primaryActionBtn, styles.primaryActionBtnLarge]}
            hoverStyle={styles.primaryActionBtnHover}
            onPress={() => openAssignModal(order)}
            activeOpacity={0.8}
          >
            <Ionicons name="bicycle-outline" size={18} color={colors.white} />
            <Text style={styles.primaryActionBtnTextLarge}>Assign Delivery</Text>
          </HoverButton>
        )}

        {order.status === 'out_for_delivery' && (
          <HoverButton
            style={[styles.primaryActionBtn, styles.primaryActionBtnLarge]}
            hoverStyle={styles.primaryActionBtnHover}
            onPress={() => { setDeliverError(''); setDeliverTarget(order); }}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-done-outline" size={18} color={colors.white} />
            <Text style={styles.primaryActionBtnTextLarge}>Mark Delivered</Text>
          </HoverButton>
        )}

        {(order.status === 'preparing' || order.status === 'out_for_delivery') && (
          <HoverButton
            style={[styles.billBtn, styles.primaryActionBtnLarge]}
            hoverStyle={styles.billBtnHover}
            onPress={() => handlePrintBill(order)}
            activeOpacity={0.8}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={styles.billBtnTextLarge}>Generate Bill</Text>
          </HoverButton>
        )}
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
          <Text style={styles.title}>Kitchen Orders</Text>
          <Text style={styles.subtitle}>Prepare escalated orders, assign delivery, and record payment on delivery.</Text>
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

      <ScrollView style={styles.bodyScroll} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.contentWrap}>
          <View style={styles.board}>
            {boardColumns.map((col) => (
              <View key={col.status} style={styles.boardColumn}>
                <View style={[styles.columnHeader, { backgroundColor: col.color }]}>
                  <View style={styles.columnHeaderLeft}>
                    <Ionicons name={col.icon} size={16} color={colors.white} />
                    <Text style={styles.columnHeaderTitle}>{col.title}</Text>
                  </View>
                  <Animated.View
                    style={[
                      styles.columnHeaderBadge,
                      col.status === 'escalated' && { transform: [{ scale: pulseAnim }] },
                    ]}
                  >
                    <Text style={styles.columnHeaderBadgeText}>{col.orders.length}</Text>
                  </Animated.View>
                </View>
                <View style={styles.columnBody}>
                  {col.orders.length === 0 ? (
                    <View style={styles.emptyColumnWrap}>
                      <Ionicons name={col.emptyIcon} size={32} color={col.color} style={{ opacity: 0.35 }} />
                      <Text style={styles.emptyColumnText}>No orders here right now.</Text>
                    </View>
                  ) : (
                    col.orders.map(renderOrderCard)
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Always-visible summary bar ────────────────────────────────── */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryBarTotal}>Total Orders <Text style={styles.summaryBarTotalNum}>{totalOrders}</Text></Text>
        {BOARD_COLUMNS.map((col, i) => (
          <React.Fragment key={col.status}>
            {i === 0 && <View style={styles.summaryBarDivider} />}
            <View style={styles.summaryBarItem}>
              <View style={[styles.summaryBarDot, { backgroundColor: col.color }]} />
              <Text style={styles.summaryBarItemText}>{col.title} {orders.filter((o) => o.status === col.status).length}</Text>
            </View>
            {i < BOARD_COLUMNS.length - 1 && <View style={styles.summaryBarDivider} />}
          </React.Fragment>
        ))}
      </View>

      {/* ── Assign Delivery modal ────────────────────────────────────── */}
      <Modal visible={!!assignTarget} transparent animationType="fade" onRequestClose={() => setAssignTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign Delivery</Text>
            <Text style={styles.modalSubtitle}>
              Who's delivering the order to Room {assignTarget?.roomNumber}?
            </Text>

            {fnbStaff.length === 0 ? (
              <Text style={styles.noStaffText}>No active F&amp;B staff found. Ask an admin to create one under F&amp;B Accounts.</Text>
            ) : (
              <View style={styles.pickerWrapRow}>
                {fnbStaff.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.pickerChip, assignStaffId === s.id && styles.pickerChipActive]}
                    onPress={() => setAssignStaffId(s.id)}
                  >
                    <Text style={[styles.pickerChipText, assignStaffId === s.id && styles.pickerChipTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAssignTarget(null)} disabled={assignSaving}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, (!assignStaffId || assignSaving) && styles.modalSubmitBtnDisabled]}
                onPress={submitAssign}
                disabled={!assignStaffId || assignSaving}
              >
                {assignSaving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Assign & Send Out</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Mark Delivered modal — records how payment was collected ──── */}
      <Modal visible={!!deliverTarget} transparent animationType="fade" onRequestClose={() => setDeliverTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark as Delivered</Text>
            <Text style={styles.modalSubtitle}>
              Confirm the order for Room {deliverTarget?.roomNumber} was delivered, and how the guest paid.
            </Text>
            <Text style={styles.deliverTotal}>{formatCurrency(deliverTarget?.totalAmount)}</Text>

            <View style={styles.paymentBtnRow}>
              <TouchableOpacity
                style={styles.paymentBtn}
                onPress={() => submitDelivered('cash')}
                disabled={deliverSaving}
                activeOpacity={0.85}
              >
                <Ionicons name="cash-outline" size={20} color={colors.primary} />
                <Text style={styles.paymentBtnText}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.paymentBtn}
                onPress={() => submitDelivered('e-wallet')}
                disabled={deliverSaving}
                activeOpacity={0.85}
              >
                <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
                <Text style={styles.paymentBtnText}>E-wallet</Text>
              </TouchableOpacity>
            </View>

            {deliverSaving && <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: spacing.sm }} />}
            {!!deliverError && <Text style={styles.deliverErrorText}>{deliverError}</Text>}

            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDeliverTarget(null)} disabled={deliverSaving}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 21, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 9,
    minWidth: 240, flexGrow: 1, maxWidth: 340,
  },
  searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text, padding: 0 },

  bodyScroll: { flex: 1 },

  // Content is capped at a sane max width and centered on very wide
  // monitors — otherwise a huge desktop screen just stretches
  // everything thin instead of actually using the space well. Padding
  // trimmed down from the previous pass to cut back on excess empty
  // margin around the board.
  contentWrap: { width: '100%', maxWidth: 1500, alignSelf: 'center', padding: spacing.lg },

  // ── Kanban board ────────────────────────────────────────────────────
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  boardColumn: {
    flexGrow: 1, flexBasis: 320, maxWidth: 460, alignSelf: 'flex-start',
    backgroundColor: colors.cardAlt, borderRadius: radius.lg,
  },
  columnHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  columnHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  columnHeaderTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white },
  columnHeaderBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999,
    minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  columnHeaderBadgeText: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.white },
  columnBody: { padding: spacing.sm + 2, gap: spacing.sm + 2, alignItems: 'center' },

  emptyColumnWrap: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs },
  emptyColumnText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },

  orderCard: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.sm + 4, paddingBottom: spacing.md + 4,
    maxWidth: 400, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },

  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderNumber: { fontSize: 15, fontFamily: fonts.headingExtraBold, color: colors.primary },
  orderDateTime: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  guestAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  guestAvatarImage: { width: 40, height: 40, borderRadius: 20 },
  guestAvatarText: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },

  orderSubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  roomBadgeText: { fontSize: 11, fontFamily: fonts.headingBold, color: colors.white },
  statusBadge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: spacing.sm },
  statusBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold },

  // Bold for hierarchy, per the request — the guest's name is the
  // second thing (after the room) staff actually need to confirm.
  guestName: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text, marginTop: spacing.xs },

  // Elapsed-time indicator, "Preparing" cards only.
  progressWrap: { marginTop: spacing.xs },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#8A5CB0' },
  progressLabel: { fontSize: 10.5, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 3 },

  itemsList: { marginTop: spacing.sm, gap: spacing.xs },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemThumb: { width: 52, height: 52, borderRadius: 14 },
  itemThumbFallback: { backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  // Lighter weight for item-level detail — deliberately less heavy
  // than the room/guest header above, so the eye lands on "who and
  // where" first, "what" second.
  itemName: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  itemDescription: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  itemPriceQtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  itemPrice: { fontSize: 12.5, fontFamily: fonts.bodyMedium, color: colors.primary },
  itemQty: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textMuted },

  orderNotes: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic', marginTop: 3 },

  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  assigneeText: { fontSize: 11.5, fontFamily: fonts.bodyMedium, color: colors.textMuted },

  orderBottomRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border,
  },
  orderMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  // Groups every action button into its own visually distinct box —
  // separated from the order-details section above by both the
  // orderBottomRow divider and this box's own background tint, so the
  // card reads as two clear zones: "what the order is" (top) and
  // "what to do about it" (bottom), rather than buttons just floating
  // loose at the end of the card.
  orderTotal: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },

  // Default hover treatment for the plain HoverButton usage — a subtle
  // lift, not used directly by name (buttons below pass their own
  // hoverStyle so the hover tint matches each button's own color).
  hoverDefault: { opacity: 0.9 },

  primaryActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.sm - 1, marginTop: spacing.sm,
  },
  // All action buttons share this same taller size now — Start
  // Preparing, Assign Delivery, Mark Delivered, and Generate Bill are
  // all equally prominent, not just the first-stage one.
  primaryActionBtnLarge: { paddingVertical: spacing.md - 2, gap: 8 },
  primaryActionBtnHover: { backgroundColor: '#4A3F30' },
  primaryActionBtnTextLarge: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white },

  // Generate Bill is deliberately white — same size as every other
  // action button, but a different fill so it visually reads as "the
  // one that's not a workflow-progressing step" (it doesn't change the
  // order's status, unlike the other three).
  billBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: 999, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  billBtnHover: { backgroundColor: colors.cardAlt },
  billBtnTextLarge: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.primary },

  // ── Bottom summary bar ────────────────────────────────────────────────
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.primary },
  modalSubtitle: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  noStaffText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic' },

  pickerWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pickerChip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: spacing.md, backgroundColor: colors.cardAlt,
  },
  pickerChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickerChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text },
  pickerChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  deliverTotal: { fontSize: 24, fontFamily: fonts.headingExtraBold, color: colors.primary, textAlign: 'center', marginBottom: spacing.md },
  deliverErrorText: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', textAlign: 'center', marginTop: spacing.sm },
  paymentBtnRow: { flexDirection: 'row', gap: spacing.md },
  paymentBtn: {
    flex: 1, alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md,
  },
  paymentBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.primary },

  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center', marginTop: spacing.md },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  modalSubmitBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  modalSubmitBtnDisabled: { opacity: 0.5 },
  modalSubmitText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});