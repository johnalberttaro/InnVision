import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import Sparkline from './Sparkline';

/**
 * KpiCard — a single dashboard KPI tile.
 *
 * REDESIGNED for "visually appealing, easy to interpret at a glance,
 * more actionable" — three concrete changes from the previous version:
 *  1. A colored left accent stripe (using the card's own `accent` color)
 *     so cards are visually distinguishable by category at a glance,
 *     not just by reading the label text.
 *  2. Icon badge is now a solid-color circle with a white icon, instead
 *     of a small icon on a ~10%-opacity tinted background — much more
 *     visible/recognizable when scanning quickly.
 *  3. Clickable cards now say "View details" next to the chevron
 *     instead of a bare chevron alone — the old version's actionability
 *     (that tapping a card drills down) was easy to miss entirely.
 *
 * Props:
 *  - icon: string (Ionicons name)
 *  - label, value: string
 *  - accent: string           color used for icon badge, value text, sparkline
 *  - note: string             optional small caption
 *  - trend: { direction: 'up'|'down'|'flat', deltaLabel: string } | null
 *  - sparklineData: number[]  optional, omit to hide
 *  - tooltip: string          optional hover/tap tooltip text
 *  - onPress: () => void      optional; makes the card clickable (drill-down)
 *  - customVisual: ReactNode  optional, replaces the value+sparkline row entirely (used for the occupancy gauge)
 */
export default function KpiCard({ icon, label, value, accent, note, trend, sparklineData, tooltip, onPress, customVisual }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const trendColor = trend?.direction === 'up' ? '#1E7B34' : trend?.direction === 'down' ? '#B3261E' : colors.textMuted;
  const trendIcon = trend?.direction === 'up' ? 'trending-up' : trend?.direction === 'down' ? 'trending-down' : 'remove';

  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? {
        onPress,
        onHoverIn: () => setShowTooltip(true),
        onHoverOut: () => setShowTooltip(false),
        style: ({ pressed }) => [styles.card, { borderLeftColor: accent }, pressed && styles.cardPressed],
      }
    : { style: [styles.card, { borderLeftColor: accent }] };

  return (
    <Wrapper {...wrapperProps}>
      <View style={styles.topContent}>
        <View style={styles.topRow}>
          <View style={[styles.iconBadge, { backgroundColor: accent }]}>
            <Ionicons name={icon} size={20} color={colors.white} />
          </View>
          {tooltip && (
            <Pressable
              onHoverIn={() => setShowTooltip(true)}
              onHoverOut={() => setShowTooltip(false)}
              onPress={() => setShowTooltip((s) => !s)}
              hitSlop={8}
            >
              <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <Text style={styles.label}>{label}</Text>

        {customVisual ? (
          customVisual
        ) : (
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: accent }]}>{value}</Text>
            {sparklineData && sparklineData.length > 1 && (
              <Sparkline data={sparklineData} color={accent} />
            )}
          </View>
        )}
      </View>

      <View style={styles.bottomRow}>
        {trend ? (
          <View style={styles.trendPill}>
            <Ionicons name={trendIcon} size={12} color={trendColor} />
            <Text style={[styles.trendText, { color: trendColor }]}>{trend.deltaLabel}</Text>
          </View>
        ) : note ? (
          <Text style={styles.note}>{note}</Text>
        ) : (
          <View />
        )}
        {onPress && (
          <View style={styles.viewDetailsWrap}>
            <Text style={styles.viewDetailsText}>View details</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.primary} />
          </View>
        )}
      </View>

      {showTooltip && tooltip && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{tooltip}</Text>
        </View>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 216,
    // A fixed floor height (tall enough to comfortably fit the occupancy
    // ring, the tallest content any card renders) plus justifyContent
    // below is what actually solves the alignment problem — a numeric
    // KPI card's content (icon/label/value) is much shorter than the
    // gauge card's, so without both of these, "View details" would sit
    // right after whatever's above it instead of at a consistent spot.
    minHeight: 224,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4, // color set inline per-card via the `accent` prop
    padding: spacing.lg,
    // Pushes bottomRow (the trend/note + "View details" row) all the way
    // to the bottom of the card, flush against minHeight above, instead
    // of it just trailing directly after the value/gauge content.
    justifyContent: 'space-between',
    shadowColor: '#332B22',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    position: 'relative',
  },
  cardPressed: { opacity: 0.85 },
  topContent: {},
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBadge: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  label: {
    fontSize: 11,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm,
    marginBottom: 6,
  },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  value: { fontSize: 30, fontFamily: fonts.headingExtraBold },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, minHeight: 18 },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trendText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
  note: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted },
  viewDetailsWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewDetailsText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.primary },
  tooltip: {
    position: 'absolute',
    top: -8,
    left: spacing.lg,
    right: spacing.lg,
    transform: [{ translateY: -36 }],
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 8,
    zIndex: 10,
  },
  tooltipText: { fontSize: 10, fontFamily: fonts.body, color: colors.white, lineHeight: 14 },
});