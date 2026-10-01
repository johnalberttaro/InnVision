import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, secondarySupabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

const EMPTY_FORM = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' };
const WIDE_BREAKPOINT = 1000;

// Local accent for this screen's redesign only — same values as
// FrontDeskAccountScreen.jsx/FnbAccountScreen.jsx (kept file-local in
// both, see FrontDeskAccountScreen.jsx's doc comment for why) so all of
// the admin portal's staff-account screens read as one visual language.
const BLUE = '#2F6FED';
const BLUE_TINT = '#EAF1FF';
const AMBER = '#B45309';
const AMBER_TINT = '#FEF3C7';

// The only thing that visually tells Housekeeping and Maintenance apart
// at a glance (besides the text, which already comes from roleLabel) —
// a small per-role icon rather than one generic "people" glyph for both.
const ROLE_ICONS = { housekeeping: 'sparkles-outline', maintenance: 'construct-outline' };

// Simple, dependency-free password strength scorer: length + character
// variety. Not a substitute for a real policy check server-side, just a
// quick visual signal while the admin is typing.
function scorePasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: colors.border };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: 'Weak', color: '#B3261E' };
  if (score <= 2) return { score: 2, label: 'Fair', color: '#C99400' };
  if (score <= 3) return { score: 3, label: 'Good', color: '#B3792A' };
  return { score: 4, label: 'Strong', color: '#1E7B34' };
}

function formatDateLabel(value) {
  try {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
  } catch {
    return '—';
  }
}

// A small, reusable single-select list in a modal — used below for both
// the account-status Filter and the per-page picker. Same component as
// FrontDeskAccountScreen.jsx/FnbAccountScreen.jsx define locally; kept as
// its own copy here too rather than a shared import, matching how this
// screen has always duplicated (not imported) its siblings' patterns.
function SimpleOptionsModal({ visible, onClose, title, options, selectedValue, onSelect }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.optionsModalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          {options.map((opt) => {
            const active = selectedValue === opt.value;
            return (
              <TouchableOpacity
                key={String(opt.value)}
                style={styles.optionRow}
                onPress={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.optionRadio, active && styles.optionRadioActive]}>
                  {active && <View style={styles.optionRadioDot} />}
                </View>
                <Text style={styles.optionRowText}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.modalCancelButton} onPress={onClose}>
            <Text style={styles.modalCancelText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/**
 * StaffRoleAccountScreen — creates and lists staff accounts for a given
 * role. Shared by both "Housekeeping Accounts" and "Maintenance
 * Accounts" (see AdminSidebar.jsx/AdminShell.jsx — same component,
 * different `role`/`roleLabel` props) rather than two near-duplicate
 * files, since the two are otherwise identical.
 *
 * UI ALIGNED WITH FRONT DESK (this pass): this was previously a
 * deliberately trimmed-down version of FrontDeskAccountScreen.jsx's
 * pattern — create + list only, no Edit, no Reset Password, no search,
 * no pagination, no password-strength meter — with its own doc comment
 * saying those could be "added later... if these roles need the same
 * polish." They're added now, ported the same way FnbAccountScreen.jsx
 * got them: icon badges, the same scoped blue/amber local accent, a
 * Filter (Active/All) control with client-side pagination, color-coded
 * Edit/Reset/Remove row actions, and the enhanced Reset Password modal
 * (recipient card, live match indicator, info tip box). Everything
 * role-specific is still driven entirely by the `role`/`roleLabel`
 * props — ROLE_ICONS above is the one addition that's per-role (a
 * sparkle for Housekeeping, a wrench for Maintenance) so the two screens
 * are distinguishable at a glance despite sharing every other pixel.
 *
 * The old per-row Remove confirmation used the generic shared
 * ConfirmDialog component (still used elsewhere for simple yes/no
 * prompts like logout); it's now the same inline icon-badge Modal
 * FrontDeskAccountScreen.jsx/FnbAccountScreen.jsx use, so all three
 * staff-account screens look identical for the actions they share.
 *
 * Same core mechanism as those two screens throughout: secondarySupabase
 * for signup so creating a new account doesn't log the admin out of
 * their own session, then promote the new profile's role on the primary
 * client, "Remove" sets profiles.active = false (not a role change),
 * and every create/update/remove/reset writes to the same
 * staff_account_audit_log table those screens use, so one audit trail
 * covers every role.
 *
 * Props:
 *  - role: 'housekeeping' | 'maintenance' — must already exist as a
 *    value on the `user_role` Postgres enum (see
 *    sql/housekeeping_maintenance_roles.sql).
 *  - roleLabel: display label, e.g. "Housekeeping"
 */
export default function StaffRoleAccountScreen({ role, roleLabel }) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const pageIcon = ROLE_ICONS[role] || 'people-outline';

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Success banner auto-dismisses after 3s rather than sitting on screen
  // until the admin's next action replaces or manually clears it —
  // matches FrontDeskAccountScreen.jsx/FnbAccountScreen.jsx.
  useEffect(() => {
    if (!createSuccess) return;
    const timer = setTimeout(() => setCreateSuccess(''), 3000);
    return () => clearTimeout(timer);
  }, [createSuccess]);

  const [searchTerm, setSearchTerm] = useState('');

  // ── Filter (active / all) + pagination ──────────────────────────────
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [pageSizeModalVisible, setPageSizeModalVisible] = useState(false);

  const [editingAccount, setEditingAccount] = useState(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [resettingAccount, setResettingAccount] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetShowPw, setResetShowPw] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState('');

  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    const loadAccounts = async () => {
      // No .eq('active', true) here on purpose — the Filter control lets
      // the admin see removed accounts too, so every profile for this
      // role is fetched once and the active/all split happens
      // client-side in filteredAccounts below.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', role)
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
          photoUrl: row.photo_url,
          createdAt: row.created_at,
          active: row.active,
        }))
      );
      setLoading(false);
    };
    loadAccounts();

    const channel = supabase
      .channel(`${role}-accounts`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadAccounts)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [role]);

  const filteredAccounts = useMemo(() => {
    const statusMatched =
      statusFilter === 'all' ? accounts : accounts.filter((a) => a.active !== false);
    const term = searchTerm.trim().toLowerCase();
    const termMatched = !term
      ? statusMatched
      : statusMatched.filter((a) => {
          const haystack = [a.displayName, a.firstName, a.lastName, a.email, a.phone].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(term);
        });
    // Alphabetical by name (A–Z, case-insensitive), same name shown on each
    // card — independent of created_at, so the list doesn't reshuffle by
    // signup date and newly-added staff don't jump to the top or bottom.
    return [...termMatched].sort((accA, accB) => {
      const nameA = accA.displayName || `${accA.firstName || ''} ${accA.lastName || ''}`.trim() || '';
      const nameB = accB.displayName || `${accB.firstName || ''} ${accB.lastName || ''}`.trim() || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [accounts, searchTerm, statusFilter]);

  // Reset to page 1 whenever the visible set could have changed shape —
  // otherwise a search or filter change could leave the admin stranded
  // on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedAccounts = filteredAccounts.slice(pageStart, pageStart + pageSize);

  const passwordStrength = scorePasswordStrength(form.password);

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

  // Same audit table + shape FrontDeskAccountScreen.jsx's/
  // FnbAccountScreen.jsx's local logStaffAudit() writes to, so every
  // staff account action across every role lands in one unified trail.
  // `details` defaults to `role: ${role}` (as before) but can be
  // overridden — Reset Password passes its own note, same as the other
  // two screens do.
  const logStaffAudit = async (staffId, staffName, staffEmail, action, details) => {
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
        details: details || `role: ${role}`,
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
    } catch (err) {
      console.error(`${roleLabel} account creation failed:`, err);
      setCreateError(err?.message || `Failed to create ${roleLabel.toLowerCase()} account.`);
    } finally {
      setCreating(false);
      await secondarySupabase.auth.signOut().catch(() => {});
    }
  };

  const confirmRemoveAccount = (acc) => {
    setCreateError('');
    setCreateSuccess('');
    setPendingRemoval(acc);
  };

  const handleRemoveAccount = async () => {
    if (!pendingRemoval) return;
    const acc = pendingRemoval;

    setRemovingId(acc.id);
    try {
      const { error } = await supabase.from('profiles').update({ active: false }).eq('id', acc.id);
      if (error) throw error;

      await logStaffAudit(
        acc.id,
        acc.displayName || `${acc.firstName || ''} ${acc.lastName || ''}`.trim() || `${roleLabel} Staff`,
        acc.email,
        'removed'
      );

      setCreateSuccess(`${acc.displayName || acc.firstName || 'Staff account'} was removed.`);
      setPendingRemoval(null);
    } catch (err) {
      console.error('Failed to remove account:', err);
      setCreateError('Could not remove that account right now.');
    } finally {
      setRemovingId(null);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────
  const openEdit = (acc) => {
    setEditError('');
    setEditingAccount(acc);
    setEditForm({ firstName: acc.firstName || '', lastName: acc.lastName || '', phone: acc.phone || '' });
  };

  const closeEdit = () => {
    setEditingAccount(null);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editingAccount) return;
    const firstName = editForm.firstName.trim();
    const lastName = editForm.lastName.trim();
    const phone = editForm.phone.trim();

    if (!firstName || !lastName) {
      setEditError('First and last name are required.');
      return;
    }

    setSavingEdit(true);
    setEditError('');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName, phone, display_name: `${firstName} ${lastName}` })
        .eq('id', editingAccount.id);
      if (error) throw error;

      await logStaffAudit(editingAccount.id, `${firstName} ${lastName}`, editingAccount.email, 'updated');

      setCreateSuccess(`${firstName} ${lastName}'s account was updated.`);
      closeEdit();
    } catch (err) {
      console.error('Failed to update account:', err);
      setEditError('Could not save these changes. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Reset Password ──────────────────────────────────────────────────
  // Lets an administrator set a new password for a staff member who's
  // forgotten theirs — the same idea as the default password an admin
  // sets when first creating the account. Requires the admin-reset-
  // password Edge Function: changing another user's password needs
  // Supabase's Admin API, which only works with the service_role key —
  // that key can never live in this app, so the actual privileged call
  // happens server-side. This screen only calls it and shows the result.
  const openReset = (acc) => {
    setResetError('');
    setResetPassword('');
    setResetConfirm('');
    setResetShowPw(false);
    setResettingAccount(acc);
  };

  const closeReset = () => {
    setResettingAccount(null);
    setResetError('');
  };

  const resetPasswordStrength = scorePasswordStrength(resetPassword);
  // Derived display bits for the modal UI: who the password is for (name
  // + initial, for a small recipient card so the admin can confirm at a
  // glance they're resetting the right account) and whether the two
  // password fields currently agree (drives the inline match icon next
  // to "Confirm new password" instead of making the admin wait for
  // Submit to find out they don't match).
  const resetAccountName = resettingAccount?.displayName || `${resettingAccount?.firstName || ''} ${resettingAccount?.lastName || ''}`.trim() || 'this staff member';
  const resetAccountInitial = resetAccountName.charAt(0).toUpperCase();
  const resetPasswordsMatch = resetConfirm.length > 0 && resetPassword === resetConfirm;
  const resetPasswordsMismatch = resetConfirm.length > 0 && resetPassword !== resetConfirm;

  const handleResetPassword = async () => {
    if (!resettingAccount) return;
    if (!resetPassword || resetPassword.length < 8) {
      setResetError('Enter a new password of at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match.');
      return;
    }

    const name = resetAccountName;

    setResetSubmitting(true);
    setResetError('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { staffUid: resettingAccount.id, newPassword: resetPassword },
      });
      if (error) {
        // supabase-js only gives a generic "non-2xx status code" message
        // by default — the function's actual error text (e.g. "Only
        // administrators can reset a password") is in the raw response
        // body, reachable via error.context. Read it so the admin (and
        // we, debugging) can see what actually went wrong.
        let message = error.message;
        if (error.context && typeof error.context.json === 'function') {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch (parseErr) {
            console.error('Could not parse Edge Function error body:', parseErr);
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      await logStaffAudit(resettingAccount.id, name, resettingAccount.email, 'password_reset', 'Password reset by administrator');

      setCreateSuccess(`Password reset for ${name}. Share it with them directly.`);
      closeReset();
    } catch (err) {
      console.error('Failed to reset password:', err);
      setResetError(err.message || 'Could not reset the password. Please try again.');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.pageIconBadge}>
          <Ionicons name={pageIcon} size={20} color={BLUE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{roleLabel} Accounts</Text>
          <Text style={styles.pageSubtitle}>
            Create and manage {roleLabel.toLowerCase()} staff accounts without leaving the admin portal.
          </Text>
        </View>
      </View>

      {!!createError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorBannerText}>{createError}</Text>
        </View>
      )}
      {!!createSuccess && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#1E7B34" />
          <Text style={styles.successBannerText}>{createSuccess}</Text>
        </View>
      )}

      <View style={isWide ? styles.columnsWrap : undefined}>
      <View style={[styles.leftColumn, isWide && styles.leftColumnWide]}>
      <View style={styles.staffCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardIconBadge}>
            <Ionicons name="person-add-outline" size={16} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Create {roleLabel} Account</Text>
            <Text style={styles.helperText}>Only administrators can create {roleLabel.toLowerCase()} staff accounts.</Text>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name <Text style={styles.requiredMark}>*</Text></Text>
            <View style={[styles.inputRow, fieldError('firstName') && styles.inputRowError]}>
              <Ionicons name="person-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={form.firstName}
                onChangeText={(v) => setField('firstName', v)}
                onBlur={() => handleBlur('firstName')}
                placeholder="Enter first name"
                autoCapitalize="words"
              />
            </View>
            {!!fieldError('firstName') && <Text style={styles.fieldErrorText}>{fieldError('firstName')}</Text>}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Last name <Text style={styles.requiredMark}>*</Text></Text>
            <View style={[styles.inputRow, fieldError('lastName') && styles.inputRowError]}>
              <Ionicons name="person-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={form.lastName}
                onChangeText={(v) => setField('lastName', v)}
                onBlur={() => handleBlur('lastName')}
                placeholder="Enter last name"
                autoCapitalize="words"
              />
            </View>
            {!!fieldError('lastName') && <Text style={styles.fieldErrorText}>{fieldError('lastName')}</Text>}
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email <Text style={styles.requiredMark}>*</Text></Text>
            <View style={[styles.inputRow, fieldError('email') && styles.inputRowError]}>
              <Ionicons name="mail-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={form.email}
                onChangeText={(v) => setField('email', v)}
                onBlur={() => handleBlur('email')}
                placeholder="staff@innvision.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {!!fieldError('email') && <Text style={styles.fieldErrorText}>{fieldError('email')}</Text>}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone number</Text>
            <View style={[styles.inputRow, fieldError('phone') && styles.inputRowError]}>
              <Ionicons name="call-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={form.phone}
                onChangeText={(v) => setField('phone', v)}
                onBlur={() => handleBlur('phone')}
                placeholder="Phone number"
                keyboardType="phone-pad"
              />
            </View>
            {!!fieldError('phone') && <Text style={styles.fieldErrorText}>{fieldError('phone')}</Text>}
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password <Text style={styles.requiredMark}>*</Text></Text>
            <View style={[styles.inputRow, fieldError('password') && styles.inputRowError]}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={form.password}
                onChangeText={(v) => setField('password', v)}
                onBlur={() => handleBlur('password')}
                placeholder="At least 8 characters"
                secureTextEntry
              />
            </View>
            {!!form.password && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthFill, { width: `${passwordStrength.score * 25}%`, backgroundColor: passwordStrength.color }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>{passwordStrength.label}</Text>
              </View>
            )}
            {!!fieldError('password') && <Text style={styles.fieldErrorText}>{fieldError('password')}</Text>}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm password <Text style={styles.requiredMark}>*</Text></Text>
            <View style={[styles.inputRow, fieldError('confirmPassword') && styles.inputRowError]}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={form.confirmPassword}
                onChangeText={(v) => setField('confirmPassword', v)}
                onBlur={() => handleBlur('confirmPassword')}
                placeholder="Re-enter password"
                secureTextEntry
              />
            </View>
            {!!fieldError('confirmPassword') && <Text style={styles.fieldErrorText}>{fieldError('confirmPassword')}</Text>}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createButton, creating && styles.buttonDisabled]}
          onPress={handleCreateAccount}
          activeOpacity={0.85}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="add" size={17} color={colors.white} />
              <Text style={styles.createButtonText}>Create {roleLabel} Account</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.manageCard}>
        <View style={styles.manageIconBadge}>
          <Ionicons name="shield-outline" size={18} color={BLUE} />
        </View>
        <Text style={styles.manageTitle}>Need to manage existing accounts?</Text>
        <Text style={styles.manageText}>
          View and manage all registered {roleLabel} staff accounts, including edit, reset password, or remove access.
        </Text>
        <TouchableOpacity
          style={styles.manageButton}
          onPress={() => {
            // Widens the list on the right to show literally every
            // registered account: clears any search term, switches the
            // Filter to "All accounts" (so removed ones show up too),
            // and sets the page size high enough that it's all one page.
            setSearchTerm('');
            setStatusFilter('all');
            setPageSize(1000);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="eye-outline" size={14} color={BLUE} />
          <Text style={styles.manageButtonText}>View All Registered {roleLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={BLUE} />
        </TouchableOpacity>
      </View>
      </View>

      <View style={[styles.staffListCard, isWide && styles.staffListCardWide]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardIconBadge}>
            <Ionicons name={pageIcon} size={16} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>{roleLabel} Accounts</Text>
            <Text style={styles.helperText}>
              {pageSize >= 1000
                ? `Manage all registered ${roleLabel} staff accounts.`
                : `Manage the ${pageSize} most recent ${roleLabel} staff accounts.`}
            </Text>
          </View>
        </View>

        <View style={styles.searchFilterRow}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={15} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Search by name, email, or phone..."
              placeholderTextColor={colors.disabled}
            />
            {!!searchTerm && (
              <TouchableOpacity onPress={() => setSearchTerm('')}>
                <Ionicons name="close-circle" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={() => setFilterModalVisible(true)} activeOpacity={0.8}>
            <Ionicons name="funnel-outline" size={14} color={colors.text} />
            <Text style={styles.filterButtonText}>Filter</Text>
            {statusFilter !== 'active' && <View style={styles.filterActiveDot} />}
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: spacing.lg }} />
        ) : pagedAccounts.length === 0 ? (
          <Text style={styles.emptyText}>
            {accounts.length === 0
              ? `No ${roleLabel.toLowerCase()} accounts yet.`
              : filteredAccounts.length === 0
              ? 'No accounts match your search.'
              : 'No accounts on this page.'}
          </Text>
        ) : (
          pagedAccounts.map((acc) => {
            const name = acc.displayName || `${acc.firstName || ''} ${acc.lastName || ''}`.trim() || `${roleLabel} Staff`;
            const initial = name.charAt(0).toUpperCase();
            return (
              <View key={acc.id} style={styles.staffRow}>
                <View style={styles.staffAvatar}>
                  {acc.photoUrl ? (
                    <Image source={{ uri: acc.photoUrl }} style={styles.staffAvatarImage} />
                  ) : (
                    <Text style={styles.staffAvatarText}>{initial}</Text>
                  )}
                </View>
                <View style={styles.staffTextWrap}>
                  <View style={styles.staffNameRow}>
                    <Text style={styles.staffName}>{name}</Text>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                    </View>
                    {acc.active === false && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveBadgeText}>Inactive</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.staffMetaRow}>
                    <Ionicons name="mail-outline" size={11} color={colors.textMuted} />
                    <Text style={styles.staffMeta}>{acc.email || 'No email provided'}</Text>
                  </View>
                  {!!acc.phone && (
                    <View style={styles.staffMetaRow}>
                      <Ionicons name="call-outline" size={11} color={colors.textMuted} />
                      <Text style={styles.staffMeta}>{acc.phone}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.staffCreatedWrap}>
                  <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                  <Text style={styles.staffCreatedText}>Created {formatDateLabel(acc.createdAt)}</Text>
                </View>
                <View style={styles.staffActions}>
                  <TouchableOpacity style={styles.editButton} onPress={() => openEdit(acc)} activeOpacity={0.8}>
                    <Ionicons name="pencil-outline" size={13} color={BLUE} />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.resetButton} onPress={() => openReset(acc)} activeOpacity={0.8}>
                    <Ionicons name="refresh-outline" size={13} color={AMBER} />
                    <Text style={styles.resetButtonText}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => confirmRemoveAccount(acc)}
                    disabled={removingId === acc.id}
                    activeOpacity={0.8}
                  >
                    {removingId === acc.id
                      ? <ActivityIndicator color={colors.white} size="small" />
                      : (
                        <>
                          <Ionicons name="trash-outline" size={13} color={colors.white} />
                          <Text style={styles.removeButtonText}>Remove</Text>
                        </>
                      )
                    }
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {filteredAccounts.length > 0 && (
          <View style={styles.paginationFooter}>
            <Text style={styles.paginationSummary}>
              Showing {pageStart + 1}
              {pagedAccounts.length > 1 ? `–${pageStart + pagedAccounts.length}` : ''} of {filteredAccounts.length} account{filteredAccounts.length !== 1 ? 's' : ''}
            </Text>
            <View style={styles.paginationControls}>
              <TouchableOpacity
                disabled={currentPage <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={styles.pageArrowBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={14} color={currentPage <= 1 ? colors.disabled : colors.text} />
              </TouchableOpacity>
              <View style={styles.pageNumberPill}>
                <Text style={styles.pageNumberText}>{currentPage}</Text>
              </View>
              <TouchableOpacity
                disabled={currentPage >= pageCount}
                onPress={() => setPage((p) => Math.min(pageCount, p + 1))}
                style={styles.pageArrowBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward" size={14} color={currentPage >= pageCount ? colors.disabled : colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.pageSizeButton} onPress={() => setPageSizeModalVisible(true)} activeOpacity={0.8}>
                <Text style={styles.pageSizeButtonText}>{pageSize >= 1000 ? 'Show all' : `${pageSize} / page`}</Text>
                <Ionicons name="chevron-down" size={12} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      </View>

      {/* ── Filter ───────────────────────────────────────────────────── */}
      <SimpleOptionsModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        title="Filter Accounts"
        options={[
          { value: 'active', label: 'Active accounts' },
          { value: 'all', label: 'All accounts (incl. removed)' },
        ]}
        selectedValue={statusFilter}
        onSelect={setStatusFilter}
      />

      {/* ── Accounts per page ────────────────────────────────────────── */}
      <SimpleOptionsModal
        visible={pageSizeModalVisible}
        onClose={() => setPageSizeModalVisible(false)}
        title="Accounts per page"
        options={[
          { value: 5, label: '5 / page' },
          { value: 10, label: '10 / page' },
          { value: 25, label: '25 / page' },
          { value: 50, label: '50 / page' },
          { value: 1000, label: 'Show all' },
        ]}
        selectedValue={pageSize}
        onSelect={setPageSize}
      />

      {/* ── Remove confirmation ─────────────────────────────────────── */}
      <Modal transparent visible={!!pendingRemoval} animationType="fade" onRequestClose={() => setPendingRemoval(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="trash-outline" size={24} color="#B3261E" />
            </View>
            <Text style={styles.modalTitle}>Remove {roleLabel} account?</Text>
            <Text style={styles.modalText}>
              This will remove {pendingRemoval?.displayName || `${pendingRemoval?.firstName || ''} ${pendingRemoval?.lastName || ''}`.trim() || 'this staff member'} from the active staff list.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setPendingRemoval(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleRemoveAccount}>
                <Text style={styles.modalConfirmText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit ─────────────────────────────────────────────────────── */}
      <Modal transparent visible={!!editingAccount} animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Staff Account</Text>
            <Text style={styles.editHint}>Email isn't editable here. To reset a forgotten password, use Reset Password from the account list instead.</Text>

            <Text style={styles.inputLabel}>First name</Text>
            <TextInput
              style={styles.input}
              value={editForm.firstName}
              onChangeText={(v) => setEditForm((prev) => ({ ...prev, firstName: v }))}
              autoCapitalize="words"
            />
            <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Last name</Text>
            <TextInput
              style={styles.input}
              value={editForm.lastName}
              onChangeText={(v) => setEditForm((prev) => ({ ...prev, lastName: v }))}
              autoCapitalize="words"
            />
            <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Phone</Text>
            <TextInput
              style={styles.input}
              value={editForm.phone}
              onChangeText={(v) => setEditForm((prev) => ({ ...prev, phone: v }))}
              keyboardType="phone-pad"
            />

            {!!editError && <Text style={styles.fieldErrorText}>{editError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={closeEdit} disabled={savingEdit}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalConfirmText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Reset Password ──────────────────────────────────────────── */}
      <Modal transparent visible={!!resettingAccount} animationType="fade" onRequestClose={closeReset}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={closeReset}
              disabled={resetSubmitting}
              activeOpacity={0.7}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.resetIconWrap}>
              <Ionicons name="key-outline" size={22} color={AMBER} />
            </View>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalText}>
              Set a new password for this account, the same way a default password is set when creating one.
            </Text>

            <View style={styles.resetRecipientCard}>
              <View style={styles.resetRecipientAvatar}>
                {resettingAccount?.photoUrl ? (
                  <Image source={{ uri: resettingAccount.photoUrl }} style={styles.resetRecipientAvatarImage} />
                ) : (
                  <Text style={styles.resetRecipientAvatarText}>{resetAccountInitial}</Text>
                )}
              </View>
              <View style={styles.resetRecipientTextWrap}>
                <Text style={styles.resetRecipientName} numberOfLines={1}>{resetAccountName}</Text>
                <Text style={styles.resetRecipientEmail} numberOfLines={1}>{resettingAccount?.email || 'No email on file'}</Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { marginTop: spacing.lg }]}>New password</Text>
            <View style={styles.passwordInputRow}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.passwordInput}
                value={resetPassword}
                onChangeText={setResetPassword}
                placeholder="At least 8 characters"
                secureTextEntry={!resetShowPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setResetShowPw((s) => !s)} style={styles.eyeBtn} activeOpacity={0.7}>
                <Ionicons name={resetShowPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {!!resetPassword && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthFill, { width: `${resetPasswordStrength.score * 25}%`, backgroundColor: resetPasswordStrength.color }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: resetPasswordStrength.color }]}>{resetPasswordStrength.label}</Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { marginTop: spacing.sm }]}>Confirm new password</Text>
            <View style={[styles.passwordInputRow, resetPasswordsMismatch && styles.passwordInputRowError]}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.passwordInput}
                value={resetConfirm}
                onChangeText={setResetConfirm}
                placeholder="Re-enter the new password"
                secureTextEntry={!resetShowPw}
                autoCapitalize="none"
              />
              {resetConfirm.length > 0 && (
                <Ionicons
                  name={resetPasswordsMatch ? 'checkmark-circle' : 'close-circle'}
                  size={17}
                  color={resetPasswordsMatch ? '#1E7B34' : '#B3261E'}
                />
              )}
            </View>

            {!!resetError && <Text style={styles.fieldErrorText}>{resetError}</Text>}

            <View style={styles.resetInfoBox}>
              <Ionicons name="information-circle-outline" size={15} color={AMBER} />
              <Text style={styles.resetInfoText}>
                Share the new password with {resetAccountName.split(' ')[0]} directly — they can change it themselves from My Profile once logged in.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={closeReset} disabled={resetSubmitting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resetConfirmButton} onPress={handleResetPassword} disabled={resetSubmitting}>
                {resetSubmitting ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="key-outline" size={14} color={colors.white} />
                    <Text style={styles.modalConfirmText}>Reset Password</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  pageIconBadge: { width: 44, height: 44, borderRadius: radius.lg, backgroundColor: BLUE_TINT, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary, marginBottom: spacing.xs },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  // Side-by-side panels on wide (desktop/tablet) viewports: the create
  // form + "manage existing accounts" cards stay a fixed, comfortably-
  // narrow column on the left, and the account list fills the rest on
  // the right. Falls back to the original single stacked column below
  // WIDE_BREAKPOINT.
  columnsWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },
  leftColumn: { gap: spacing.lg, marginBottom: spacing.xl },
  leftColumnWide: { flexBasis: 420, flexGrow: 0, flexShrink: 0, marginBottom: 0 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  errorBannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#DFF5E1', borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  successBannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: '#1E7B34' },

  staffCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.lg },
  cardIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE_TINT, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
  helperText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  requiredMark: { color: colors.danger },
  // flexWrap + a minWidth per field (not a hardcoded row/column split)
  // means this lays out sensibly whether it's in the narrower left
  // panel on desktop, a full-width stacked card on tablet, or anything
  // in between — fields wrap to their own line only if the container
  // is too narrow to fit two comfortably.
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  inputGroup: { flex: 1, minWidth: 160 },
  inputLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.cardAlt, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  inputError: { borderColor: '#B3261E', backgroundColor: colors.dangerBg },
  fieldErrorText: { fontSize: 11, fontFamily: fonts.body, color: '#B3261E', marginTop: 4 },

  // Leading-icon input row used by the create-form fields — a bordered
  // container holding an Ionicons glyph and a borderless TextInput,
  // same shape as the pre-existing searchBar/passwordInputRow pattern
  // below rather than a new one-off.
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, backgroundColor: colors.cardAlt,
  },
  inputRowError: { borderColor: '#B3261E', backgroundColor: colors.dangerBg },
  inputRowField: { flex: 1, paddingVertical: spacing.sm, fontFamily: fonts.body, fontSize: 13, color: colors.text, outlineStyle: 'none' },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  strengthTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 10, fontFamily: fonts.bodySemiBold, minWidth: 42 },
  passwordInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md, marginTop: spacing.xs,
  },
  // Live-mismatch state for the Confirm field (mirrors inputRowError above).
  passwordInputRowError: { borderColor: '#B3261E', backgroundColor: colors.dangerBg },
  passwordInput: { flex: 1, paddingVertical: spacing.sm, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  eyeBtn: { paddingVertical: spacing.xs },

  createButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: BLUE, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  createButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
  buttonDisabled: { opacity: 0.7 },

  // "Need to manage existing accounts?" prompt card — its button widens
  // the list on the right to show every registered account in one go
  // (see the onPress handler above) rather than navigating anywhere.
  manageCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  manageIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: BLUE_TINT, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  manageTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.xs },
  manageText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 17, marginBottom: spacing.md },
  manageButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: BLUE, borderRadius: radius.md, paddingVertical: spacing.sm + 2, backgroundColor: BLUE_TINT,
  },
  manageButtonText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: BLUE },

  staffListCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  staffListCardWide: { flex: 1, minWidth: 0 },
  searchFilterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 38, backgroundColor: colors.cardAlt,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text, outlineStyle: 'none' },
  filterButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 38,
  },
  filterButtonText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },
  filterActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BLUE },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },

  staffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  staffAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  staffAvatarImage: { width: 40, height: 40 },
  staffAvatarText: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
  staffTextWrap: { flex: 1, minWidth: 140 },
  staffNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  staffName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  roleBadge: { backgroundColor: BLUE_TINT, borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm },
  roleBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: BLUE },
  inactiveBadge: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm },
  inactiveBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  staffMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  staffMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  staffCreatedWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 108, flexShrink: 0 },
  staffCreatedText: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  staffActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xs, maxWidth: 260 },
  // Edit / Reset / Remove read as three distinct action weights — a
  // filled light tint for the two non-destructive actions (blue for
  // Edit, amber for Reset, matching BLUE/AMBER above) and a solid fill
  // for the destructive one (Remove), rather than all three sharing the
  // same neutral outline.
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BLUE_TINT, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  editButtonText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: BLUE },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: AMBER_TINT, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8 },
  resetButtonText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: AMBER },
  removeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.danger, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, minWidth: 88 },
  removeButtonText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },

  paginationFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  paginationSummary: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  paginationControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pageArrowBtn: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  pageNumberPill: { minWidth: 28, height: 28, borderRadius: radius.sm, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pageNumberText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },
  pageSizeButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: spacing.sm, height: 28, marginLeft: spacing.xs,
  },
  pageSizeButtonText: { fontSize: 12, fontFamily: fonts.body, color: colors.text },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 420 },
  // Corner dismiss button for the Reset Password modal. `modalCard` has no
  // explicit `position`, but React Native (and RN-Web's View reset) treats
  // every View as the positioning root for its own absolutely-positioned
  // children regardless, so this needs no change to modalCard itself.
  modalCloseBtn: {
    position: 'absolute', top: spacing.md, right: spacing.md, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, zIndex: 1,
  },
  modalIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FBE7E7', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, alignSelf: 'center' },
  // Amber twin of modalIconWrap, scoped to Reset Password to match the
  // amber row-level "Reset" action that opens this modal.
  resetIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: AMBER_TINT, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, alignSelf: 'center' },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  modalText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg, textAlign: 'center' },
  editHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 16 },
  // "Who is this for?" card in the Reset Password modal — avatar + name +
  // email, so the admin can confirm the account at a glance rather than
  // relying on a name buried mid-sentence in a paragraph.
  resetRecipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.cardAlt,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginTop: spacing.md,
  },
  resetRecipientAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: AMBER_TINT, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  resetRecipientAvatarImage: { width: 36, height: 36 },
  resetRecipientAvatarText: { fontSize: 14, fontFamily: fonts.headingBold, color: AMBER },
  resetRecipientTextWrap: { flex: 1, minWidth: 0 },
  resetRecipientName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  resetRecipientEmail: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  // Small amber tip box for the "share it with them" note — pulled out of
  // the explanatory paragraph above so it reads as a tip, not a warning.
  resetInfoBox: { flexDirection: 'row', gap: spacing.xs, backgroundColor: AMBER_TINT, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.md },
  resetInfoText: { flex: 1, fontSize: 11, fontFamily: fonts.body, color: AMBER, lineHeight: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  modalCancelButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalConfirmButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: 999, backgroundColor: colors.danger },
  modalSaveButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: 999, backgroundColor: colors.primary, minWidth: 130, alignItems: 'center' },
  // Amber twin of modalSaveButton, scoped to Reset Password's own submit
  // button (icon + label, row layout) so Edit's "Save Changes" button
  // (still modalSaveButton, unchanged) keeps its neutral dark fill.
  resetConfirmButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: 999, backgroundColor: AMBER, minWidth: 130,
  },
  modalConfirmText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

  // Filter / page-size option list, reusing modalBackdrop/modalCard's
  // shape at a narrower width.
  optionsModalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxWidth: 300 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
  optionRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  optionRadioActive: { borderColor: BLUE },
  optionRadioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: BLUE },
  optionRowText: { fontSize: 13, fontFamily: fonts.body, color: colors.text },
});