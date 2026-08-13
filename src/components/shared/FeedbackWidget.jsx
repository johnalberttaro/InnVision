import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';

/**
 * FeedbackWidget — a floating icon (bottom-right corner) that opens a
 * rating + feedback modal. Inspired by the floating feedback bubble on
 * gohotels.ph, rebuilt with InnVision's own theme rather than copying
 * their branding.
 *
 * Self-contained: manages its own visibility, form state, and Supabase
 * write. Just drop <FeedbackWidget /> into any screen — HomeScreen.jsx
 * for now.
 *
 * AUTO-OPEN ON RECENT BOOKING (autoOpenOnRecentBooking prop, used on
 * HomeScreen.jsx): on mount, checks whether the guest's most recent
 * reservation has already been prompted for. If not, the modal opens on
 * its own instead of waiting for the FAB to be tapped — and is marked as
 * prompted for that reservation right away, whether the guest submits or
 * just dismisses it. That "already prompted" marker is stored in
 * AsyncStorage (per reservation id, namespaced by user id), NOT
 * re-derived from feedback timestamps — an earlier version compared
 * "booked more recently than last feedback given," which meant a guest
 * who dismissed without submitting saw it again on every subsequent Home
 * visit, including after logging out and back in. AsyncStorage persists
 * across logout/login (it's device storage, not tied to the Supabase
 * session), so once shown for a given reservation, it's done — for
 * good, on that device — regardless of whether they actually submitted.
 * A new booking gets a new reservation id, so it pops up again for that
 * one, as intended ("once per reservation" — not "once ever").
 *
 * Submission requires a logged-in user (matches the same rule
 * ContactUsScreen.jsx follows) — shows a "please log in" message rather
 * than failing silently if nobody's signed in.
 */
const RATING_OPTIONS = [
  { value: 1, emoji: '😠', label: 'Terrible' },
  { value: 2, emoji: '😞', label: 'Bad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Excellent' },
];

const promptedKey = (userId, reservationId) => `feedbackPrompted:${userId}:${reservationId}`;

export default function FeedbackWidget({ autoOpenOnRecentBooking = false }) {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = getStyles(colors, spacing, radius, fonts);

  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Guards the auto-open check so it only ever runs once per mount, not
  // on every re-render.
  const autoCheckRan = useRef(false);

  useEffect(() => {
    if (!autoOpenOnRecentBooking || autoCheckRan.current) return;
    autoCheckRan.current = true;

    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) return;

        const { data: latestReservation } = await supabase
          .from('reservations')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestReservation) return; // never booked — nothing to prompt about

        const key = promptedKey(user.id, latestReservation.id);
        const alreadyPrompted = await AsyncStorage.getItem(key);
        if (alreadyPrompted) return;

        // Mark it prompted immediately — the popup should show exactly
        // once for this reservation regardless of whether the guest
        // actually submits or just closes it.
        await AsyncStorage.setItem(key, '1');
        setError('');
        setSubmitted(false);
        setVisible(true);
      } catch (err) {
        // Best-effort — a failed check here should never block the
        // guest from seeing their Home screen normally.
        console.error('Failed to check for a recent unprompted booking:', err);
      }
    })();
  }, [autoOpenOnRecentBooking]);

  const openWidget = () => {
    setError('');
    setSubmitted(false);
    setVisible(true);
  };

  const closeWidget = () => {
    setVisible(false);
    setRating(null);
    setFeedbackText('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!rating) {
      setError('Please select how your experience was.');
      return;
    }
    if (!feedbackText.trim()) {
      setError('Please give your feedback before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        setError('Please log in to your account before submitting feedback.');
        setSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase.from('feedback').insert({
        user_id: user.id,
        rating,
        feedback_text: feedbackText.trim(),
      });
      if (insertError) throw insertError;

      setSubmitted(true);
      setRating(null);
      setFeedbackText('');
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      setError('Something went wrong submitting your feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedOption = RATING_OPTIONS.find((o) => o.value === rating);

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={openWidget}
        activeOpacity={0.85}
        accessibilityLabel="Give feedback"
      >
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.onPrimary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeWidget}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            {submitted ? (
              <View style={styles.successWrap}>
                <View style={styles.successIconRing}>
                  <Ionicons name="checkmark" size={30} color="#FFFFFF" />
                </View>
                <Text style={styles.successTitle}>Thanks for your feedback!</Text>
                <Text style={styles.successBody}>We really appreciate you taking the time.</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={closeWidget} activeOpacity={0.85}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.dismissX} onPress={closeWidget} disabled={submitting} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>

                <View style={styles.headerIconWrap}>
                  <Ionicons name="chatbubble-ellipses" size={22} color={colors.onPrimary} />
                </View>

                <Text style={styles.title}>How was your overall experience with InnVision?</Text>

                <View style={styles.ratingRow}>
                  {RATING_OPTIONS.map((opt) => {
                    const active = rating === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={styles.ratingOption}
                        onPress={() => { setRating(opt.value); setError(''); }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.emojiCircle, active && { backgroundColor: RATING_COLORS[opt.value], borderColor: RATING_COLORS[opt.value] }]}>
                          <Text style={styles.emoji}>{opt.emoji}</Text>
                        </View>
                        <Text style={[styles.ratingLabel, active && { color: RATING_COLORS[opt.value], fontFamily: fonts.bodySemiBold }]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Feedback <Text style={styles.required}>(Required)</Text></Text>
                <TextInput
                  style={styles.textArea}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  placeholder="Please give your feedback"
                  placeholderTextColor={colors.disabled}
                  multiline
                  numberOfLines={4}
                />

                {!!error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="warning-outline" size={14} color="#B3261E" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeWidget} disabled={submitting}>
                    <Text style={styles.cancelBtnText}>Close</Text>
                  </TouchableOpacity>
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
                        <Ionicons name="send" size={14} color={colors.onPrimary} />
                        <Text style={styles.submitBtnText}>Submit</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// One accent color per rating level (red → green), used for the emoji
// circle + label once selected, so the color itself reinforces how
// positive/negative the pick is rather than everything staying the same
// single brand color regardless of what was picked.
const RATING_COLORS = {
  1: '#B3261E',
  2: '#D97706',
  3: '#9A7B00',
  4: '#4C8C3C',
  5: '#1E7B34',
};

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      bottom: 110,
      right: spacing.lg,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
      zIndex: 20,
      ...Platform.select({ web: { cursor: 'pointer' } }),
    },

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.xl,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 10,
    },

    dismissX: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 1, padding: 4 },

    headerIconWrap: {
      alignSelf: 'center',
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },

    title: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.text, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 24 },

    ratingRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
    ratingOption: { alignItems: 'center', flex: 1 },
    emojiCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.cardAlt,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    emoji: { fontSize: 22 },
    ratingLabel: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },

    fieldLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 6 },
    required: { color: colors.danger, fontFamily: fonts.body, fontSize: 11 },
    textArea: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.text,
      minHeight: 90,
      textAlignVertical: 'top',
      backgroundColor: colors.background,
    },

    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#FDECEA',
      borderRadius: radius.sm,
      padding: spacing.sm,
      marginTop: spacing.sm,
    },
    errorText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    cancelBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    cancelBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text },
    submitBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },

    successWrap: { alignItems: 'center', paddingVertical: spacing.md },
    successIconRing: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#1E7B34',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    successTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: 4 },
    successBody: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
    closeBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radius.md, backgroundColor: colors.primary },
    closeBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
  });
}