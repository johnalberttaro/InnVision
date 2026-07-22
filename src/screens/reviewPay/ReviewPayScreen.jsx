import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import Brandheader from '../../components/shared/Brandheader';
import Appfooter from '../../components/shared/Appfooter';
import StepIndicator from '../../components/shared/StepIndicator';
import StayBar from '../../components/shared/StayBar';
import EwalletPaymentScreen from './EwalletPaymentScreen';
import { useTheme } from '../../context/ThemeContext';
import { formatDate } from '../../utils/dateHelpers';
import { formatCurrency } from '../../utils/roomRates';

const TAX_RATE = 0.17;
const TWO_COL_BREAKPOINT = 680;

/**
 * ReviewPayScreen — Final step.
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). Fixes made during
 * migration:
 *  - The separate module-level `summaryStyles` (for the SummaryRow
 *    sub-component) is folded into the same getStyles() factory as the
 *    rest of the screen, so both recompute together when the theme
 *    changes. SummaryRow now takes `styles` as a prop instead of
 *    importing its own static stylesheet.
 *  - `roomSummaryRow`'s background was `colors.white` (invariant) used as
 *    a card surface — changed to `colors.card` so it flips like every
 *    other card.
 *  - `checkmark`, `confirmBtnText`, and the confirming-state spinner all
 *    used `colors.white` while sitting on `colors.primary` (which flips)
 *    — changed to `onPrimary`.
 *
 * MIGRATED TO SUPABASE. `user` is now a Supabase Auth user (user.id, not
 * user.uid). Also fixed the guest-duplication bug: upsertGuestRecord()
 * used to query-then-insert by a linkedUid field that registration never
 * actually set, silently creating a second guest row on every user's
 * first booking. It now does a single upsert() against guests.user_id,
 * which has a real UNIQUE constraint — see upsertGuestRecord() below.
 *
 * GUEST RECORD UPSERT: confirming a reservation also creates-or-updates
 * a matching row in the "guests" table, linked by guests.user_id. See
 * upsertGuestRecord() below for details.
 *
 * E-WALLET PAYMENT STEP (added): when Payment Mode is "Pay Online", the
 * "Confirm Reservation" button becomes "Pay Now". Tapping it does NOT
 * write to Supabase directly — instead ReviewPayScreen swaps its own
 * content for <EwalletPaymentScreen>, a dedicated sub-view (own file,
 * src/screens/booking/EwalletPaymentScreen.jsx) where the guest picks
 * GCash / Maya / GoTyme / Maribank and taps Proceed. This is a local
 * view swap (paymentStep state), not an App.jsx route change — the
 * guest-details form and the payment step are just two render branches
 * of this same screen, so no navigation prop wiring was needed.
 *
 * EwalletPaymentScreen is presentation-only: once its mock "processing"
 * delay finishes, it calls back via onConfirmPayment(walletId), which
 * this screen uses to set `eWallet` and immediately call
 * submitReservation() — the actual (and only) Supabase write still
 * happens here, same as the Pay at Hotel path.
 *
 * This is a MOCK payment step — no real gateway integration exists for
 * any of the four wallets. The reservation is still created with
 * status: 'pending' regardless of payment mode; a paid-online reservation
 * additionally gets paymentStatus: 'paid' and eWalletProvider set, which
 * BillingService.createBillingRecordFromReservation() reads at check-in
 * time to auto-record the payment on the folio.
 *
 * "Pay at Hotel" is unaffected — it still calls submitReservation()
 * directly with paymentStatus: 'unpaid'.
 *
 * This is the ONLY place in the mobile app that creates a Supabase
 * reservation document. Nothing before this point (dates, room selection,
 * guest form fields) is saved — it's all local, in-progress state passed
 * down as props. The document is created here, once, when the guest's
 * confirmation actually goes through.
 *
 * It's written to the same collection/shape AdminDashboardScreen (and
 * AdminBookingsScreen) read from — collection "reservations" — with:
 *   - status: 'pending'   → matches the admin "Pending Reservations" screen,
 *     which approves (→ 'upcoming') or declines (→ 'declined') from there.
 *     We do NOT set 'upcoming' directly here; that skips admin review.
 *   - checkIn / checkOut as ISO strings
 *   - selectedRooms: [{roomNumber, roomTypeId, roomTypeName, price}, ...]
 *     — one entry per physical room in this reservation, from
 *     RoomSelectionScreen's multi-room picker.
 *   - roomType: a human-readable comma-joined summary (e.g. "Twin, King")
 *     kept for any admin views (AdminBookingsScreen) that still display a
 *     single roomType string rather than drilling into selectedRooms.
 *   - totals.totalRooms, nights, totalAmount, guestDetails — exactly the
 *     fields AdminDashboardScreen already reads.
 *   - paymentStatus: 'paid' | 'unpaid' — 'paid' only when paymentMode is
 *     'online' and the mock e-wallet step completed; 'unpaid' for Pay at
 *     Hotel. Read by BillingService.createBillingRecordFromReservation()
 *     at check-in to auto-settle the folio for pre-paid reservations.
 *   - eWalletProvider: 'gcash' | 'maya' | 'gotyme' | 'maribank' | null —
 *     only set when paymentMode === 'online'. Mock only.
 *   - createdAt: serverTimestamp() so it sorts correctly and appears
 *     immediately in the admin's live onSnapshot listener.
 *
 * Props:
 *  - bookingDetails: { checkIn, checkOut, nights, rooms, totals }
 *  - selectedRooms:  Array<{roomNumber, roomTypeId, roomTypeName, price, name, ...}>
 *                    — one entry per room, from RoomSelectionScreen
 *  - user:           Firebase auth user
 *  - onBackToRooms:  () => void
 *  - onConfirm:      () => void
 */
export default function ReviewPayScreen({ bookingDetails, selectedRooms, user, onBackToRooms, onConfirm, onHomePress }) {
  const { width } = useWindowDimensions();
  const isTwoCol  = width >= TWO_COL_BREAKPOINT;

  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const [firstName, setFirstName]             = useState('');
  const [lastName, setLastName]               = useState('');
  const [email, setEmail]                     = useState(user?.email || '');
  const [phone, setPhone]                     = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [paymentMode, setPaymentMode]         = useState('hotel');
  const [eWallet, setEWallet]                 = useState(null);
  const [agreed, setAgreed]                   = useState(false);
  const [errors, setErrors]                   = useState({});
  const [focusedField, setFocusedField]       = useState(null);
  const [confirming, setConfirming]           = useState(false);
  const [showSuccessState, setShowSuccessState] = useState(false);
  const [successMessage, setSuccessMessage]   = useState('');

  // 'form' shows the guest-details form below; 'ewallet' swaps in
  // EwalletPaymentScreen. See docstring above.
  const [paymentStep, setPaymentStep] = useState('form');

  // Only set once the reservation has actually been created in Supabase
  // (i.e. after a successful addDoc below). Used only for the reference
  // badge — nothing before confirm should imply a saved record exists.
  const [reservationId, setReservationId] = useState(null);

  // profiles.first_name/last_name are reliably split (set at
  // registration by the on_auth_user_created trigger reading signup
  // metadata) — no more guessing by splitting a single displayName
  // string, which broke for multi-word first names like "John Albert"
  // (would have shown "John" / "Albert Tabasa" instead of "John Albert" /
  // "Tabasa"). Also prefills phone, which the old version left blank.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, phone')
          .eq('id', user.id)
          .single();
        if (!cancelled && !error && data) {
          if (data.first_name) setFirstName(data.first_name);
          if (data.last_name) setLastName(data.last_name);
          if (data.phone) setPhone(data.phone);
        }
      } catch (err) {
        console.warn('Failed to load profile for name prefill:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!bookingDetails || !selectedRooms || selectedRooms.length === 0) {
    return (
      <View style={styles.container}>
        <Brandheader />
        <Text style={styles.message}>Missing booking information.</Text>
      </View>
    );
  }

  const { checkIn, checkOut, nights, rooms, totals } = bookingDetails;
  const combinedNightlyRate = selectedRooms.reduce((sum, r) => sum + (r.price || 0), 0);
  const subtotal = combinedNightlyRate * Math.max(nights, 1);
  const tax      = Math.round(subtotal * TAX_RATE);
  const total    = subtotal + tax;
  const roomTypeSummary = selectedRooms.map((r) => r.roomTypeName || r.name).join(', ');

  if (showSuccessState) {
    return (
      <View style={styles.container}>
        <Brandheader onHomePress={onHomePress} />
        <View style={styles.successOverlay}>
          <TouchableOpacity style={styles.successHomeButton} onPress={onHomePress} activeOpacity={0.85}>
            <Ionicons name="home-outline" size={16} color={colors.primary} />
            <Text style={styles.successHomeButtonText}>Home</Text>
          </TouchableOpacity>

          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            </View>
            <Text style={styles.successTitle}>Reservation Submitted</Text>
            <Text style={styles.successMessage}>{successMessage}</Text>

            {reservationId && (
              <View style={styles.resIdBadge}>
                <Ionicons name="document-text-outline" size={13} color={colors.primary} />
                <Text style={styles.resIdText}>Ref: #{reservationId.slice(0, 10).toUpperCase()}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.successPrimaryBtn} onPress={onHomePress} activeOpacity={0.85}>
              <Text style={styles.successPrimaryBtnText}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Validation ───────────────────────────────────────────────────────
  // Note: eWallet choice is no longer validated here — it's chosen on
  // EwalletPaymentScreen itself, which won't call back until one is
  // selected. This only guards the fields that belong to this form.
  const validate = () => {
    const e = {};
    if (!firstName.trim()) e.firstName = 'First name is required.';
    if (!lastName.trim())  e.lastName  = 'Last name is required.';
    if (!email.trim()) {
      e.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'Enter a valid email address.';
    }
    if (!phone.trim()) e.phone = 'Phone number is required.';
    if (!agreed) e.agreed = 'Please agree to the Terms & Conditions.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Creates or updates this guest's entry in the "guests" table so the
  // booking shows up on the admin Guest Records screen. Runs after the
  // reservation itself has already been saved — failure here is logged
  // but never blocks or fails the guest's actual booking.
  //
  // FIXED BUG carried over from the Firestore version: the old code
  // queried for an existing guest by linkedUid and addDoc'd a new one if
  // none was found — but registration created a guests/{uid} doc WITHOUT
  // a linkedUid field, so that query always came up empty on a user's
  // first booking, creating a second, duplicate guest record every time.
  // guests.user_id now has a UNIQUE constraint, so a single upsert with
  // onConflict is both simpler and structurally correct — it can't
  // create a duplicate even if called repeatedly.
  const upsertGuestRecord = async () => {
    try {
      const { error } = await supabase
        .from('guests')
        .upsert(
          {
            user_id: user.id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            source: 'Mobile App',
            created_by: 'guest-booking',
          },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
    } catch (err) {
      console.warn('Failed to upsert guest record (reservation still succeeded):', err);
    }
  };

  // Actually writes the reservation to Supabase. Called either directly
  // (Pay at Hotel) or after EwalletPaymentScreen's onConfirmPayment fires
  // (Pay Online). Assumes validate() has already passed, and for online
  // payments that `eWallet` has already been set by handleEwalletConfirm.
  const submitReservation = async () => {
    setConfirming(true);
    try {
      const { data: inserted, error } = await supabase
        .from('reservations')
        .insert({
          user_id: user.id,
          guest_email: email.trim(),
          guest_details: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            specialRequests: specialRequests.trim(),
          },

          check_in: checkIn.toISOString(),
          check_out: checkOut.toISOString(),
          nights,
          guest_count: totals?.totalGuests ?? null,

          // selected_rooms: one entry per physical room in this
          // reservation. room_type is kept as a simple comma-joined
          // string for any admin views that don't drill into
          // selected_rooms.
          selected_rooms: selectedRooms.map((r) => ({
            roomNumber: r.roomNumber ?? null,
            roomTypeId: r.roomTypeId ?? r.id ?? null,
            roomTypeName: r.roomTypeName || r.name,
            price: r.price ?? null,
          })),
          room_type: roomTypeSummary,

          subtotal,
          tax,
          total_amount: total,
          payment_mode: paymentMode,
          // 'paid' only when the mock e-wallet step actually completed;
          // read by BillingService at check-in to auto-settle the folio.
          payment_status: paymentMode === 'online' && eWallet ? 'paid' : 'unpaid',
          // Mock only — no real gateway is wired in. Recorded purely for
          // reference/display and to pick the right paymentMethod on the
          // auto-generated receipt at check-in.
          ewallet_provider: paymentMode === 'online' ? eWallet : null,

          // 'pending' → awaits admin approval on the Pending Reservations
          // screen (✓ moves it to 'upcoming', ✕ moves it to 'declined').
          status: 'pending',
        })
        .select('id')
        .single();
      if (error) throw error;

      setReservationId(inserted.id);

      // Guest Records upsert — see upsertGuestRecord() docstring above.
      // Runs after the reservation write succeeds; its own errors are
      // caught internally and never affect the guest-facing flow below.
      await upsertGuestRecord();

      setSuccessMessage(`Thank you, ${firstName}! Your ${roomTypeSummary} room request for ${formatDate(checkIn)} – ${formatDate(checkOut)} has been sent to the hotel for confirmation.\n\nTotal: ${formatCurrency(total)}`);
      setShowSuccessState(true);
    } catch (err) {
      console.error('Confirm reservation error:', err);
      Alert.alert('Error', 'Could not submit your reservation. Please try again.');
      // Let the guest retry from the form rather than being stuck on a
      // payment-step view that already reported success to them.
      setPaymentStep('form');
    } finally {
      setConfirming(false);
    }
  };

  // Entry point for the form's action button. Pay at Hotel goes straight
  // to submitReservation(); Pay Online switches to EwalletPaymentScreen
  // instead — submitReservation() only runs once that screen calls back.
  const handleConfirm = () => {
    if (!validate()) return;

    if (!user) {
      Alert.alert('Please log in', 'You need to be logged in to complete your reservation.');
      return;
    }

    if (paymentMode === 'online') {
      setPaymentStep('ewallet');
      return;
    }

    submitReservation();
  };

  // Called by EwalletPaymentScreen once the guest picks a wallet and the
  // mock processing delay finishes.
  const handleEwalletConfirm = (walletId) => {
    setEWallet(walletId);
    submitReservation();
  };

  const handleEwalletCancel = () => {
    setPaymentStep('form');
  };

  // ── Helpers ──────────────────────────────────────────────────────────
  const isFocused  = (f) => focusedField === f;
  const hasError   = (f) => !!errors[f];
  const clearError = (f) => { if (errors[f]) setErrors(p => ({ ...p, [f]: null })); };

  const inputWrapStyle = (f) => [
    styles.inputWrap,
    isFocused(f) && styles.inputWrapFocused,
    hasError(f)  && styles.inputWrapError,
  ];

  return (
    <View style={styles.container}>
      <Brandheader onHomePress={onHomePress} />
      <StepIndicator currentStep={2} />

      <ScrollView contentContainerStyle={styles.content}>
        <StayBar checkIn={checkIn} checkOut={checkOut} totals={totals} onEdit={onBackToRooms} />

        {/* Room selection summary — one row per room in this reservation */}
        <View style={styles.roomsSummaryList}>
          {selectedRooms.map((room, i) => (
            <View key={room.roomNumber ?? room.id ?? i} style={styles.roomSummaryRow}>
              <Text style={styles.roomSummaryLabel}>ROOM {i + 1} ✓</Text>
              <Text style={styles.roomSummaryValue} numberOfLines={1}>
                {room.name || `${room.roomTypeName} (Room ${room.roomNumber})`}
              </Text>
            </View>
          ))}
        </View>

        {paymentStep === 'ewallet' ? (
          <EwalletPaymentScreen
            checkIn={checkIn}
            checkOut={checkOut}
            nights={nights}
            roomTypeSummary={roomTypeSummary}
            guestName={`${firstName} ${lastName}`.trim()}
            subtotal={subtotal}
            tax={tax}
            total={total}
            onCancel={handleEwalletCancel}
            onConfirmPayment={handleEwalletConfirm}
          />
        ) : (
        <View style={isTwoCol ? styles.twoCol : styles.oneCol}>

          {/* ── LEFT: Guest Details Form ──────────────────────── */}
          <View style={[styles.panel, isTwoCol && { flex: 1 }]}>
            <Text style={styles.panelTitle}>Enter Guest Details</Text>

            {/* First & Last Name */}
            <View style={styles.nameRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>First Name <Text style={styles.required}>*</Text></Text>
                <View style={inputWrapStyle('firstName')}>
                  <Ionicons name="person-outline" size={15} color={isFocused('firstName') ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={firstName}
                    onChangeText={v => { setFirstName(v); clearError('firstName'); }}
                    placeholder="Juan"
                    placeholderTextColor={colors.disabled}
                    onFocus={() => setFocusedField('firstName')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="words"
                  />
                </View>
                {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Last Name <Text style={styles.required}>*</Text></Text>
                <View style={inputWrapStyle('lastName')}>
                  <Ionicons name="person-outline" size={15} color={isFocused('lastName') ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={lastName}
                    onChangeText={v => { setLastName(v); clearError('lastName'); }}
                    placeholder="dela Cruz"
                    placeholderTextColor={colors.disabled}
                    onFocus={() => setFocusedField('lastName')}
                    onBlur={() => setFocusedField(null)}
                    autoCapitalize="words"
                  />
                </View>
                {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email Address <Text style={styles.required}>*</Text></Text>
              <View style={inputWrapStyle('email')}>
                <Ionicons name="mail-outline" size={15} color={isFocused('email') ? colors.primary : colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={v => { setEmail(v); clearError('email'); }}
                  placeholder="user@domain.com"
                  placeholderTextColor={colors.disabled}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone Number <Text style={styles.required}>*</Text></Text>
              <View style={inputWrapStyle('phone')}>
                <Text style={styles.phonePrefix}>🇵🇭 +63</Text>
                <View style={styles.phoneDivider} />
                <TextInput
                  style={[styles.input, { marginLeft: spacing.sm }]}
                  value={phone}
                  onChangeText={v => { setPhone(v); clearError('phone'); }}
                  placeholder="9XX XXX XXXX"
                  placeholderTextColor={colors.disabled}
                  keyboardType="phone-pad"
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
            </View>

            {/* Special Requests */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Special Requests <Text style={styles.optional}>(optional)</Text></Text>
              <View style={[inputWrapStyle('specialRequests'), styles.textAreaWrap]}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={specialRequests}
                  onChangeText={setSpecialRequests}
                  placeholder="e.g. estimated time of arrival, preferences..."
                  placeholderTextColor={colors.disabled}
                  multiline
                  numberOfLines={3}
                  onFocus={() => setFocusedField('specialRequests')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Payment Mode */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Payment Mode <Text style={styles.required}>*</Text></Text>
              <View style={styles.paymentRow}>
                {['hotel', 'online'].map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.payOption, paymentMode === mode && styles.payOptionActive]}
                    onPress={() => {
                      setPaymentMode(mode);
                      if (mode === 'hotel') setEWallet(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.payOptionText, paymentMode === mode && styles.payOptionTextActive]}>
                      {mode === 'hotel' ? 'Pay at Hotel' : 'Pay Online'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Terms & Conditions */}
            <TouchableOpacity
              style={[styles.termsRow, errors.agreed && styles.termsRowError]}
              onPress={() => { setAgreed(p => !p); clearError('agreed'); }}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.termsText}>
                By clicking, I confirm that I have read and agreed to the hotel's{' '}
                <Text style={styles.termsLink}>Terms & Conditions</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Data Privacy Policy</Text>.
              </Text>
            </TouchableOpacity>
            {errors.agreed && <Text style={styles.errorText}>{errors.agreed}</Text>}

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.backBtn} onPress={onBackToRooms} activeOpacity={0.8} disabled={confirming}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                activeOpacity={0.85}
                disabled={confirming}
              >
                {confirming
                  ? <ActivityIndicator color={colors.onPrimary} />
                  : <Text style={styles.confirmBtnText}>
                      {paymentMode === 'online' ? 'Pay Now' : 'Confirm Reservation'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* ── RIGHT: Booking Summary ────────────────────────── */}
          <View style={[styles.panel, isTwoCol && { flex: 1 }]}>
            <Text style={styles.panelTitle}>Booking Summary</Text>

            <SummaryRow styles={styles} label="Check-in"  value={formatDate(checkIn)} />
            <SummaryRow styles={styles} label="Check-out" value={formatDate(checkOut)} />
            <SummaryRow styles={styles} label="Nights"    value={`${nights} night${nights !== 1 ? 's' : ''}`} />
            <SummaryRow styles={styles} label={`Room${selectedRooms.length !== 1 ? 's' : ''}`} value={roomTypeSummary} />
            <SummaryRow
              styles={styles}
              label="Guests"
              value={
                `${totals.totalAdults} Adult${totals.totalAdults !== 1 ? 's' : ''}` +
                (totals.totalChildren > 0
                  ? `, ${totals.totalChildren} Child${totals.totalChildren !== 1 ? 'ren' : ''}`
                  : '')
              }
            />

            <View style={styles.rateBox}>
              {selectedRooms.map((room, i) => (
                <View key={room.roomNumber ?? room.id ?? i} style={[i > 0 && styles.rateLineDivider]}>
                  <Text style={styles.rateBoxLabel}>
                    ▪ {room.name || `${room.roomTypeName} (Room ${room.roomNumber})`}
                  </Text>
                  <Text style={styles.rateBoxPrice}>
                    {formatCurrency(room.price)} × {nights} night{nights !== 1 ? 's' : ''}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Subtotal</Text>
              <Text style={styles.calcValue}>{formatCurrency(subtotal)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Tax & Service Charge (17%)</Text>
              <Text style={styles.calcValue}>{formatCurrency(tax)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Cost</Text>
              <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
            </View>

            <Text style={styles.taxNote}>*Includes taxes and service charges.</Text>
            <Text style={[styles.taxNote, { fontFamily: fonts.bodySemiBold, marginTop: 2 }]}>
              * {paymentMode === 'online' ? 'Pay online upon confirmation.' : 'Pay at hotel upon check-in.'}
            </Text>

            {/* Reservation ID badge — only appears once addDoc has actually
                succeeded above; there is no id to show before that. */}
            {reservationId && (
              <View style={styles.resIdBadge}>
                <Ionicons name="document-text-outline" size={13} color={colors.primary} />
                <Text style={styles.resIdText}>Ref: #{reservationId.slice(0, 10).toUpperCase()}</Text>
              </View>
            )}
          </View>

        </View>
        )}

        <View style={styles.footerBleed}>
          <Appfooter />
        </View>
      </ScrollView>
        
    </View>
  );
}

function SummaryRow({ label, value, styles }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content:   { padding: spacing.lg, paddingBottom: spacing.xxl },
    message:   { fontSize: 15, fontFamily: fonts.body, color: colors.textMuted, margin: spacing.lg },
    footerBleed: { marginHorizontal: -spacing.lg, marginTop: spacing.xl, marginBottom: -spacing.xxl },

    roomsSummaryList:  { marginBottom: spacing.lg, gap: spacing.sm },
    roomSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    roomSummaryLabel: { fontSize: 12, fontFamily: fonts.headingSemiBold, color: colors.step, letterSpacing: 0.3 },
    roomSummaryValue: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, flex: 1 },

    twoCol: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
    oneCol: { flexDirection: 'column', gap: spacing.lg },

    panel: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    panelTitle: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.md, paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },

    nameRow:    { flexDirection: 'row', gap: spacing.sm },
    fieldGroup: { marginBottom: spacing.md },
    label:      { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginBottom: spacing.xs },
    required:   { color: colors.danger },
    optional:   { color: colors.textMuted, fontFamily: fonts.body },

    inputWrap:        { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md, gap: spacing.sm },
    inputWrapFocused: { borderColor: colors.primary, backgroundColor: colors.card },
    inputWrapError:   { borderColor: colors.danger,  backgroundColor: colors.dangerBg },
    textAreaWrap:     { alignItems: 'flex-start', paddingVertical: spacing.sm },
    inputIcon:        { flexShrink: 0 },
    input:            { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text, paddingVertical: 0 },
    textArea:         { minHeight: 60, textAlignVertical: 'top' },
    errorText:        { fontFamily: fonts.body, fontSize: 11, color: colors.danger, marginTop: spacing.xs },

    phonePrefix:  { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text, paddingRight: spacing.xs },
    phoneDivider: { width: 1, height: 18, backgroundColor: colors.border },

    paymentRow:          { flexDirection: 'row', gap: spacing.sm },
    payOption:           { flex: 1, paddingVertical: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, alignItems: 'center' },
    payOptionActive:     { borderColor: colors.primary, backgroundColor: colors.primaryTint },
    payOptionText:       { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textMuted },
    payOptionTextActive: { color: colors.primary },

    termsRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: spacing.md, borderWidth: 0.5, borderColor: colors.border },
    termsRowError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
    checkbox:        { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkmark:       { color: colors.onPrimary, fontSize: 11, fontFamily: fonts.bodySemiBold },
    termsText:       { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, flex: 1, lineHeight: 16 },
    termsLink:       { color: colors.primary, fontFamily: fonts.bodySemiBold, textDecorationLine: 'underline' },

    actionRow:           { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    backBtn:             { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt },
    backBtnText:         { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
    confirmBtn:          { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    confirmBtnDisabled:  { opacity: 0.7 },
    confirmBtnText:      { color: colors.onPrimary, fontSize: 14, fontFamily: fonts.headingSemiBold, letterSpacing: 0.3 },

    rateBox:      { backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm, gap: 4 },
    rateLineDivider: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.border },
    rateBoxLabel: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    rateBoxPrice: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
    divider:      { height: 0.5, backgroundColor: colors.border, marginVertical: spacing.sm },
    calcRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
    calcLabel:    { fontSize: 12, fontFamily: fonts.body,         color: colors.textMuted },
    calcValue:    { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
    totalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
    totalLabel:   { fontSize: 15, fontFamily: fonts.headingBold,      color: colors.text },
    totalValue:   { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
    taxNote:      { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

    resIdBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, backgroundColor: colors.primaryTint, borderRadius: radius.sm, padding: spacing.sm },
    resIdText:  { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primary },

    successOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
      paddingTop: spacing.xxl,
      position: 'relative',
    },
    successHomeButton: {
      position: 'absolute',
      top: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    successHomeButtonText: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
      fontSize: 13,
    },
    successCard: {
      width: '100%',
      maxWidth: 560,
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    successIconWrap: {
      marginBottom: spacing.md,
    },
    successTitle: {
      fontSize: 22,
      fontFamily: fonts.headingBold,
      color: colors.text,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    successMessage: {
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    successPrimaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      minWidth: 180,
      alignItems: 'center',
    },
    successPrimaryBtnText: {
      color: colors.onPrimary,
      fontFamily: fonts.bodySemiBold,
      fontSize: 14,
    },

    // Folded in from the old separate summaryStyles stylesheet
    summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs + 2, borderBottomWidth: 0.5, borderBottomColor: colors.border },
    summaryLabel: { fontSize: 12, fontFamily: fonts.body,         color: colors.textMuted },
    summaryValue: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  });
}