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
 * Swipeable hero carousel with dot indicators and prev/next arrow buttons.
 * Used by: screens/home/HomeScreen.jsx
 *
 * Props:
 *  - slides: [{ uri, caption }] (optional, defaults to HERO_SLIDES above)
 *  - height: number (optional) — fixed height override. If omitted, height
 *    is computed responsively from screen width (45% of width, clamped
 *    between 220 and 520) so the carousel looks proportionate on both a
 *    narrow phone and a wide desktop browser instead of using one fixed
 *    number that only suits one of them.
 */
export default function ImageCarousel({ slides = HERO_SLIDES, height, onBookNow }) {
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  const screenWidth = width;
  // Slide width must match the scroll pagination exactly. The carousel wrap
  // has marginHorizontal = spacing.md on each side, so each slide is the
  // viewport width minus that total margin. Paging math below uses slideWidth
  // (not screenWidth) so slides stay aligned on every screen size.
  const slideWidth = screenWidth - spacing.md * 2;
  const computedHeight = height ?? Math.min(520, Math.max(220, screenWidth * 0.45));
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
      {!isMobile && (
        <View style={styles.leftDetails}>
          <Text style={styles.leftTitle}>Featured stay</Text>
          <Text style={styles.leftSubtitle}>Modern comfort, easy booking, and a calm atmosphere.</Text>
        </View>
      )}

      <Animated.View style={[styles.carouselViewport, { opacity: fadeAnim }]}> 
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumScrollEnd}
        >
          {slides.map((slide, index) => (
            <View key={index} style={[styles.slide, { width: slideWidth, height: computedHeight }, isMobile && styles.slideMobile]}>
              <View style={[styles.slideInner, isMobile && styles.slideInnerMobile]}>
                <View style={[styles.imagePanel, isMobile && styles.imagePanelMobile]}>
                  <Image source={{ uri: slide.uri }} style={styles.image} resizeMode="cover" />
                  <View style={styles.overlay} />
                </View>
                <View style={[styles.contentPanel, isMobile && styles.contentPanelMobile]}>
                  {slide.badge ? <Text style={styles.badge}>{slide.badge}</Text> : null}
                  {slide.caption ? <Text style={[styles.caption, isMobile && styles.captionMobile]}>{slide.caption}</Text> : null}
                  {slide.description ? <Text style={styles.description}>{slide.description}</Text> : null}
                  <TouchableOpacity style={styles.ctaButton} onPress={onBookNow}>
                    <Text style={styles.ctaButtonText}>Book Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {slides.length > 1 && (
        <>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowLeft, isMobile && styles.arrowLeftMobile]}
            onPress={() => scrollToIndex(activeIndex - 1)}
            accessibilityLabel="Previous slide"
          >
            <Text style={styles.arrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowRight]}
            onPress={() => scrollToIndex(activeIndex + 1)}
            accessibilityLabel="Next slide"
          >
            <Text style={styles.arrowText}>›</Text>
          </TouchableOpacity>

          <View style={styles.dotsRow}>
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
    backgroundColor: colors.homeHeroGreen,
    overflow: 'visible',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 24,
    paddingLeft: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  leftDetails: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 104,
    justifyContent: 'center',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
  },
  leftTitle: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fonts.headingSemiBold,
    marginBottom: 4,
  },
  leftSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  carouselViewport: {
    flex: 1,
  },
  slide: {
    justifyContent: 'center',
    paddingLeft: 112,
    paddingRight: spacing.sm,
  },
  slideMobile: {
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
  },
  slideInner: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  slideInnerMobile: {
    flexDirection: 'column',
  },
  contentPanel: {
    flex: 0.45,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  contentPanelMobile: {
    flex: undefined,
    width: '100%',
    padding: spacing.lg,
  },
  imagePanel: {
    flex: 0.55,
    position: 'relative',
  },
  imagePanelMobile: {
    flex: undefined,
    height: 160,
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(24, 20, 16, 0.18)',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.bodySemiBold,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: spacing.sm,
  },
  caption: {
    color: colors.text,
    fontSize: 28,
    fontFamily: fonts.headingBold,
    marginBottom: spacing.sm,
  },
  captionMobile: {
    fontSize: 20,
  },
  description: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  ctaButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  ctaButtonText: {
    color: colors.onPrimary,
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
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: 112,
  },
  arrowLeftMobile: {
    left: spacing.sm,
  },
  arrowRight: {
    right: spacing.md,
  },
  arrowText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  dotsRow: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.dotInactive,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: colors.dotActive,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});