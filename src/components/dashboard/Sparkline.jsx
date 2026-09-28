import React, { useId } from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

/**
 * Sparkline — small trend-area chart for a KPI card (e.g. last 7 days).
 *
 * REDESIGNED from a bare thin polyline into a smoothed, gradient-filled
 * area + line, to match the "This Week's Performance" reference design
 * (InnVision Graph redesign): a soft area fill under a rounded 2px line,
 * with the latest point marked. Three concrete changes from the old
 * version:
 *  1. Smoothing — each segment curves through the midpoint of its two
 *     endpoints (a quadratic-through-midpoints technique), so a flat
 *     run stays flat and peaks/valleys round off instead of the old
 *     sharp-cornered zig-zag. No charting library needed for this.
 *  2. A gradient area fill under the line (accent color fading to
 *     transparent), instead of a bare line with nothing beneath it —
 *     this is what made the old version read as "sparse."
 *  3. A larger default size (was a tiny 64x24 shown squeezed beside the
 *     value text; now a full-width block under the value + trend badge,
 *     per KpiCard's updated layout), with a 2px rounded-cap line and a
 *     ringed end-point dot so the latest value is easy to spot.
 *
 * The gradient's id includes a per-instance React id (useId) so two
 * sparklines on screen at once — even ones that happen to share the
 * same accent color — never collide. That matters here specifically
 * because this app also builds for web (react-native-web via
 * `npm run build:web`), where SVG gradient ids are resolved against a
 * single shared document, unlike native where each <Svg> is isolated.
 *
 * Props:
 *  - data: number[]        series of values, oldest -> newest (e.g. last 7 days)
 *  - color: string         stroke/fill color (the KPI card's own accent)
 *  - width, height: number
 */
export default function Sparkline({ data = [], color = '#1A1A1E', width = 180, height = 44 }) {
  const reactId = useId();

  if (!data || data.length < 2) {
    return <Svg width={width} height={height} />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const padY = 4; // keeps the line and end dot off the very top/bottom edge

  const points = data.map((v, i) => ({
    x: i * stepX,
    y: padY + (height - padY * 2) * (1 - (v - min) / range),
  }));

  let linePath = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    linePath += ` Q ${p0.x},${p0.y} ${midX},${midY}`;
  }
  const last = points[points.length - 1];
  linePath += ` L ${last.x},${last.y}`;

  const areaPath = `${linePath} L ${last.x},${height} L ${points[0].x},${height} Z`;
  const gradientId = `spark-fill-${reactId.replace(/:/g, '')}`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <Path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={3} fill={color} stroke="#FFFFFF" strokeWidth={1.5} />
    </Svg>
  );
}