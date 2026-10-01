import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { fetchAllFeedback, averageRating } from '../../utils/FeedbackService';
import KpiCard from '../../components/dashboard/KpiCard';

/**
 * GuestFeedbackScreen — staff-facing viewer for the guest's overall
 * "How was your experience?" feedback, submitted via the floating
 * FeedbackWidget (src/components/shared/FeedbackWidget.jsx) shown on the
 * guest home screen. That widget has always written to the `feedback`
 * table; nothing ever read it back until now — this is the first staff
 * view onto it.
 *
 * Routed as reports:feedback, under Admin → Reports & Analytics, right
 * next to the existing Guest Ratings screen (reports:ratings). Admin-only
 * for now, by design — unlike GuestRatingsScreen.jsx, this isn't also
 * mirrored into Front Desk's Guest Management tabs yet. Easy to add
 * there later the same way (same component, just imported a second
 * place), if it turns out to be wanted.
 *
 * RATING_OPTIONS / RATING_COLORS below are copied from FeedbackWidget.jsx
 * rather than imported — that file doesn't export them, and it's a
 * guest-facing component this staff screen shouldn't otherwise depend
 * on — so the emoji, labels, and colors a guest sees while rating match
 * exactly what staff see here for that same rating value.
 *
 * REQUIRES a Supabase RLS policy allowing staff to SELECT from
 * `feedback` — see migration_out/20261002_feedback_staff_select_policy.sql
 * and the note at the top of FeedbackService.js. Without it this screen
 * still loads cleanly, it just shows zero rows for everyone.
 *
 * VISUAL DESIGN: like GuestRatingsScreen, this screen intentionally
 * breaks from the portal's usual monochrome palette with real color —
 * the same red-to-green sentiment scale the guest sees on the rating
 * widget itself, plus one purple accent (TOTAL_COLOR) reused for both
 * the header badge and the "Total Feedback" tile, so the screen reads
 * as one deliberate, restrained palette rather than a scattered pile of
 * one-off colors.
 */
const RATING_OPTIONS = [
  { value: 1, emoji: '😠', label: 'Terrible' },
  { value: 2, emoji: '😞', label: 'Bad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Excellent' },
];

const RATING_COLORS = {
  1: '#B3261E',
  2: '#D97706',
  3: '#9A7B00',
  4: '#4C8C3C',
  5: '#1E7B34',
};

const TOTAL_COLOR = '#6B46C1'; // purple — same "Total X" accent GuestRatingsScreen uses, reused here for the header badge too

// Average-rating KPI tile picks the nearest rating bucket's own color, so
// its accent carries the same "how are we doing" signal as the individual
// cards below it — a 4.2 average tints green, a 2.1 average tints red.
function colorForAverage(avg) {
  if (avg == null) return colors.textMuted;
  return RATING_COLORS[Math.max(1, Math.min(5, Math.round(avg)))];
}

// Same light-tint-behind-a-colored-badge technique KpiCard.jsx already
// uses for its trend pills (trendBg), just parameterized on an arbitrary
// hex instead of the three hardcoded up/down/flat colors it has.
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function GuestFeedbackScreen() {
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 1 | 2 | 3 | 4 | 5

  const load = async () => {
    try {
      const data = await fetchAllFeedback();
      setFeedbackList(data);
      setError('');
    } catch (err) {
      console.error('Failed to load guest feedback:', err);
      setError('Could not load guest feedback.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const avg = averageRating(feedbackList);
  const needsAttentionCount = useMemo(() => feedbackList.filter((f) => f.rating <= 2).length, [feedbackList]);

  const visibleFeedback = useMemo(() => {
    if (filter === 'all') return feedbackList;
    return feedbackList.filter((f) => f.rating === filter);
  }, [feedbackList, filter]);

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerIconBadge}>
          <Ionicons name="happy" size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Guest Feedback</Text>
          <Text style={styles.subtitle}>Overall experience feedback guests submit from the home menu.</Text>
        </View>
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color="#B3261E" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <View style={styles.kpiRow}>
        <KpiCard
          icon="happy-outline"
          label="Average Rating"
          value={avg != null ? `${avg.toFixed(1)} / 5` : '—'}
          accent={colorForAverage(avg)}
          note={`${feedbackList.length} submission${feedbackList.length !== 1 ? 's' : ''}`}
        />
        <KpiCard
          icon="chatbubbles-outline"
          label="Total Feedback"
          value={String(feedbackList.length)}
          accent={TOTAL_COLOR}
          note="All submissions"
        />
        <KpiCard
          icon="alert-circle-outline"
          label="Needs Attention"
          value={String(needsAttentionCount)}
          accent={colors.danger}
          note="Rated Terrible or Bad"
        />
      </View>

      <View style={styles.filterRow}>
        <View style={styles.filterChipsWrap}>
          <FilterChip
            filterKey="all"
            label="All"
            icon="apps-outline"
            color={colors.primary}
            active={filter === 'all'}
            onPress={() => setFilter('all')}
          />
          {RATING_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.value}
              filterKey={opt.value}
              label={opt.label}
              emoji={opt.emoji}
              color={RATING_COLORS[opt.value]}
              active={filter === opt.value}
              onPress={() => setFilter(opt.value)}
            />
          ))}
        </View>
        <Text style={styles.resultCount}>
          {visibleFeedback.length} submission{visibleFeedback.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {visibleFeedback.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbox-ellipses-outline" size={28} color={colors.disabled} />
          <Text style={styles.emptyText}>No feedback yet.</Text>
        </View>
      ) : (
        visibleFeedback.map((item) => <FeedbackCard key={item.id} feedback={item} />)
      )}
    </ScrollView>
  );
}

// Pressable (not TouchableOpacity) specifically so the hover state below
// works — react-native-web fires onHoverIn/onHoverOut on Pressable for a
// mouse pointer; same pattern as GuestRatingsScreen's own FilterChip.
function FilterChip({ label, icon, emoji, color, active, onPress }) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !active;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.filterChip,
        active && { backgroundColor: color, borderColor: color },
        showHover && { borderColor: color, backgroundColor: colors.cardAlt },
      ]}
    >
      {emoji ? (
        <Text style={styles.filterChipEmoji}>{emoji}</Text>
      ) : (
        <Ionicons name={icon} size={14} color={active ? '#FFFFFF' : color} />
      )}
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function FeedbackCard({ feedback }) {
  const option = RATING_OPTIONS.find((o) => o.value === feedback.rating);
  const ratingColor = RATING_COLORS[feedback.rating] || colors.textMuted;
  const date = feedback.created_at
    ? new Date(feedback.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  return (
    <View style={[styles.feedbackCard, { borderLeftColor: ratingColor }]}>
      <View style={styles.feedbackTopRow}>
        {feedback.photo_url ? (
          <Image source={{ uri: feedback.photo_url }} style={[styles.avatarImage, { borderColor: ratingColor }]} />
        ) : (
          <View style={[styles.avatarCircle, { borderColor: ratingColor }]}>
            <Text style={styles.avatarText}>{initials(feedback.guest_name)}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.feedbackGuestName}>{feedback.guest_name}</Text>
          <Text style={styles.feedbackMeta}>{feedback.guest_email || '—'} · {date}</Text>
        </View>

        <View style={[styles.ratingPill, { backgroundColor: hexToRgba(ratingColor, 0.12) }]}>
          <Text style={styles.ratingPillEmoji}>{option?.emoji || '❓'}</Text>
          <Text style={[styles.ratingPillText, { color: ratingColor }]}>{option?.label || 'Unknown'}</Text>
        </View>
      </View>

      <View style={styles.commentWrap}>
        <Ionicons name="chatbox-ellipses-outline" size={13} color={colors.textMuted} style={{ marginTop: 1 }} />
        <Text style={styles.feedbackComment}>{feedback.feedback_text || '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  headerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: TOTAL_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#332B22',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FDECEA',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: { flex: 1, fontSize: 12, fontFamily: fonts.bodySemiBold, color: '#B3261E' },

  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterChipEmoji: { fontSize: 14 },
  filterChipText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  filterChipTextActive: { color: '#FFFFFF' },
  resultCount: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  feedbackCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#332B22',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  feedbackTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.cardAlt,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.cardAlt,
    borderWidth: 2,
  },
  avatarText: { fontSize: 13, fontFamily: fonts.headingExtraBold, color: colors.text },

  feedbackGuestName: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text },
  feedbackMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 3 },

  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  ratingPillEmoji: { fontSize: 15 },
  ratingPillText: { fontSize: 12, fontFamily: fonts.headingBold },

  commentWrap: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  feedbackComment: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: 18,
  },
});