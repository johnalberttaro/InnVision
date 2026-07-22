import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, colors, spacing } from '../../utils/theme';

/**
 * OccupancyGauge — full circular progress ring showing occupied / total
 * rooms, with the percentage and room count both inside the ring.
 *
 * REDESIGNED from a semicircular arc to a full circle — a full ring is a
 * more universally understood "at a glance" pattern (the same mental
 * model as an Apple Watch activity ring or a Fitbit goal ring: full
 * circle = 100%, and how far around it's filled reads instantly without
 * needing to read the number). It also uses the available square space
 * in the KPI card better than a semicircle did, so everything can render
 * larger.
 *
 * Also new: the ring's color now shifts automatically based on how full
 * the hotel actually is, instead of always being one fixed brand color —
 * this is what makes it "actionable" rather than just decorative. Front
 * desk can read the SITUATION at a glance, not just the number:
 *   - Under 50% occupied  -> calm green  ("plenty of availability")
 *   - 50-79% occupied     -> steady charcoal/brand color ("normal")
 *   - 80%+ occupied       -> amber       ("getting full, plan ahead")
 * A `color` prop is still accepted for a fixed override if you ever want
 * one, but the default (recommended) behavior is auto-thresholded.
 *
 * Props:
 *  - percent: number (0-100)
 *  - occupied: number
 *  - total: number
 *  - color: string | null   optional FIXED override; omit to use the
 *                            auto occupancy-level color described above
 *  - trackColor: string     background ring color
 *  - size: number           overall diameter of the ring
 */
export default function OccupancyGauge({
  percent = 0,
  occupied = 0,
  total = 0,
  color = null,
  trackColor = '#E2D6C1',
  size = 108,
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  const levelColor =
    color ||
    (clamped >= 80 ? '#B36B00' /* amber — getting full */
      : clamped >= 50 ? colors.primary /* steady, normal operation */
      : '#1E7B34' /* green — plenty of availability */);

  const levelLabel =
    clamped >= 80 ? 'Nearly full'
      : clamped >= 50 ? 'Steady'
      : total > 0 ? 'Plenty of rooms'
      : '';

  const strokeWidth = 10;
  const r = size / 2 - strokeWidth / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = circumference * (clamped / 100);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Track — the full, unfilled ring */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress — starts at 12 o'clock (rotated -90deg) and sweeps
              clockwise, the standard reading direction for a progress ring */}
          {clamped > 0 && (
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke={levelColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              strokeDashoffset={0}
              rotation={-90}
              origin={`${cx}, ${cy}`}
            />
          )}
        </Svg>
        {/* Percentage + room count, centered inside the ring */}
        <View style={styles.centerLabel} pointerEvents="none">
          <Text style={[styles.percentLabel, { color: levelColor }]}>
            {total > 0 ? `${Math.round(clamped)}%` : '—'}
          </Text>
          <Text style={styles.roomsLabel}>{total > 0 ? `${occupied}/${total}` : 'No data'}</Text>
        </View>
      </View>
      {!!levelLabel && (
        <Text style={[styles.statusLabel, { color: levelColor }]}>{levelLabel}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  centerLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentLabel: { fontSize: 24, fontFamily: fonts.headingExtraBold },
  roomsLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: '#8A7C64', marginTop: 1 },
  statusLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, marginTop: spacing.xs },
});