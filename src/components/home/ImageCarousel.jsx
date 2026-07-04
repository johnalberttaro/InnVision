import React, { useRef, useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { colors, spacing, fonts } from '../../utils/theme';

// ============================================================================
// 📷 HERO PHOTOS — edit this list any time to change the homepage carousel.
// ============================================================================
// Just replace the `uri` value with any image URL (must start with
// https://). The `caption` is the big text shown over each photo — set it
// to '' (empty string) if you don't want a caption on a given slide.
// Add or remove slides freely; the dots and arrows adjust automatically.
//
// Currently using stable, royalty-free Lorem Picsum placeholder photos
// (picsum.photos) since this is a student prototype with no real property
// photography yet — these are temporary and meant to be swapped out.
const HERO_SLIDES = [
  { uri: 'https://picsum.photos/id/1011/800/900', caption: 'Explore More' },
  { uri: 'https://picsum.photos/id/1015/800/900', caption: 'Island Getaways' },
  { uri: 'https://picsum.photos/id/1016/800/900', caption: 'Budget-Friendly Stays' },
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
export default function ImageCarousel({ slides = HERO_SLIDES, height }) {
  const screenWidth = Dimensions.get('window').width;
  const computedHeight = height ?? Math.min(520, Math.max(220, screenWidth * 0.45));
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToIndex = (index) => {
    const clamped = Math.max(0, Math.min(index, slides.length - 1));
    scrollRef.current?.scrollTo({ x: clamped * screenWidth, animated: true });
    setActiveIndex(clamped);
  };

  const handleMomentumScrollEnd = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    setActiveIndex(index);
  };

  return (
    <View style={[styles.wrap, { height: computedHeight }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {slides.map((slide, index) => (
          <View key={index} style={[styles.slide, { width: screenWidth, height: computedHeight }]}>
            <Image source={{ uri: slide.uri }} style={styles.image} resizeMode="cover" />
            <View style={styles.overlay} />
            {slide.caption ? (
              <Text style={styles.caption}>{slide.caption}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <>
          <TouchableOpacity
            style={[styles.arrow, styles.arrowLeft]}
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
    overflow: 'hidden',
  },
  slide: {
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 110, 58, 0.25)',
  },
  caption: {
    color: colors.white,
    fontSize: 26,
    fontFamily: fonts.headingBold,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
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
    left: spacing.md,
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