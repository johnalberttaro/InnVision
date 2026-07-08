import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const STEPS = ['Search', 'Room & Rates', 'Review & Pay'];

/**
 * Horizontal progress bar across the booking flow.
 * Used by: screens/roomRates/RoomSelectionScreen.jsx, screens/reviewPay/ReviewPayScreen.jsx
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). Two fixes made during
 * migration:
 *  - `segment`'s `borderRightColor` was `colors.white` (invariant) — used
 *    as the thin gap between segments, it should match the page
 *    background so it still reads as a gap in dark mode instead of a
 *    stray white line. Changed to `colors.background`.
 *  - `labelActive` used `colors.white` for text on top of the active
 *    segment (background = colors.step, which flips) — changed to
 *    `onPrimary`.
 *
 * Props:
 *  - currentStep: number (0 = Search, 1 = Room & Rates, 2 = Review & Pay)
 */
export default function StepIndicator({ currentStep }) {
  const { colors, spacing, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, fonts), [colors, spacing, fonts]);

  return (
    <View style={styles.row}>
      {STEPS.map((label, index) => {
        const isActive = index === currentStep;
        const isDone = index < currentStep;
        return (
          <View
            key={label}
            style={[
              styles.segment,
              isActive && styles.segmentActive,
              isDone && styles.segmentDone,
            ]}
          >
            <Text
              style={[
                styles.label,
                (isActive || isDone) && styles.labelActive,
              ]}
              numberOfLines={1}
            >
              {label.toUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function getStyles(colors, spacing, fonts) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
    },
    segment: {
      flex: 1,
      backgroundColor: colors.stepBg,
      paddingVertical: spacing.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderRightWidth: 1,
      borderRightColor: colors.background,
    },
    segmentActive: {
      backgroundColor: colors.step,
    },
    segmentDone: {
      backgroundColor: colors.stepDone,
      opacity: 0.55,
    },
    label: {
      fontSize: 11,
      fontFamily: fonts.headingSemiBold,
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
    labelActive: {
      color: colors.onPrimary,
    },
  });
}