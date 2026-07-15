import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import Sparkline from './Sparkline';

/**
 * KpiCard — a single dashboard KPI tile.
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
        style: ({ pressed }) => [styles.card, pressed && styles.cardPressed],
      }
    : { style: styles.card };

  return (
    <Wrapper {...wrapperProps}>
      <View style={styles.topRow}>
        <View style={[styles.iconBadge, { backgroundColor: `${accent}1A` }]}>
          <Ionicons name={icon} size={18} color={accent} />
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

      <View style={styles.bottomRow}>
        {trend ? (
          <View style={styles.trendPill}>
            <Ionicons name={trendIcon} size={12} color={trendColor} />
            <Text style={[styles.trendText, { color: trendColor }]}>{trend.deltaLabel}</Text>
          </View>
        ) : note ? (
          <Text style={styles.note}>{note}</Text>
        ) : null}
        {onPress && <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />}
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
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    shadowColor: '#332B22',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    position: 'relative',
  },
  cardPressed: { opacity: 0.85 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBadge: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
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
  value: { fontSize: 22, fontFamily: fonts.headingExtraBold },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, minHeight: 18 },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trendText: { fontSize: 11, fontFamily: fonts.bodySemiBold },
  note: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted },
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