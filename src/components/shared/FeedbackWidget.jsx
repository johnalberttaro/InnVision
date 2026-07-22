import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
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

export default function FeedbackWidget() {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = getStyles(colors, spacing, radius, fonts);

  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

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
                <Ionicons name="checkmark-circle" size={44} color={colors.primary} />
                <Text style={styles.successTitle}>Thanks for your feedback!</Text>
                <Text style={styles.successBody}>We really appreciate you taking the time.</Text>
                <TouchableOpacity style={styles.closeBtn} onPress={closeWidget} activeOpacity={0.85}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.title}>How was your overall experience with InnVision?</Text>

                <View style={styles.ratingRow}>
                  {RATING_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={styles.ratingOption}
                      onPress={() => { setRating(opt.value); setError(''); }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.emojiCircle, rating === opt.value && styles.emojiCircleActive]}>
                        <Text style={styles.emoji}>{opt.emoji}</Text>
                      </View>
                      <Text style={[styles.ratingLabel, rating === opt.value && styles.ratingLabelActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
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

                {!!error && <Text style={styles.errorText}>{error}</Text>}

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
                    <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
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

    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xl },

    title: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.text, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 24 },

    ratingRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
    ratingOption: { alignItems: 'center', flex: 1 },
    emojiCircle: {
      width: 48, height: 48, borderRadius: 24,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: 'transparent',
      marginBottom: spacing.xs,
    },
    emojiCircleActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
    emoji: { fontSize: 22 },
    ratingLabel: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },
    ratingLabelActive: { color: colors.primary, fontFamily: fonts.bodySemiBold },

    fieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, marginBottom: spacing.xs },
    required: { color: colors.danger },
    textArea: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      backgroundColor: colors.cardAlt, padding: spacing.md,
      fontFamily: fonts.body, fontSize: 13, color: colors.text,
      minHeight: 90, textAlignVertical: 'top',
    },
    errorText: { fontSize: 11, fontFamily: fonts.body, color: colors.danger, marginTop: spacing.xs },

    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    cancelBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
    submitBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    submitBtnDisabled: { opacity: 0.7 },
    submitBtnText: { fontSize: 13, fontFamily: fonts.headingSemiBold, color: colors.onPrimary },

    successWrap: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.xs },
    successTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginTop: spacing.sm },
    successBody: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
    closeBtn: { marginTop: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: 999, backgroundColor: colors.primary },
    closeBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
  });
}