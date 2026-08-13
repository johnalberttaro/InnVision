import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import {
  subscribeToRooms,
  subscribeToRoomTypes,
  joinRoomsWithTypes,
  updateRoomStatus,
  formatCurrency,
  ROOM_STATUS,
} from '../../utils/Roomsservice';
import { createBillingRecord } from '../../utils/BillingService';

const TAX_RATE = 0.17; // matches the guest-facing booking flow (ReviewPayScreen)

/**
 * WalkInScreen — lets front desk staff check in a guest who shows up
 * without a prior reservation.
 *
 * DESIGN DECISIONS (per explicit request, not the guest-booking default):
 *  - No login/account is created for the guest. A lightweight `guests`
 *    row is inserted with user_id: null — the exact same convention
 *    GuestRecordsScreen.jsx's "Add Guest" already uses for staff-entered
 *    guests (see the comment there: "manually created here → always a
 *    walk-in / staff-entered guest"). This screen reuses that pattern
 *    rather than inventing a new one.
 *  - The stay skips the Reservation stage entirely and is inserted
 *    directly with status: 'checked-in' + checked_in_at set — the same
 *    end state ReservationsScreen.jsx's handleCheckIn() produces, just
 *    reached in one step instead of via an existing 'upcoming' row.
 *  - Because user_id is null (no guest account), this reservation will
 *    NOT auto-link to the guest's record on Guest Records (that screen
 *    joins guests ⨝ reservations by user_id) — same known limitation
 *    that already applies to any manually-added guest today. The folio
 *    and room status are unaffected by this; only the "current
 *    reservation" convenience link on the guest's profile won't populate.
 *  - No guest notification is created (there's no auth user to notify).
 *
 * Length of stay is collected as a number of nights rather than a
 * calendar date range, since check-in is always "now" for a walk-in —
 * keeps the form to one screen without pulling in the guest booking
 * flow's calendar component.
 *
 * VISUAL DESIGN: matches the icon-badged section-header + shadowed-card
 * language established by KpiCard/AddRoomTypeScreen elsewhere in the
 * portal. Room selection reuses each room's photo (same `images[0]`
 * RoomManagementScreen's RoomRow shows) so a room reads as a place, not
 * just a number. Guests/Nights use the same +/- stepper control as
 * OrderFoodScreen's cart. Total is pinned to a floating bottom bar
 * (same pattern as OrderFoodScreen's cart bar) so it's always visible
 * while scrolling a long room list.
 */
export default function WalkInScreen({ staffUid, staffName, onCheckedIn }) {
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [nights, setNights] = useState(1);
  const [specialRequests, setSpecialRequests] = useState('');
  const [selectedRoomNumbers, setSelectedRoomNumbers] = useState([]);

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let roomsLoaded = false;
    let typesLoaded = false;
    const maybeStopLoading = () => {
      if (roomsLoaded && typesLoaded) setLoadingRooms(false);
    };

    const unsubRooms = subscribeToRooms(
      (data) => { setRooms(data); roomsLoaded = true; maybeStopLoading(); },
      () => { setLoadError('Could not load rooms.'); roomsLoaded = true; maybeStopLoading(); }
    );
    const unsubTypes = subscribeToRoomTypes(
      (data) => { setRoomTypes(data); typesLoaded = true; maybeStopLoading(); },
      () => { setLoadError('Could not load room types.'); typesLoaded = true; maybeStopLoading(); }
    );

    return () => {
      unsubRooms && unsubRooms();
      unsubTypes && unsubTypes();
    };
  }, []);

  const vacantRooms = useMemo(() => {
    const joined = joinRoomsWithTypes(rooms, roomTypes);
    return joined.filter((r) => r.status === ROOM_STATUS.VACANT);
  }, [rooms, roomTypes]);

  const selectedRooms = useMemo(
    () => vacantRooms.filter((r) => selectedRoomNumbers.includes(r.roomNumber)),
    [vacantRooms, selectedRoomNumbers]
  );

  const toggleRoom = (roomNumber) => {
    setSelectedRoomNumbers((prev) =>
      prev.includes(roomNumber) ? prev.filter((rn) => rn !== roomNumber) : [...prev, roomNumber]
    );
    if (errors.rooms) setErrors((p) => ({ ...p, rooms: null }));
  };

  const subtotal = useMemo(
    () => selectedRooms.reduce((sum, r) => sum + (r.price || 0), 0) * Math.max(nights, 1),
    [selectedRooms, nights]
  );
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;

  const validate = () => {
    const e = {};
    if (!firstName.trim()) e.firstName = 'First name is required.';
    if (!lastName.trim()) e.lastName = 'Last name is required.';
    if (!phone.trim()) e.phone = 'Phone number is required.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = 'Enter a valid email address.';
    }
    if (selectedRoomNumbers.length === 0) e.rooms = 'Select at least one room.';
    if (nights < 1) e.nights = 'Must be at least 1 night.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setGuestCount(1);
    setNights(1);
    setSpecialRequests('');
    setSelectedRoomNumbers([]);
    setErrors({});
  };

  const handleReviewPress = () => {
    if (!validate()) return;
    setConfirmVisible(true);
  };

  const handleConfirmCheckIn = async () => {
    setConfirmVisible(false);
    setSaving(true);
    try {
      const guestName = `${firstName.trim()} ${lastName.trim()}`;
      const nowIso = new Date().toISOString();
      const checkOutIso = new Date(Date.now() + nights * 24 * 60 * 60 * 1000).toISOString();
      const roomTypeSummary = [...new Set(selectedRooms.map((r) => r.roomTypeName))].join(', ');

      // Lightweight guest record — same user_id: null convention
      // GuestRecordsScreen.jsx's "Add Guest" already uses for
      // staff-entered guests. Best-effort: a failure here shouldn't
      // block the actual check-in, matching upsertGuestRecord()'s
      // behavior in the guest booking flow.
      try {
        await supabase.from('guests').insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          source: 'Walk-In',
          user_id: null,
          created_by: staffName || 'front-desk-walkin',
        });
      } catch (guestErr) {
        console.warn('Failed to create guest record (check-in still proceeding):', guestErr);
      }

      const { data: inserted, error: reservationError } = await supabase
        .from('reservations')
        .insert({
          user_id: null,
          guest_email: email.trim() || null,
          guest_details: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
            specialRequests: specialRequests.trim(),
            walkIn: true,
          },
          check_in: nowIso,
          check_out: checkOutIso,
          nights,
          guest_count: guestCount || null,
          selected_rooms: selectedRooms.map((r) => ({
            roomNumber: r.roomNumber,
            roomTypeId: r.roomTypeId,
            roomTypeName: r.roomTypeName,
            price: r.price ?? null,
          })),
          room_type: roomTypeSummary,
          subtotal,
          tax,
          total_amount: total,
          payment_mode: 'hotel',
          payment_status: 'unpaid',
          ewallet_provider: null,
          status: 'checked-in',
          checked_in_at: nowIso,
        })
        .select('id')
        .single();
      if (reservationError) throw reservationError;

      // Folio + room status — same two side effects handleCheckIn() in
      // ReservationsScreen.jsx runs for a normal check-in. paymentMode:
      // 'hotel' means createBillingRecord leaves the folio Unpaid rather
      // than auto-settling, so front desk records payment separately.
      await Promise.all([
        createBillingRecord({
          reservationRef: inserted.id,
          guestUid: null,
          guestName,
          roomNumbers: selectedRooms.map((r) => r.roomNumber),
          checkInDate: nowIso,
          checkOutDate: checkOutIso,
          roomCharges: subtotal,
          additionalCharges: 0,
          taxServiceCharges: tax,
          paymentMode: 'hotel',
        }),
        Promise.all(selectedRooms.map((r) => updateRoomStatus(r.roomNumber, ROOM_STATUS.OCCUPIED))),
      ]);

      setSuccessInfo({
        guestName,
        roomNumbers: selectedRooms.map((r) => r.roomNumber),
        total,
      });
      resetForm();
      if (onCheckedIn) onCheckedIn(inserted.id);
    } catch (err) {
      console.error('Walk-in check-in failed:', err);
      setErrors({ submit: 'Could not complete this check-in. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loadingRooms) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const canSubmit = selectedRooms.length > 0 && !saving;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconBadge}>
            <Ionicons name="person-add" size={20} color={colors.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Walk-In Check-In</Text>
            <Text style={styles.subtitle}>For a guest checking in on the spot, with no prior reservation.</Text>
          </View>
        </View>

        {!!loadError && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#B3261E" />
            <Text style={styles.errorBannerText}>{loadError}</Text>
          </View>
        )}

        {!!successInfo && (
          <View style={styles.successBanner}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.successText}>
              {successInfo.guestName} checked in to Room{successInfo.roomNumbers.length > 1 ? 's' : ''}{' '}
              {successInfo.roomNumbers.join(', ')} — {formatCurrency(successInfo.total)} total.
            </Text>
          </View>
        )}

        {/* Guest Details */}
        <View style={styles.card}>
          <SectionHeader icon="person-outline" title="Guest Details" />

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>First Name</Text>
              <TextInput
                style={[styles.input, errors.firstName && styles.inputError]}
                value={firstName}
                onChangeText={(v) => { setFirstName(v); if (errors.firstName) setErrors((p) => ({ ...p, firstName: null })); }}
                placeholder="Juan"
                placeholderTextColor={colors.disabled}
              />
              {!!errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Last Name</Text>
              <TextInput
                style={[styles.input, errors.lastName && styles.inputError]}
                value={lastName}
                onChangeText={(v) => { setLastName(v); if (errors.lastName) setErrors((p) => ({ ...p, lastName: null })); }}
                placeholder="Dela Cruz"
                placeholderTextColor={colors.disabled}
              />
              {!!errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={[styles.inputWithIcon, errors.phone && styles.inputError]}>
                <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                <TextInput
                  style={styles.inputWithIconText}
                  value={phone}
                  onChangeText={(v) => { setPhone(v); if (errors.phone) setErrors((p) => ({ ...p, phone: null })); }}
                  placeholder="09XX XXX XXXX"
                  placeholderTextColor={colors.disabled}
                  keyboardType="phone-pad"
                />
              </View>
              {!!errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Email (optional)</Text>
              <View style={[styles.inputWithIcon, errors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
                <TextInput
                  style={styles.inputWithIconText}
                  value={email}
                  onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((p) => ({ ...p, email: null })); }}
                  placeholder="juan@email.com"
                  placeholderTextColor={colors.disabled}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
              {!!errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Guests</Text>
              <Stepper value={guestCount} min={1} onChange={setGuestCount} />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>Nights</Text>
              <Stepper value={nights} min={1} onChange={(v) => { setNights(v); if (errors.nights) setErrors((p) => ({ ...p, nights: null })); }} />
              {!!errors.nights && <Text style={styles.errorText}>{errors.nights}</Text>}
            </View>
          </View>

          <Text style={styles.fieldLabel}>Special Requests (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={specialRequests}
            onChangeText={setSpecialRequests}
            placeholder="e.g. extra towels, high floor"
            placeholderTextColor={colors.disabled}
            multiline
          />
        </View>

        {/* Room selection */}
        <View style={styles.card}>
          <SectionHeader icon="bed-outline" title="Select Room(s)" />
          <Text style={styles.sectionHint}>Only currently vacant rooms are shown. Tap to select — you can pick more than one.</Text>

          {!!errors.rooms && <Text style={styles.errorText}>{errors.rooms}</Text>}

          {vacantRooms.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="bed-outline" size={22} color={colors.disabled} />
              <Text style={styles.emptyText}>No vacant rooms right now.</Text>
            </View>
          ) : (
            <View style={styles.roomGrid}>
              {vacantRooms.map((room) => {
                const active = selectedRoomNumbers.includes(room.roomNumber);
                const thumb = room.images && room.images.length > 0 ? room.images[0] : null;
                return (
                  <TouchableOpacity
                    key={room.roomNumber}
                    style={[styles.roomCard, active && styles.roomCardActive]}
                    onPress={() => toggleRoom(room.roomNumber)}
                    activeOpacity={0.85}
                  >
                    {thumb ? (
                      <Image source={thumb.source ? thumb.source : { uri: thumb.uri }} style={styles.roomCardImage} />
                    ) : (
                      <View style={styles.roomCardImagePlaceholder}>
                        <Ionicons name="image-outline" size={18} color={colors.disabled} />
                      </View>
                    )}

                    {active && (
                      <View style={styles.roomCardCheck}>
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      </View>
                    )}

                    <View style={styles.roomCardBody}>
                      <Text style={styles.roomCardNumber}>Room {room.roomNumber}</Text>
                      <Text style={styles.roomCardType} numberOfLines={1}>{room.roomTypeName}</Text>
                      {room.price != null && (
                        <Text style={styles.roomCardPrice}>{formatCurrency(room.price)}<Text style={styles.roomCardPriceUnit}> / night</Text></Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Summary */}
        {selectedRooms.length > 0 && (
          <View style={[styles.card, styles.summaryCard]}>
            <SectionHeader icon="receipt-outline" title="Summary" />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Rooms</Text>
              <Text style={styles.summaryValue}>{selectedRooms.map((r) => r.roomNumber).join(', ')}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Nights</Text>
              <Text style={styles.summaryValue}>{Math.max(nights, 1)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax (17%)</Text>
              <Text style={styles.summaryValue}>{formatCurrency(tax)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Text style={styles.summaryTotalLabel}>Total Due</Text>
              <Text style={styles.summaryTotalValue}>{formatCurrency(total)}</Text>
            </View>
          </View>
        )}

        {!!errors.submit && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#B3261E" />
            <Text style={styles.errorBannerText}>{errors.submit}</Text>
          </View>
        )}

        {/* Spacer so content isn't hidden behind the floating action bar */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Floating check-in bar */}
      <View style={styles.actionBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionBarSubtext}>
            {selectedRooms.length > 0
              ? `${selectedRooms.length} room${selectedRooms.length > 1 ? 's' : ''} • ${Math.max(nights, 1)} night${nights > 1 ? 's' : ''}`
              : 'No room selected yet'}
          </Text>
          <Text style={styles.actionBarTotal}>{formatCurrency(total)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleReviewPress}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={16} color={colors.primary} />
              <Text style={styles.submitBtnText}>Check In</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <WalkInConfirmModal
        visible={confirmVisible}
        guestName={`${firstName.trim()} ${lastName.trim()}`}
        roomNumbers={selectedRooms.map((r) => r.roomNumber)}
        nights={Math.max(nights, 1)}
        total={total}
        saving={saving}
        onConfirm={handleConfirmCheckIn}
        onCancel={() => setConfirmVisible(false)}
      />
    </View>
  );
}

function WalkInConfirmModal({ visible, guestName, roomNumbers, nights, total, saving, onConfirm, onCancel }) {
  const roomLabel = roomNumbers.length > 1 ? 'Rooms' : 'Room';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconBadge}>
            <Ionicons name="log-in-outline" size={22} color={colors.onPrimary} />
          </View>

          <Text style={styles.modalTitle}>Confirm Walk-In Check-In</Text>
          <Text style={styles.modalSubtitle}>
            This creates the folio and marks the room{roomNumbers.length > 1 ? 's' : ''} Occupied immediately.
          </Text>

          <View style={styles.modalDetails}>
            <View style={styles.modalRow}>
              <Text style={styles.modalRowLabel}>Guest</Text>
              <Text style={styles.modalRowValue}>{guestName}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalRowLabel}>{roomLabel}</Text>
              <Text style={styles.modalRowValue}>{roomNumbers.join(', ')}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalRowLabel}>Nights</Text>
              <Text style={styles.modalRowValue}>{nights}</Text>
            </View>
            <View style={[styles.modalRow, styles.modalTotalRow]}>
              <Text style={styles.modalTotalLabel}>Total Due</Text>
              <Text style={styles.modalTotalValue}>{formatCurrency(total)}</Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onCancel} disabled={saving} activeOpacity={0.8}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalConfirmBtn} onPress={onConfirm} disabled={saving} activeOpacity={0.85}>
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={15} color={colors.onPrimary} />
                  <Text style={styles.modalConfirmText}>Check In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SectionHeader({ icon, title }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionIconBadge}>
        <Ionicons name={icon} size={14} color={colors.onPrimary} />
      </View>
      <Text style={styles.sectionLabel}>{title}</Text>
    </View>
  );
}

function Stepper({ value, min = 0, max = 99, onChange }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Ionicons name="remove" size={14} color={value <= min ? colors.disabled : colors.text} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{value}</Text>
      <TouchableOpacity
        style={styles.stepperBtn}
        onPress={() => onChange(Math.min(max, value + 1))}
      >
        <Ionicons name="add" size={14} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.md },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  headerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FDECEA',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#DFF5E1',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  successIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E7B34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    shadowColor: '#332B22',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  sectionIconBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text },
  sectionHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md, marginLeft: 34 },

  fieldRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', marginTop: spacing.md },
  fieldHalf: { flex: 1, minWidth: 160 },
  fieldLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  inputWithIconText: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.text,
  },
  inputError: { borderColor: '#B3261E' },
  textArea: { minHeight: 64, textAlignVertical: 'top', marginTop: spacing.sm },
  errorText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: '#B3261E', marginTop: 4 },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.background,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { opacity: 0.5 },
  stepperValue: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text, minWidth: 24, textAlign: 'center' },

  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  roomCard: {
    width: 132,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  roomCardActive: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  roomCardImage: { width: '100%', height: 74, backgroundColor: colors.cardAlt },
  roomCardImagePlaceholder: {
    width: '100%',
    height: 74,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCardCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  roomCardBody: { padding: spacing.sm },
  roomCardNumber: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.text },
  roomCardType: { fontSize: 10.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  roomCardPrice: { fontSize: 11.5, fontFamily: fonts.headingBold, color: colors.primary, marginTop: 4 },
  roomCardPriceUnit: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted },

  summaryCard: { borderLeftWidth: 3, borderLeftColor: colors.primary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, marginLeft: 34 },
  summaryLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  summaryValue: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    marginLeft: 34,
  },
  summaryTotalLabel: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.text },
  summaryTotalValue: { fontSize: 16, fontFamily: fonts.headingExtraBold, color: colors.primary },

  actionBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  actionBarSubtext: { fontSize: 11, fontFamily: fonts.body, color: 'rgba(255,255,255,0.7)' },
  actionBarTotal: { fontSize: 16, fontFamily: fonts.headingExtraBold, color: colors.onPrimary, marginTop: 1 },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.onPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.primary },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  modalIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 16, fontFamily: fonts.headingExtraBold, color: colors.text, textAlign: 'center' },
  modalSubtitle: {
    fontSize: 11.5,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.md,
    lineHeight: 16,
  },
  modalDetails: {
    width: '100%',
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  modalRowLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  modalRowValue: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, maxWidth: '65%', textAlign: 'right' },
  modalTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.sm },
  modalTotalLabel: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.text },
  modalTotalValue: { fontSize: 16, fontFamily: fonts.headingExtraBold, color: colors.primary },
  modalActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  modalConfirmText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
});