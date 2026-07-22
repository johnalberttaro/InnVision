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
import { supabase, secondarySupabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

/**
 * FrontDeskAccountsScreen — admin creates/manages front desk staff
 * accounts.
 *
 * MIGRATED TO SUPABASE. Notable differences from the Firebase version:
 *
 *  - Account creation uses `secondarySupabase` (a second, session-isolated
 *    Supabase client — see supabase.js) instead of the primary client, for
 *    the same reason the old code used Firebase's `secondaryAuth`:
 *    signUp() on the primary client would log the admin OUT of their own
 *    session and INTO the brand-new staff account.
 *
 *  - Role promotion is a separate step run on the PRIMARY (admin) client:
 *    the new account is created with role defaulting to 'guest' (the
 *    on_auth_user_created trigger's default for every signup), and can't
 *    promote its own role — both the profiles RLS policy and the
 *    prevent_role_self_escalation trigger require an admin session to
 *    change role/active. So this screen signs the new account up on
 *    secondarySupabase, then immediately runs
 *    `supabase.from('profiles').update({ role: 'frontdesk' })...` on the
 *    ADMIN's own authenticated primary client.
 *
 *  - KNOWN LIMITATION vs. the Firebase version: the old code could roll
 *    back a failed Firestore write by calling deleteUser() on the
 *    just-created Firebase Auth account. Supabase's client SDK has no
 *    equivalent — deleting an auth user requires the Admin API (a
 *    service_role key, which must never run in client code). So if the
 *    role-promotion step fails after the account was already created,
 *    the account is left behind with the default 'guest' role rather
 *    than being cleaned up automatically. The error message says so
 *    explicitly, and the fix is a manual role promotion (or asking an
 *    admin to try again) rather than a full account deletion+retry.
 *
 *  - "Remove" now sets profiles.active = false, the real field for this
 *    (see GuestProfileTableScreen.jsx), instead of overloading the role
 *    column with a fake 'inactive' value — role stays 'frontdesk',
 *    active flips to false, and every screen that checks
 *    role='frontdesk' AND active=true (dashboard staff count, this
 *    screen's own list) picks that up correctly.
 */
export default function FrontDeskAccountsScreen() {
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [staffForm, setStaffForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [staffError, setStaffError] = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [removingStaffId, setRemovingStaffId] = useState(null);
  const [pendingStaffRemoval, setPendingStaffRemoval] = useState(null);

  useEffect(() => {
    const loadStaff = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'frontdesk')
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load front desk accounts:', error);
        return;
      }
      setStaffAccounts(
        (data || []).map((row) => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          displayName: row.display_name,
          email: row.email,
          createdAt: row.created_at,
        }))
      );
    };
    loadStaff();

    const channel = supabase
      .channel('frontdesk-accounts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadStaff)
      .subscribe();

    return () => supabase.removeChannel(channel);
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
      // Step 1: create the auth account on the ISOLATED secondary
      // client, so this never touches the admin's own primary session.
      const { data: signUpData, error: signUpError } = await secondarySupabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            phone,
            display_name: `${firstName} ${lastName}`,
          },
        },
      });
      if (signUpError) throw signUpError;
      const newUser = signUpData.user;

      // Step 2: promote the role, run on the PRIMARY client (i.e. as the
      // signed-in admin) — the new account can't do this for itself, see
      // the file header note on prevent_role_self_escalation.
      const { error: promoteError } = await supabase
        .from('profiles')
        .update({ role: 'frontdesk', active: true })
        .eq('id', newUser.id);

      if (promoteError) {
        // No client-side account deletion is possible here (see file
        // header) — be upfront that the account exists but is stuck at
        // the default 'guest' role rather than silently losing that fact.
        throw new Error(
          `Account was created, but could not be promoted to Front Desk role: ${promoteError.message}. ` +
          `The account exists with the default guest role — promote it manually or try again.`
        );
      }

      setStaffSuccess(`Front desk account created for ${firstName} ${lastName}.`);
      setStaffForm({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' });
    } catch (err) {
      console.error('Front desk account creation failed:', err);
      const message = err?.message || 'Failed to create front desk account.';
      setStaffError(message);
    } finally {
      setCreatingStaff(false);
      // Cleanup: drop the secondary client's session now that we're done
      // with it, same spirit as the old signOut(secondaryAuth) call.
      await secondarySupabase.auth.signOut().catch(() => {});
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
      const { error } = await supabase
        .from('profiles')
        .update({ active: false })
        .eq('id', pendingStaffRemoval.id);
      if (error) throw error;
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
  successBanner: { backgroundColor: colors.accentTint, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
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