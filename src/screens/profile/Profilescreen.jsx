import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  useWindowDimensions,
  ActivityIndicator,
  TextInput,
  Switch,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../services/supabase';
import { useTheme } from '../../context/ThemeContext';
import { formatDate } from '../../utils/dateHelpers';

/**
 * ProfileScreen — Guest profile dashboard for InnVision.
 *
 * MIGRATED TO SUPABASE. Notes on what changed from the Firebase version:
 *
 *  - `user` prop is now a Supabase Auth user object: `user.id` (not
 *    `user.uid`), `user.created_at` / `user.last_sign_in_at` are top-level
 *    ISO strings (not nested under `user.metadata`), and there's no
 *    `user.displayName` / `user.photoURL` — those now live on the
 *    `profiles` row instead, which this screen loads directly.
 *
 *  - contact / gender / address / photoURL / twoFactorEnabled used to
 *    live on the Firestore `guests/{uid}` doc. In the new schema those
 *    are columns on `profiles` instead — a `guests` row is now only
 *    created when someone actually books a stay, so a freshly-registered
 *    user with no bookings yet would have nowhere to store these
 *    otherwise. Run the `alter table profiles add column ...` migration
 *    before using this file.
 *
 *  - Avatar upload goes to Supabase Storage (bucket `avatars`, path
 *    `{uid}/avatar.jpg`) instead of Firebase Storage. Needs the
 *    `avatars` bucket + policies set up first.
 *
 *  - Reservation status comparison fixed: the old version compared
 *    against `r.status === 'completed'`, but the reservations table's
 *    status enum has no 'completed' value — every other screen in this
 *    app uses 'checked-out'. That means Completed/History counts here
 *    were effectively always zero in the live app. Now uses the same
 *    current/history split as GuestRecordsScreen:
 *      current = pending | upcoming | checked-in
 *      history = checked-out | declined | cancelled
 *
 *  - Password change: Supabase has no direct "reauthenticateWithCredential"
 *    API. This re-verifies the current password by calling
 *    signInWithPassword with it first (throws if wrong), then calls
 *    auth.updateUser({ password }).
 *
 *  - Email change: same reauth pattern, then auth.updateUser({ email }).
 *    Supabase's default "secure email change" sends a confirmation to
 *    BOTH the old and new address (configurable in Auth settings) —
 *    slightly different UX than Firebase's single verifyBeforeUpdateEmail
 *    link, worth trying once to see the actual email copy you get.
 *
 * Props:
 *  - user:       Supabase Auth user object
 *  - onBookNow:  () => void
 *  - onLogout:   () => void
 *  - onBackPress:() => void
 */
export default function ProfileScreen({ user, onBookNow, onLogout, onBackPress }) {
  const { width } = useWindowDimensions();
  const isWide    = width >= 768;
  const { colors, spacing, radius, fonts, isDark, setDarkMode } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const notify = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

  // ── Supabase: profile row (identity + editable personal info) ──────
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoadingProfile(false); return; }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!cancelled) {
        if (error) console.error('Supabase profile load error:', error);
        setProfile(data || {});
        setLoadingProfile(false);
      }
    })();

    // Realtime updates — same live-listener behavior the Firestore
    // onSnapshot version had.
    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => setProfile(payload.new)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const displayName = profile?.display_name
    || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    || 'Guest';
  const email    = user?.email || '—';
  // Contact falls back to the phone number captured at registration
  // (profile.phone) until the person explicitly sets a separate contact
  // number here — so registration data always shows up somewhere, instead
  // of the two fields silently disagreeing.
  const displayedContact = profile?.contact || profile?.phone || '';
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // ── Supabase: live reservations for this user ──────────────────────
  const [reservations, setReservations] = useState([]);
  const [loadingRes, setLoadingRes]     = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoadingRes(false); return; }

    let cancelled = false;
    const loadReservations = async () => {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        if (error) console.error('Supabase reservations error:', error);
        setReservations(data || []);
        setLoadingRes(false);
      }
    };
    loadReservations();

    const channel = supabase
      .channel(`profile-reservations-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `user_id=eq.${user.id}` },
        () => loadReservations()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ── Personal Information: in-place edit mode ─────────────────────
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalDraft, setPersonalDraft] = useState({ contact: '', gender: '', address: '' });

  const startEditingPersonal = () => {
    setPersonalDraft({
      contact: displayedContact,
      gender: profile?.gender || '',
      address: profile?.address || '',
    });
    setIsEditingPersonal(true);
  };

  const cancelEditingPersonal = () => {
    setIsEditingPersonal(false);
  };

  const savePersonalInfo = async () => {
    if (!user?.id) return;
    setSavingPersonal(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          contact: personalDraft.contact.trim(),
          gender: personalDraft.gender.trim(),
          address: personalDraft.address.trim(),
          // updated_at is handled automatically by the trg_profiles_updated_at
          // trigger — no need to set it here.
        })
        .eq('id', user.id);
      if (error) throw error;
      setProfile((p) => ({ ...p, ...personalDraft }));
      setIsEditingPersonal(false);
    } catch (err) {
      console.error('Failed to save personal info:', err);
      notify('Error', 'Could not save your changes. Please try again.');
    } finally {
      setSavingPersonal(false);
    }
  };

  // ── Avatar upload (Supabase Storage) ────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const displayedPhotoURL = profile?.photo_url || null;

  const handleAvatarPress = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        notify('Permission needed', 'Please allow photo library access to change your profile picture.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // Path convention: avatars/{uid}/avatar.jpg — matches the
      // avatars_owner_* storage policies, which check the folder name
      // equals auth.uid().
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so the new photo shows immediately even though the
      // path/filename didn't change (upsert overwrote the same file).
      const photoURL = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_url: photoURL })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setProfile((p) => ({ ...p, photo_url: photoURL }));
      notify('Done', 'Profile picture updated.');
    } catch (err) {
      console.error('Avatar upload failed:', err);
      notify('Error', 'Could not upload your photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Change Password ──────────────────────────────────────────────
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const resetPasswordForm = () => {
    setPasswordFormOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const submitPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      notify('Missing info', 'Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 6) {
      notify('Weak password', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("Passwords don't match", 'New password and confirmation must match.');
      return;
    }

    setSavingPassword(true);
    try {
      // Supabase has no reauthenticateWithCredential — verify the current
      // password by attempting a real sign-in with it first.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw { ...verifyError, _step: 'verify' };

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw { ...updateError, _step: 'update' };

      notify('Done', 'Your password has been updated.');
      resetPasswordForm();
    } catch (err) {
      console.error('Password change failed:', err);
      const msg = (err.message || '').toLowerCase();
      if (err._step === 'verify' && msg.includes('invalid login credentials')) {
        notify('Incorrect password', 'Your current password is incorrect.');
      } else if (err.status === 429 || msg.includes('rate limit')) {
        notify('Too many attempts', 'Please wait a moment before trying again.');
      } else {
        notify('Error', 'Could not update your password. Please try again.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  // ── Change Email ──────────────────────────────────────────────────
  const [emailFormOpen, setEmailFormOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const resetEmailForm = () => {
    setEmailFormOpen(false);
    setNewEmail('');
    setEmailPassword('');
  };

  const submitEmailChange = async () => {
    if (!newEmail || !emailPassword) {
      notify('Missing info', 'Please fill in both fields.');
      return;
    }
    setSavingEmail(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: emailPassword,
      });
      if (verifyError) throw { ...verifyError, _step: 'verify' };

      const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
      if (updateError) throw { ...updateError, _step: 'update' };

      // With Supabase's default "secure email change" setting, a
      // confirmation link goes to BOTH the old and new address, and the
      // change only takes effect once both are clicked. Adjust this
      // copy if you turn that setting off in Auth settings.
      notify('Verification sent', `Check ${newEmail} (and your current inbox) for links to confirm this change.`);
      resetEmailForm();
    } catch (err) {
      console.error('Email change failed:', err);
      const msg = (err.message || '').toLowerCase();
      if (err._step === 'verify' && msg.includes('invalid login credentials')) {
        notify('Incorrect password', 'Your current password is incorrect.');
      } else if (msg.includes('already registered') || msg.includes('already been registered')) {
        notify('Email in use', 'That email is already associated with another account.');
      } else {
        notify('Error', 'Could not update your email. Please try again.');
      }
    } finally {
      setSavingEmail(false);
    }
  };

  // ── 2FA (UI/preference only — enforcement is a future step) ───────
  const twoFactorEnabled = !!profile?.two_factor_enabled;
  const [savingTwoFactor, setSavingTwoFactor] = useState(false);

  const toggleTwoFactor = async (value) => {
    if (!user?.id) return;
    setSavingTwoFactor(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ two_factor_enabled: value })
        .eq('id', user.id);
      if (error) throw error;
      setProfile((p) => ({ ...p, two_factor_enabled: value }));
    } catch (err) {
      console.error('Failed to update 2FA preference:', err);
      notify('Error', 'Could not save this setting. Please try again.');
    } finally {
      setSavingTwoFactor(false);
    }
  };

  // ── Derived summary counts ────────────────────────────────────────
  // See file header note: fixed to match the status vocabulary every
  // other screen in the app actually uses (checked-in/checked-out/
  // declined), instead of the old 'completed' value that never matched
  // anything real.
  const CURRENT_STATUSES = ['pending', 'upcoming', 'checked-in'];
  const HISTORY_STATUSES = ['checked-out', 'declined', 'cancelled'];

  const totalRes  = reservations.length;
  const upcoming  = reservations.filter(r => r.status === 'pending' || r.status === 'upcoming').length;
  const completed = reservations.filter(r => r.status === 'checked-out').length;
  const cancelled = reservations.filter(r => r.status === 'cancelled' || r.status === 'declined').length;

  const currentRes = reservations.filter(r => CURRENT_STATUSES.includes(r.status));
  const historyRes = reservations.filter(r => HISTORY_STATUSES.includes(r.status));

  const summaryCards = [
    { label: 'Total',     value: totalRes,  color: colors.primary, bg: colors.primaryTint },
    { label: 'Upcoming',  value: upcoming,  color: colors.accent,  bg: colors.accentTint  },
    { label: 'Completed', value: completed, color: '#2e7d32',      bg: '#e8f5e9'          },
    { label: 'Cancelled', value: cancelled, color: colors.danger,  bg: colors.dangerBg    },
  ];

  const statusBadge = (status) => {
    const map = {
      'pending':     { color: colors.accent,   bg: colors.accentTint  },
      'upcoming':    { color: colors.primary,  bg: colors.primaryTint },
      'checked-in':  { color: colors.primary,  bg: colors.primaryTint },
      'checked-out': { color: '#2e7d32',       bg: '#e8f5e9'          },
      'declined':    { color: colors.danger,   bg: colors.dangerBg    },
      'cancelled':   { color: colors.danger,   bg: colors.dangerBg    },
    };
    return map[status] || { color: colors.textMuted, bg: colors.cardAlt };
  };

  const formatResDate = (iso) => {
    if (!iso) return '—';
    try { return formatDate(new Date(iso)); }
    catch { return iso; }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back button ─────────────────────────────────────── */}
        <TouchableOpacity style={styles.backBtn} onPress={onBackPress} activeOpacity={0.7}>
          <Ionicons name="arrow-back-outline" size={18} color={colors.primary} />
          <Text style={styles.backBtnText}>Back to Home</Text>
        </TouchableOpacity>

        {/* ── Profile Header ──────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.avatarWrap}>
              {displayedPhotoURL ? (
                <Image source={{ uri: displayedPhotoURL }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <TouchableOpacity style={styles.avatarEdit} onPress={handleAvatarPress} disabled={uploadingAvatar}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Ionicons name="camera-outline" size={13} color={colors.primary} />
                }
              </TouchableOpacity>
            </View>

            <View style={styles.headerInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
                <View style={[styles.badge, { backgroundColor: '#e8f5e9' }]}>
                  <Ionicons name="checkmark-circle" size={11} color="#2e7d32" />
                  <Text style={[styles.badgeText, { color: '#2e7d32' }]}>Verified</Text>
                </View>
              </View>
              <Text style={styles.emailText} numberOfLines={1}>{email}</Text>
              <Text style={styles.welcomeText}>Welcome back! Your account is active.</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {!isEditingPersonal && (
              <TouchableOpacity style={styles.btnPrimary} onPress={startEditingPersonal} activeOpacity={0.85}>
                <Ionicons name="create-outline" size={15} color={colors.onPrimary} />
                <Text style={styles.btnPrimaryText}>Edit profile</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.btnOutline} onPress={onLogout} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={15} color={colors.danger} />
              <Text style={[styles.btnOutlineText, { color: colors.danger }]}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Quick Actions ───────────────────────────────────── */}
        <SectionTitle title="Quick actions" styles={styles} />
        <View style={styles.quickGrid}>
          {[
            { icon: 'bed-outline',    label: 'Book a room',  onPress: onBookNow },
            { icon: 'person-outline', label: 'Edit profile', onPress: startEditingPersonal },
          ].map((q, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={q.onPress} activeOpacity={0.8}>
              <Ionicons name={q.icon} size={22} color={colors.primary} />
              <Text style={styles.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Reservation Summary ─────────────────────────────── */}
        <SectionTitle title="Reservation summary" styles={styles} />
        <View style={styles.summaryGrid}>
          {summaryCards.map((s, i) => (
            <View key={i} style={[styles.summaryCard, { backgroundColor: s.bg }]}>
              <Text style={[styles.summaryValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.summaryLabel, { color: s.color }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Personal Information (editable: contact/gender/address only) ── */}
        <SectionTitle title="Personal information" styles={styles} />
        <View style={styles.card}>
          <InfoRow styles={styles} label="Full name" value={displayName} />
          <InfoRow styles={styles} label="Email" value={email} />

          {isEditingPersonal ? (
            <>
              <EditableRow
                styles={styles}
                colors={colors}
                label="Contact number"
                value={personalDraft.contact}
                onChangeText={(v) => setPersonalDraft(d => ({ ...d, contact: v }))}
                placeholder="e.g. 09171234567"
                keyboardType="phone-pad"
              />
              <EditableRow
                styles={styles}
                colors={colors}
                label="Gender"
                value={personalDraft.gender}
                onChangeText={(v) => setPersonalDraft(d => ({ ...d, gender: v }))}
                placeholder="e.g. Female, Male, Prefer not to say"
              />
              <EditableRow
                styles={styles}
                colors={colors}
                label="Address"
                value={personalDraft.address}
                onChangeText={(v) => setPersonalDraft(d => ({ ...d, address: v }))}
                placeholder="Street, City, Province"
                last
              />
              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  style={[styles.btnPrimary, savingPersonal && styles.btnDisabled]}
                  onPress={savePersonalInfo}
                  disabled={savingPersonal}
                  activeOpacity={0.85}
                >
                  {savingPersonal
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.btnPrimaryText}>Save changes</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={cancelEditingPersonal} disabled={savingPersonal} activeOpacity={0.85}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <InfoRow styles={styles} label="Contact" value={displayedContact || 'Not set'} muted={!displayedContact} />
              <InfoRow styles={styles} label="Gender" value={profile?.gender || 'Not set'} muted={!profile?.gender} />
              <InfoRow styles={styles} label="Address" value={profile?.address || 'Not set'} muted={!profile?.address} last />
            </>
          )}
        </View>

        {/* ── Account Information ─────────────────────────────── */}
        <SectionTitle title="Account information" styles={styles} />
        <View style={styles.card}>
          <InfoRow styles={styles} label="Username" value={email.split('@')[0]} />
          <InfoRow styles={styles} label="Date registered" value={
            user?.created_at
              ? new Date(user.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
              : '—'
          } />
          <InfoRow styles={styles} label="Last login" value={
            user?.last_sign_in_at
              ? new Date(user.last_sign_in_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
              : '—'
          } />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <View style={[styles.badge, { backgroundColor: '#e8f5e9' }]}>
              <Ionicons name="checkmark-circle" size={11} color="#2e7d32" />
              <Text style={[styles.badgeText, { color: '#2e7d32' }]}>Active</Text>
            </View>
          </View>
        </View>

        {/* ── Current Reservations ────────────────────────────── */}
        <SectionTitle title="Current reservations" styles={styles} />
        {loadingRes ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.lg }} />
        ) : currentRes.length === 0 ? (
          <EmptyState styles={styles} colors={colors} icon="calendar-outline" message="No current reservations." />
        ) : currentRes.map((r) => {
          const s = statusBadge(r.status);
          const roomCount = Array.isArray(r.selected_rooms) ? r.selected_rooms.length : null;
          return (
            <View key={r.id} style={styles.resCard}>
              <View style={styles.resHeader}>
                <Text style={styles.resId}>#{r.id.slice(0, 10).toUpperCase()}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{r.status}</Text>
                </View>
              </View>
              <View style={styles.resGrid}>
                <ResItem styles={styles} label="Room type" value={r.room_type || 'Not selected'} />
                <ResItem styles={styles} label="Check-in" value={formatResDate(r.check_in)} />
                <ResItem styles={styles} label="Check-out" value={formatResDate(r.check_out)} />
                <ResItem styles={styles} label="Nights" value={r.nights ? `${r.nights} night${r.nights > 1 ? 's' : ''}` : '—'} />
                <ResItem styles={styles} label="Rooms" value={roomCount != null ? `${roomCount}` : '—'} />
                <ResItem styles={styles} label="Guests" value={r.guest_count != null ? `${r.guest_count}` : '—'} />
              </View>
            </View>
          );
        })}

        {/* ── Reservation History ─────────────────────────────── */}
        <SectionTitle title="Reservation history" styles={styles} />
        {loadingRes ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.lg }} />
        ) : historyRes.length === 0 ? (
          <EmptyState styles={styles} colors={colors} icon="time-outline" message="No reservation history yet." />
        ) : historyRes.map((r) => {
          const s = statusBadge(r.status);
          return (
            <View key={r.id} style={styles.resCard}>
              <View style={styles.resHeader}>
                <Text style={styles.resId}>#{r.id.slice(0, 10).toUpperCase()}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{r.status}</Text>
                </View>
              </View>
              <View style={styles.resGrid}>
                <ResItem styles={styles} label="Room type" value={r.room_type || '—'} />
                <ResItem styles={styles} label="Duration" value={r.nights ? `${r.nights} night${r.nights > 1 ? 's' : ''}` : '—'} />
                <ResItem styles={styles} label="Total" value={r.total_amount ? `₱${Number(r.total_amount).toLocaleString()}` : '—'} />
              </View>
            </View>
          );
        })}

        {/* ── Appearance ───────────────────────────────────────── */}
        <SectionTitle title="Appearance" styles={styles} />
        <View style={styles.card}>
          <View style={[styles.secRow, { borderBottomWidth: 0 }]}>
            <View style={styles.secLeft}>
              <Ionicons name={isDark ? 'moon' : 'moon-outline'} size={18} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.secLabel}>Dark mode</Text>
                <Text style={styles.secSub}>Applies across the whole app, on every device you're signed into.</Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={setDarkMode}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {/* ── Security Settings ───────────────────────────────── */}
        <SectionTitle title="Security settings" styles={styles} />
        <View style={styles.card}>
          {/* Password */}
          <View style={styles.secRow}>
            <View style={styles.secLeft}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.secLabel}>Password</Text>
                <Text style={styles.secSub} numberOfLines={1}>Change your password</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.btnSm} onPress={() => setPasswordFormOpen(o => !o)} activeOpacity={0.8}>
              <Text style={styles.btnSmText}>{passwordFormOpen ? 'Close' : 'Change'}</Text>
            </TouchableOpacity>
          </View>
          {passwordFormOpen && (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.input}
                placeholder="Current password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <TextInput
                style={styles.input}
                placeholder="New password (min. 6 characters)"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  style={[styles.btnPrimary, savingPassword && styles.btnDisabled]}
                  onPress={submitPasswordChange}
                  disabled={savingPassword}
                  activeOpacity={0.85}
                >
                  {savingPassword
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.btnPrimaryText}>Update password</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={resetPasswordForm} disabled={savingPassword} activeOpacity={0.85}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Email */}
          <View style={styles.secRow}>
            <View style={styles.secLeft}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.secLabel}>Email address</Text>
                <Text style={styles.secSub} numberOfLines={1}>{email}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.btnSm} onPress={() => setEmailFormOpen(o => !o)} activeOpacity={0.8}>
              <Text style={styles.btnSmText}>{emailFormOpen ? 'Close' : 'Update'}</Text>
            </TouchableOpacity>
          </View>
          {emailFormOpen && (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.input}
                placeholder="New email address"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={newEmail}
                onChangeText={setNewEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Current password (to confirm it's you)"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={emailPassword}
                onChangeText={setEmailPassword}
              />
              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  style={[styles.btnPrimary, savingEmail && styles.btnDisabled]}
                  onPress={submitEmailChange}
                  disabled={savingEmail}
                  activeOpacity={0.85}
                >
                  {savingEmail
                    ? <ActivityIndicator size="small" color={colors.onPrimary} />
                    : <Text style={styles.btnPrimaryText}>Send verification</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={resetEmailForm} disabled={savingEmail} activeOpacity={0.85}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 2FA */}
          <View style={[styles.secRow, { borderBottomWidth: 0 }]}>
            <View style={styles.secLeft}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.secLabel}>Two-factor authentication</Text>
                <Text style={styles.secSub}>Saves your preference now — enforcement is coming soon.</Text>
              </View>
            </View>
            {savingTwoFactor
              ? <ActivityIndicator size="small" color={colors.primary} />
              : (
                <Switch
                  value={twoFactorEnabled}
                  onValueChange={toggleTwoFactor}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              )
            }
          </View>
        </View>

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */
function SectionTitle({ title, styles }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function InfoRow({ label, value, muted, last, styles }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, muted && styles.infoValueMuted]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function EditableRow({ label, value, onChangeText, placeholder, keyboardType, last, styles, colors }) {
  return (
    <View style={[styles.editableRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <TextInput
        style={styles.editableInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function ResItem({ label, value, styles }) {
  return (
    <View style={styles.resItem}>
      <Text style={styles.resItemLabel}>{label}</Text>
      <Text style={styles.resItemValue}>{value}</Text>
    </View>
  );
}

function EmptyState({ icon, message, styles, colors }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={32} color={colors.disabled} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

/* ── Styles factory — called inside the component so it recomputes when
   the active theme (colors) changes. ─────────────────────────────────── */
function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: colors.cardAlt },
    scroll: { flex: 1 },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    contentWide: { paddingHorizontal: spacing.xxl * 2, maxWidth: 800, alignSelf: 'center', width: '100%' },

    backBtn:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
    backBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },

    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },

    headerRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: colors.primaryTint,
      borderWidth: 1.5, borderColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarImage: {
      width: 64, height: 64, borderRadius: 32,
      borderWidth: 1.5, borderColor: colors.primary,
    },
    avatarText:  { fontFamily: fonts.headingBold, fontSize: 22, color: colors.primary },
    avatarEdit: {
      position: 'absolute', bottom: 0, right: -2,
      width: 24, height: 24, borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 0.5, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    headerInfo:  { flex: 1 },
    nameRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', marginBottom: 2 },
    displayName: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.text },
    emailText:   { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: 3 },
    welcomeText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
    headerActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },

    btnPrimary:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    btnPrimaryText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.onPrimary },
    btnOutline:     { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.dangerBg },
    btnOutlineText: { fontFamily: fonts.headingSemiBold, fontSize: 13 },
    btnGhost:       { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
    btnGhostText:   { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
    btnDisabled:    { opacity: 0.7 },

    badge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
    badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },

    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    quickBtn:  { flex: 1, minWidth: 120, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 0.5, borderColor: colors.border, padding: spacing.md, alignItems: 'flex-start', gap: spacing.sm },
    quickLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },

    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    summaryCard: { flex: 1, minWidth: 70, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
    summaryValue: { fontFamily: fonts.headingExtraBold, fontSize: 24 },
    summaryLabel: { fontFamily: fonts.body, fontSize: 11, marginTop: 2 },

    sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    sectionTitle:     { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.6, flexShrink: 0 },
    sectionLine:      { flex: 1, height: 0.5, backgroundColor: colors.border },

    infoRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: spacing.sm },
    infoLabel:  { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, minWidth: 110, flexShrink: 0 },
    infoValue:  { fontFamily: fonts.body, fontSize: 13, color: colors.text, flex: 1, textAlign: 'right' },
    infoValueMuted: { color: colors.textMuted },

    editableRow: { paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: spacing.xs },
    editableInput: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingVertical: spacing.sm - 2, paddingHorizontal: spacing.sm,
      fontFamily: fonts.body, fontSize: 13, color: colors.text, backgroundColor: colors.background,
    },
    editActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },

    inlineForm: { paddingVertical: spacing.md, gap: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
      fontFamily: fonts.body, fontSize: 13, color: colors.text, backgroundColor: colors.background,
    },

    resCard:   { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
    resHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    resId:     { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
    resGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    resItem:   { flex: 1, minWidth: 80 },
    resItemLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginBottom: 2 },
    resItemValue: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },

    emptyState: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, marginBottom: spacing.lg },
    emptyText:  { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },

    secRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: spacing.sm },
    secLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    secLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
    secSub:   { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, maxWidth: 220 },
    btnSm:       { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.card, flexShrink: 0 },
    btnSmText:   { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
  });
}