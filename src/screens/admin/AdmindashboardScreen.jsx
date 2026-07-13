import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity, Modal } from 'react-native';
import { createUserWithEmailAndPassword, deleteUser, updateProfile } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, limit, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';
import { subscribeToRoomTypes, subscribeToRooms, isAvailable } from '../../utils/Roomsservice';
import { resolveUserRole } from '../../utils/roleHelpers';

/**
 * AdminDashboardScreen — overview of hotel operations for the Admin
 * Portal: KPI cards, revenue summary, and recent activity.
 *
 * This is the real home for the KPI-card layout that
 * frontdesk/FrontDeskDashboardScreen.jsx's internal comments were already
 * describing as "AdminDashboardScreen" — that file stays the Front Desk
 * staff's dashboard; this is the actual Admin one, plus a live Occupancy
 * Rate card (frontdesk's version left it as "—" pending room inventory
 * data, which we now have access to here via Roomsservice).
 */
export default function AdminDashboardScreen() {
  const [bookings, setBookings] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [staffForm, setStaffForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [staffError, setStaffError] = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [removingStaffId, setRemovingStaffId] = useState(null);
  const [pendingStaffRemoval, setPendingStaffRemoval] = useState(null);

  useEffect(() => {
    const bookingsQuery = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'), limit(200));
    const unsubBookings = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        setBookings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Failed to load dashboard bookings:', error);
        setLoading(false);
      }
    );
    const unsubRooms = subscribeToRooms(setRooms, (error) =>
      console.error('Failed to load dashboard rooms:', error)
    );
    const unsubStaff = onSnapshot(
      collection(db, 'guests'),
      (snapshot) => {
        const staff = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((guest) => resolveUserRole(guest) === 'frontdesk' && guest.role !== 'inactive');
        setStaffAccounts(staff);
      },
      (error) => {
        console.error('Failed to load staff accounts:', error);
      }
    );
    return () => {
      unsubBookings();
      unsubRooms();
      unsubStaff();
    };
  }, []);

  const confirmedBookings = bookings.filter((b) => b.status === 'upcoming');

  const totalReservations = bookings.length;
  const totalRevenue = confirmedBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  const todayStr = new Date().toDateString();
  const todaysCheckIns = confirmedBookings.filter((b) => {
    try {
      return new Date(b.checkIn).toDateString() === todayStr;
    } catch {
      return false;
    }
  }).length;
  const todaysCheckOuts = confirmedBookings.filter((b) => {
    try {
      return new Date(b.checkOut).toDateString() === todayStr;
    } catch {
      return false;
    }
  }).length;

  const occupiedRooms = rooms.filter((r) => !isAvailable(r.status)).length;
  const occupancyRate = rooms.length > 0 ? Math.round((occupiedRooms / rooms.length) * 100) : null;

  const recentActivity = bookings.slice(0, 5);

  const handleCreateFrontDeskAccount = async () => {
    const firstName = staffForm.firstName.trim();
    const lastName = staffForm.lastName.trim();
    const email = staffForm.email.trim();
    const password = staffForm.password;
    const confirmPassword = staffForm.confirmPassword;
    const phone = staffForm.phone.trim();

    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword) {
      setStaffError('Please fill in the staff name, email, phone number, password, and confirm password.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStaffError('Please enter a valid email address.');
      return;
    }

    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      setStaffError('Please enter a valid phone number.');
      return;
    }

    if (password.length < 8) {
      setStaffError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setStaffError('Passwords do not match.');
      return;
    }

    setStaffError('');
    setStaffSuccess('');
    setCreatingStaff(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;

      await updateProfile(newUser, {
        displayName: `${firstName} ${lastName}`,
      });

      try {
        await setDoc(
          doc(db, 'guests', newUser.uid),
          {
            firstName,
            lastName,
            email,
            phone,
            displayName: `${firstName} ${lastName}`,
            role: 'frontdesk',
            createdAt: serverTimestamp(),
            createdBy: auth.currentUser?.uid || null,
          },
          { merge: true }
        );
      } catch (firestoreErr) {
        await deleteUser(newUser).catch(() => {});
        throw new Error(`Could not save staff profile: ${firestoreErr.message}`);
      }

      setStaffSuccess(`Front desk account created for ${firstName} ${lastName}.`);
      setStaffForm({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' });
    } catch (err) {
      console.error('Front desk account creation failed:', err);
      const message = err?.message || 'Failed to create front desk account.';
      setStaffError(message);
    } finally {
      setCreatingStaff(false);
    }
  };

  const confirmRemoveStaffAccount = (staff) => {
    setPendingStaffRemoval(staff);
  };

  const handleRemoveStaffAccount = async () => {
    if (!pendingStaffRemoval) return;

    setRemovingStaffId(pendingStaffRemoval.id);
    setStaffError('');
    setStaffSuccess('');

    try {
      await setDoc(
        doc(db, 'guests', pendingStaffRemoval.id),
        {
          role: 'inactive',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setStaffSuccess('Front-desk account removed from the active staff list.');
    } catch (err) {
      console.error('Failed to remove staff account:', err);
      setStaffError('Could not remove that staff account right now.');
    } finally {
      setRemovingStaffId(null);
      setPendingStaffRemoval(null);
    }
  };

  const getGuestName = (item) => {
    if (!item.guestDetails) return item.guestName || 'A guest';
    const { firstName, lastName } = item.guestDetails;
    return `${firstName || ''} ${lastName || ''}`.trim() || 'A guest';
  };

  const formatDateLabel = (value) => {
    try {
      if (!value) return '—';
      if (typeof value?.toDate === 'function') {
        return value.toDate().toLocaleDateString();
      }
      return new Date(value).toLocaleDateString();
    } catch {
      return '—';
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Admin Dashboard</Text>
      <Text style={styles.pageSubtitle}>Overview of hotel operations</Text>

      <View style={styles.staffCard}>
        <Text style={styles.sectionTitle}>Create Front Desk Account</Text>
        <Text style={styles.helperText}>Only administrators can create front-desk staff accounts.</Text>

        {staffError ? <Text style={styles.errorText}>{staffError}</Text> : null}
        {staffSuccess ? <Text style={styles.successText}>{staffSuccess}</Text> : null}

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name</Text>
            <TextInput
              style={styles.input}
              value={staffForm.firstName}
              onChangeText={(value) => setStaffForm((prev) => ({ ...prev, firstName: value }))}
              placeholder="First name"
              autoCapitalize="words"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Last name</Text>
            <TextInput
              style={styles.input}
              value={staffForm.lastName}
              onChangeText={(value) => setStaffForm((prev) => ({ ...prev, lastName: value }))}
              placeholder="Last name"
              autoCapitalize="words"
            />
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={staffForm.email}
              onChangeText={(value) => setStaffForm((prev) => ({ ...prev, email: value }))}
              placeholder="staff@innvision.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={styles.input}
              value={staffForm.phone}
              onChangeText={(value) => setStaffForm((prev) => ({ ...prev, phone: value }))}
              placeholder="Must be a valid phone number"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            value={staffForm.password}
            onChangeText={(value) => setStaffForm((prev) => ({ ...prev, password: value }))}
            placeholder="At least 8 characters"
            secureTextEntry
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={staffForm.confirmPassword}
            onChangeText={(value) => setStaffForm((prev) => ({ ...prev, confirmPassword: value }))}
            placeholder="Re-enter password"
            secureTextEntry
          />
        </View>

        <TouchableOpacity style={styles.createButton} onPress={handleCreateFrontDeskAccount} disabled={creatingStaff}>
          {creatingStaff ? <ActivityIndicator color={colors.white} /> : <Text style={styles.createButtonText}>Create Front Desk Account</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.staffListCard}>
        <Text style={styles.sectionTitle}>Front Desk Accounts</Text>
        {staffAccounts.length === 0 ? (
          <Text style={styles.emptyText}>No front-desk accounts yet.</Text>
        ) : (
          staffAccounts.map((staff) => (
            <View key={staff.id} style={styles.staffRow}>
              <View style={styles.staffTextWrap}>
                <Text style={styles.staffName}>{staff.displayName || `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Front Desk Staff'}</Text>
                <Text style={styles.staffMeta}>{staff.email || 'No email provided'}</Text>
                <Text style={styles.staffMeta}>Created {formatDateLabel(staff.createdAt)}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => confirmRemoveStaffAccount(staff)}
                disabled={removingStaffId === staff.id}
              >
                {removingStaffId === staff.id ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.removeButtonText}>Remove</Text>}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <Modal transparent visible={!!pendingStaffRemoval} animationType="fade" onRequestClose={() => setPendingStaffRemoval(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove front-desk account?</Text>
            <Text style={styles.modalText}>
              This will remove {pendingStaffRemoval?.displayName || `${pendingStaffRemoval?.firstName || ''} ${pendingStaffRemoval?.lastName || ''}`.trim() || 'this staff member'} from the active staff list.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setPendingStaffRemoval(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleRemoveStaffAccount}>
                <Text style={styles.modalConfirmText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.kpiGrid}>
        <KpiCard icon="📅" label="Total Reservations" value={String(totalReservations)} accent={colors.primary} />
        <KpiCard icon="💰" label="Total Revenue" value={formatCurrency(totalRevenue)} accent={colors.accent} note="Confirmed bookings only" />
        <KpiCard icon="🛎️" label="Today's Check-ins" value={String(todaysCheckIns)} accent={colors.primary} />
        <KpiCard icon="🚪" label="Today's Check-outs" value={String(todaysCheckOuts)} accent={colors.accent} />
        <KpiCard
          icon="🏨"
          label="Occupancy Rate"
          value={occupancyRate === null ? '—' : `${occupancyRate}%`}
          accent={colors.primary}
          note={rooms.length > 0 ? `${occupiedRooms} of ${rooms.length} rooms` : 'No rooms yet'}
        />
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityCard}>
        {recentActivity.length === 0 ? (
          <Text style={styles.emptyText}>No reservations yet.</Text>
        ) : (
          recentActivity.map((booking, index) => (
            <View
              key={booking.id}
              style={[styles.activityRow, index < recentActivity.length - 1 && styles.activityRowBorder]}
            >
              <View style={styles.activityIconBadge}>
                <Text style={styles.activityIcon}>🛏️</Text>
              </View>
              <View style={styles.activityTextWrap}>
                <Text style={styles.activityTitle}>
                  {getGuestName(booking)} booked {booking.roomType || '(room pending)'}
                </Text>
                <Text style={styles.activitySubtitle}>
                  {booking.totals?.totalRooms ?? 0} Room{booking.totals?.totalRooms !== 1 ? 's' : ''} ·{' '}
                  {booking.nights} night{booking.nights !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={styles.activityAmount}>
                {booking.totalAmount != null ? formatCurrency(booking.totalAmount) : '—'}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function KpiCard({ icon, label, value, accent, note }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconBadge, { backgroundColor: `${accent}1A` }]}>
        <Text style={styles.kpiIcon}>{icon}</Text>
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
      {note ? <Text style={styles.kpiNote}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.xl },
  staffCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.xl },
  staffListCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.xl },
  helperText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  formRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.body, color: colors.text, backgroundColor: colors.background },
  createButton: { backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  createButtonText: { fontFamily: fonts.headingSemiBold, color: colors.white },
  staffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  staffTextWrap: { flex: 1, marginRight: spacing.md },
  staffName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  staffMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  removeButton: { backgroundColor: colors.danger, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm, minWidth: 70, alignItems: 'center' },
  removeButtonText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  modalText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  modalCancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.border },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalConfirmButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.danger },
  modalConfirmText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
  errorText: { fontSize: 12, fontFamily: fonts.body, color: colors.danger, marginBottom: spacing.sm },
  successText: { fontSize: 12, fontFamily: fonts.body, color: colors.accent, marginBottom: spacing.sm },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xxl },
  kpiCard: { width: 200, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  kpiIconBadge: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  kpiIcon: { fontSize: 18 },
  kpiLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  kpiValue: { fontSize: 22, fontFamily: fonts.headingExtraBold },
  kpiNote: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.md },
  activityCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, padding: spacing.lg },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  activityIcon: { fontSize: 16 },
  activityTextWrap: { flex: 1 },
  activityTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  activitySubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  activityAmount: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.accent },
});