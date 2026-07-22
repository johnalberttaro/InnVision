import React, { useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/**
 * A tappable card-style row used for the date range and room/guest
 * dropdown triggers on the hero search card.
 * Used by: screens/reservation/ReservationScreen.jsx
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). Fix made during migration:
 *  - `pill`'s background was `colors.white` (invariant) — the text
 *    content rendered inside it (via `children`, from ReservationScreen)
 *    is already theme-aware and flips to near-white in dark mode, so a
 *    stuck-white pill made that text invisible. Changed to `colors.card`
 *    so the pill flips along with everything else.
 *
 * ENHANCED: icon now accepts a real icon element (e.g. an <Ionicons />
 * node from ReservationScreen), not just an emoji string — rendering an
 * arbitrary component inside a <Text> (the old behavior) is invalid in
 * React Native and would break for anything but plain text. Still
 * accepts a plain string for backward compatibility, wrapped in <Text>
 * only in that case.
 *
 * Props:
 *  - icon: React.ReactNode | string — an icon element, or (legacy) an
 *    emoji string
 *  - children: content to render inside (text or a row of split labels)
 *  - isOpen: boolean (flips the chevron)
 *  - onPress: () => void
 *  - error: string | undefined
 */
export default function DropdownTrigger({ icon, children, isOpen, onPress, error }) {
  const scale = useRef(new Animated.Value(1)).current;
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

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
            {typeof icon === 'string' ? <Text style={styles.icon}>{icon}</Text> : icon}
          </View>
          <View style={styles.content}>{children}</View>
          <Text style={[styles.chevron, isOpen && styles.chevronActive]}>{isOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      </Animated.View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
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
}