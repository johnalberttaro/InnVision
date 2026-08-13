import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

/**
 * RatingModal — shared star-rating + optional-comment modal used for both
 * post-stay room ratings (MyReservationsScreen.jsx) and post-order food
 * ratings (OrderFoodScreen.jsx). One component so the two rating flows
 * always look and behave identically to the guest, and any future third
 * "rate X" surface can reuse it too instead of building its own modal.
 *
 * Fully controlled by the parent for submission — this component only
 * collects rating+comment and calls onSubmit(rating, comment); the parent
 * owns the actual submitRoomReview/submitFoodReview Supabase call so this
 * file has no opinion on *what* is being rated.
 *
 * Props:
 *  - visible, onClose
 *  - subjectTitle: e.g. "Deluxe King — Room 204" or "Order #A1B2C3"
 *  - subjectSubtitle: optional second line, e.g. the stay dates or order date
 *  - onSubmit: async (rating, comment) => void — throwing surfaces an error
 */
export default function RatingModal({ visible, onClose, subjectTitle, subjectSubtitle, onSubmit }) {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = getStyles(colors, spacing, radius, fonts);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setRating(0);
    setComment('');
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a star rating.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(rating, comment);
      reset();
      onClose();
    } catch (err) {
      console.error('Rating submission failed:', err);
      setError('Could not submit your rating. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} disabled={submitting}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <Text style={styles.title}>Rate Your Experience</Text>
          {!!subjectTitle && <Text style={styles.subjectTitle}>{subjectTitle}</Text>}
          {!!subjectSubtitle && <Text style={styles.subjectSubtitle}>{subjectSubtitle}</Text>}

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => { setRating(n); setError(''); }} activeOpacity={0.7}>
                <Ionicons
                  name={n <= rating ? 'star' : 'star-outline'}
                  size={34}
                  color={n <= rating ? '#F5B400' : colors.disabled}
                  style={styles.star}
                />
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>}

          <Text style={styles.commentLabel}>Comments (optional)</Text>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Tell us more about your experience..."
            placeholderTextColor={colors.disabled}
            multiline
            numberOfLines={4}
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color={colors.onPrimary} size="small" />
              : <Text style={styles.submitBtnText}>Submit Rating</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const RATING_LABELS = { 1: 'Terrible', 2: 'Bad', 3: 'Okay', 4: 'Good', 5: 'Excellent' };

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      padding: spacing.lg,
      alignItems: 'center',
    },
    closeBtn: { position: 'absolute', top: spacing.md, right: spacing.md, padding: 4 },
    title: { fontSize: 17, fontFamily: fonts.headingExtraBold, color: colors.text, textAlign: 'center', marginTop: spacing.xs },
    subjectTitle: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, textAlign: 'center', marginTop: 6 },
    subjectSubtitle: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
    starsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    star: { marginHorizontal: 2 },
    ratingLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginTop: spacing.sm },
    commentLabel: {
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
      color: colors.textMuted,
      alignSelf: 'flex-start',
      marginTop: spacing.lg,
      marginBottom: 6,
    },
    commentInput: {
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      padding: spacing.md,
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.text,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    errorText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.danger, marginTop: spacing.sm },
    submitBtn: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      marginTop: spacing.lg,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.onPrimary },
  });
}