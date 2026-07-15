import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { fonts } from '../../utils/theme';

/**
 * OccupancyGauge — semicircular gauge showing occupied / total rooms.
 *
 * Props:
 *  - percent: number (0-100)
 *  - occupied: number
 *  - total: number
 *  - color: string        active arc color
 *  - trackColor: string   background arc color
 *  - size: number         overall width; height is size/2 + a bit for the label
 */
export default function OccupancyGauge({ percent = 0, occupied = 0, total = 0, color = '#332B22', trackColor = '#E2D6C1', size = 92 }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;

  const describeArc = (fraction) => {
    // Semicircle from angle 180deg (left) to 0deg (right), sweeping through the top.
    const startAngle = Math.PI; // 180deg
    const endAngle = Math.PI - Math.PI * fraction; // sweeps clockwise toward 0deg
    const startX = cx + r * Math.cos(startAngle);
    const startY = cy + r * Math.sin(startAngle);
    const endX = cx + r * Math.cos(endAngle);
    const endY = cy + r * Math.sin(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;
    return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
  };

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size / 2 + 10}>
        <Path d={describeArc(1)} stroke={trackColor} strokeWidth={8} fill="none" strokeLinecap="round" />
        {clamped > 0 && (
          <Path d={describeArc(clamped / 100)} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" />
        )}
      </Svg>
      <Text style={[styles.percentLabel, { color }]}>{total > 0 ? `${Math.round(clamped)}%` : '—'}</Text>
      <Text style={styles.subLabel}>{total > 0 ? `${occupied} of ${total} rooms` : 'Needs room inventory data'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  percentLabel: { fontSize: 20, fontFamily: fonts.headingExtraBold, marginTop: -6 },
  subLabel: { fontSize: 10, fontFamily: fonts.body, color: '#8A7C64', marginTop: 2 },
});