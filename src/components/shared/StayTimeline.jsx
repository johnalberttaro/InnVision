import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fonts } from '../../utils/portalTheme';
import { getStayTimeline } from '../../utils/stayTimes';

/**
 * StayTimeline — a reservation's real timeline for staff screens:
 * Booked on → Stay dates → Checked in (date + time) → Checked out
 * (date + time). See utils/stayTimes.js for the rules.
 *
 * Props:
 *  - reservation: a reservations row (snake_case) or the camelCase shape
 *  - compact: smaller text, for list cards
 */
const TONE = {
  done:    { dot: '#1E7B34', value: colors.text },
  waiting: { dot: '#C99400', value: colors.textMuted },
  warn:    { dot: '#B3261E', value: '#B3261E' },
  muted:   { dot: colors.textMuted, value: colors.text },
};

export default function StayTimeline({ reservation, compact = false }) {
  const rows = getStayTimeline(reservation);
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {rows.map((row, i) => {
        const tone = TONE[row.tone] || TONE.muted;
        const last = i === rows.length - 1;
        return (
          <View key={row.key} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { borderColor: tone.dot }, row.tone === 'done' && { backgroundColor: tone.dot }]}>
                <Ionicons name={row.icon} size={compact ? 10 : 11} color={row.tone === 'done' ? '#FFFFFF' : tone.dot} />
              </View>
              {!last && <View style={styles.line} />}
            </View>
            <View style={[styles.body, !last && { paddingBottom: compact ? 8 : 10 }]}>
              <Text style={[styles.label, compact && styles.labelCompact]}>{row.label}</Text>
              <Text style={[styles.value, compact && styles.valueCompact, { color: tone.value }]}>{row.value}</Text>
              {!!row.note && <Text style={[styles.note, compact && styles.noteCompact]}>{row.note}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xs },
  row: { flexDirection: 'row', gap: 10 },
  rail: { alignItems: 'center', width: 20 },
  dot: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  line: { flex: 1, width: 1.5, backgroundColor: colors.border, marginVertical: 2 },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, letterSpacing: 0.3, textTransform: 'uppercase' },
  labelCompact: { fontSize: 10 },
  value: { fontSize: 13, fontFamily: fonts.bodySemiBold, marginTop: 1 },
  valueCompact: { fontSize: 12 },
  note: { fontSize: 11.5, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  noteCompact: { fontSize: 11 },
});
