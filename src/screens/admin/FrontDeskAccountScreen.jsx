import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, secondaryAuth, db } from '../../services/firebase';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { resolveUserRole } from '../../utils/roleHelpers';

export default function FrontDeskAccountsScreen() {
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [staffForm, setStaffForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [staffError, setStaffError] = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [removingStaffId, setRemovingStaffId] = useState(null);
  const [pendingStaffRemoval, setPendingStaffRemoval] = useState(null);

  useEffect(() => {
    const guestsQuery = query(collection(db, 'guests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      guestsQuery,
      (snapshot) => {
        const staff = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((guest) => resolveUserRole(guest) === 'frontdesk' && guest.role !== 'inactive');
        setStaffAccounts(staff);
      },
      (error) => {
        console.error('Failed to load front desk accounts:', error);
      }
    );

    return unsubscribe;
  }, []);

  const handleCreateFrontDeskAccount = async () => {
    const firstName = staffForm.firstName.trim();
    const lastName = staffForm.lastName.trim();
    const email = staffForm.email.trim();
    const password = staffForm.password;
    const confirmPassword = staffForm.confirmPassword;
    const phone = staffForm.phone.trim();

    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword) {
      setStaffError('Please fill in all fields before creating the account.');
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
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
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
      await signOut(secondaryAuth).catch(() => {});
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
      setStaffSuccess('Front desk account removed from the active staff list.');
    } catch (err) {
      console.error('Failed to remove staff account:', err);
      setStaffError('Could not remove that staff account right now.');
    } finally {
      setRemovingStaffId(null);
      setPendingStaffRemoval(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.pageTitle}>Front Desk Accounts</Text>
          <Text style={styles.pageSubtitle}>
            Create and manage front desk staff accounts without leaving the admin portal.
          </Text>
        </View>
      </View>

      {!!staffError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{staffError}</Text>
        </View>
      )}
      {!!staffSuccess && (
        <View style={styles.successBanner}>
          <Text style={styles.successBannerText}>{staffSuccess}</Text>
        </View>
      )}

      <View style={styles.staffCard}>
        <Text style={styles.sectionTitle}>Create Front Desk Account</Text>
        <Text style={styles.helperText}>Only administrators can create front-desk staff accounts.</Text>

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
              placeholder="Phone number"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.formRow}>
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
        </View>

        <TouchableOpacity
          style={[styles.createButton, creatingStaff && styles.buttonDisabled]}
          onPress={handleCreateFrontDeskAccount}
          activeOpacity={0.85}
          disabled={creatingStaff}
        >
          {creatingStaff ? <ActivityIndicator color={colors.white} /> : <Text style={styles.createButtonText}>Create Front Desk Account</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.staffListCard}>
        <Text style={styles.sectionTitle}>Existing Front Desk Accounts</Text>
        {staffAccounts.length === 0 ? (
          <Text style={styles.emptyText}>No front desk accounts yet.</Text>
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
    </ScrollView>
  );
}

function formatDateLabel(value) {
  try {
    if (!value) return '—';
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleDateString();
    }
    return new Date(value).toLocaleDateString();
  } catch {
    return '—';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  headerRow: { marginBottom: spacing.xl },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary, marginBottom: spacing.xs },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  errorBanner: { backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  errorBannerText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  successBanner: { backgroundColor: colors.accentBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  successBannerText: { fontFamily: fonts.body, fontSize: 13, color: colors.accent },
  staffCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.xl },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.md },
  helperText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.md },
  formRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.cardAlt, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  createButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  createButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
  buttonDisabled: { opacity: 0.7 },
  staffListCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },
  staffRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  staffTextWrap: { flex: 1, marginRight: spacing.md },
  staffName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  staffMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs },
  removeButton: { backgroundColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8, minWidth: 80, alignItems: 'center' },
  removeButtonText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  modalText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  modalCancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.border },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalConfirmButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.danger },
  modalConfirmText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});