import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { fetchAllReviews, averageRating } from '../../utils/ReviewsService';

/**
 * GuestRatingsScreen — staff-facing viewer for the guest ratings guests
 * submit after checkout (room) and after a food order is delivered
 * (food). Shared between Admin (routed as reports:ratings, under Reports
 * & Analytics) and Front Desk (routed as guests:ratings, under Guest
 * Management) — same file, no admin-only actions in it, so no reason to
 * fork it into two screens. This redesign applies to both places it's
 * used, same as every earlier version of this screen has.
 *
 * 2026-10-02 REDESIGN: reworked to match a reference mockup the user
 * provided, scoped deliberately to just this screen's own content —
 * the surrounding sidebar/top bar (notifications, weather, date) were
 * explicitly left untouched per the user's own call, since those are
 * shared app chrome, not part of "the ratings screen" itself.
 *
 * What changed from the previous version:
 *  - KPI cards restyled as pastel "stat cards" (StatCard below) instead
 *    of KpiCard.jsx's white-card/left-border style. Built as a LOCAL
 *    component rather than changing KpiCard.jsx itself, so every other
 *    dashboard that uses the shared KpiCard (Revenue Report, Front Desk
 *    dashboard, etc.) is completely unaffected by this redesign.
 *  - Room/Food/Total cards are now tappable (they already carried a
 *    chevron hinting at this before, but never did anything) — tapping
 *    one jumps the type tabs to that category, Total resets to All.
 *  - New Rating Overview panel: a real distribution of the currently
 *    visible reviews by star count (1–5), each row clickable to filter
 *    the list to that star rating — same filter a guest's search can
 *    also narrow down to below.
 *  - New search box (guest name / room / comment text) and a Filter
 *    control offering the same star-rating filter as the distribution
 *    panel, kept in sync via one shared ratingFilter value. The Filter
 *    control opens as a plain panel in the page flow rather than a
 *    floating popover — simpler and more reliable than measuring and
 *    positioning an overlay, at the cost of a little visual polish.
 *  - Review cards now lead with the guest's name plus their room number
 *    (parsed from the existing subject_label text — see
 *    parseRoomSubject/parseFoodSubject below — no new data or column
 *    needed) instead of the room type as the heading, matching the
 *    mockup's "Name (Room #)" convention.
 *  - The mockup's per-card "···" overflow menu was deliberately left
 *    out: there's no review-moderation action anywhere in this app yet
 *    (delete, flag, respond) for it to open, and this codebase has
 *    consistently avoided shipping controls that don't do anything yet
 *    (see e.g. the Promos menu item, the 2FA toggle's honest "coming
 *    soon"). Worth adding for real once there's an action behind it.
 *
 * Averages/counts on the three stat cards are still computed from the
 * full, unfiltered review set (same as before) — they're headline
 * totals, not "what's currently visible," so search/type/rating
 * filters never move them.
 *
 * VISUAL DESIGN: still intentionally breaking from the portal's usual
 * monochrome palette with real color — teal for room stays, amber for
 * food orders, gold for stars, purple for the "Total" card — now
 * additionally used as soft pastel tints (via hexToRgba) for the stat
 * cards' backgrounds and icon circles, matching the mockup's softer
 * look.
 */
const ROOM_COLOR = '#2E7D96'; // teal-blue
const FOOD_COLOR = '#D97706'; // amber
const STAR_COLOR = '#F5B400'; // gold
const TOTAL_COLOR = '#6B46C1'; // purple

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// "Deluxe Suite (203)" -> { typeText: 'Deluxe Suite', roomNumber: '203' }
// (see MyReservationsScreen.jsx's submitRoomReview call for the exact
// format this parses — `${roomType} (${roomLabel})`)
function parseRoomSubject(label) {
  if (!label) return { typeText: '', roomNumber: null };
  const match = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (match) return { typeText: match[1].trim(), roomNumber: match[2].trim() };
  return { typeText: label, roomNumber: null };
}

// "Order — Room 102" -> '102' (see OrderFoodScreen.jsx's submitFoodReview call)
function parseFoodRoomNumber(label) {
  if (!label) return null;
  const match = label.match(/Room\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

const RATING_FILTER_OPTIONS = [
  { key: 'all', label: 'All Ratings' },
  { key: 5, label: '5 Stars' },
  { key: 4, label: '4 Stars' },
  { key: 3, label: '3 Stars' },
  { key: 2, label: '2 Stars' },
  { key: 1, label: '1 Star' },
];

export default function GuestRatingsScreen() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'room' | 'food'
  const [ratingFilter, setRatingFilter] = useState('all'); // 'all' | 1 | 2 | 3 | 4 | 5
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

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

  // Headline stats — always computed from the full, unfiltered set.
  const roomReviews = useMemo(() => reviews.filter((r) => r.type === 'room'), [reviews]);
  const foodReviews = useMemo(() => reviews.filter((r) => r.type === 'food'), [reviews]);
  const roomAvg = averageRating(roomReviews);
  const foodAvg = averageRating(foodReviews);

  // Narrowed by type + search, but NOT by ratingFilter — this is what
  // the distribution panel's bars are computed from, so every bar stays
  // visible (and clickable) no matter which one is currently active.
  const distributionSource = useMemo(() => {
    let list = typeFilter === 'all' ? reviews : reviews.filter((r) => r.type === typeFilter);
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter((r) => {
        const haystack = [r.guest_name, r.subject_label, r.comment].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(term);
      });
    }
    return list;
  }, [reviews, typeFilter, searchTerm]);

  const ratingCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    distributionSource.forEach((r) => {
      if (counts[r.rating] !== undefined) counts[r.rating] += 1;
    });
    return counts;
  }, [distributionSource]);

  const visibleReviews = useMemo(() => {
    if (ratingFilter === 'all') return distributionSource;
    return distributionSource.filter((r) => r.rating === ratingFilter);
  }, [distributionSource, ratingFilter]);

  const activeRatingLabel = RATING_FILTER_OPTIONS.find((o) => o.key === ratingFilter)?.label;

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
          <Text style={styles.subtitle}>View and manage feedback from room stays and food orders.</Text>
        </View>
        <View style={styles.reviewsPill}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.text} />
          <Text style={styles.reviewsPillText}>
            {reviews.length} Review{reviews.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color="#B3261E" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatCard
          icon="bed-outline"
          label="Room Rating"
          value={roomAvg != null ? `${roomAvg.toFixed(1)} / 5` : '—'}
          note={`${roomReviews.length} rating${roomReviews.length !== 1 ? 's' : ''}`}
          tint={ROOM_COLOR}
          onPress={() => setTypeFilter('room')}
        />
        <StatCard
          icon="restaurant-outline"
          label="Food Rating"
          value={foodAvg != null ? `${foodAvg.toFixed(1)} / 5` : '—'}
          note={`${foodReviews.length} rating${foodReviews.length !== 1 ? 's' : ''}`}
          tint={FOOD_COLOR}
          onPress={() => setTypeFilter('food')}
        />
        <StatCard
          icon="chatbubbles-outline"
          label="Total Reviews"
          value={String(reviews.length)}
          note="Room + Food combined"
          tint={TOTAL_COLOR}
          onPress={() => setTypeFilter('all')}
        />
        <RatingDistribution counts={ratingCounts} activeRating={ratingFilter} onSelectRating={setRatingFilter} />
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.typeTabsWrap}>
          <TypeTab label="All Reviews" icon="apps-outline" active={typeFilter === 'all'} onPress={() => setTypeFilter('all')} />
          <TypeTab label="Room Stays" icon="bed-outline" active={typeFilter === 'room'} onPress={() => setTypeFilter('room')} />
          <TypeTab label="Food Orders" icon="restaurant-outline" active={typeFilter === 'food'} onPress={() => setTypeFilter('food')} />
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search guest, room, or review..."
            placeholderTextColor={colors.textMuted}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {!!searchTerm && (
            <Pressable onPress={() => setSearchTerm('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.filterButton, ratingFilter !== 'all' && styles.filterButtonActive]}
          onPress={() => setFilterOpen((o) => !o)}
        >
          <Ionicons name="filter-outline" size={14} color={ratingFilter !== 'all' ? '#FFFFFF' : colors.text} />
          <Text style={[styles.filterButtonText, ratingFilter !== 'all' && styles.filterButtonTextActive]}>
            {ratingFilter === 'all' ? 'Filter' : activeRatingLabel}
          </Text>
          <Ionicons name={filterOpen ? 'chevron-up' : 'chevron-down'} size={14} color={ratingFilter !== 'all' ? '#FFFFFF' : colors.text} />
        </Pressable>
      </View>

      {filterOpen && (
        <View style={styles.filterPanel}>
          {RATING_FILTER_OPTIONS.map((o) => (
            <Pressable
              key={o.key}
              style={[styles.filterOption, ratingFilter === o.key && styles.filterOptionActive]}
              onPress={() => {
                setRatingFilter(o.key);
                setFilterOpen(false);
              }}
            >
              <Text style={[styles.filterOptionText, ratingFilter === o.key && styles.filterOptionTextActive]}>{o.label}</Text>
              {ratingFilter === o.key && <Ionicons name="checkmark" size={14} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.resultCount}>
        {visibleReviews.length} review{visibleReviews.length !== 1 ? 's' : ''}
      </Text>

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

// Pastel stat card — local to this screen (see header comment for why
// this isn't just a new mode on the shared KpiCard).
function StatCard({ icon, label, value, note, tint, onPress }) {
  const content = (
    <>
      <View style={styles.statTopRow}>
        <View style={styles.statTopLeft}>
          <View style={[styles.statIconCircle, { backgroundColor: hexToRgba(tint, 0.18) }]}>
            <Ionicons name={icon} size={16} color={tint} />
          </View>
          <Text style={styles.statLabel}>{label}</Text>
        </View>
        {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {!!note && <Text style={styles.statNote}>{note}</Text>}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.statCard, { backgroundColor: hexToRgba(tint, 0.08) }, pressed && styles.statCardPressed]}
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.statCard, { backgroundColor: hexToRgba(tint, 0.08) }]}>{content}</View>;
}

// Rating-distribution panel — counts within distributionSource (type +
// search applied, rating filter NOT applied, so every bar stays
// clickable). Clicking an already-active row clears back to 'all'.
function RatingDistribution({ counts, activeRating, onSelectRating }) {
  const max = Math.max(1, counts[1], counts[2], counts[3], counts[4], counts[5]);
  const total = counts[1] + counts[2] + counts[3] + counts[4] + counts[5];
  return (
    <View style={styles.distPanel}>
      <Text style={styles.distTitle}>Rating Overview</Text>
      {[5, 4, 3, 2, 1].map((n) => {
        const count = counts[n] || 0;
        // barPct sizes the bar itself (relative to whichever star level
        // has the most reviews, so the busiest row is always full-width).
        const barPct = Math.round((count / max) * 100);
        // sharePct is the extra column the mockup shows next to the
        // label — that mockup just repeats the star value as a decimal
        // (e.g. "4 ★ 4.0"), which isn't a real metric, so this shows
        // this row's actual share of total reviews instead.
        const sharePct = total > 0 ? Math.round((count / total) * 100) : 0;
        const active = activeRating === n;
        return (
          <Pressable
            key={n}
            onPress={() => onSelectRating(active ? 'all' : n)}
            style={[styles.distRow, active && styles.distRowActive]}
          >
            <View style={styles.distLabel}>
              <Text style={styles.distLabelText}>{n}</Text>
              <Ionicons name="star" size={11} color={STAR_COLOR} />
            </View>
            <Text style={styles.distPercent}>{sharePct}%</Text>
            <View style={styles.distBarTrack}>
              <View style={[styles.distBarFill, { width: `${barPct}%` }]} />
            </View>
            <Text style={styles.distCount}>{count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Pressable (not TouchableOpacity) specifically so the hover state below
// works — react-native-web fires onHoverIn/onHoverOut on Pressable for a
// mouse pointer; there's no touch equivalent, so this is simply inert
// (never fires) on a phone/tablet, no platform check needed.
function TypeTab({ label, icon, active, onPress }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.typeTab, active && styles.typeTabActive, hovered && !active && styles.typeTabHover]}
    >
      <Ionicons name={icon} size={14} color={active ? '#FFFFFF' : colors.text} />
      <Text style={[styles.typeTabText, active && styles.typeTabTextActive]}>{label}</Text>
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

  const roomInfo = isRoom ? parseRoomSubject(review.subject_label) : null;
  const roomNumber = isRoom ? roomInfo.roomNumber : parseFoodRoomNumber(review.subject_label);
  const subline = isRoom ? roomInfo.typeText || 'Room Stay' : roomNumber ? `Room ${roomNumber}` : review.subject_label || '—';

  return (
    <View style={[styles.reviewCard, { borderLeftColor: typeColor }]}>
      <View style={styles.reviewTopRow}>
        {review.photo_url ? (
          <Image source={{ uri: review.photo_url }} style={[styles.avatarImage, { borderColor: typeColor }]} />
        ) : (
          <View style={[styles.avatarCircle, { borderColor: typeColor }]}>
            <Text style={styles.avatarText}>{initials(review.guest_name)}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <View style={styles.reviewHeaderLine}>
            <Text style={styles.reviewSubject}>
              {review.guest_name}
              {roomNumber ? <Text style={styles.reviewRoomNumber}> ({roomNumber})</Text> : null}
            </Text>
            <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
              <Ionicons name={isRoom ? 'bed-outline' : 'restaurant-outline'} size={11} color="#FFFFFF" />
              <Text style={styles.typeBadgeText}>{isRoom ? 'Room Stay' : 'Food Order'}</Text>
            </View>
          </View>
          <View style={styles.reviewMetaRow}>
            <Ionicons name={isRoom ? 'bed-outline' : 'restaurant-outline'} size={11} color={colors.textMuted} />
            <Text style={styles.reviewMeta}>{subline} · {date}</Text>
          </View>
        </View>

        <View style={styles.starsWrap}>
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
          <Text style={styles.starsValue}>{Number(review.rating || 0).toFixed(1)}</Text>
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

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg, flexWrap: 'wrap' },
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
  reviewsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  reviewsPillText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },

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

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },

  // ── Stat cards ──────────────────────────────────────────────────
  statCard: {
    width: 220,
    minHeight: 128,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statCardPressed: { opacity: 0.85 },
  statTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statTopLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  statIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text, flexShrink: 1 },
  statValue: { fontSize: 26, fontFamily: fonts.headingExtraBold, color: colors.text },
  statNote: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  // ── Rating distribution panel ──────────────────────────────────
  distPanel: {
    width: 420,
    marginLeft: 'auto',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  distTitle: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Without this, the row shrink-wraps to its own content (label +
    // bar + count) instead of filling the panel's width, leaving the
    // bar looking squashed into a sliver on the left with dead white
    // space to its right. alignSelf: 'stretch' forces it to take the
    // panel's full width regardless of what its content measures to.
    alignSelf: 'stretch',
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
  },
  distRowActive: { backgroundColor: 'rgba(245,180,0,0.12)' },
  distLabel: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 22 },
  distLabelText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  distPercent: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, width: 34 },
  // minWidth: 0 stops the track's flex:1 from being blocked by its own
  // content's intrinsic size — same fix as searchInput below.
  distBarTrack: { flex: 1, minWidth: 0, height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  distBarFill: { height: 8, borderRadius: 4, backgroundColor: STAR_COLOR },
  distCount: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, width: 20, textAlign: 'right' },

  // ── Controls row: type tabs + search + filter ──────────────────
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  typeTabsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeTab: {
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
  typeTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeTabHover: { borderColor: colors.primary, backgroundColor: colors.cardAlt },
  typeTabText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  typeTabTextActive: { color: '#FFFFFF' },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: 260,
    marginLeft: 'auto',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  // minWidth: 0 is the fix here — a bare TextInput's intrinsic content
  // width otherwise blocks flex: 1 from actually growing it to fill the
  // search box, which is what left that empty bordered gap next to it.
  searchInput: { flex: 1, minWidth: 0, fontSize: 12, fontFamily: fonts.body, color: colors.text, padding: 0 },

  filterButton: {
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
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterButtonText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.text },
  filterButtonTextActive: { color: '#FFFFFF' },

  filterPanel: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterOptionActive: { backgroundColor: colors.cardAlt },
  filterOptionText: { fontSize: 12, fontFamily: fonts.body, color: colors.text },
  filterOptionTextActive: { fontFamily: fonts.bodySemiBold },

  resultCount: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  reviewCard: {
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
  reviewTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
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
  reviewRoomNumber: { fontFamily: fonts.body, color: colors.textMuted },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  typeBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#FFFFFF' },
  reviewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  reviewMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },

  starsWrap: { alignItems: 'flex-end', gap: 2 },
  starsRow: { flexDirection: 'row', gap: 1 },
  starsValue: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.text },

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