import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { colors, spacing, fonts } from '../../utils/theme';

const MOBILE_BREAKPOINT = 768;

// ============================================================================
// 📷 HERO PHOTOS — edit this list any time to change the homepage carousel.
// ============================================================================
// Just replace the `uri` value with any image URL (must start with
// https://). The `caption` is the big text shown over each photo — set it
// to '' (empty string) if you don't want a caption on a given slide.
// Add or remove slides freely; the dots and arrows adjust automatically.
//
// Hotel-style imagery for a more polished homepage experience.
const HERO_SLIDES = [
  {
    uri: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
    caption: 'Luxury Suites',
    description: 'Elegant stays with comfort, privacy, and premium amenities.',
    badge: 'From $180/night',
  },
  {
    uri: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
    caption: 'Comfort & Style',
    description: 'Thoughtfully designed rooms for relaxing business or leisure stays.',
    badge: 'Free cancellation',
  },
  {
    uri: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=80',
    caption: 'Stay in Comfort',
    description: 'A welcoming atmosphere with modern features and easy booking.',
    badge: '24/7 concierge',
  },
];
// ============================================================================

/**
 * Swipeable hero carousel — full-bleed photo with badge/title/description/
 * CTA overlaid directly on a gradient scrim at the bottom, rather than a
 * separate content panel beside or below the image.
 *
 * REDESIGNED (previously a split layout: image + panel side-by-side on
 * desktop, stacked on mobile). Two structural problems with that version:
 *  1. Two genuinely different layouts needed two different height
 *     formulas — the mobile one was wrong and clipped all the text below
 *     the badge (title/description/button never visible on phones).
 *  2. It read as a template hotel-widget split-card, not a considered
 *     hero moment.
 * This version uses ONE layout structure on every screen size — the
 * photo IS the hero, text sits on top of it — so there's no risk of the
 * same "two formulas, one wrong" bug class recurring, and it reads as a
 * proper photographic hero rather than a two-panel widget.
 *
 * The gradient scrim is built from a few stacked semi-transparent Views
 * of increasing opacity rather than expo-linear-gradient, since that
 * package isn't already a project dependency — this achieves the same
 * visual effect with zero new installs.
 *
 * Used by: screens/home/HomeScreen.jsx
 *
 * Props:
 *  - slides: [{ uri, caption, description, badge }] (optional, defaults
 *    to HERO_SLIDES above)
 *  - height: number (optional) — fixed height override. If omitted,
 *    height is responsive: taller relative to width on mobile (so the
 *    overlaid text has comfortable room) and a wider, shorter banner
 *    proportion on desktop.
 */
export default function ImageCarousel({ slides = HERO_SLIDES, height, onBookNow }) {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const screenWidth = width;
  const slideWidth = screenWidth - spacing.md * 2;
  const computedHeight =
    height ?? (isMobile
      ? Math.min(560, Math.max(420, screenWidth * 1.05))
      : Math.min(460, Math.max(320, screenWidth * 0.32)));

  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateToIndex = (index) => {
    const clamped = Math.max(0, Math.min(index, slides.length - 1));
    setActiveIndex(clamped);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      scrollRef.current?.scrollTo({ x: clamped * slideWidth, animated: false });
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    });
  };

  const scrollToIndex = (index) => {
    animateToIndex(index);
  };

  const handleMomentumScrollEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / slideWidth);
    setActiveIndex(index);
  };

  useEffect(() => {
    if (slides.length <= 1) return undefined;

    const timer = setInterval(() => {
      const nextIndex = (activeIndex + 1) % slides.length;
      animateToIndex(nextIndex);
    }, 6000);

    return () => clearInterval(timer);
  }, [activeIndex, slides.length]);

  return (
    <View style={[styles.wrap, { height: computedHeight }]}>
      <Animated.View style={[styles.carouselViewport, { opacity: fadeAnim }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        >
          {slides.map((slide, index) => (
            <View key={index} style={[styles.slide, { width: slideWidth, height: computedHeight }]}>
              <Image source={{ uri: slide.uri }} style={styles.image} resizeMode="cover" />

              {/* Gradient-scrim substitute: 4 stacked bands, increasing
                  opacity toward the bottom, instead of a real linear
                  gradient (no expo-linear-gradient dependency needed). */}
              <View style={styles.scrimBase} />
              <View style={[styles.scrimBand, styles.scrimBand1]} />
              <View style={[styles.scrimBand, styles.scrimBand2]} />
              <View style={[styles.scrimBand, styles.scrimBand3]} />

              <View style={[styles.content, isMobile && styles.contentMobile]}>
                {slide.badge ? (
                  <View style={styles.badgeWrap}>
                    <Text style={styles.badge}>{slide.badge}</Text>
                  </View>
                ) : null}
                {slide.caption ? (
                  <Text style={[styles.caption, isMobile && styles.captionMobile]}>{slide.caption}</Text>
                ) : null}
                {slide.description ? (
                  <Text style={[styles.description, !isMobile && styles.descriptionDesktop]} numberOfLines={2}>
                    {slide.description}
                  </Text>
                ) : null}
                <TouchableOpacity style={styles.ctaButton} onPress={onBookNow} activeOpacity={0.85}>
                  <Text style={styles.ctaButtonText}>Book Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {slides.length > 1 && (
        <>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowLeft]}
            onPress={() => scrollToIndex(activeIndex - 1)}
            accessibilityLabel="Previous slide"
            activeOpacity={0.8}
          >
            <Text style={styles.arrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowRight]}
            onPress={() => scrollToIndex(activeIndex + 1)}
            accessibilityLabel="Next slide"
            activeOpacity={0.8}
          >
            <Text style={styles.arrowText}>›</Text>
          </TouchableOpacity>

          <View style={styles.dotsRow} pointerEvents="none">
            {slides.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.homeHeroGreen,
  },
  carouselViewport: {
    flex: 1,
  },
  slide: {
    position: 'relative',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },

  /* Gradient-scrim substitute — a faint full-image darken so the arrows
     read against bright sky/wall areas too, then three bands of rising
     opacity stacked over just the bottom half, standing in for a real
     linear gradient without a new dependency. */
  scrimBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 16, 10, 0.12)',
  },
  scrimBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrimBand1: { height: '75%', backgroundColor: 'rgba(20, 16, 10, 0.18)' },
  scrimBand2: { height: '50%', backgroundColor: 'rgba(20, 16, 10, 0.30)' },
  scrimBand3: { height: '30%', backgroundColor: 'rgba(20, 16, 10, 0.40)' },

  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    paddingRight: spacing.xl * 2, // room for the right arrow
  },
  contentMobile: {
    padding: spacing.lg,
    paddingRight: spacing.xl + spacing.lg,
  },

  badgeWrap: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(253, 250, 244, 0.92)', // colors.card, translucent
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  badge: {
    color: colors.text,
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 30,
    fontFamily: fonts.headingExtraBold,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  captionMobile: {
    fontSize: 24,
  },
  description: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  descriptionDesktop: {
    maxWidth: 420,
  },

  ctaButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.xl,
  },
  ctaButtonText: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bodySemiBold,
  },

  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(253, 250, 244, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: { left: spacing.md },
  arrowRight: { right: spacing.md },
  arrowText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },

  dotsRow: {
    position: 'absolute',
    top: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 18,
  },
});