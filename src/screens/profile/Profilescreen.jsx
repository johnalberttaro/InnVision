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
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db } from '../../services/firebase';
import { useTheme } from '../../context/ThemeContext';
import { formatDate } from '../../utils/dateHelpers';

/**
 * ProfileScreen — Guest profile dashboard for InnVision.
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()) — this is the first screen
 * converted from the old static `import { colors } from utils/theme`
 * pattern. Styles are built by getStyles(colors) INSIDE the component
 * body (not at module scope) so they recompute whenever the active theme
 * changes, anywhere in the app.
 *
 * NEW IN THIS VERSION:
 *  - Personal Information (Contact/Gender/Address only) is editable
 *    in-place — no separate screen or modal. Name/email/username/status/
 *    registration date remain read-only, sourced from Firebase Auth.
 *  - Avatar upload via Firebase Storage + Firebase Auth updateProfile().
 *  - Change Password (reauth + updatePassword) and Change Email
 *    (reauth + verifyBeforeUpdateEmail) inline expanding forms.
 *  - 2FA toggle — UI/preference only for now (saved to Firestore),
 *    enforcement is a separate follow-up per current scope.
 *  - Dark Mode toggle — drives the app-wide ThemeProvider directly.
 *
 * Props:
 *  - user:       Firebase user object
 *  - onBookNow:  () => void
 *  - onLogout:   () => void
 *  - onBackPress:() => void
 *
 * (onEditProfile is no longer used — editing now happens in place on this
 * screen. Safe to remove from the caller whenever convenient.)
 */
export default function ProfileScreen({ user, onBookNow, onLogout, onBackPress }) {
  const { width } = useWindowDimensions();
  const isWide    = width >= 768;
  const { colors, spacing, radius, fonts, isDark, setDarkMode } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const displayName = user?.displayName || 'Guest';
  const email       = user?.email || '—';
  const initials    = displayName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const notify = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

  // ── Firestore: live reservations ─────────────────────────────────
  const [reservations, setReservations] = useState([]);
  const [loadingRes, setLoadingRes]     = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoadingRes(false); return; }

    const q = query(
      collection(db, 'reservations'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setReservations(docs);
      setLoadingRes(false);
    }, (err) => {
      console.error('Firestore reservations error:', err);
      setLoadingRes(false);
    });

    return unsubscribe;
  }, [user?.uid]);

  // ── Firestore: guest profile doc (contact/gender/address/photoURL/2FA) ──
  const [guestProfile, setGuestProfile] = useState({});
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoadingProfile(false); return; }

    const unsubscribe = onSnapshot(
      doc(db, 'guests', user.uid),
      (snapshot) => {
        setGuestProfile(snapshot.data() || {});
        setLoadingProfile(false);
      },
      (err) => {
        console.error('Firestore guest profile error:', err);
        setLoadingProfile(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  // ── Personal Information: in-place edit mode ─────────────────────
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalDraft, setPersonalDraft] = useState({ contact: '', gender: '', address: '' });

  const startEditingPersonal = () => {
    setPersonalDraft({
      contact: guestProfile.contact || '',
      gender: guestProfile.gender || '',
      address: guestProfile.address || '',
    });
    setIsEditingPersonal(true);
  };

  const cancelEditingPersonal = () => {
    setIsEditingPersonal(false);
  };

  const savePersonalInfo = async () => {
    if (!user?.uid) return;
    setSavingPersonal(true);
    try {
      await setDoc(
        doc(db, 'guests', user.uid),
        {
          contact: personalDraft.contact.trim(),
          gender: personalDraft.gender.trim(),
          address: personalDraft.address.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setIsEditingPersonal(false);
    } catch (err) {
      console.error('Failed to save personal info:', err);
      notify('Error', 'Could not save your changes. Please try again.');
    } finally {
      setSavingPersonal(false);
    }
  };

  // ── Avatar upload ──────────────────────────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Local override so the new photo shows immediately, without waiting on
  // the parent App.jsx's `user` object to refresh (updateProfile() doesn't
  // trigger onAuthStateChanged, so the prop above stays stale otherwise).
  const [localPhotoURL, setLocalPhotoURL] = useState(null);
  const displayedPhotoURL = localPhotoURL || guestProfile.photoURL || user?.photoURL || null;

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

      const storage = getStorage();
      const avatarRef = ref(storage, `avatars/${user.uid}.jpg`);
      await uploadBytes(avatarRef, blob);
      const downloadURL = await getDownloadURL(avatarRef);

      await updateProfile(auth.currentUser, { photoURL: downloadURL });
      await setDoc(doc(db, 'guests', user.uid), { photoURL: downloadURL, updatedAt: serverTimestamp() }, { merge: true });

      setLocalPhotoURL(downloadURL);
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
      notify('Passwords don\'t match', 'New password and confirmation must match.');
      return;
    }

    setSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      notify('Done', 'Your password has been updated.');
      resetPasswordForm();
    } catch (err) {
      console.error('Password change failed:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        notify('Incorrect password', 'Your current password is incorrect.');
      } else if (err.code === 'auth/too-many-requests') {
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
      const credential = EmailAuthProvider.credential(user.email, emailPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
      notify('Verification sent', `Check ${newEmail} for a link to confirm this change. Your email will update once you click it.`);
      resetEmailForm();
    } catch (err) {
      console.error('Email change failed:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        notify('Incorrect password', 'Your current password is incorrect.');
      } else if (err.code === 'auth/email-already-in-use') {
        notify('Email in use', 'That email is already associated with another account.');
      } else {
        notify('Error', 'Could not update your email. Please try again.');
      }
    } finally {
      setSavingEmail(false);
    }
  };

  // ── 2FA (UI/preference only — enforcement is a future step) ───────
  const twoFactorEnabled = !!guestProfile.twoFactorEnabled;
  const [savingTwoFactor, setSavingTwoFactor] = useState(false);

  const toggleTwoFactor = async (value) => {
    if (!user?.uid) return;
    setSavingTwoFactor(true);
    try {
      await setDoc(doc(db, 'guests', user.uid), { twoFactorEnabled: value, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.error('Failed to update 2FA preference:', err);
      notify('Error', 'Could not save this setting. Please try again.');
    } finally {
      setSavingTwoFactor(false);
    }
  };

  // ── Derived summary counts ────────────────────────────────────────
  const totalRes     = reservations.length;
  const upcoming     = reservations.filter(r => r.status === 'pending' || r.status === 'upcoming').length;
  const completed    = reservations.filter(r => r.status === 'completed').length;
  const cancelled    = reservations.filter(r => r.status === 'cancelled').length;

  const currentRes   = reservations.filter(r => r.status === 'pending' || r.status === 'upcoming');
  const historyRes   = reservations.filter(r => r.status === 'completed' || r.status === 'cancelled');

  const summaryCards = [
    { label: 'Total',     value: totalRes,  color: colors.primary, bg: colors.primaryTint },
    { label: 'Upcoming',  value: upcoming,  color: colors.accent,  bg: colors.accentTint  },
    { label: 'Completed', value: completed, color: '#2e7d32',      bg: '#e8f5e9'          },
    { label: 'Cancelled', value: cancelled, color: colors.danger,  bg: colors.dangerBg    },
  ];

  const statusBadge = (status) => {
    const map = {
      'pending':   { color: colors.accent,   bg: colors.accentTint  },
      'upcoming':  { color: colors.primary,  bg: colors.primaryTint },
      'completed': { color: '#2e7d32',       bg: '#e8f5e9'          },
      'cancelled': { color: colors.danger,   bg: colors.dangerBg    },
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
              <InfoRow styles={styles} label="Contact" value={guestProfile.contact || 'Not set'} muted={!guestProfile.contact} />
              <InfoRow styles={styles} label="Gender" value={guestProfile.gender || 'Not set'} muted={!guestProfile.gender} />
              <InfoRow styles={styles} label="Address" value={guestProfile.address || 'Not set'} muted={!guestProfile.address} last />
            </>
          )}
        </View>

        {/* ── Account Information ─────────────────────────────── */}
        <SectionTitle title="Account information" styles={styles} />
        <View style={styles.card}>
          <InfoRow styles={styles} label="Username" value={email.split('@')[0]} />
          <InfoRow styles={styles} label="Date registered" value={
            user?.metadata?.creationTime
              ? new Date(user.metadata.creationTime).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
              : '—'
          } />
          <InfoRow styles={styles} label="Last login" value={
            user?.metadata?.lastSignInTime
              ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
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
          return (
            <View key={r.id} style={styles.resCard}>
              <View style={styles.resHeader}>
                <Text style={styles.resId}>#{r.id.slice(0, 10).toUpperCase()}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{r.status}</Text>
                </View>
              </View>
              <View style={styles.resGrid}>
                <ResItem styles={styles} label="Room type" value={r.roomType || 'Not selected'} />
                <ResItem styles={styles} label="Check-in" value={formatResDate(r.checkIn)} />
                <ResItem styles={styles} label="Check-out" value={formatResDate(r.checkOut)} />
                <ResItem styles={styles} label="Nights" value={r.nights ? `${r.nights} night${r.nights > 1 ? 's' : ''}` : '—'} />
                <ResItem styles={styles} label="Rooms" value={r.totals?.totalRooms ? `${r.totals.totalRooms}` : '—'} />
                <ResItem styles={styles} label="Guests" value={r.totals?.totalGuests ? `${r.totals.totalGuests}` : '—'} />
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
                <ResItem styles={styles} label="Room type" value={r.roomType || '—'} />
                <ResItem styles={styles} label="Duration" value={r.nights ? `${r.nights} night${r.nights > 1 ? 's' : ''}` : '—'} />
                <ResItem styles={styles} label="Total" value={r.totalAmount ? `₱${r.totalAmount.toLocaleString()}` : '—'} />
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