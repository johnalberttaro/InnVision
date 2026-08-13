import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, secondarySupabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import ConfirmDialog from '../../components/shared/ConfirmDialog';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' };

/**
 * StaffRoleAccountScreen — creates and lists staff accounts for a given
 * role. Shared by both "Housekeeping Accounts" and "Maintenance
 * Accounts" (see AdminSidebar.jsx/AdminShell.jsx — same component,
 * different `role`/`roleLabel` props) rather than two near-duplicate
 * files, since the two are otherwise identical.
 *
 * Deliberately a trimmed-down version of FrontDeskAccountScreen.jsx's
 * pattern — same core mechanism (secondarySupabase for signup so
 * creating a new account doesn't log the admin out of their own
 * session, then promote the new profile's role, same audit log table),
 * but without that screen's password-strength meter, inline edit flow,
 * or search bar. Those can be added later the same way FrontDeskAccount
 * Screen grew them over time, if these roles need the same polish.
 *
 * Props:
 *  - role: 'housekeeping' | 'maintenance' — must already exist as a
 *    value on the `user_role` Postgres enum (see
 *    sql/housekeeping_maintenance_roles.sql).
 *  - roleLabel: display label, e.g. "Housekeeping"
 */
export default function StaffRoleAccountScreen({ role, roleLabel }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);

  const loadAccounts = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', role)
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(`Failed to load ${role} accounts:`, error);
      setLoading(false);
      return;
    }
    setAccounts(
      (data || []).map((row) => ({
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        displayName: row.display_name,
        email: row.email,
        phone: row.phone,
        createdAt: row.created_at,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    loadAccounts();
  }, [role]);

  const computeErrors = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required.';
    if (!form.lastName.trim()) e.lastName = 'Last name is required.';
    if (!form.email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (!form.phone.trim()) e.phone = 'Phone number is required.';
    else {
      const digitsOnly = form.phone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) e.phone = 'Enter a valid phone number.';
    }
    if (!form.password) e.password = 'Password is required.';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm the password.';
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    return e;
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(computeErrors());
  };
  const fieldError = (field) => (touched[field] ? errors[field] : undefined);
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // Same audit table + shape FrontDeskAccountScreen.jsx's local
  // logStaffAudit() writes to, so every staff account creation across
  // every role lands in one unified trail.
  const logStaffAudit = async (staffId, staffName, staffEmail, action) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      let performedByName = user?.email || null;
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, first_name, last_name')
          .eq('id', user.id)
          .single();
        if (profile) {
          performedByName =
            profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || performedByName;
        }
      }
      await supabase.from('staff_account_audit_log').insert({
        staff_id: staffId,
        staff_name: staffName,
        staff_email: staffEmail || null,
        action,
        performed_by: user?.id || null,
        performed_by_name: performedByName,
        details: `role: ${role}`,
      });
    } catch (err) {
      console.error('Failed to write staff audit log entry (account action still succeeded):', err);
    }
  };

  const handleCreateAccount = async () => {
    const currentErrors = computeErrors();
    setErrors(currentErrors);
    setTouched({ firstName: true, lastName: true, email: true, phone: true, password: true, confirmPassword: true });
    if (Object.keys(currentErrors).length > 0) return;

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim();
    const password = form.password;
    const phone = form.phone.trim();

    setCreateError('');
    setCreateSuccess('');
    setCreating(true);

    try {
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

      const { error: promoteError } = await supabase
        .from('profiles')
        .update({ role, active: true })
        .eq('id', newUser.id);

      if (promoteError) {
        throw new Error(
          `Account was created, but could not be promoted to ${roleLabel} role: ${promoteError.message}. ` +
          `The account exists with the default guest role — promote it manually or try again.`
        );
      }

      await logStaffAudit(newUser.id, `${firstName} ${lastName}`, email, 'created');

      setCreateSuccess(`${roleLabel} account created for ${firstName} ${lastName}.`);
      setForm(EMPTY_FORM);
      setTouched({});
      setErrors({});
      await loadAccounts();
    } catch (err) {
      console.error(`${roleLabel} account creation failed:`, err);
      setCreateError(err?.message || `Failed to create ${roleLabel.toLowerCase()} account.`);
    } finally {
      setCreating(false);
      await secondarySupabase.auth.signOut().catch(() => {});
    }
  };

  const handleRemoveAccount = async () => {
    if (!pendingRemoval) return;
    setRemoving(true);
    try {
      const { error } = await supabase.from('profiles').update({ active: false }).eq('id', pendingRemoval.id);
      if (error) throw error;
      await logStaffAudit(
        pendingRemoval.id,
        `${pendingRemoval.firstName} ${pendingRemoval.lastName}`,
        pendingRemoval.email,
        'removed'
      );
      setPendingRemoval(null);
      await loadAccounts();
    } catch (err) {
      console.error('Failed to remove account:', err);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{roleLabel} Accounts</Text>
      <Text style={styles.subtitle}>Create and manage {roleLabel.toLowerCase()} staff logins.</Text>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Create {roleLabel} Account</Text>

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>First Name</Text>
            <TextInput
              style={[styles.input, fieldError('firstName') && styles.inputError]}
              value={form.firstName}
              onChangeText={(v) => setField('firstName', v)}
              onBlur={() => handleBlur('firstName')}
              placeholder="Juan"
              placeholderTextColor={colors.disabled}
            />
            {!!fieldError('firstName') && <Text style={styles.errorText}>{fieldError('firstName')}</Text>}
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Last Name</Text>
            <TextInput
              style={[styles.input, fieldError('lastName') && styles.inputError]}
              value={form.lastName}
              onChangeText={(v) => setField('lastName', v)}
              onBlur={() => handleBlur('lastName')}
              placeholder="Dela Cruz"
              placeholderTextColor={colors.disabled}
            />
            {!!fieldError('lastName') && <Text style={styles.errorText}>{fieldError('lastName')}</Text>}
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={[styles.input, fieldError('email') && styles.inputError]}
              value={form.email}
              onChangeText={(v) => setField('email', v)}
              onBlur={() => handleBlur('email')}
              placeholder="juan@innvision.com"
              placeholderTextColor={colors.disabled}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {!!fieldError('email') && <Text style={styles.errorText}>{fieldError('email')}</Text>}
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={[styles.input, fieldError('phone') && styles.inputError]}
              value={form.phone}
              onChangeText={(v) => setField('phone', v)}
              onBlur={() => handleBlur('phone')}
              placeholder="09XX XXX XXXX"
              placeholderTextColor={colors.disabled}
              keyboardType="phone-pad"
            />
            {!!fieldError('phone') && <Text style={styles.errorText}>{fieldError('phone')}</Text>}
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={[styles.input, fieldError('password') && styles.inputError]}
              value={form.password}
              onChangeText={(v) => setField('password', v)}
              onBlur={() => handleBlur('password')}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.disabled}
              secureTextEntry
            />
            {!!fieldError('password') && <Text style={styles.errorText}>{fieldError('password')}</Text>}
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Confirm Password</Text>
            <TextInput
              style={[styles.input, fieldError('confirmPassword') && styles.inputError]}
              value={form.confirmPassword}
              onChangeText={(v) => setField('confirmPassword', v)}
              onBlur={() => handleBlur('confirmPassword')}
              placeholder="Re-enter password"
              placeholderTextColor={colors.disabled}
              secureTextEntry
            />
            {!!fieldError('confirmPassword') && <Text style={styles.errorText}>{fieldError('confirmPassword')}</Text>}
          </View>
        </View>

        {!!createError && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#B3261E" />
            <Text style={styles.errorBannerText}>{createError}</Text>
          </View>
        )}
        {!!createSuccess && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#1E7B34" />
            <Text style={styles.successBannerText}>{createSuccess}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
          onPress={handleCreateAccount}
          disabled={creating}
          activeOpacity={0.85}
        >
          {creating ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <Ionicons name="person-add-outline" size={16} color={colors.onPrimary} />
              <Text style={styles.submitBtnText}>Create Account</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Existing {roleLabel} Accounts</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: spacing.lg }} />
        ) : accounts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={22} color={colors.disabled} />
            <Text style={styles.emptyText}>No {roleLabel.toLowerCase()} accounts yet.</Text>
          </View>
        ) : (
          accounts.map((acc) => (
            <View key={acc.id} style={styles.accountRow}>
              <View style={styles.accountAvatar}>
                <Text style={styles.accountAvatarText}>{(acc.firstName || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName}>{acc.displayName || `${acc.firstName} ${acc.lastName}`}</Text>
                <Text style={styles.accountMeta}>{acc.email} · {acc.phone || '—'}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => setPendingRemoval(acc)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <ConfirmDialog
        visible={!!pendingRemoval}
        title="Remove This Account?"
        message={pendingRemoval ? `${pendingRemoval.firstName} ${pendingRemoval.lastName} will lose access immediately. This can't be undone from here.` : ''}
        confirmLabel={removing ? 'Removing…' : 'Remove'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => setPendingRemoval(null)}
        onConfirm={handleRemoveAccount}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },

  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionLabel: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.md },

  fieldRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.md },
  fieldHalf: { flex: 1, minWidth: 200 },
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
  inputError: { borderColor: '#B3261E' },
  errorText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: '#B3261E', marginTop: 4 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#FDECEA', borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md,
  },
  errorBannerText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#B3261E' },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#DFF5E1', borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md,
  },
  successBannerText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  accountAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  accountAvatarText: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.text },
  accountName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  accountMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  removeBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#FDECEA',
    alignItems: 'center', justifyContent: 'center',
  },
});