import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fonts } from '../../utils/theme';

const STEPS = ['Search', 'Room & Rates', 'Review & Pay'];

/**
 * Horizontal progress bar across the booking flow.
 * Used by: screens/roomRates/RoomSelectionScreen.jsx, screens/reviewPay/ReviewPayScreen.jsx
 *
 * Props:
 *  - currentStep: number (0 = Search, 1 = Room & Rates, 2 = Review & Pay)
 */
export default function StepIndicator({ currentStep }) {
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

const styles = StyleSheet.create({
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
    borderRightColor: colors.white,
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
    color: colors.white,
  },
});
