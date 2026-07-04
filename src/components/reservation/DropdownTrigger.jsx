import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';

/**
 * A tappable card-style row used for the date range and room/guest
 * dropdown triggers on the hero search card.
 * Used by: screens/reservation/ReservationScreen.jsx
 *
 * Props:
 *  - icon: string (emoji used as a lightweight icon, no asset needed)
 *  - children: content to render inside (text or a row of split labels)
 *  - isOpen: boolean (flips the chevron)
 *  - onPress: () => void
 *  - error: string | undefined
 */
export default function DropdownTrigger({ icon, children, isOpen, onPress, error }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };

  return (
    <View>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={[styles.pill, isOpen && styles.pillActive, error && styles.pillError]}
          onPress={onPress}
          onPressIn={pressIn}
          onPressOut={pressOut}
          activeOpacity={0.85}
        >
          <View style={styles.iconBadge}>
            <Text style={styles.icon}>{icon}</Text>
          </View>
          <View style={styles.content}>{children}</View>
          <Text style={[styles.chevron, isOpen && styles.chevronActive]}>{isOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </Animated.View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  pillActive: {
    borderColor: colors.accent,
  },
  pillError: {
    borderColor: colors.danger,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  icon: {
    fontSize: 15,
  },
  content: {
    flex: 1,
  },
  chevron: {
    fontSize: 10,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  chevronActive: {
    color: colors.accent,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    marginLeft: spacing.md,
  },
});