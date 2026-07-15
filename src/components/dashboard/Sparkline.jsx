import React from 'react';
import Svg, { Polyline, Circle } from 'react-native-svg';

/**
 * Sparkline — tiny inline trend line for a KPI card.
 *
 * Props:
 *  - data: number[]        series of values, oldest -> newest (e.g. last 7 days)
 *  - color: string         stroke color
 *  - width, height: number
 */
export default function Sparkline({ data = [], color = '#332B22', width = 64, height = 24 }) {
  if (!data || data.length < 2) {
    return <Svg width={width} height={height} />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(' ');

  const lastX = (data.length - 1) * stepX;
  const lastY = height - ((data[data.length - 1] - min) / range) * (height - 4) - 2;

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={lastX} cy={lastY} r={2.25} fill={color} />
    </Svg>
  );
}