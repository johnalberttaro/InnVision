import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, colors, spacing } from '../../utils/portalTheme';

/**
 * FnbOrdersDonut — two-segment ring showing today's Delivered vs
 * Cancelled split, for FnbDashboardScreen.jsx's "Orders Overview".
 *
 * Same multi-Circle SVG technique OccupancyGauge.jsx already uses for
 * its single-value progress ring (stroke-dasharray/offset math),
 * extended here to draw two segments around the same ring instead of
 * one — each segment's dashoffset is shifted by the cumulative length
 * of whatever was drawn before it, so they sit back-to-back rather
 * than overlapping.
 *
 * Deliberately doesn't include "Preparing" / "Out for Delivery" as
 * segments — this chart is about how today's orders RESOLVED, not
 * where they currently sit in the active workflow (that's what the
 * Kitchen Orders board itself already shows).
 *
 * Props:
 *  - delivered: number  count of delivered orders today
 *  - cancelled: number  count of cancelled orders today
 *  - size: number       ring diameter
 */
export default function FnbOrdersDonut({ delivered = 0, cancelled = 0, size = 160 }) {
  const total = delivered + cancelled;
  const strokeWidth = 22;
  const r = size / 2 - strokeWidth / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const deliveredPct = total > 0 ? (delivered / total) * 100 : 0;
  const cancelledPct = total > 0 ? (cancelled / total) * 100 : 0;
  const deliveredLength = circumference * (deliveredPct / 100);
  const cancelledLength = circumference * (cancelledPct / 100);

  const DELIVERED_COLOR = '#1E7B34';
  const CANCELLED_COLOR = '#B3261E';
  const TRACK_COLOR = '#E2D6C1';

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke={TRACK_COLOR} strokeWidth={strokeWidth} fill="none" />
          {total === 0 ? null : (
            <>
              {delivered > 0 && (
                <Circle
                  cx={cx} cy={cy} r={r}
                  stroke={DELIVERED_COLOR} strokeWidth={strokeWidth} fill="none"
                  strokeDasharray={`${deliveredLength} ${circumference}`}
                  strokeDashoffset={0}
                  rotation={-90} origin={`${cx}, ${cy}`}
                />
              )}
              {cancelled > 0 && (
                <Circle
                  cx={cx} cy={cy} r={r}
                  stroke={CANCELLED_COLOR} strokeWidth={strokeWidth} fill="none"
                  strokeDasharray={`${cancelledLength} ${circumference}`}
                  // Shifted back by however much the delivered segment
                  // already used, so this one picks up right where that
                  // one ended instead of drawing from 12 o'clock again.
                  strokeDashoffset={-deliveredLength}
                  rotation={-90} origin={`${cx}, ${cy}`}
                />
              )}
            </>
          )}
        </Svg>
        <View style={styles.centerLabel} pointerEvents="none">
          <Text style={styles.totalLabel}>{total}</Text>
          <Text style={styles.totalSubLabel}>{total === 1 ? 'order' : 'orders'}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: DELIVERED_COLOR }]} />
          <Text style={styles.legendText}>Delivered: {total > 0 ? Math.round(deliveredPct) : 0}%</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: CANCELLED_COLOR }]} />
          <Text style={styles.legendText}>Cancelled: {total > 0 ? Math.round(cancelledPct) : 0}%</Text>
        </View>
      </View>
      <Text style={styles.footnote}>Showing orders for today</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  centerLabel: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  totalLabel: { fontSize: 26, fontFamily: fonts.headingExtraBold, color: colors.primary },
  totalSubLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: '#8A7C64', marginTop: 1 },

  legend: { marginTop: spacing.md, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { fontSize: 12.5, fontFamily: fonts.bodyMedium, color: colors.text },

  footnote: { fontSize: 10.5, fontFamily: fonts.body, color: colors.disabled, marginTop: spacing.sm },
});