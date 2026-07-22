import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, fonts } from '../utils/theme';

const logo = require('../../assets/logo.png');

const RING_SIZE = 168;
const RING_STROKE = 4;
const LOGO_CIRCLE_SIZE = 132;
const GOLD = '#E8A628'; // matches the logo's gold, not a theme token elsewhere

/**
 * LoadingScreen — branded splash/loading state: the InnVision logo
 * centered in a circular frame, a rotating gold progress ring around it,
 * and the "HOTEL MANAGEMENT SYSTEM" tagline below.
 *
 * Meant to be rendered wherever the app shows a loading state — e.g. in
 * App.jsx while checking for an existing Supabase session on startup, or
 * any screen with a slow initial data fetch. Self-contained (owns its
 * own animation loop), so it just needs to be dropped in conditionally:
 *
 *   if (checkingSession) return <LoadingScreen />;
 *
 * The ring animation is a partial arc (not a full circle) rotating
 * continuously — the standard "still working" spinner pattern, distinct
 * from OccupancyGauge's full-circle PROGRESS ring (which represents a
 * static percentage, not an active loading state) so the two don't read
 * as the same visual language for two different meanings.
 *
 * Props:
 *  - message: string (optional) — small status line under the tagline,
 *    e.g. "Loading your dashboard…". Omit for just the tagline alone.
 */
export default function LoadingScreen({ message }) {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const r = RING_SIZE / 2 - RING_STROKE / 2;
  const circumference = 2 * Math.PI * r;
  // The arc covers ~28% of the ring, leaving a clear gap — reads as an
  // active spinner rather than a near-complete progress ring.
  const arcLength = circumference * 0.28;

  return (
    <View style={styles.screen}>
      <View style={styles.centerWrap}>
        <View style={styles.ringWrap}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={r}
                stroke={GOLD}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${arcLength} ${circumference}`}
              />
            </Svg>
          </Animated.View>

          {/* Faint full track under the arc, so the ring's full circle
              is still visible even where the gold arc isn't currently
              covering it — makes the shape read clearly at a glance. */}
          <View style={styles.trackRing} pointerEvents="none" />

          <View style={styles.logoCircle}>
            <Image source={logo} style={styles.logoImage} resizeMode="contain" />
          </View>
        </View>

        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkDark}>Inn</Text>
          <Text style={styles.wordmarkGold}>Vision</Text>
        </Text>
        <Text style={styles.tagline}>HOTEL MANAGEMENT SYSTEM</Text>

        {!!message && <Text style={styles.message}>{message}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrap: { alignItems: 'center' },

  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  trackRing: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
    borderColor: 'rgba(51, 43, 34, 0.10)', // faint charcoal, matches colors.primary
  },
  logoCircle: {
    position: 'absolute',
    width: LOGO_CIRCLE_SIZE,
    height: LOGO_CIRCLE_SIZE,
    borderRadius: LOGO_CIRCLE_SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoImage: { width: 76, height: 76 },

  wordmark: { fontSize: 26, fontFamily: fonts.headingExtraBold, letterSpacing: 0.3 },
  wordmarkDark: { color: colors.text },
  wordmarkGold: { color: GOLD },

  tagline: {
    fontSize: 11,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
    letterSpacing: 2.5,
    marginTop: 4,
  },
  message: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});