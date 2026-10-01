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

/**
 * FnbAccountsScreen — admin creates/manages Kitchen/F&B staff accounts.
 *
 * Same account-creation flow, Edit/Remove/Reset Password actions, audit
 * logging, and desktop two-panel layout as FrontDeskAccountScreen.jsx —
 * see that file's own header comment for the full history of WHY it's
 * built the way it is (the secondarySupabase session-isolation trick for
 * account creation, the active=false "Remove" pattern, the desktop/tablet
 * layout reasoning). Only the assigned role differs.
 *
 * Kitchen/F&B accounts are what let a Kitchen Orders screen
 * (fnb/KitchenOrdersScreen.jsx) actually have anyone able to log in and
 * use it — without this screen existing, that whole portal would be
 * unreachable, since nothing else in the app can create an 'fnb'-role
 * account. Requires 003_food_service_fnb_role.sql and
 * 004_food_service_fnb_setup.sql to have been run first (adds the
 * 'fnb' value to the role enum, and widens food_orders/food_order_items
 * RLS to include it) — without those migrations, accounts created here
 * would exist but be unable to see or act on any order once logged in.
 *
 * UI ALIGNED WITH FRONT DESK (this pass): ported the same visual redesign
 * as FrontDeskAccountScreen.jsx for consistency across the admin portal's
 * staff-account screens — icon badges, a scoped blue/amber local accent
 * (BLUE/BLUE_TINT/AMBER/AMBER_TINT below — see FrontDeskAccountScreen.jsx
 * for why this stays local rather than touching portalTheme.js's shared,
 * deliberately monochrome palette), leading icons on the create-form
 * fields, a Filter (Active/All) control with client-side pagination
 * (5/10/25/50/Show all per page), color-coded Edit/Reset/Remove action
 * buttons, and the same enhanced Reset Password modal (recipient card
 * with avatar + name + email, a live match/mismatch icon on Confirm, and
 * an info tip box). F&B never had a separate "Roster" screen the way
 * Front Desk's old staff:frontdesk page was, so there was nothing to
 * remove here — the "Need to manage existing accounts?" card's "View
 * All" button has simply always meant "show everything in this list"
 * (clears search, switches the Filter to All, sets the page size high
 * enough to fit every account on one page), same as Front Desk's version
 * now behaves after its own Roster page was retired.
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

// Local accent for this screen's redesign only — same values as
// FrontDeskAccountScreen.jsx (kept file-local there too, see that file's
// doc comment for why) so the two staff-account screens read as the same
// visual language rather than two different ones.
const BLUE = '#2F6FED';
const BLUE_TINT = '#EAF1FF';
const AMBER = '#B45309';
const AMBER_TINT = '#FEF3C7';

// A small, reusable single-select list in a modal — used below for both
// the account-status Filter and the per-page picker, so neither needed
// its own bespoke popover/positioning logic. Matches this file's
// existing modal conventions (plain backdrop View, no tap-outside-to-
// close, since none of this screen's other modals do that either).
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

export default function FnbAccountsScreen() {
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

  // ── Filter (active / all) + pagination ──────────────────────────────
  // The account list used to ALWAYS query active=true with no way to see
  // removed accounts at all. It now fetches every F&B profile regardless
  // of status and filters client-side, so the Filter control below can
  // switch between the two without a second round trip.
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [pageSizeModalVisible, setPageSizeModalVisible] = useState(false);

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
      // No .eq('active', true) here on purpose — the Filter control lets
      // the admin see removed accounts too, so every F&B profile is
      // fetched once and the active/all split happens client-side in
      // filteredStaff below.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'fnb')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Failed to load F&B accounts:', error);
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
          active: row.active,
        }))
      );
    };
    loadStaff();

    const channel = supabase
      .channel('fnb-accounts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadStaff)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const filteredStaff = useMemo(() => {
    const statusMatched =
      statusFilter === 'all' ? staffAccounts : staffAccounts.filter((s) => s.active !== false);
    const term = searchTerm.trim().toLowerCase();
    const termMatched = !term
      ? statusMatched
      : statusMatched.filter((s) => {
          const haystack = [s.displayName, s.firstName, s.lastName, s.email, s.phone].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(term);
        });
    // Alphabetical by name (A–Z, case-insensitive), same name shown on each
    // card — independent of created_at, so the list doesn't reshuffle by
    // signup date and newly-added staff don't jump to the top or bottom.
    return [...termMatched].sort((a, b) => {
      const nameA = a.displayName || `${a.firstName || ''} ${a.lastName || ''}`.trim() || '';
      const nameB = b.displayName || `${b.firstName || ''} ${b.lastName || ''}`.trim() || '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [staffAccounts, searchTerm, statusFilter]);

  // Reset to page 1 whenever the visible set could have changed shape —
  // otherwise a search or filter change could leave the admin stranded
  // on a now-empty page.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pagedStaff = filteredStaff.slice(pageStart, pageStart + pageSize);

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

  const handleCreateFnbAccount = async () => {
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
        .update({ role: 'fnb', active: true })
        .eq('id', newUser.id);

      if (promoteError) {
        throw new Error(
          `Account was created, but could not be promoted to F&B role: ${promoteError.message}. ` +
          `The account exists with the default guest role — promote it manually or try again.`
        );
      }

      await logStaffAudit(newUser.id, `${firstName} ${lastName}`, email, 'created');

      setStaffSuccess(`F&B account created for ${firstName} ${lastName}.`);
      setStaffForm(EMPTY_FORM);
      setTouched({});
      setErrors({});
    } catch (err) {
      console.error('F&B account creation failed:', err);
      setStaffError(err?.message || 'Failed to create F&B account.');
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
        staff.displayName || `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'F&B Staff',
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
  // Derived display bits for the modal UI: who the password is for (name +
  // initial, for a small recipient card so the admin can confirm at a
  // glance they're resetting the right account) and whether the two
  // password fields currently agree (drives the inline match icon next to
  // "Confirm new password" instead of making the admin wait for Submit to
  // find out they don't match).
  const resetStaffName = resettingStaff?.displayName || `${resettingStaff?.firstName || ''} ${resettingStaff?.lastName || ''}`.trim() || 'this staff member';
  const resetStaffInitial = resetStaffName.charAt(0).toUpperCase();
  const resetPasswordsMatch = resetConfirm.length > 0 && resetPassword === resetConfirm;
  const resetPasswordsMismatch = resetConfirm.length > 0 && resetPassword !== resetConfirm;

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

    const name = resetStaffName;

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
        <View style={styles.pageIconBadge}>
          <Ionicons name="restaurant-outline" size={20} color={BLUE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>F&amp;B Accounts</Text>
          <Text style={styles.pageSubtitle}>
            Create and manage Kitchen/F&amp;B staff accounts without leaving the admin portal.
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
      <View style={[styles.leftColumn, isWide && styles.leftColumnWide]}>
      <View style={styles.staffCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardIconBadge}>
            <Ionicons name="person-add-outline" size={16} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Create F&amp;B Account</Text>
            <Text style={styles.helperText}>Only administrators can create Kitchen/F&amp;B staff accounts.</Text>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name <Text style={styles.requiredMark}>*</Text></Text>
            <View style={[styles.inputRow, fieldError('firstName') && styles.inputRowError]}>
              <Ionicons name="person-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={staffForm.firstName}
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
                value={staffForm.lastName}
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
                value={staffForm.email}
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
                value={staffForm.phone}
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
                value={staffForm.password}
                onChangeText={(v) => setField('password', v)}
                onBlur={() => handleBlur('password')}
                placeholder="At least 8 characters"
                secureTextEntry
              />
            </View>
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
            <Text style={styles.inputLabel}>Confirm password <Text style={styles.requiredMark}>*</Text></Text>
            <View style={[styles.inputRow, fieldError('confirmPassword') && styles.inputRowError]}>
              <Ionicons name="lock-closed-outline" size={15} color={colors.textMuted} />
              <TextInput
                style={styles.inputRowField}
                value={staffForm.confirmPassword}
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
          style={[styles.createButton, creatingStaff && styles.buttonDisabled]}
          onPress={handleCreateFnbAccount}
          activeOpacity={0.85}
          disabled={creatingStaff}
        >
          {creatingStaff ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="add" size={17} color={colors.white} />
              <Text style={styles.createButtonText}>Create F&amp;B Account</Text>
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
          View and manage all registered F&amp;B staff accounts, including edit, reset password, or remove access.
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
          <Text style={styles.manageButtonText}>View All Registered F&amp;B</Text>
          <Ionicons name="chevron-forward" size={14} color={BLUE} />
        </TouchableOpacity>
      </View>
      </View>

      <View style={[styles.staffListCard, isWide && styles.staffListCardWide]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cardIconBadge}>
            <Ionicons name="restaurant-outline" size={16} color={BLUE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>F&amp;B Accounts</Text>
            <Text style={styles.helperText}>
              {pageSize >= 1000
                ? 'Manage all registered F&B staff accounts.'
                : `Manage the ${pageSize} most recent F&B staff accounts.`}
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

        {pagedStaff.length === 0 ? (
          <Text style={styles.emptyText}>
            {staffAccounts.length === 0
              ? 'No F&B accounts yet.'
              : filteredStaff.length === 0
              ? 'No accounts match your search.'
              : 'No accounts on this page.'}
          </Text>
        ) : (
          pagedStaff.map((staff) => {
            const name = staff.displayName || `${staff.firstName || ''} ${staff.lastName || ''}`.trim() || 'F&B Staff';
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
                      <Text style={styles.roleBadgeText}>F&amp;B</Text>
                    </View>
                    {staff.active === false && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveBadgeText}>Inactive</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.staffMetaRow}>
                    <Ionicons name="mail-outline" size={11} color={colors.textMuted} />
                    <Text style={styles.staffMeta}>{staff.email || 'No email provided'}</Text>
                  </View>
                  {!!staff.phone && (
                    <View style={styles.staffMetaRow}>
                      <Ionicons name="call-outline" size={11} color={colors.textMuted} />
                      <Text style={styles.staffMeta}>{staff.phone}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.staffCreatedWrap}>
                  <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
                  <Text style={styles.staffCreatedText}>Created {formatDateLabel(staff.createdAt)}</Text>
                </View>
                <View style={styles.staffActions}>
                  <TouchableOpacity style={styles.editButton} onPress={() => openEdit(staff)} activeOpacity={0.8}>
                    <Ionicons name="pencil-outline" size={13} color={BLUE} />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.resetButton} onPress={() => openReset(staff)} activeOpacity={0.8}>
                    <Ionicons name="refresh-outline" size={13} color={AMBER} />
                    <Text style={styles.resetButtonText}>Reset</Text>
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

        {filteredStaff.length > 0 && (
          <View style={styles.paginationFooter}>
            <Text style={styles.paginationSummary}>
              Showing {pageStart + 1}
              {pagedStaff.length > 1 ? `–${pageStart + pagedStaff.length}` : ''} of {filteredStaff.length} account{filteredStaff.length !== 1 ? 's' : ''}
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
      <Modal transparent visible={!!pendingStaffRemoval} animationType="fade" onRequestClose={() => setPendingStaffRemoval(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="trash-outline" size={24} color="#B3261E" />
            </View>
            <Text style={styles.modalTitle}>Remove F&amp;B account?</Text>
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
                {resettingStaff?.photoUrl ? (
                  <Image source={{ uri: resettingStaff.photoUrl }} style={styles.resetRecipientAvatarImage} />
                ) : (
                  <Text style={styles.resetRecipientAvatarText}>{resetStaffInitial}</Text>
                )}
              </View>
              <View style={styles.resetRecipientTextWrap}>
                <Text style={styles.resetRecipientName} numberOfLines={1}>{resetStaffName}</Text>
                <Text style={styles.resetRecipientEmail} numberOfLines={1}>{resettingStaff?.email || 'No email on file'}</Text>
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
                Share the new password with {resetStaffName.split(' ')[0]} directly — they can change it themselves from My Profile once logged in.
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