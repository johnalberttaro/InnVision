import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fonts } from '../../utils/theme';

/**
 * DashboardFooter — shared bottom bar for FrontDeskShell.jsx and
 * AdminShell.jsx. Kept deliberately minimal — this sits below dense
 * data screens (tables, KPI grids), so it shouldn't compete for
 * attention. Just a copyright line, consistent with the hotel name
 * used elsewhere (ContactUsScreen.jsx's HOTEL_INFO).
 */
export default function DashboardFooter() {
  const year = new Date().getFullYear();
  return (
    <View style={styles.bar}>
      <Text style={styles.text}>© {year} InnVision Training Hotel — Consolatrix College of Toledo City, Inc.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  text: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
});