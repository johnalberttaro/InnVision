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
import { colors, spacing, radius, fonts } from '../../utils/theme';

/**
 * MyProfileScreen — front desk staff's own self-service profile view,
 * reached by tapping their name at the bottom of FrontDeskSidebar.jsx.
 *
 * Distinct from FrontDeskStaffScreen.jsx (the admin-facing "Front Desk
 * Roster" that manages EVERYONE's profiles) — this shows only the
 * signed-in staff member's own record, and only lets them edit what a
 * real employee should reasonably self-manage: their profile photo and
 * phone number. Position, access level, responsibilities, training
 * context, and performance metrics are admin-assigned and shown
 * read-only here — same real vs. honest-manual data split as the admin
 * roster (Today's Transactions is computed live from payments; feedback/
 * error counts are whatever the admin has recorded).
 *
 * Props:
 *  - staffUid: string — the signed-in user's id
 *  - onBack: () => void (optional)
 */
export default function MyProfileScreen({ staffUid, onBack }) {
  const [profile, setProfile] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [todaysTransactions, setTodaysTransactions] = useState(0);

  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

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

  useEffect(() => {
    if (!staffUid) return;
    const loadToday = async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('processed_by', staffUid)
        .gte('created_at', startOfDay.toISOString());
      if (!error) setTodaysTransactions(count || 0);
    };
    loadToday();
  }, [staffUid]);

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

  if (loading) {
    return <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  if (!profile) {
    return <View style={styles.centerWrap}><Text style={styles.mutedNote}>Could not load your profile.</Text></View>;
  }

  const name = profile.display_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Front Desk Staff';
  const responsibilities = details?.responsibilities || [];
  const trainingContext = details?.training_context;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.primary} />
          <Text style={styles.backLinkText}>Back</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.pageTitle}>My Profile</Text>
      <Text style={styles.pageSubtitle}>View your details and update your photo or phone number.</Text>

      {!!message && (
        <View style={[styles.messageBanner, message.type === 'error' ? styles.messageBannerError : styles.messageBannerSuccess]}>
          <Ionicons
            name={message.type === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            size={16}
            color={message.type === 'error' ? '#B3261E' : '#1E7B34'}
          />
          <Text style={[styles.messageText, { color: message.type === 'error' ? '#B3261E' : '#1E7B34' }]}>{message.text}</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePhotoUpload} disabled={uploadingPhoto} activeOpacity={0.8}>
            {profile.photo_url ? (
              <Image source={{ uri: profile.photo_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarUploadBadge}>
              {uploadingPhoto
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Ionicons name="camera" size={13} color={colors.white} />
              }
            </View>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.name}>{name}</Text>
            {!!details?.position && <Text style={styles.position}>{details.position}</Text>}
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>FRONT DESK</Text>
            </View>
          </View>
        </View>
        <Text style={styles.photoHint}>Tap your photo to change it.</Text>

        <SectionLabel icon="information-circle-outline" text="Basic Information" />
        <View style={styles.infoGrid}>
          <InfoItem label="Full Name" value={name} />
          <InfoItem label="Email" value={profile.email || '—'} />
        </View>
        <Text style={styles.fieldLabel}>Phone</Text>
        <View style={styles.phoneRow}>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            keyboardType="phone-pad"
            placeholderTextColor={colors.disabled}
          />
          <TouchableOpacity
            style={[styles.saveBtn, (savingPhone || phone.trim() === (profile.phone || '')) && styles.saveBtnDisabled]}
            onPress={handleSavePhone}
            disabled={savingPhone || phone.trim() === (profile.phone || '')}
          >
            {savingPhone ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <SectionLabel icon="key-outline" text="Account Details" />
        <View style={styles.infoGrid}>
          <InfoItem label="Username" value={details?.username || (profile.email ? profile.email.split('@')[0] : '—')} />
          <InfoItem label="Role" value="Front Desk" />
          <InfoItem label="Access Level" value={details?.access_level || 'Standard'} />
        </View>
        <Text style={styles.mutedNote}>These are set by an administrator.</Text>

        <SectionLabel icon="checkmark-done-outline" text="Responsibilities" />
        {responsibilities.length === 0 ? (
          <Text style={styles.mutedNote}>No responsibilities assigned yet.</Text>
        ) : (
          <View style={styles.chipRow}>
            {responsibilities.map((r) => (
              <View key={r} style={styles.respChip}>
                <Text style={styles.respChipText}>{r}</Text>
              </View>
            ))}
          </View>
        )}

        <SectionLabel icon="stats-chart-outline" text="My Performance" />
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{todaysTransactions}</Text>
            <Text style={styles.metricLabel}>Today's Transactions</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {details?.customer_feedback_score != null ? `${details.customer_feedback_score}/5` : '—'}
            </Text>
            <Text style={styles.metricLabel}>Customer Feedback</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={[styles.metricValue, (details?.error_reports_count || 0) > 0 && { color: '#B3261E' }]}>
              {details?.error_reports_count ?? 0}
            </Text>
            <Text style={styles.metricLabel}>Error Reports</Text>
          </View>
        </View>

        {!!trainingContext && (
          <>
            <SectionLabel icon="school-outline" text="Training Context" />
            <View style={styles.trainingRow}>
              <View style={styles.trainingBadge}>
                <Text style={styles.trainingBadgeText}>{trainingContext}</Text>
              </View>
              {!!details?.supervisor_or_intern_name && (
                <Text style={styles.trainingName}>
                  {trainingContext === 'Student Intern' ? 'Supervised by ' : 'Supervising '}
                  {details.supervisor_or_intern_name}
                </Text>
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function SectionLabel({ icon, text }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Ionicons name={icon} size={13} color={colors.primary} />
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
  );
}

function InfoItem({ label, value }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoItemLabel}>{label}</Text>
      <Text style={styles.infoItemValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, maxWidth: 560, width: '100%', alignSelf: 'center' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mutedNote: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic' },

  backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  backLinkText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.primary, marginLeft: 2 },

  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

  messageBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  messageBannerSuccess: { backgroundColor: '#DFF5E1' },
  messageBannerError: { backgroundColor: '#FBE7E7' },
  messageText: { fontSize: 13, fontFamily: fonts.body, flex: 1 },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  avatarWrap: { position: 'relative' },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 22, fontFamily: fonts.headingBold, color: colors.primary },
  avatarUploadBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  headerTextWrap: { flex: 1 },
  name: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.text },
  position: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 2 },
  roleBadge: { backgroundColor: colors.primaryTint, borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm, alignSelf: 'flex-start', marginTop: spacing.xs },
  roleBadgeText: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: colors.primary, letterSpacing: 0.4 },
  photoHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.sm },

  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionLabelText: { fontSize: 11, fontFamily: fonts.headingSemiBold, color: colors.text, textTransform: 'uppercase', letterSpacing: 0.4 },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  infoItem: { minWidth: 130, flexGrow: 1 },
  infoItemLabel: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted },
  infoItemValue: { fontSize: 12.5, fontFamily: fonts.bodyMedium, color: colors.text, marginTop: 1 },

  fieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, marginBottom: spacing.xs },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: 13, fontFamily: fonts.body, color: colors.text, backgroundColor: colors.cardAlt },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  respChip: { backgroundColor: colors.accentTint, borderRadius: 999, paddingVertical: 4, paddingHorizontal: spacing.sm },
  respChipText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.accent },

  metricsRow: { flexDirection: 'row', gap: spacing.sm },
  metricCard: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' },
  metricValue: { fontSize: 18, fontFamily: fonts.headingExtraBold, color: colors.primary },
  metricLabel: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  trainingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  trainingBadge: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 4, paddingHorizontal: spacing.md },
  trainingBadgeText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white },
  trainingName: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
});