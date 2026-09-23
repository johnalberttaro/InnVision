import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { fetchAllReviews, averageRating } from '../../utils/ReviewsService';
import KpiCard from '../../components/dashboard/KpiCard';

/**
 * GuestRatingsScreen — staff-facing viewer for the guest ratings guests
 * submit after checkout (room) and after a food order is delivered
 * (food). Shared between Admin (routed as reports:ratings, under Reports
 * & Analytics) and Front Desk (routed as guests:ratings, under Guest
 * Management) — same file, no admin-only actions in it, so no reason to
 * fork it into two screens.
 *
 * Averages are computed client-side from a plain fetch of every review
 * row (see ReviewsService.fetchAllReviews), matching how other
 * dashboards in this app (e.g. RevenueReportScreen) already compute
 * their own summaries rather than adding a Postgres aggregate RPC —
 * review volume for a training-hotel project is small enough that this
 * is the simpler, honest choice.
 *
 * VISUAL DESIGN: this screen intentionally breaks from the portal's
 * usual monochrome palette with real color — a teal for room stays, an
 * amber for food orders, gold for the stars — same as RevenueReportScreen
 * and FrontDeskDashboardScreen already do for their own KPI cards
 * (colors.danger reds, hardcoded #1E7B34 greens, etc.), so this isn't a
 * one-off exception to "monochrome by design," it's the same established
 * pattern of using real color specifically to distinguish categories at
 * a glance on a dashboard-style screen.
 */
const ROOM_COLOR = '#2E7D96'; // teal-blue
const FOOD_COLOR = '#D97706'; // amber
const STAR_COLOR = '#F5B400'; // gold
const TOTAL_COLOR = '#6B46C1'; // purple

export default function GuestRatingsScreen() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'room' | 'food'

  const load = async () => {
    try {
      const data = await fetchAllReviews();
      setReviews(data);
      setError('');
    } catch (err) {
      console.error('Failed to load reviews:', err);
      setError('Could not load guest ratings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const roomReviews = useMemo(() => reviews.filter((r) => r.type === 'room'), [reviews]);
  const foodReviews = useMemo(() => reviews.filter((r) => r.type === 'food'), [reviews]);
  const roomAvg = averageRating(roomReviews);
  const foodAvg = averageRating(foodReviews);

  const visibleReviews = useMemo(() => {
    if (filter === 'all') return reviews;
    return reviews.filter((r) => r.type === filter);
  }, [reviews, filter]);

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
          <Ionicons name="star" size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Guest Ratings</Text>
          <Text style={styles.subtitle}>Room and food ratings guests submit after their stay or order.</Text>
        </View>
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color="#B3261E" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <View style={styles.kpiRow}>
        {/* VISUAL: value simplified from the old "No ratings yet" string to
            a plain em dash when there's no average yet — the note directly
            below already spells out "0 ratings", so the big headline number
            saying the same thing in words was both redundant and prone to
            wrapping onto two cramped lines inside the tile. Still the exact
            same roomAvg/foodAvg values driving it either way. */}
        <KpiCard
          icon="bed-outline"
          label="Avg Room Rating"
          value={roomAvg != null ? `${roomAvg.toFixed(1)} / 5` : '—'}
          accent={ROOM_COLOR}
          note={`${roomReviews.length} rating${roomReviews.length !== 1 ? 's' : ''}`}
        />
        <KpiCard
          icon="restaurant-outline"
          label="Avg Food Rating"
          value={foodAvg != null ? `${foodAvg.toFixed(1)} / 5` : '—'}
          accent={FOOD_COLOR}
          note={`${foodReviews.length} rating${foodReviews.length !== 1 ? 's' : ''}`}
        />
        <KpiCard
          icon="chatbubbles-outline"
          label="Total Ratings"
          value={String(reviews.length)}
          accent={TOTAL_COLOR}
          note="Room + Food combined"
        />
      </View>

      {/* VISUAL: chips moved from TouchableOpacity to the same
          Pressable-with-hover pattern GuestTabButton (GuestManagementScreen)
          and ReservationTabButton (ReservationsScreen) already use for tab
          bars elsewhere in this app — this screen is staff-facing on what's
          clearly a desktop/web portal, and it was the one filter row in
          Guest Management with no mouse-hover feedback at all. onPress/
          setFilter/active-key logic is untouched, just how the chip renders.
          Also added a small result count (reuses the already-computed
          visibleReviews.length, same "{n} guests"-style convention Guest
          Records already uses) so it's clear at a glance how many reviews
          the current filter is showing. */}
      <View style={styles.filterRow}>
        <View style={styles.filterChipsWrap}>
          {[
            { key: 'all', label: 'All', icon: 'apps-outline', color: colors.primary },
            { key: 'room', label: 'Room Stays', icon: 'bed-outline', color: ROOM_COLOR },
            { key: 'food', label: 'Food Orders', icon: 'restaurant-outline', color: FOOD_COLOR },
          ].map((f) => (
            <FilterChip key={f.key} filter={f} active={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </View>
        <Text style={styles.resultCount}>
          {visibleReviews.length} review{visibleReviews.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {visibleReviews.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="star-outline" size={28} color={colors.disabled} />
          <Text style={styles.emptyText}>No ratings yet.</Text>
        </View>
      ) : (
        visibleReviews.map((r) => <ReviewCard key={r.id} review={r} />)
      )}
    </ScrollView>
  );
}

// Pressable (not TouchableOpacity) specifically so the hover state below
// works — react-native-web fires onHoverIn/onHoverOut on Pressable for a
// mouse pointer; there's no touch equivalent, so this is simply inert
// (never fires) on a phone/tablet, no platform check needed. Same pattern
// as GuestTabButton/ReservationTabButton elsewhere in this app.
function FilterChip({ filter, active, onPress }) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !active;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.filterChip,
        active && { backgroundColor: filter.color, borderColor: filter.color },
        showHover && { borderColor: filter.color, backgroundColor: colors.cardAlt },
      ]}
    >
      <Ionicons name={filter.icon} size={14} color={active ? '#FFFFFF' : filter.color} />
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{filter.label}</Text>
    </Pressable>
  );
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function ReviewCard({ review }) {
  const isRoom = review.type === 'room';
  const typeColor = isRoom ? ROOM_COLOR : FOOD_COLOR;
  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  return (
    <View style={[styles.reviewCard, { borderLeftColor: typeColor }]}>
      <View style={styles.reviewTopRow}>
        {/* VISUAL: avatar bumped 36→42 with a thin ring in the review's own
            type color — same at-a-glance color coding the left border
            stripe and type badge already carry, and the same avatar-ring
            treatment Guest Records now uses for its own cards. */}
        {review.photo_url ? (
          <Image source={{ uri: review.photo_url }} style={[styles.avatarImage, { borderColor: typeColor }]} />
        ) : (
          <View style={[styles.avatarCircle, { borderColor: typeColor }]}>
            <Text style={styles.avatarText}>{initials(review.guest_name)}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={styles.reviewHeaderLine}>
            <Text style={styles.reviewSubject}>{review.subject_label || '—'}</Text>
            <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
              <Ionicons name={isRoom ? 'bed-outline' : 'restaurant-outline'} size={11} color="#FFFFFF" />
              <Text style={styles.typeBadgeText}>{isRoom ? 'Room Stay' : 'Food Order'}</Text>
            </View>
          </View>
          <Text style={styles.reviewMeta}>{review.guest_name} · {date}</Text>
        </View>

        {/* VISUAL: stars now sit in a small gold-tinted pill (same bg/text
            pairing the VIP badge in Guest Records uses) with the numeric
            rating alongside — same 1-decimal format as the "X.X / 5"
            averages above, so a single review's rating and the KPI
            averages read consistently. Still driven by the exact same
            review.rating value the stars themselves use. */}
        <View style={styles.ratingPill}>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons
                key={n}
                name={n <= review.rating ? 'star' : 'star-outline'}
                size={14}
                color={n <= review.rating ? STAR_COLOR : colors.disabled}
              />
            ))}
          </View>
          <Text style={styles.ratingPillText}>{Number(review.rating || 0).toFixed(1)}</Text>
        </View>
      </View>

      {!!review.comment && (
        <View style={styles.commentWrap}>
          <Ionicons name="chatbox-ellipses-outline" size={13} color={colors.textMuted} style={{ marginTop: 1 }} />
          <Text style={styles.reviewComment}>{review.comment}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  // Small shadow added so the badge lifts slightly off the page instead of
  // reading as a flat color square — same shadow recipe the review/KPI
  // cards below already use, just scaled down.
  headerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: STAR_COLOR,
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
  filterChipText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  filterChipTextActive: { color: '#FFFFFF' },
  // NEW: small "{n} reviews" readout next to the filter chips — same
  // subtitle convention Guest Records uses ("{n} guests"), reusing
  // visibleReviews.length rather than any new computation.
  resultCount: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    // Bumped sm→md for a bit more breathing room between cards, same
    // reasoning as the Guest Records card spacing pass.
    marginBottom: spacing.md,
    shadowColor: '#332B22',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  reviewTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // Bumped 36→42 with a 2px ring (color set inline per-card to the
  // review's own type color) — see the VISUAL note at this style's call
  // site above.
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

  reviewHeaderLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  reviewSubject: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  typeBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#FFFFFF' },
  reviewMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 3 },

  // NEW: gold-tinted pill wrapping the stars + numeric rating — same
  // bg/text pairing the VIP badge in Guest Records uses (#FFF4D6/#8A6D00),
  // reused here rather than inventing another one-off color.
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF4D6',
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  starsRow: { flexDirection: 'row', gap: 1 },
  ratingPillText: { fontSize: 12, fontFamily: fonts.headingBold, color: '#8A6D00' },

  commentWrap: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  reviewComment: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: 18,
  },
});
