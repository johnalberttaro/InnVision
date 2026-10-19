import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, Platform, StatusBar } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Font from 'expo-font';

const logo = require('../../assets/logo.png');
const BUILDING = require('../../assets/hm-building.jpg');

// Same dark-and-gold look as the guest Home page.
const BG = '#17120E';
const TEXT = '#F7F2EA';
const MUTED = 'rgba(247,242,234,0.62)';
const GOLD = '#C9A14A';
const GOLD_LIGHT = '#F0D58E';

const RING_SIZE = 150;
const RING_STROKE = 3;
const TILE_SIZE = 104;

const STATUS_LINES = ['Preparing your stay…', 'Checking your account…', 'Almost ready…'];

// Fills the parent. Written out by hand: React Native 0.85+ (Expo SDK 57)
// removed StyleSheet.absoluteFillObject, so spreading it adds nothing on phones.
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
const web = (style) => (Platform.OS === 'web' ? style : null);
const useNative = Platform.OS !== 'web';

// Fonts may still be loading while this screen shows, so a font name is
// only used once it's ready (the app re-renders this screen when fonts finish).
const font = (name) => {
  try { return Font.isLoaded(name) ? name : undefined; } catch { return undefined; }
};

/**
 * LoadingScreen — branded splash shown while the app starts (fonts load and
 * the saved login is checked; see App.jsx). Also usable anywhere a full-page
 * loading state is needed: `if (loading) return <LoadingScreen />;`
 *
 * Look: dark warm background with the HM building photo faintly behind it,
 * the InnVision logo on a cream tile with a soft breathing glow, a rotating
 * gold arc around it, the wordmark, a sliding gold progress bar, and a short
 * status line that changes every second or so.
 *
 * Props:
 *  - message: string (optional) — fixed status line. When omitted, the
 *    screen cycles through a few friendly default lines.
 */
export default function LoadingScreen({ message }) {
  const spin = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const [lineIndex, setLineIndex] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: useNative })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: useNative }),
          Animated.timing(breathe, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: useNative }),
        ])
      ),
      Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: useNative })),
    ];
    loops.forEach((l) => l.start());
    Animated.timing(enter, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: useNative }).start();
    return () => loops.forEach((l) => l.stop());
  }, [spin, breathe, slide, enter]);

  useEffect(() => {
    if (message) return undefined;
    const t = setInterval(() => setLineIndex((i) => (i + 1) % STATUS_LINES.length), 1100);
    return () => clearInterval(t);
  }, [message]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const tileScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const segment = Math.max(barWidth * 0.38, 1);
  const barX = slide.interpolate({ inputRange: [0, 1], outputRange: [-segment, barWidth || 1] });
  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  const r = RING_SIZE / 2 - RING_STROKE;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.3;

  return (
    <View style={styles.screen} accessibilityRole="progressbar" accessibilityLabel="Loading InnVision">
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      <Image source={BUILDING} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.shade} pointerEvents="none" />

      <Animated.View style={[styles.center, { opacity: enter, transform: [{ translateY: rise }] }]}>
        <View style={styles.ringWrap}>
          <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
          <View style={styles.track} />
          <Animated.View style={[FILL, { transform: [{ rotate }] }]}>
            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Defs>
                <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={GOLD_LIGHT} />
                  <Stop offset="1" stopColor={GOLD} />
                </LinearGradient>
              </Defs>
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={r}
                stroke="url(#gold)"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${arc} ${circumference}`}
              />
            </Svg>
          </Animated.View>
          <Animated.View style={[styles.tile, { transform: [{ scale: tileScale }] }]}>
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          </Animated.View>
        </View>

        <Text style={[styles.wordmark, { fontFamily: font('Inter_800ExtraBold') }]}>
          <Text style={{ color: TEXT }}>Inn</Text>
          <Text style={styles.wordmarkGold}>Vision</Text>
        </Text>
        <Text style={[styles.tagline, { fontFamily: font('Inter_600SemiBold') }]}>CCTC TRAINING HOTEL</Text>

        <View style={styles.bar} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
          {barWidth > 0 && (
            <Animated.View style={[styles.barFill, { width: segment, transform: [{ translateX: barX }] }]} />
          )}
        </View>

        <Text style={[styles.status, { fontFamily: font('Inter_500Medium') }]} accessibilityLiveRegion="polite">
          {message || STATUS_LINES[lineIndex]}
        </Text>
      </Animated.View>

      <Text style={[styles.footer, { fontFamily: font('Inter_400Regular') }]}>
        Hospitality Management Department · Consolatrix College of Toledo City
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { ...FILL, width: '100%', height: '100%', opacity: 0.22 },
  shade: {
    ...FILL,
    backgroundColor: 'rgba(23,18,14,0.72)',
    ...web({
      backgroundColor: 'transparent',
      backgroundImage: [
        'radial-gradient(ellipse at 50% 42%, rgba(201,161,74,0.18) 0%, rgba(201,161,74,0) 45%)',
        'radial-gradient(ellipse at 50% 45%, rgba(23,18,14,0.55) 0%, rgba(23,18,14,0.92) 75%)',
      ].join(', '),
    }),
  },

  center: { alignItems: 'center', paddingHorizontal: 24 },

  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  glow: {
    position: 'absolute',
    width: RING_SIZE + 40,
    height: RING_SIZE + 40,
    borderRadius: (RING_SIZE + 40) / 2,
    backgroundColor: 'rgba(201,161,74,0.16)',
    ...web({
      backgroundColor: 'transparent',
      backgroundImage: 'radial-gradient(circle, rgba(240,213,142,0.32) 0%, rgba(201,161,74,0) 68%)',
    }),
  },
  track: {
    position: 'absolute',
    width: RING_SIZE - RING_STROKE * 2 + RING_STROKE,
    height: RING_SIZE - RING_STROKE * 2 + RING_STROKE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(247,242,234,0.12)',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 28,
    backgroundColor: '#F7F2EA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    ...web({
      backgroundImage: 'linear-gradient(160deg, #FBF7F0 0%, #EFE6D6 100%)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset, 0 14px 34px rgba(0,0,0,0.45)',
    }),
  },
  logo: { width: 62, height: 62 },

  wordmark: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  wordmarkGold: {
    color: GOLD,
    ...web({
      backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    }),
  },
  tagline: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
    color: MUTED,
  },

  bar: {
    width: 180,
    height: 3,
    borderRadius: 2,
    marginTop: 28,
    backgroundColor: 'rgba(247,242,234,0.12)',
    overflow: 'hidden',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: GOLD,
    ...web({ backgroundImage: `linear-gradient(90deg, rgba(201,161,74,0) 0%, ${GOLD_LIGHT} 50%, rgba(201,161,74,0) 100%)` }),
  },
  status: { marginTop: 14, fontSize: 13, color: MUTED, letterSpacing: 0.1 },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    textAlign: 'center',
    fontSize: 11.5,
    color: 'rgba(247,242,234,0.42)',
  },
});