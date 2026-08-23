import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTheme } from '../../context/ThemeContext';

const CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing',   icon: 'water-outline' },
  { key: 'electrical', label: 'Electrical', icon: 'flash-outline' },
  { key: 'hvac',        label: 'HVAC',       icon: 'thermometer-outline' },
  { key: 'furniture',  label: 'Furniture',  icon: 'bed-outline' },
  { key: 'other',      label: 'Other',      icon: 'build-outline' },
];

/**
 * ReportIssueScreen — lets a checked-in guest report a maintenance issue
 * themselves, instead of it always going through Front Desk verbally
 * (see MaintenanceRequest.jsx's "+ New Request" — that's the ONLY way a
 * maintenance_requests row got created before this screen; a guest had
 * no self-service path at all).
 *
 * Inserts directly into maintenance_requests with status: 'open' — same
 * starting state Front Desk's own "New Request" form creates, so it
 * lands in the exact same place on the Admin/Front Desk Maintenance
 * Requests board and gets assigned to maintenance staff the same way,
 * regardless of who reported it.
 *
 * DESIGN CHOICE: no priority picker, unlike the staff-facing form (which
 * has Low/Normal/Urgent). Guests default to 'normal' — assessing true
 * urgency (is this actually urgent, or does the guest just feel that
 * way?) is left to staff triage, not self-reported by the person with
 * the least context on hotel operations. Staff can still escalate it
 * from their own board after reviewing it.
 *
 * ELIGIBILITY: same rule as OrderFoodScreen.jsx — only a guest with a
 * status = 'checked-in' reservation can use this (that's the room the
 * issue is attributed to). A friendly message shows otherwise, same
 * pattern as that screen.
 */
export default function ReportIssueScreen({ user, onBackPress }) {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = getStyles(colors, spacing, radius, fonts);

  const [checkedInReservation, setCheckedInReservation] = useState(null);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('reservations')
        .select('id, status, selected_rooms, guest_details, guest_email')
        .eq('user_id', user.id)
        .eq('status', 'checked-in')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled) {
        if (fetchError) console.error('Failed to load checked-in reservation:', fetchError);
        else if (data && data.length > 0) setCheckedInReservation(data[0]);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const roomNumber = (() => {
    const rooms = checkedInReservation?.selected_rooms;
    if (Array.isArray(rooms) && rooms.length > 0) {
      return rooms[0]?.roomNumber || rooms[0]?.number || rooms[0]?.room || null;
    }
    return null;
  })();

  const handleSubmit = async () => {
    if (!category) {
      setError('Please select what kind of issue this is.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe the issue.');
      return;
    }
    if (!roomNumber) {
      setError('Could not determine your room. Please contact Front Desk directly.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const guestName = checkedInReservation?.guest_details
        ? `${checkedInReservation.guest_details.firstName || ''} ${checkedInReservation.guest_details.lastName || ''}`.trim()
        : (checkedInReservation?.guest_email || user?.email || 'Guest');

      const { error: insertError } = await supabase.from('maintenance_requests').insert({
        room_number: roomNumber,
        category,
        priority: 'normal',
        description: description.trim(),
        status: 'open',
        reported_by: user.id,
      });
      if (insertError) throw insertError;

      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit maintenance request:', err);
      setError('Something went wrong submitting your request. Please try again, or contact Front Desk directly.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!checkedInReservation) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <View style={styles.stateCard}>
            <Ionicons name="build-outline" size={44} color={colors.textMuted} />
            <Text style={styles.stateTitle}>Issue reporting isn't available yet</Text>
            <Text style={styles.stateMessage}>
              This becomes available once you've checked in. If you've just checked in, this may take a moment to update.
            </Text>
            {!!onBackPress && (
              <TouchableOpacity style={styles.stateSecondaryBtn} onPress={onBackPress} activeOpacity={0.85}>
                <Text style={styles.stateSecondaryBtnText}>Go back</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerWrap}>
          <View style={styles.stateCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            </View>
            <Text style={styles.stateTitle}>Issue reported</Text>
            <Text style={styles.stateMessage}>
              Thanks — our maintenance team has been notified about Room {roomNumber}. Front Desk will follow up if needed.
            </Text>
            {!!onBackPress && (
              <TouchableOpacity style={styles.statePrimaryBtn} onPress={onBackPress} activeOpacity={0.85}>
                <Text style={styles.statePrimaryBtnText}>Go back</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {!!onBackPress && (
          <TouchableOpacity onPress={onBackPress} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Report an Issue</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.roomLabel}>Room {roomNumber}</Text>
        <Text style={styles.subtitle}>Let us know what's wrong and our team will take care of it.</Text>

        <Text style={styles.fieldLabel}>What kind of issue is it?</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => { setCategory(c.key); setError(''); }}
                activeOpacity={0.8}
              >
                <Ionicons name={c.icon} size={15} color={active ? colors.onPrimary : colors.text} />
                <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Describe the issue</Text>
        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={(v) => { setDescription(v); if (error) setError(''); }}
          placeholder="e.g. The bathroom sink is leaking"
          placeholderTextColor={colors.disabled}
          multiline
          numberOfLines={5}
        />

        {!!error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={14} color="#B3261E" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <Ionicons name="send" size={15} color={colors.onPrimary} />
              <Text style={styles.submitBtnText}>Submit Report</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.text },

    content: { padding: spacing.lg, paddingBottom: spacing.xl },
    roomLabel: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
    subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },

    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },

    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    categoryChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    },
    categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    categoryChipText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    categoryChipTextActive: { color: colors.onPrimary },

    textArea: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      padding: spacing.md, fontSize: 13, fontFamily: fonts.body, color: colors.text,
      minHeight: 110, textAlignVertical: 'top', backgroundColor: colors.white,
    },

    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: '#FDECEA', borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.md,
    },
    errorText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

    submitBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.lg,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },

    // Matches ReviewPayScreen.jsx's booking-success card exactly (same
    // shadow, radius, icon size, button shape) so every guest-facing
    // confirmation in the app reads as the same design language.
    stateCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    successIconWrap: { marginBottom: spacing.md },
    stateTitle: {
      fontSize: 20,
      fontFamily: fonts.headingBold,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    stateMessage: {
      fontSize: 14,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: spacing.md,
    },
    statePrimaryBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      minWidth: 180,
      alignItems: 'center',
    },
    statePrimaryBtnText: { color: colors.onPrimary, fontFamily: fonts.bodySemiBold, fontSize: 14 },
    stateSecondaryBtn: {
      marginTop: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 180,
      alignItems: 'center',
    },
    stateSecondaryBtnText: { color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  });
}