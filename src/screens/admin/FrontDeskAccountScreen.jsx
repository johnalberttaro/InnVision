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
 *  - "Remove" sets profiles.active = false, the real field for this (see
 *    GuestProfileTableScreen.jsx), instead of overloading the role
 *    column with a fake 'inactive' value — role stays 'frontdesk',
 *    active flips to false, and every screen that checks
 *    role='frontdesk' AND active=true (dashboard staff count, this
 *    screen's own list) picks that up correctly.
 *
 * ENHANCED (this pass): inline/live validation (touched-state pattern,
 * matching AddRoomTypeScreen.jsx), a password strength meter, a
 * search/filter bar over the account list, an Edit flow (name + phone —
 * NOT email/password, which are auth-level changes handled through
 * proper reset flows rather than a direct profile edit), avatar-initial
 * circles and a "Front Desk" role badge per row, and a centralized audit
 * trail (staff_account_audit_log — create/update/remove all log
 * automatically via logStaffAudit() below, non-blocking so a logging
 * failure never blocks the actual action). "Role assignment" here means
 * a visible, confirmed role badge rather than a role PICKER — this
 * screen is scoped to Front Desk accounts specifically (matching its
 * name and the sidebar's separate "Front Desk Accounts" item); creating
 * accounts with other roles would be a different, more sensitive flow
 * this screen doesn't attempt.
 *
 * DESKTOP/TABLET LAYOUT: this is an admin-only screen — nobody reaches
 * it from a phone — but it previously had no max-width cap at all, so
 * on an actual desktop monitor the form fields and account rows just
 * stretched edge to edge and got uncomfortably wide. On wide viewports
 * (>= WIDE_BREAKPOINT) "Create Front Desk Account" and "Existing Front
 * Desk Accounts" now sit side by side as two panels instead of one long
 * stacked page, and the overall content area is capped at a sane max
 * width. Form field rows use flexWrap + a minWidth per field rather than
 * a hardcoded row/column split, so they lay out sensibly whichever panel
 * width they end up in. Narrower viewports (tablet portrait, or the
 * mobile build) fall back to the original single stacked column.
 *
 * FIXED: the account list always showed an initials circle, even for
 * staff who'd uploaded a real profile photo via their own self-service
 * "My Profile" screen — photo_url was never fetched or rendered here
 * (same gap as FrontDeskStaffScreen.jsx's roster, fixed the same way).
 * Now shows the actual photo when one exists. Stays live automatically
 * via the existing realtime subscription on the profiles table below.
 */

// Writes one row to staff_account_audit_log. Never throws — a logging
// failure shouldn't block the actual create/update/remove action that
// already succeeded (or is about to).
async function logStaffAudit(staffId, staffName, staffEmail, action, details) {
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
      details: details || null,
    });
  } catch (err) {
    console.error('Failed to write staff account audit log:', err);
  }
}

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

const EMPTY_FORM = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', phone: '' };
const WIDE_BREAKPOINT = 1000;

export default function FrontDeskAccountsScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [staffForm, setStaffForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({});
  const [staffError, setStaffError] = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');

  // Success banners (create/edit/remove/reset) auto-dismiss after 3s
  // rather than sitting on screen until the admin's next action
  // replaces or manually clears them.
  useEffect(() => {
    if (!staffSuccess) return;
    const timer = setTimeout(() => setStaffSuccess(''), 3000);
    return () => clearTimeout(timer);
  }, [staffSuccess]);
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [removingStaffId, setRemovingStaffId] = useState(null);
  const [pendingStaffRemoval, setPendingStaffRemoval] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [editingStaff, setEditingStaff] = useState(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [resettingStaff, setResettingStaff] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetShowPw, setResetShowPw] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState('');

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
          phone: row.phone,
          photoUrl: row.photo_url,
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

  const filteredStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return staffAccounts;
    return staffAccounts.filter((s) => {
      const haystack = [s.displayName, s.firstName, s.lastName, s.email, s.phone].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [staffAccounts, searchTerm]);

  const passwordStrength = scorePasswordStrength(staffForm.password);

  // ── Live/inline validation ──────────────────────────────────────────
  const computeErrors = () => {
    const e = {};
    if (!staffForm.firstName.trim()) e.firstName = 'First name is required.';
    if (!staffForm.lastName.trim()) e.lastName = 'Last name is required.';
    if (!staffForm.email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffForm.email.trim())) e.email = 'Enter a valid email address.';
    if (!staffForm.phone.trim()) e.phone = 'Phone number is required.';
    else {
      const digitsOnly = staffForm.phone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) e.phone = 'Enter a valid phone number.';
    }
    if (!staffForm.password) e.password = 'Password is required.';
    else if (staffForm.password.length < 8) e.password = 'Password must be at least 8 characters.';
    if (!staffForm.confirmPassword) e.confirmPassword = 'Please confirm the password.';
    else if (staffForm.password !== staffForm.confirmPassword) e.confirmPassword = 'Passwords do not match.';
    return e;
  };

  const [errors, setErrors] = useState({});
  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(computeErrors());
  };
  const fieldError = (field) => (touched[field] ? errors[field] : undefined);

  const setField = (field, value) => setStaffForm((prev) => ({ ...prev, [field]: value }));

  const handleCreateFrontDeskAccount = async () => {
    const currentErrors = computeErrors();
    setErrors(currentErrors);
    setTouched({ firstName: true, lastName: true, email: true, phone: true, password: true, confirmPassword: true });
    if (Object.keys(currentErrors).length > 0) return;

    const firstName = staffForm.firstName.trim();
    const lastName = staffForm.lastName.trim();
    const email = staffForm.email.trim();
    const password = staffForm.password;
    const phone = staffForm.phone.trim();

    setStaffError('');
    setStaffSuccess('');
    setCreatingStaff(true);

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
        .update({ role: 'frontdesk', active: true })
        .eq('id', newUser.id);

      if (promoteError) {
        throw new Error(
          `Account was created, but could not be promoted to Front Desk role: ${promoteError.message}. ` +
          `The account exists with the default guest role — promote it manually or try again.`
        );
      }

      await logStaffAudit(newUser.id, `${firstName} ${lastName}`, email, 'created');

      setStaffSuccess(`Front desk account created for ${firstName} ${lastName}.`);
      setStaffForm(EMPTY_FORM);
      setTouched({});
      setErrors({});
    } catch (err) {
      console.error('Front desk account creation failed:', err);
      setStaffError(err?.message || 'Failed to create front desk account.');
    } finally {
      setCreatingStaff(false);
      await secondarySupabase.auth.signOut().catch(() => {});
    }
  };

  const confirmRemoveStaffAccount = (staff) => {
    setStaffError('');
    setStaffSuccess('');
    setPendingStaffRemoval(staff);
  };

  const handleRemoveStaffAccount = async () => {
    if (!pendingStaffRemoval) return;
    const staff = pendingStaffRemoval;

    setRemovingStaffId(staff.id);
    try {
      const { error } = await supabase.from('profiles').update({ active: false }).eq('id', staff.id);
      if (error) throw error;

      await logStaffAudit(
        staff.id,
        staff.displayName || `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Front Desk Staff',
        staff.email,
        'removed'
      );

      setStaffSuccess(`${staff.displayName || staff.firstName || 'Staff account'} was removed.`);
      setPendingStaffRemoval(null);
    } catch (err) {
      console.error('Failed to remove staff account:', err);
      setStaffError('Could not remove that staff account right now.');
    } finally {
      setRemovingStaffId(null);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────
  const openEdit = (staff) => {
    setEditError('');
    setEditingStaff(staff);
    setEditForm({ firstName: staff.firstName || '', lastName: staff.lastName || '', phone: staff.phone || '' });
  };

  const closeEdit = () => {
    setEditingStaff(null);
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editingStaff) return;
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
        .eq('id', editingStaff.id);
      if (error) throw error;

      await logStaffAudit(editingStaff.id, `${firstName} ${lastName}`, editingStaff.email, 'updated');

      setStaffSuccess(`${firstName} ${lastName}'s account was updated.`);
      closeEdit();
    } catch (err) {
      console.error('Failed to update staff account:', err);
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
  const openReset = (staff) => {
    setResetError('');
    setResetPassword('');
    setResetConfirm('');
    setResetShowPw(false);
    setResettingStaff(staff);
  };

  const closeReset = () => {
    setResettingStaff(null);
    setResetError('');
  };

  const resetPasswordStrength = scorePasswordStrength(resetPassword);

  const handleResetPassword = async () => {
    if (!resettingStaff) return;
    if (!resetPassword || resetPassword.length < 8) {
      setResetError('Enter a new password of at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match.');
      return;
    }

    const name = resettingStaff.displayName || `${resettingStaff.firstName || ''} ${resettingStaff.lastName || ''}`.trim() || 'this staff member';

    setResetSubmitting(true);
    setResetError('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { staffUid: resettingStaff.id, newPassword: resetPassword },
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

      await logStaffAudit(resettingStaff.id, name, resettingStaff.email, 'password_reset', 'Password reset by administrator');

      setStaffSuccess(`Password reset for ${name}. Share it with them directly.`);
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
        <View>
          <Text style={styles.pageTitle}>Front Desk Accounts</Text>
          <Text style={styles.pageSubtitle}>
            Create and manage front desk staff accounts without leaving the admin portal.
          </Text>
        </View>
      </View>

      {!!staffError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.errorBannerText}>{staffError}</Text>
        </View>
      )}
      {!!staffSuccess && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#1E7B34" />
          <Text style={styles.successBannerText}>{staffSuccess}</Text>
        </View>
      )}

      <View style={isWide ? styles.columnsWrap : undefined}>
      <View style={[styles.staffCard, isWide && styles.staffCardWide]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="person-add-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>Create Front Desk Account</Text>
        </View>
        <Text style={styles.helperText}>Only administrators can create front-desk staff accounts.</Text>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name</Text>
            <TextInput
              style={[styles.input, fieldError('firstName') && styles.inputError]}
              value={staffForm.firstName}
              onChangeText={(v) => setField('firstName', v)}
              onBlur={() => handleBlur('firstName')}
              placeholder="First name"
              autoCapitalize="words"
            />
            {!!fieldError('firstName') && <Text style={styles.fieldErrorText}>{fieldError('firstName')}</Text>}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Last name</Text>
            <TextInput
              style={[styles.input, fieldError('lastName') && styles.inputError]}
              value={staffForm.lastName}
              onChangeText={(v) => setField('lastName', v)}
              onBlur={() => handleBlur('lastName')}
              placeholder="Last name"
              autoCapitalize="words"
            />
            {!!fieldError('lastName') && <Text style={styles.fieldErrorText}>{fieldError('lastName')}</Text>}
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={[styles.input, fieldError('email') && styles.inputError]}
              value={staffForm.email}
              onChangeText={(v) => setField('email', v)}
              onBlur={() => handleBlur('email')}
              placeholder="staff@innvision.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!fieldError('email') && <Text style={styles.fieldErrorText}>{fieldError('email')}</Text>}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone</Text>
            <TextInput
              style={[styles.input, fieldError('phone') && styles.inputError]}
              value={staffForm.phone}
              onChangeText={(v) => setField('phone', v)}
              onBlur={() => handleBlur('phone')}
              placeholder="Phone number"
              keyboardType="phone-pad"
            />
            {!!fieldError('phone') && <Text style={styles.fieldErrorText}>{fieldError('phone')}</Text>}
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={[styles.input, fieldError('password') && styles.inputError]}
              value={staffForm.password}
              onChangeText={(v) => setField('password', v)}
              onBlur={() => handleBlur('password')}
              placeholder="At least 8 characters"
              secureTextEntry
            />
            {!!staffForm.password && (
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
            <Text style={styles.inputLabel}>Confirm password</Text>
            <TextInput
              style={[styles.input, fieldError('confirmPassword') && styles.inputError]}
              value={staffForm.confirmPassword}
              onChangeText={(v) => setField('confirmPassword', v)}
              onBlur={() => handleBlur('confirmPassword')}
              placeholder="Re-enter password"
              secureTextEntry
            />
            {!!fieldError('confirmPassword') && <Text style={styles.fieldErrorText}>{fieldError('confirmPassword')}</Text>}
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

      <View style={[styles.staffListCard, isWide && styles.staffListCardWide]}>
        <View style={styles.cardHeaderRow}>
          <Ionicons name="people-outline" size={16} color={colors.primary} />
          <Text style={styles.sectionTitle}>Existing Front Desk Accounts</Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={15} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search by name, email, or phone"
            placeholderTextColor={colors.disabled}
          />
          {!!searchTerm && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={15} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {filteredStaff.length === 0 ? (
          <Text style={styles.emptyText}>
            {staffAccounts.length === 0 ? 'No front desk accounts yet.' : 'No accounts match your search.'}
          </Text>
        ) : (
          filteredStaff.map((staff) => {
            const name = staff.displayName || `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'Front Desk Staff';
            const initial = name.charAt(0).toUpperCase();
            return (
              <View key={staff.id} style={styles.staffRow}>
                <View style={styles.staffAvatar}>
                  {staff.photoUrl ? (
                    <Image source={{ uri: staff.photoUrl }} style={styles.staffAvatarImage} />
                  ) : (
                    <Text style={styles.staffAvatarText}>{initial}</Text>
                  )}
                </View>
                <View style={styles.staffTextWrap}>
                  <View style={styles.staffNameRow}>
                    <Text style={styles.staffName}>{name}</Text>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>Front Desk</Text>
                    </View>
                  </View>
                  <Text style={styles.staffMeta}>{staff.email || 'No email provided'}</Text>
                  <Text style={styles.staffMeta}>
                    {staff.phone ? `${staff.phone} · ` : ''}Created {formatDateLabel(staff.createdAt)}
                  </Text>
                </View>
                <View style={styles.staffActions}>
                  <TouchableOpacity style={styles.editButton} onPress={() => openEdit(staff)} activeOpacity={0.8}>
                    <Ionicons name="pencil-outline" size={13} color={colors.text} />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editButton} onPress={() => openReset(staff)} activeOpacity={0.8}>
                    <Ionicons name="key-outline" size={13} color={colors.text} />
                    <Text style={styles.editButtonText}>Reset Password</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => confirmRemoveStaffAccount(staff)}
                    disabled={removingStaffId === staff.id}
                    activeOpacity={0.8}
                  >
                    {removingStaffId === staff.id
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
      </View>
      </View>

      {/* ── Remove confirmation ─────────────────────────────────────── */}
      <Modal transparent visible={!!pendingStaffRemoval} animationType="fade" onRequestClose={() => setPendingStaffRemoval(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="trash-outline" size={24} color="#B3261E" />
            </View>
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

      {/* ── Edit ─────────────────────────────────────────────────────── */}
      <Modal transparent visible={!!editingStaff} animationType="fade" onRequestClose={closeEdit}>
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
      <Modal transparent visible={!!resettingStaff} animationType="fade" onRequestClose={closeReset}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.editHint}>
              Sets a new password for {resettingStaff?.displayName || `${resettingStaff?.firstName || ''} ${resettingStaff?.lastName || ''}`.trim() || 'this staff member'}, the same way a default password is set when creating an account. Share it with them directly — they can change it themselves from My Profile once logged in.
            </Text>

            <Text style={styles.inputLabel}>New password</Text>
            <View style={styles.passwordInputRow}>
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
            <View style={styles.passwordInputRow}>
              <TextInput
                style={styles.passwordInput}
                value={resetConfirm}
                onChangeText={setResetConfirm}
                placeholder="Re-enter the new password"
                secureTextEntry={!resetShowPw}
                autoCapitalize="none"
              />
            </View>

            {!!resetError && <Text style={styles.fieldErrorText}>{resetError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={closeReset} disabled={resetSubmitting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleResetPassword} disabled={resetSubmitting}>
                {resetSubmitting ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalConfirmText}>Reset Password</Text>}
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
  headerRow: { marginBottom: spacing.xl },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary, marginBottom: spacing.xs },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  // Side-by-side panels on wide (desktop/tablet) viewports: the create
  // form stays a fixed, comfortably-narrow width on the left, and the
  // account list fills the rest on the right. Falls back to the
  // original single stacked column below WIDE_BREAKPOINT.
  columnsWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  errorBannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#DFF5E1', borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  successBannerText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: '#1E7B34' },

  staffCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.xl },
  staffCardWide: { flexBasis: 420, flexGrow: 0, flexShrink: 0, marginBottom: 0 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
  helperText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.md },
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

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  strengthTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 10, fontFamily: fonts.bodySemiBold, minWidth: 42 },
  passwordInputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md, marginTop: spacing.xs,
  },
  passwordInput: { flex: 1, paddingVertical: spacing.sm, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  eyeBtn: { paddingLeft: spacing.xs, paddingVertical: spacing.xs },

  createButton: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  createButtonText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
  buttonDisabled: { opacity: 0.7 },

  staffListCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  staffListCardWide: { flex: 1, minWidth: 0 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 38, backgroundColor: colors.cardAlt, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },
  emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },

  staffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  staffAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  staffAvatarImage: { width: 40, height: 40 },
  staffAvatarText: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
  staffTextWrap: { flex: 1 },
  staffNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  staffName: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  roleBadge: { backgroundColor: colors.primaryTint, borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm },
  roleBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.primary },
  staffMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  staffActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xs, maxWidth: 260 },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 8 },
  editButtonText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.text },
  removeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 8, minWidth: 88 },
  removeButtonText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 420 },
  modalIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FBE7E7', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, alignSelf: 'center' },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  modalText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg, textAlign: 'center' },
  editHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  modalCancelButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
  modalConfirmButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: 999, backgroundColor: colors.danger },
  modalSaveButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: 999, backgroundColor: colors.primary, minWidth: 130, alignItems: 'center' },
  modalConfirmText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
});