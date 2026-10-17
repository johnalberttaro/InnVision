import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

/**
 * MyProfileScreen — a staff member's own profile page. Shared by every
 * staff portal: Front Desk, Housekeeping, Maintenance and Admin (each
 * shell renders it with the signed-in user's id).
 *
 * What staff can change here: their photo, phone number and password.
 * Everything else (position, access level, responsibilities, training
 * context, feedback score, error reports) is set by an administrator and
 * shown read-only.
 *
 * The role badge and the "My Performance" numbers follow the account's
 * real role (profiles.role):
 *  - Front Desk / Admin: payments processed today, customer feedback,
 *    error reports.
 *  - Housekeeping: cleaning tasks completed today, this week, and still open.
 *  - Maintenance: requests resolved today, this week, and still open.
 *
 * Change Password re-checks the current password with a real
 * signInWithPassword() call first, because portal devices are often
 * shared and an open session alone shouldn't be enough to change it.
 *
 * Layout: a profile banner across the top, then two columns on wide
 * screens (account details on the left, performance and security on the
 * right) that stack on narrow ones. The width is measured from the page
 * itself (onLayout), so the sidebar is taken into account.
 *
 * Props:
 *  - staffUid: string — the signed-in user's id
 *  - onBack: () => void (optional)
 */
const WIDE_BREAKPOINT = 900;

const web = (style) => (Platform.OS === 'web' ? style : null);

const ROLE_META = {
  admin:        { label: 'Administrator', icon: 'shield-checkmark-outline' },
  frontdesk:    { label: 'Front Desk',    icon: 'desktop-outline' },
  housekeeping: { label: 'Housekeeping',  icon: 'sparkles-outline' },
  maintenance:  { label: 'Maintenance',   icon: 'construct-outline' },
};

const SUCCESS = '#1E7B34';
const DANGER = '#B3261E';

export default function MyProfileScreen({ staffUid, onBack }) {
  const [pageWidth, setPageWidth] = useState(0);
  const isWide = pageWidth >= WIDE_BREAKPOINT;
  const isCompact = pageWidth > 0 && pageWidth < 560;
  const styles = getStyles(colors, spacing, radius, fonts);

  const [profile, setProfile] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);

  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});

  useEffect(() => {
    if (!staffUid) return;

    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, staff_profile_details(*)')
        .eq('id', staffUid)
        .single();
      if (error) {
        console.error('Failed to load my profile:', error);
        setLoading(false);
        return;
      }
      setProfile(data);
      setDetails(data.staff_profile_details || {});
      setPhone(data.phone || '');
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`my-profile-${staffUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${staffUid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_profile_details', filter: `profile_id=eq.${staffUid}` }, load)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [staffUid]);

  const role = profile?.role || 'frontdesk';

  // Role-specific numbers for "My Performance".
  useEffect(() => {
    if (!staffUid || !profile) return;
    let cancelled = false;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const count = async (query) => {
      const { count: n, error } = await query;
      return error ? null : n || 0;
    };

    const loadMetrics = async () => {
      if (role === 'housekeeping' || role === 'maintenance') {
        const table = role === 'housekeeping' ? 'housekeeping_tasks' : 'maintenance_requests';
        const doneStatus = role === 'housekeeping' ? 'completed' : 'resolved';
        const doneAt = role === 'housekeeping' ? 'completed_at' : 'resolved_at';
        const base = () => supabase.from(table).select('id', { count: 'exact', head: true }).eq('assigned_to', staffUid);
        const [today, week, open] = await Promise.all([
          count(base().eq('status', doneStatus).gte(doneAt, startOfDay.toISOString())),
          count(base().eq('status', doneStatus).gte(doneAt, weekAgo.toISOString())),
          count(base().neq('status', doneStatus)),
        ]);
        if (!cancelled) setMetrics({ today, week, open });
      } else {
        const today = await count(
          supabase
            .from('payments')
            .select('id', { count: 'exact', head: true })
            .eq('processed_by', staffUid)
            .gte('created_at', startOfDay.toISOString())
        );
        if (!cancelled) setMetrics({ today });
      }
    };
    loadMetrics();
    return () => { cancelled = true; };
  }, [staffUid, profile, role]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const handlePhotoUpload = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
      base64: Platform.OS !== 'web',
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    setUploadingPhoto(true);
    try {
      let body;
      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        body = await response.blob();
      } else {
        if (!asset.base64) throw new Error('No image data returned from the picker.');
        body = decodeBase64(asset.base64);
      }
      const path = `${staffUid}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, body, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const photoURL = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase.from('profiles').update({ photo_url: photoURL }).eq('id', staffUid);
      if (updateError) throw updateError;

      showMessage('success', 'Profile photo updated.');
    } catch (err) {
      console.error('Failed to upload photo:', err);
      showMessage('error', 'Could not upload that photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      const { error } = await supabase.from('profiles').update({ phone: phone.trim() }).eq('id', staffUid);
      if (error) throw error;
      showMessage('success', 'Phone number updated.');
    } catch (err) {
      console.error('Failed to update phone:', err);
      showMessage('error', 'Could not save your phone number. Please try again.');
    } finally {
      setSavingPhone(false);
    }
  };

  const passwordStrength = scorePasswordStrength(newPassword, colors);

  const handleChangePassword = async () => {
    const errs = {};
    if (!currentPassword) errs.currentPassword = 'Enter your current password.';
    if (!newPassword) {
      errs.newPassword = 'Enter a new password.';
    } else if (newPassword.length < 8) {
      errs.newPassword = 'Password must be at least 8 characters.';
    } else if (currentPassword && newPassword === currentPassword) {
      errs.newPassword = 'New password must be different from your current one.';
    }
    if (!confirmPassword) {
      errs.confirmPassword = 'Confirm your new password.';
    } else if (newPassword && confirmPassword !== newPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }
    setPasswordErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setChangingPassword(true);
    try {
      // Re-check the current password before allowing the change (shared devices).
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });
      if (verifyError) {
        setPasswordErrors({ currentPassword: 'Current password is incorrect.' });
        setChangingPassword(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
      showMessage('success', 'Password updated successfully.');
    } catch (err) {
      console.error('Failed to change password:', err);
      showMessage('error', 'Could not update your password. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  if (!profile) {
    return <View style={styles.centerWrap}><Text style={styles.mutedNote}>Could not load your profile.</Text></View>;
  }

  const roleMeta = ROLE_META[role] || { label: role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Staff', icon: 'person-outline' };
  const name = profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || `${roleMeta.label} Staff`;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  const responsibilities = details?.responsibilities || [];
  const trainingContext = details?.training_context;
  const username = details?.username || (profile.email ? profile.email.split('@')[0] : '—');
  const accessLevel = details?.access_level || (role === 'admin' ? 'Full' : 'Standard');
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const phoneUnchanged = phone.trim() === (profile.phone || '');

  const metricTiles = buildMetricTiles(role, metrics, details);

  const passwordChecks = [
    { ok: newPassword.length >= 8, label: 'At least 8 characters' },
    { ok: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword), label: 'Upper and lower case letters' },
    { ok: /\d/.test(newPassword), label: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(newPassword), label: 'A symbol' },
  ];

  // ── Banner ────────────────────────────────────────────────────────────
  const banner = (
    <View style={styles.bannerCard}>
      <View style={styles.bannerStrip} />
      <View style={[styles.bannerBody, isCompact && styles.bannerBodyCompact]}>
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={handlePhotoUpload}
          disabled={uploadingPhoto}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
        >
          {profile.photo_url ? (
            <Image source={{ uri: profile.photo_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{initials}</Text>
            </View>
          )}
          <View style={styles.avatarBadge}>
            {uploadingPhoto
              ? <ActivityIndicator color={colors.onPrimary} size="small" />
              : <Ionicons name="camera" size={15} color={colors.onPrimary} />}
          </View>
        </TouchableOpacity>

        <View style={[styles.bannerText, isCompact && { alignItems: 'center' }]}>
          <Text style={[styles.name, isCompact && { textAlign: 'center' }]}>{name}</Text>
          <View style={[styles.badgeRow, isCompact && { justifyContent: 'center' }]}>
            <View style={styles.rolePill}>
              <Ionicons name={roleMeta.icon} size={13} color={colors.onPrimary} />
              <Text style={styles.rolePillText}>{roleMeta.label}</Text>
            </View>
            {!!details?.position && (
              <View style={styles.softPill}><Text style={styles.softPillText}>{details.position}</Text></View>
            )}
            {!!trainingContext && (
              <View style={styles.softPill}>
                <Ionicons name="school-outline" size={12} color={colors.text} />
                <Text style={styles.softPillText}>{trainingContext}</Text>
              </View>
            )}
          </View>
          <View style={[styles.metaRow, isCompact && { justifyContent: 'center' }]}>
            <MetaItem icon="mail-outline" text={profile.email || '—'} styles={styles} />
            {!!profile.phone && <MetaItem icon="call-outline" text={profile.phone} styles={styles} />}
            {!!memberSince && <MetaItem icon="calendar-outline" text={`Since ${memberSince}`} styles={styles} />}
          </View>
        </View>

        {!isCompact && (
          <TouchableOpacity style={styles.photoBtn} onPress={handlePhotoUpload} disabled={uploadingPhoto} activeOpacity={0.85}>
            <Ionicons name="image-outline" size={15} color={colors.text} />
            <Text style={styles.photoBtnText}>{profile.photo_url ? 'Change photo' : 'Add photo'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // ── Left column: contact + account ────────────────────────────────────
  const leftColumn = (
    <View style={isWide ? styles.colLeft : undefined}>
      <Card title="Contact" icon="person-circle-outline" subtitle="How the team can reach you." styles={styles}>
        <FieldLabel text="Full name" styles={styles} />
        <ReadOnlyField value={name} styles={styles} />

        <FieldLabel text="Email" styles={styles} />
        <ReadOnlyField value={profile.email || '—'} icon="lock-closed-outline" styles={styles} />

        <FieldLabel text="Phone number" styles={styles} />
        <View style={styles.phoneRow}>
          <View style={[styles.inputBox, { flex: 1, minWidth: 0 }]}>
            <Ionicons name="call-outline" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.inputText}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. 0917 123 4567"
              keyboardType="phone-pad"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryBtnSmall, (savingPhone || phoneUnchanged) && styles.btnDisabled]}
            onPress={handleSavePhone}
            disabled={savingPhone || phoneUnchanged}
            activeOpacity={0.85}
          >
            {savingPhone ? <ActivityIndicator color={colors.onPrimary} size="small" /> : <Text style={styles.primaryBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </Card>

      <Card title="Account" icon="id-card-outline" subtitle="Set by an administrator." styles={styles}>
        <DetailRow label="Username" value={username} styles={styles} />
        <DetailRow label="Role" value={roleMeta.label} styles={styles} />
        <DetailRow label="Access level" value={accessLevel} styles={styles} />
        {!!details?.position && <DetailRow label="Position" value={details.position} styles={styles} />}
        {!!trainingContext && <DetailRow label="Training" value={trainingContext} styles={styles} />}
        {!!details?.supervisor_or_intern_name && (
          <DetailRow
            label={trainingContext === 'Student Intern' ? 'Supervisor' : 'Supervising'}
            value={details.supervisor_or_intern_name}
            styles={styles}
          />
        )}
        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
          <Text style={styles.noteText}>Need a change here? Ask your administrator.</Text>
        </View>
      </Card>
    </View>
  );

  // ── Right column: performance, responsibilities, security ────────────
  const rightColumn = (
    <View style={isWide ? styles.colRight : undefined}>
      <Card title="My Performance" icon="stats-chart-outline" subtitle={performanceSubtitle(role)} styles={styles}>
        <View style={[styles.metricsRow, isCompact && { flexDirection: 'column' }]}>
          {metricTiles.map((m) => (
            <View key={m.label} style={styles.metricTile}>
              <View style={styles.metricIcon}><Ionicons name={m.icon} size={16} color={m.color || colors.text} /></View>
              <Text style={[styles.metricValue, m.color && { color: m.color }]}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card title="Responsibilities" icon="checkmark-done-outline" styles={styles}>
        {responsibilities.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="clipboard-outline" size={18} color={colors.textMuted} />
            <Text style={styles.emptyText}>No responsibilities assigned yet. Your administrator can add them.</Text>
          </View>
        ) : (
          <View style={styles.chipRow}>
            {responsibilities.map((r) => (
              <View key={r} style={styles.respChip}>
                <Ionicons name="checkmark" size={12} color={colors.text} />
                <Text style={styles.respChipText}>{r}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card
        title="Change Password"
        icon="lock-closed-outline"
        subtitle="Your administrator sets a default password when your account is made. Change it to one only you know."
        styles={styles}
      >
        <FieldLabel text="Current password" styles={styles} />
        <PasswordInput
          value={currentPassword}
          onChange={(v) => { setCurrentPassword(v); setPasswordErrors((e) => ({ ...e, currentPassword: undefined })); }}
          placeholder="Enter your current password"
          shown={showCurrent}
          onToggle={() => setShowCurrent((s) => !s)}
          error={passwordErrors.currentPassword}
          styles={styles}
        />

        <View style={[styles.pwRow, isWide && styles.pwRowWide]}>
          <View style={isWide ? styles.pwCol : undefined}>
            <FieldLabel text="New password" styles={styles} />
            <PasswordInput
              value={newPassword}
              onChange={(v) => { setNewPassword(v); setPasswordErrors((e) => ({ ...e, newPassword: undefined })); }}
              placeholder="At least 8 characters"
              shown={showNew}
              onToggle={() => setShowNew((s) => !s)}
              error={passwordErrors.newPassword}
              styles={styles}
            />
          </View>
          <View style={isWide ? styles.pwCol : undefined}>
            <FieldLabel text="Confirm new password" styles={styles} />
            <PasswordInput
              value={confirmPassword}
              onChange={(v) => { setConfirmPassword(v); setPasswordErrors((e) => ({ ...e, confirmPassword: undefined })); }}
              placeholder="Re-enter your new password"
              shown={showConfirm}
              onToggle={() => setShowConfirm((s) => !s)}
              error={passwordErrors.confirmPassword}
              styles={styles}
            />
          </View>
        </View>

        {!!newPassword && (
          <View style={styles.strengthWrap}>
            <View style={styles.strengthRow}>
              <View style={styles.strengthTrack}>
                <View style={[styles.strengthFill, { width: `${passwordStrength.score * 25}%`, backgroundColor: passwordStrength.color }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>{passwordStrength.label}</Text>
            </View>
            <View style={styles.checkList}>
              {passwordChecks.map((c) => (
                <View key={c.label} style={styles.checkItem}>
                  <Ionicons name={c.ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={c.ok ? SUCCESS : colors.textMuted} />
                  <Text style={[styles.checkText, c.ok && { color: colors.text }]}>{c.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, changingPassword && styles.btnDisabled]}
          onPress={handleChangePassword}
          disabled={changingPassword}
          activeOpacity={0.85}
        >
          {changingPassword ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.onPrimary} />
              <Text style={styles.primaryBtnText}>Update Password</Text>
            </>
          )}
        </TouchableOpacity>
      </Card>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.inner} onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backLink}>
            <Ionicons name="chevron-back" size={16} color={colors.text} />
            <Text style={styles.backLinkText}>Back</Text>
          </TouchableOpacity>
        )}

        <View style={styles.pageHead}>
          <Text style={styles.pageTitle}>My Profile</Text>
          <Text style={styles.pageSubtitle}>Your details, your work summary, and your password.</Text>
        </View>

        {!!message && (
          <View style={[styles.messageBanner, message.type === 'error' ? styles.messageError : styles.messageSuccess]}>
            <Ionicons
              name={message.type === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
              size={17}
              color={message.type === 'error' ? DANGER : SUCCESS}
            />
            <Text style={[styles.messageText, { color: message.type === 'error' ? DANGER : SUCCESS }]}>{message.text}</Text>
          </View>
        )}

        {banner}

        <View style={isWide ? styles.columns : undefined}>
          {leftColumn}
          {rightColumn}
        </View>
      </View>
    </ScrollView>
  );
}

function performanceSubtitle(role) {
  if (role === 'housekeeping') return 'Cleaning tasks assigned to you.';
  if (role === 'maintenance') return 'Maintenance requests assigned to you.';
  return 'Payments you processed and admin-recorded scores.';
}

function buildMetricTiles(role, metrics, details) {
  const v = (n) => (n == null ? '—' : String(n));
  if (role === 'housekeeping' || role === 'maintenance') {
    const doneWord = role === 'housekeeping' ? 'Cleaned' : 'Resolved';
    return [
      { label: `${doneWord} today`, value: v(metrics?.today), icon: 'today-outline' },
      { label: `${doneWord} this week`, value: v(metrics?.week), icon: 'calendar-outline' },
      { label: 'Still open', value: v(metrics?.open), icon: 'time-outline', color: (metrics?.open || 0) > 0 ? '#B3792A' : undefined },
    ];
  }
  const errors = details?.error_reports_count ?? 0;
  return [
    { label: "Today's transactions", value: v(metrics?.today), icon: 'receipt-outline' },
    {
      label: 'Customer feedback',
      value: details?.customer_feedback_score != null ? `${details.customer_feedback_score}/5` : '—',
      icon: 'star-outline',
    },
    { label: 'Error reports', value: String(errors), icon: 'alert-circle-outline', color: errors > 0 ? DANGER : undefined },
  ];
}

// Simple password strength signal (length + character variety). Same scorer
// as the admin account screen; not a replacement for server-side rules.
function scorePasswordStrength(password, colors) {
  if (!password) return { score: 0, label: '', color: colors.border };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: 'Weak', color: DANGER };
  if (score <= 2) return { score: 2, label: 'Fair', color: '#C99400' };
  if (score <= 3) return { score: 3, label: 'Good', color: '#B3792A' };
  return { score: 4, label: 'Strong', color: SUCCESS };
}

function Card({ title, icon, subtitle, children, styles }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}><Ionicons name={icon} size={16} color={colors.text} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function MetaItem({ icon, text, styles }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function FieldLabel({ text, styles }) {
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

function ReadOnlyField({ value, icon, styles }) {
  return (
    <View style={[styles.inputBox, styles.inputReadOnly]}>
      <Text style={[styles.inputText, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text>
      {!!icon && <Ionicons name={icon} size={14} color={colors.textMuted} />}
    </View>
  );
}

function DetailRow({ label, value, styles }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function PasswordInput({ value, onChange, placeholder, shown, onToggle, error, styles }) {
  return (
    <View>
      <View style={[styles.inputBox, !!error && styles.inputError]}>
        <Ionicons name="key-outline" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.inputText}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!shown}
          autoCapitalize="none"
        />
        <TouchableOpacity onPress={onToggle} style={styles.eyeBtn} activeOpacity={0.7} accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
          <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, paddingBottom: spacing.xl * 2 },
    inner: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    mutedNote: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },

    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    backLinkText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, marginLeft: 2 },

    pageHead: { marginBottom: spacing.lg },
    pageTitle: { fontSize: 26, fontFamily: fonts.headingExtraBold, color: colors.text, letterSpacing: -0.6 },
    pageSubtitle: { fontSize: 14, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },

    messageBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      borderRadius: radius.md || 12, paddingVertical: 12, paddingHorizontal: spacing.md,
      marginBottom: spacing.lg, borderWidth: 1,
    },
    messageSuccess: { backgroundColor: '#ECF8EE', borderColor: '#BFE5C6' },
    messageError: { backgroundColor: '#FDEEEE', borderColor: '#F3C7C4' },
    messageText: { fontSize: 13, fontFamily: fonts.bodySemiBold, flex: 1 },

    // Banner
    bannerCard: {
      backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden', marginBottom: spacing.lg,
      ...web({ boxShadow: '0 1px 2px rgba(16,16,20,0.04), 0 8px 24px rgba(16,16,20,0.05)' }),
    },
    bannerStrip: {
      height: 92, backgroundColor: '#1A1A1E',
      ...web({
        backgroundImage: [
          'radial-gradient(ellipse at 85% 0%, rgba(201,161,74,0.35) 0%, rgba(201,161,74,0) 55%)',
          'linear-gradient(120deg, #111114 0%, #2A2A30 100%)',
        ].join(', '),
      }),
    },
    bannerBody: {
      flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg,
      paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, flexWrap: 'wrap',
    },
    bannerBodyCompact: { flexDirection: 'column', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },

    // The photo overlaps the dark strip; the name and badges sit below it.
    avatarWrap: { position: 'relative', marginTop: -52 },
    avatarImage: { width: 104, height: 104, borderRadius: 52, borderWidth: 4, borderColor: colors.card, backgroundColor: colors.cardAlt },
    avatarFallback: {
      width: 104, height: 104, borderRadius: 52, borderWidth: 4, borderColor: colors.card,
      backgroundColor: '#ECE7DD', alignItems: 'center', justifyContent: 'center',
    },
    avatarFallbackText: { fontSize: 34, fontFamily: fonts.headingBold, color: '#5A4A2E' },
    avatarBadge: {
      position: 'absolute', bottom: 4, right: 4, width: 30, height: 30, borderRadius: 15,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 3, borderColor: colors.card,
    },

    bannerText: { flex: 1, minWidth: 220, paddingTop: 14 },
    name: { fontSize: 24, fontFamily: fonts.headingExtraBold, color: colors.text, letterSpacing: -0.5 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    rolePill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12,
    },
    rolePillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.onPrimary, letterSpacing: 0.2 },
    softPill: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    softPillText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 12 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 320 },
    metaText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },

    photoBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: colors.border, borderRadius: 999,
      paddingVertical: 9, paddingHorizontal: 16, backgroundColor: colors.card, marginTop: 18,
    },
    photoBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },

    // Columns
    columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
    colLeft: { flexBasis: 380, flexGrow: 0, flexShrink: 0 },
    colRight: { flex: 1, minWidth: 0 },

    // Cards
    card: {
      backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
      padding: spacing.lg, marginBottom: spacing.lg,
      ...web({ boxShadow: '0 1px 2px rgba(16,16,20,0.04)' }),
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardIcon: {
      width: 34, height: 34, borderRadius: 10, backgroundColor: colors.cardAlt,
      alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, letterSpacing: -0.2 },
    cardSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, lineHeight: 19 },
    cardBody: { marginTop: spacing.md },

    // Fields
    fieldLabel: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 6, marginTop: 12 },
    fieldError: { fontSize: 12, fontFamily: fonts.body, color: DANGER, marginTop: 6 },
    inputBox: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      backgroundColor: colors.card, paddingHorizontal: 14, minHeight: 46,
    },
    inputReadOnly: { backgroundColor: colors.cardAlt },
    inputError: { borderColor: DANGER },
    inputText: {
      flex: 1, minWidth: 0, paddingVertical: 11, fontSize: 14, fontFamily: fonts.body, color: colors.text,
      ...web({ outlineStyle: 'none' }),
    },
    eyeBtn: { paddingVertical: 6, paddingLeft: 4 },
    phoneRow: { flexDirection: 'row', gap: 10 },

    primaryBtnSmall: {
      backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 22,
      alignItems: 'center', justifyContent: 'center', minHeight: 46,
    },
    primaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: colors.primary, borderRadius: 12, minHeight: 48, marginTop: spacing.lg,
    },
    primaryBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
    btnDisabled: { opacity: 0.4 },

    // Account details
    detailRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.cardAlt,
    },
    detailLabel: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted },
    detailValue: { fontSize: 13.5, fontFamily: fonts.bodySemiBold, color: colors.text, flexShrink: 1, textAlign: 'right' },
    noteBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md,
      backgroundColor: colors.cardAlt, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    },
    noteText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted, flex: 1 },

    // Metrics
    metricsRow: { flexDirection: 'row', gap: 12 },
    metricTile: {
      flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14,
      padding: 14, backgroundColor: colors.card,
      ...web({ backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #FAFAFB 100%)' }),
    },
    metricIcon: {
      width: 30, height: 30, borderRadius: 9, backgroundColor: colors.cardAlt,
      alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    },
    metricValue: { fontSize: 26, fontFamily: fonts.headingExtraBold, color: colors.text, letterSpacing: -0.6 },
    metricLabel: { fontSize: 12.5, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 2 },

    // Responsibilities
    emptyRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 12,
      paddingVertical: 14, paddingHorizontal: 14,
    },
    emptyText: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    respChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12,
    },
    respChipText: { fontSize: 12.5, fontFamily: fonts.bodySemiBold, color: colors.text },

    // Password
    pwRow: { flexDirection: 'column' },
    pwRowWide: { flexDirection: 'row', gap: 12 },
    pwCol: { flex: 1, minWidth: 0 },
    strengthWrap: { marginTop: 12 },
    strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    strengthTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
    strengthFill: { height: '100%', borderRadius: 3 },
    strengthLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, minWidth: 48, textAlign: 'right' },
    checkList: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 10 },
    checkItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    checkText: { fontSize: 12.5, fontFamily: fonts.body, color: colors.textMuted },
  });
}