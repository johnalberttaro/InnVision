import React, { useState } from 'react';
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
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import Brandheader from '../../components/shared/Brandheader';
import Appfooter from '../../components/shared/Appfooter';
import StepIndicator from '../../components/shared/StepIndicator';
import StayBar from '../../components/shared/StayBar';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatDate } from '../../utils/dateHelpers';
import { formatCurrency } from '../../utils/roomRates';

const TAX_RATE = 0.17;
const TWO_COL_BREAKPOINT = 680;

/**
 * ReviewPayScreen — Final step.
 *
 * This is the ONLY place in the mobile app that creates a Firestore
 * reservation document. Nothing before this point (dates, room selection,
 * guest form fields) is saved — it's all local, in-progress state passed
 * down as props. The document is created here, once, when the guest taps
 * "Confirm Reservation".
 *
 * It's written to the same collection/shape AdminDashboardScreen (and
 * AdminBookingsScreen) read from — collection "reservations" — with:
 *   - status: 'pending'   → matches the admin "Pending Reservations" screen,
 *     which approves (→ 'upcoming') or declines (→ 'declined') from there.
 *     We do NOT set 'upcoming' directly here; that skips admin review.
 *   - checkIn / checkOut as ISO strings
 *   - roomType, totals.totalRooms, nights, totalAmount, guestDetails —
 *     exactly the fields AdminDashboardScreen already reads.
 *   - createdAt: serverTimestamp() so it sorts correctly and appears
 *     immediately in the admin's live onSnapshot listener.
 *
 * Props:
 *  - bookingDetails: { checkIn, checkOut, nights, rooms, totals }
 *  - selectedRate:   rate object from Room & Rates
 *  - user:           Firebase auth user
 *  - onBackToRooms:  () => void
 *  - onConfirm:      () => void
 */
export default function ReviewPayScreen({ bookingDetails, selectedRate, user, onBackToRooms, onConfirm }) {
  const { width } = useWindowDimensions();
  const isTwoCol  = width >= TWO_COL_BREAKPOINT;

  const [firstName, setFirstName]             = useState(user?.displayName?.split(' ')[0] || '');
  const [lastName, setLastName]               = useState(user?.displayName?.split(' ').slice(1).join(' ') || '');
  const [email, setEmail]                     = useState(user?.email || '');
  const [phone, setPhone]                     = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [paymentMode, setPaymentMode]         = useState('hotel');
  const [agreed, setAgreed]                   = useState(false);
  const [errors, setErrors]                   = useState({});
  const [focusedField, setFocusedField]       = useState(null);
  const [confirming, setConfirming]           = useState(false);

  // Only set once the reservation has actually been created in Firestore
  // (i.e. after a successful addDoc below). Used only for the reference
  // badge — nothing before confirm should imply a saved record exists.
  const [reservationId, setReservationId] = useState(null);

  if (!bookingDetails || !selectedRate) {
    return (
      <View style={styles.container}>
        <Brandheader />
        <Text style={styles.message}>Missing booking information.</Text>
      </View>
    );
  }

  const { checkIn, checkOut, nights, rooms, totals } = bookingDetails;
  const subtotal = selectedRate.price * Math.max(nights, 1);
  const tax      = Math.round(subtotal * TAX_RATE);
  const total    = subtotal + tax;

  // ── Validation ───────────────────────────────────────────────────────
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

  const handleConfirm = async () => {
    if (!validate()) return;

    if (!user) {
      Alert.alert('Please log in', 'You need to be logged in to complete your reservation.');
      return;
    }

    setConfirming(true);

    try {
      // Create the reservation now — this is the single moment a booking
      // becomes official. Field names/shape here must match what
      // AdminDashboardScreen / AdminBookingsScreen query and read.
      const docRef = await addDoc(collection(db, 'reservations'), {
        uid:        user.uid,
        guestEmail: email.trim(),
        // Flat guestName kept for any admin views that don't drill into
        // guestDetails; guestDetails is the source of truth.
        guestName:  `${firstName.trim()} ${lastName.trim()}`.trim(),
        guestDetails: {
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     email.trim(),
          phone:     phone.trim(),
          specialRequests: specialRequests.trim(),
        },
        phone: phone.trim(),

        checkIn:  checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        nights,
        rooms:  rooms || null,
        totals,

        roomType: selectedRate.name,
        roomId:   selectedRate.id,

        subtotal,
        tax,
        totalAmount: total,
        paymentMode,

        // 'pending' → awaits admin approval on the Pending Reservations
        // screen (✓ moves it to 'upcoming', ✕ moves it to 'declined').
        status: 'pending',

        createdAt: serverTimestamp(),
      });

      setReservationId(docRef.id);

      Alert.alert(
        'Reservation Submitted! 🎉',
        `Thank you, ${firstName}! Your ${selectedRate.name} room request for ${formatDate(checkIn)} – ${formatDate(checkOut)} has been sent to the hotel for confirmation.\n\nTotal: ${formatCurrency(total)}`,
        [{ text: 'OK', onPress: onConfirm }]
      );
    } catch (err) {
      console.error('Confirm reservation error:', err);
      Alert.alert('Error', 'Could not submit your reservation. Please try again.');
    } finally {
      setConfirming(false);
    }
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
      <Brandheader />
      <StepIndicator currentStep={2} />

      <ScrollView contentContainerStyle={styles.content}>
        <StayBar checkIn={checkIn} checkOut={checkOut} totals={totals} onEdit={onBackToRooms} />

        {/* Room tab indicator */}
        <View style={styles.roomTabRow}>
          <View style={styles.roomTabActive}>
            <Text style={styles.roomTabActiveText}>ROOM 1 ✓</Text>
          </View>
          <View style={styles.roomTabRest}>
            <Text style={styles.roomTabRestText}>{selectedRate.name}</Text>
          </View>
        </View>

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
                    onPress={() => setPaymentMode(mode)}
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
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.confirmBtnText}>Confirm Reservation</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* ── RIGHT: Booking Summary ────────────────────────── */}
          <View style={[styles.panel, isTwoCol && { flex: 1 }]}>
            <Text style={styles.panelTitle}>Booking Summary</Text>

            <SummaryRow label="Check-in"  value={formatDate(checkIn)} />
            <SummaryRow label="Check-out" value={formatDate(checkOut)} />
            <SummaryRow label="Nights"    value={`${nights} night${nights !== 1 ? 's' : ''}`} />
            <SummaryRow label="Room"      value={selectedRate.name} />
            <SummaryRow
              label="Guests"
              value={
                `${totals.totalAdults} Adult${totals.totalAdults !== 1 ? 's' : ''}` +
                (totals.totalChildren > 0
                  ? `, ${totals.totalChildren} Child${totals.totalChildren !== 1 ? 'ren' : ''}`
                  : '')
              }
            />

            <View style={styles.rateBox}>
              <Text style={styles.rateBoxLabel}>▪ Room Only</Text>
              <Text style={styles.rateBoxPrice}>
                {formatCurrency(selectedRate.price)} × {nights} night{nights !== 1 ? 's' : ''}
              </Text>
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

        <View style={styles.footerBleed}>
          <Appfooter />
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text style={summaryStyles.value}>{value}</Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs + 2, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  label: { fontSize: 12, fontFamily: fonts.body,         color: colors.textMuted },
  value: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { padding: spacing.lg, paddingBottom: spacing.xxl },
  message:   { fontSize: 15, fontFamily: fonts.body, color: colors.textMuted, margin: spacing.lg },
  footerBleed: { marginHorizontal: -spacing.lg, marginTop: spacing.xl, marginBottom: -spacing.xxl },

  roomTabRow:       { flexDirection: 'row', marginBottom: spacing.lg, borderRadius: 8, overflow: 'hidden' },
  roomTabActive:    { backgroundColor: colors.step, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  roomTabActiveText:{ color: colors.white, fontFamily: fonts.headingSemiBold, fontSize: 12, letterSpacing: 0.4 },
  roomTabRest:      { flex: 1, backgroundColor: colors.stepBg, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  roomTabRestText:  { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 },

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
  checkmark:       { color: colors.white, fontSize: 11, fontFamily: fonts.bodySemiBold },
  termsText:       { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, flex: 1, lineHeight: 16 },
  termsLink:       { color: colors.primary, fontFamily: fonts.bodySemiBold, textDecorationLine: 'underline' },

  actionRow:           { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  backBtn:             { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt },
  backBtnText:         { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  confirmBtn:          { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  confirmBtnDisabled:  { opacity: 0.7 },
  confirmBtnText:      { color: colors.white, fontSize: 14, fontFamily: fonts.headingSemiBold, letterSpacing: 0.3 },

  rateBox:      { backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm, gap: 4 },
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
});