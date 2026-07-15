import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { colors, fonts, spacing } from '../../utils/theme';

const CHART_HEIGHT = 160;
const BAR_GROUP_GAP = 10;

/**
 * ReservationsTrendChart — grouped bar chart, upcoming vs pending, per day
 * for the last 7 days (by createdAt).
 *
 * Props:
 *  - days: Array<{ label: string, upcoming: number, pending: number }>
 */
export default function ReservationsTrendChart({ days = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const width = Math.max(280, days.length * 56);
  const maxVal = Math.max(1, ...days.map((d) => Math.max(d.upcoming, d.pending)));
  const groupWidth = width / days.length;
  const barWidth = (groupWidth - BAR_GROUP_GAP) / 2 - 4;

  return (
    <View>
      <View style={styles.legendRow}>
        <LegendDot color={colors.primary} label="Upcoming" />
        <LegendDot color={colors.stepDone || '#6B5F4C'} label="Pending" />
      </View>

      <Svg width={width} height={CHART_HEIGHT}>
        <Line x1={0} y1={CHART_HEIGHT - 20} x2={width} y2={CHART_HEIGHT - 20} stroke={colors.border} strokeWidth={1} />
        {days.map((d, i) => {
          const groupX = i * groupWidth + 6;
          const upcomingH = (d.upcoming / maxVal) * (CHART_HEIGHT - 36);
          const pendingH = (d.pending / maxVal) * (CHART_HEIGHT - 36);
          return (
            <React.Fragment key={i}>
              <Rect
                x={groupX}
                y={CHART_HEIGHT - 20 - upcomingH}
                width={barWidth}
                height={upcomingH}
                rx={3}
                fill={colors.primary}
                opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.35}
              />
              <Rect
                x={groupX + barWidth + 4}
                y={CHART_HEIGHT - 20 - pendingH}
                width={barWidth}
                height={pendingH}
                rx={3}
                fill={colors.stepDone || '#6B5F4C'}
                opacity={hoverIndex === null || hoverIndex === i ? 1 : 0.35}
              />
              <SvgText
                x={groupX + groupWidth / 2 - 6}
                y={CHART_HEIGHT - 6}
                fontSize={10}
                fill={colors.textMuted}
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>

      {/* Tap targets overlay for tooltips (kept as separate Pressable row
          since RN SVG doesn't handle per-shape touch events well across
          platforms). Works with tap on touch devices and hover on web. */}
      <View style={[styles.hitRow, { width }]}>
        {days.map((d, i) => (
          <Pressable
            key={i}
            style={{ width: groupWidth }}
            onPress={() => setHoverIndex(hoverIndex === i ? null : i)}
            onHoverIn={() => setHoverIndex(i)}
            onHoverOut={() => setHoverIndex(null)}
          />
        ))}
      </View>

      {hoverIndex !== null && days[hoverIndex] && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{days[hoverIndex].label}</Text>
          <Text style={styles.tooltipLine}>Upcoming: {days[hoverIndex].upcoming}</Text>
          <Text style={styles.tooltipLine}>Pending: {days[hoverIndex].pending}</Text>
        </View>
      )}
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  hitRow: { flexDirection: 'row', marginTop: -CHART_HEIGHT, height: CHART_HEIGHT },
  tooltip: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tooltipTitle: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.white, marginBottom: 2 },
  tooltipLine: { fontSize: 10, fontFamily: fonts.body, color: 'rgba(255,255,255,0.85)' },
});