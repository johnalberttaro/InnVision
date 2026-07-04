import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  SafeAreaView,
  FlatList,
  Image,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { formatCurrency } from '../../utils/roomRates';

const MAX_CARD_WIDTH = 720;

/**
 * RateCard — responsive room card + detail modal.
 *
 * Props:
 *  - rate: room rate object
 *  - onReserve: () => void
 *  - cardWidth: number (optional) — pass the pre-calculated column width
 *    from RoomSelectionScreen so the image fills exactly the card, not the
 *    full screen width. Falls back to (winWidth - padding) if omitted.
 */
export default function RateCard({ rate, onReserve, cardWidth: propCardWidth }) {
  // NOTE: also grab `height` here — we need it to give the modal a real
  // pixel height on native. See comment near modalContainer below.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab]       = useState('rates');
  const cardScale = useRef(new Animated.Value(1)).current;

  // Use the prop width (from 2-col grid) if provided, otherwise full width
  const cardWidth   = propCardWidth ?? Math.min(winWidth - spacing.lg * 2, MAX_CARD_WIDTH);
  // 16:9 image — but cap height so cards don't get too tall on wide screens
  const imageHeight = Math.min(Math.round(cardWidth * (9 / 16)), 220);

  const tabs = [
    { key: 'rates',      label: 'Rates' },
    { key: 'inclusions', label: 'Room & Inclusions' },
    { key: 'pictures',   label: 'Pictures' },
    { key: 'tnc',        label: 'Terms & Conditions' },
  ];

  const handleOpenModal = () => { setActiveTab('rates'); setModalVisible(true); };
  const pressIn  = () => Animated.spring(cardScale, { toValue: 0.985, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(cardScale, { toValue: 1,     useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  return (
    <>
      {/* ── Card ─────────────────────────────────────────────── */}
      <Animated.View style={[styles.cardWrapper, { transform: [{ scale: cardScale }] }]}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={handleOpenModal}
          onPressIn={pressIn}
          onPressOut={pressOut}
        >
          {/* Image carousel — uses the exact card width so nothing is clipped */}
          <ImageCarousel
            images={rate.images}
            width={cardWidth}
            height={imageHeight}
            label={rate.name}
          />

          <View style={styles.cardBody}>
            <Text style={styles.roomName}>{rate.name}</Text>

            <View style={styles.priceRow}>
              <Text style={styles.fromLabel}>From </Text>
              <Text style={styles.price}>{formatCurrency(rate.price)}</Text>
              <Text style={styles.perNight}> / night </Text>
              <Text style={styles.strikePrice}>{formatCurrency(rate.originalPrice)}</Text>
            </View>
            <Text style={styles.taxNote}>*{rate.taxNote}</Text>

            <View style={styles.bottomRow}>
              <Text style={styles.note}>* {rate.note}</Text>
              <TouchableOpacity
                style={styles.reserveButton}
                activeOpacity={0.85}
                onPress={handleOpenModal}
              >
                <Text style={styles.reserveText}>RESERVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Modal ────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.backdrop}>
          {/*
            FIX (mobile bug): modalContainer must get a real `height`, not
            just `maxHeight`. `maxHeight` alone is only a clamp — Yoga still
            shrink-wraps the container around its children first, and a
            `flexGrow` child (tabContent) contributes ~0 to that shrink-wrap
            measurement. That circular dependency is exactly why the header
            and tab bar rendered but the ScrollView body (RATES / BOOK
            button) collapsed to 0 height and was untappable on native,
            while it happened to work on web (real CSS resolves this
            differently). Giving the container a concrete `height` breaks
            the circularity and lets `tabContent`'s `flexGrow: 1` actually
            fill real space.
          */}
          <SafeAreaView style={[styles.modalContainer, { height: Math.round(winHeight * 0.9) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{rate.name.toUpperCase()}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>CLOSE ✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabBar}
              contentContainerStyle={styles.tabBarContent}
            >
              {tabs.map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                    {tab.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView
              style={styles.tabContent}
              contentContainerStyle={styles.tabContentContainer}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === 'rates'      && <RatesTab      rate={rate} onReserve={() => { setModalVisible(false); onReserve && onReserve(rate); }} />}
              {activeTab === 'inclusions' && <InclusionsTab rate={rate} />}
              {activeTab === 'pictures'   && <PicturesTab   rate={rate} winWidth={winWidth} />}
              {activeTab === 'tnc'        && <TncTab        onBack={() => setActiveTab('rates')} />}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

/* ── Responsive Image Carousel ──────────────────────────────────────────── */
function ImageCarousel({ images, width, height, label }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const hasImages = Array.isArray(images) && images.length > 0;

  const goTo = (newIndex) => {
    const clamped = Math.max(0, Math.min(newIndex, images.length - 1));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  const onMomentumScrollEnd = (e) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  if (!hasImages) {
    return (
      <View style={[carouselStyles.slot, { width, height }]}>
        <Text style={carouselStyles.fallbackIcon}>🛏️</Text>
        <Text style={carouselStyles.fallbackText}>No image available</Text>
      </View>
    );
  }

  return (
    // overflow:hidden clips the FlatList but we keep arrows OUTSIDE the clip
    <View style={{ width, height, position: 'relative' }}>
      {/* Clipped image strip */}
      <View style={[carouselStyles.slot, { width, height, overflow: 'hidden' }]}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <Image
              source={item.source ? item.source : { uri: item.uri }}
              style={{ width, height }}
              resizeMode="cover"
            />
          )}
        />

        {/* Dot indicators */}
        {images.length > 1 && (
          <View style={carouselStyles.dotsRow}>
            {images.map((_, i) => (
              <View key={i} style={[carouselStyles.dot, i === index && carouselStyles.dotActive]} />
            ))}
          </View>
        )}

        {/* Image label overlay */}
        <View style={carouselStyles.labelOverlay}>
          <Text style={carouselStyles.labelText}>{images[index]?.label || label}</Text>
        </View>
      </View>

      {/* Arrows sit OUTSIDE the overflow:hidden clip so they are fully visible */}
      {images.length > 1 && (
        <>
          <TouchableOpacity
            style={[carouselStyles.arrow, carouselStyles.arrowLeft]}
            onPress={() => goTo(index - 1)}
            activeOpacity={0.7}
          >
            <Text style={carouselStyles.arrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[carouselStyles.arrow, carouselStyles.arrowRight]}
            onPress={() => goTo(index + 1)}
            activeOpacity={0.7}
          >
            <Text style={carouselStyles.arrowText}>›</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

/* ── Tab: Rates ─────────────────────────────────────────────────────────── */
function RatesTab({ rate, onReserve }) {
  return (
    <View style={tabStyles.container}>
      <Text style={tabStyles.sectionTitle}>BEST AVAILABLE RATE</Text>

      <View style={tabStyles.rateRow}>
        <View style={tabStyles.rateInfo}>
          <Text style={tabStyles.rateType}>Room only</Text>
          <Text style={tabStyles.ratePoints}>▶ CCTC</Text>
        </View>
        <View style={tabStyles.ratePrices}>
          <Text style={tabStyles.ratePriceMain}>{formatCurrency(rate.price)}</Text>
          <Text style={tabStyles.ratePriceStrike}>{formatCurrency(rate.originalPrice)}</Text>
        </View>
        <TouchableOpacity style={tabStyles.bookBtn} onPress={onReserve} activeOpacity={0.8}>
          <Text style={tabStyles.bookBtnText}>BOOK</Text>
        </TouchableOpacity>
      </View>

      {rate.bbPrice && (
        <View style={tabStyles.rateRow}>
          <View style={tabStyles.rateInfo}>
            <Text style={tabStyles.rateType}>Bed and breakfast</Text>
            <Text style={tabStyles.ratePoints}>▶ CCTC</Text>
          </View>
          <View style={tabStyles.ratePrices}>
            <Text style={tabStyles.ratePriceMain}>{formatCurrency(rate.bbPrice)}</Text>
            <Text style={tabStyles.ratePriceStrike}>{formatCurrency(rate.bbOriginalPrice)}</Text>
          </View>
          <TouchableOpacity style={tabStyles.bookBtn} onPress={onReserve} activeOpacity={0.8}>
            <Text style={tabStyles.bookBtnText}>BOOK</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={tabStyles.footNote}>*excl. of taxes and charges</Text>
      <Text style={[tabStyles.footNote, { fontFamily: fonts.bodySemiBold, marginTop: 4 }]}>
        * BOOK NOW 
      </Text>
    </View>
  );
}

/* ── Tab: Room & Inclusions ─────────────────────────────────────────────── */
function InclusionsTab({ rate }) {
  return (
    <View style={tabStyles.container}>
      {rate.description ? <Text style={tabStyles.roomDesc}>{rate.description}</Text> : null}
      <View style={tabStyles.detailGrid}>
        <DetailItem label="Room size"     value={rate.size} />
        <DetailItem label="Bed type"      value={rate.bed} />
        <DetailItem label="Max occupancy" value={rate.occupancy} />
        <DetailItem label="Floor"         value={rate.floor} />
      </View>
      <Text style={tabStyles.sectionTitle}>INCLUSIONS</Text>
      {(rate.inclusions || []).map((item, i) => (
        <View key={i} style={tabStyles.inclusionRow}>
          <Text style={tabStyles.inclusionBullet}>✓</Text>
          <Text style={tabStyles.inclusionText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailItem({ label, value }) {
  return (
    <View style={tabStyles.detailItem}>
      <Text style={tabStyles.detailLabel}>{label}</Text>
      <Text style={tabStyles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

/* ── Tab: Pictures ──────────────────────────────────────────────────────── */
function PicturesTab({ rate, winWidth }) {
  const hasImages = rate.images && rate.images.length > 0;
  const thumbSize = (winWidth - spacing.md * 2 - 16) / 3;

  if (hasImages) {
    const modalWidth = Math.min(winWidth, MAX_CARD_WIDTH);
    const modalImgH  = Math.round(modalWidth * (9 / 16));
    return (
      <View style={tabStyles.container}>
        <ImageCarousel images={rate.images} width={modalWidth} height={modalImgH} label={rate.name} />
        <View style={tabStyles.thumbRow}>
          {rate.images.map((img, i) => (
            <View key={i} style={[tabStyles.thumbSlot, { width: thumbSize }]}>
              <Image
                source={img.source ? img.source : { uri: img.uri }}
                style={[tabStyles.thumbImage, { width: thumbSize, height: thumbSize * (3 / 4) }]}
                resizeMode="cover"
              />
              <Text style={tabStyles.picLabel}>{img.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={tabStyles.container}>
      <View style={tabStyles.picturesGrid}>
        {['Bedroom view', 'Bathroom', 'City view'].map((lbl, i) => (
          <View key={i} style={[tabStyles.pictureSlot, { width: thumbSize, height: thumbSize * (3 / 4) }]}>
            <Text style={tabStyles.picIcon}>📷</Text>
            <Text style={tabStyles.picLabel}>{lbl}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Tab: Terms & Conditions ────────────────────────────────────────────── */
const TNC_ITEMS = [
  'Check-in time is at 2:00pm and check-out time is on or before 12:00 noon. Early check-in and late check-out may be arranged subject to room availability and appropriate charges.',
  'Request for extension of stay must be made at the Front Desk at least 24 hours prior to your check-out date, subject to room availability and payment of applicable charges.',
  'All changes in booking, such as but not limited to, change in name, date, no. of nights, type and number of rooms, and add-ons shall be allowed only until 2:00 pm of check-in date, free of charge.',
  'Cancellation of booking made more than 24 hours prior to the check-in date shall be free of charge. If cancellation is made within 24 hours prior to check-in date or guest is a no-show, the first night shall be charged.',
  'Room reservations for bookings made online which have not been prepaid before check-in shall be held only until 4:00 pm of the check-in date.',
  "To avail of Senior Citizen's or PWD discount, the qualified guest shall be personally present during check-in and shall present their ID.",
  'Smoking or using any type of e-cigarette is strictly prohibited inside the hotel premises. Violators will be penalized accordingly.',
  'Guests are not allowed to bring pets, appliances, dangerous chemicals, explosives, or firearms into the hotel.',
  'The Hotel shall not be responsible or liable for any loss or damage to your property during your stay.',
  'The Hotel reserves the right to refuse accommodation to individuals suspected of suffering from communicable illnesses.',
  'The Hotel reserves the right to terminate your booking if you violate any hotel policies or compromise the safety of staff and guests.',
  'Go Hotels is committed to protecting your privacy in accordance with the Data Privacy Act of 2012.',
];

function TncTab({ onBack }) {
  return (
    <View style={tabStyles.container}>
      <TouchableOpacity style={tabStyles.backBtn} onPress={onBack}>
        <Text style={tabStyles.backBtnText}>{'< Back to Rates'}</Text>
      </TouchableOpacity>
      <Text style={tabStyles.tncHeader}>
        The following are the highlighted Terms & Conditions of the Hotel.
      </Text>
      {TNC_ITEMS.map((item, i) => (
        <View key={i} style={tabStyles.tncRow}>
          <Text style={tabStyles.tncNum}>{i + 1}.</Text>
          <Text style={tabStyles.tncText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/* ── Carousel styles ────────────────────────────────────────────────────── */
const carouselStyles = StyleSheet.create({
  slot: {
    backgroundColor: colors.cardAlt,
    position: 'relative',
  },
  fallbackIcon: {
    fontSize: 40,
    textAlign: 'center',
    marginTop: 50,
  },
  fallbackText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  labelOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.38)',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  labelText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  // Arrows sit OUTSIDE overflow:hidden so they are never clipped
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  arrowLeft:  { left: 6 },
  arrowRight: { right: 6 },
  arrowText: {
    color: '#fff',
    fontSize: 22,
    fontFamily: fonts.headingBold,
    lineHeight: 24,
  },
  dotsRow: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
  },
});

/* ── Card styles ────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardBody: {
    padding: spacing.md,
  },
  roomName: {
    fontSize: 15,
    fontFamily: fonts.headingBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  fromLabel:   { fontSize: 11, fontFamily: fonts.body,             color: colors.textMuted },
  price:       { fontSize: 15, fontFamily: fonts.headingExtraBold, color: colors.accent },
  perNight:    { fontSize: 10, fontFamily: fonts.body,             color: colors.textMuted },
  strikePrice: { fontSize: 10, fontFamily: fonts.body,             color: colors.priceStrike, textDecorationLine: 'line-through' },
  taxNote: {
    fontSize: 9,
    fontFamily: fonts.body,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  note: {
    fontSize: 9,
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
    flex: 1,
    marginRight: spacing.xs,
  },
  reserveButton: {
    backgroundColor: colors.step,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.md,
    shadowColor: colors.step,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },
  reserveText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: fonts.headingSemiBold,
    letterSpacing: 0.5,
  },

  /* Modal */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // A real `height` (winHeight * 0.9) is passed inline in the render
    // method above. Do NOT swap this back to `maxHeight` — a clamp with no
    // definite size collapses the `flexGrow` ScrollView below to 0 height
    // on native, which was the actual cause of the invisible BOOK button.
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  modalTitle:   { fontSize: 15, fontFamily: fonts.headingBold, color: colors.accent, letterSpacing: 0.5 },
  closeBtn:     { paddingVertical: 4, paddingHorizontal: 8 },
  closeBtnText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  tabBar:        { borderBottomWidth: 0.5, borderBottomColor: colors.border, backgroundColor: '#F5F5F5', flexGrow: 0 },
  tabBarContent: { flexDirection: 'row', alignItems: 'center' },
  tabBtn:        { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:  { borderBottomColor: colors.accent, backgroundColor: colors.white },
  tabLabel:      { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, letterSpacing: 0.4 },
  tabLabelActive:{ color: colors.accent },
  // FIX: `flexGrow`/`flexShrink` instead of a bare `flex: 1`, paired with a
  // contentContainerStyle below, so the ScrollView reliably gets real
  // measured height from its parent (which now has a real pixel maxHeight)
  // on both native and web.
  tabContent:          { flexGrow: 1, flexShrink: 1 },
  tabContentContainer: { flexGrow: 1 },
});

/* ── Tab content styles ─────────────────────────────────────────────────── */
const tabStyles = StyleSheet.create({
  container:    { padding: spacing.md, paddingBottom: 32 },
  sectionTitle: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },

  rateRow:         { flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: 8, gap: 8 },
  rateInfo:        { flex: 1 },
  rateType:        { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 2 },
  ratePoints:      { fontSize: 11, fontFamily: fonts.body, color: colors.accent },
  ratePrices:      { alignItems: 'flex-end', marginRight: 4 },
  ratePriceMain:   { fontSize: 14, fontFamily: fonts.headingBold, color: colors.accent },
  ratePriceStrike: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, textDecorationLine: 'line-through' },
  bookBtn:         { backgroundColor: colors.primaryDark, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm },
  bookBtnText:     { color: '#fff', fontSize: 11, fontFamily: fonts.headingSemiBold, letterSpacing: 0.4 },
  footNote:        { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },

  roomDesc:        { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 20, marginBottom: 14 },
  detailGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  detailItem:      { width: '47%' },
  detailLabel:     { fontSize: 10, fontFamily: fonts.bodySemiBold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  detailValue:     { fontSize: 13, fontFamily: fonts.body, color: colors.text },
  inclusionRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 8 },
  inclusionBullet: { fontSize: 12, color: colors.accent, fontFamily: fonts.body, marginTop: 1 },
  inclusionText:   { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, flex: 1 },

  picturesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pictureSlot:  { backgroundColor: colors.cardAlt, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.border, gap: 4 },
  picIcon:      { fontSize: 28 },
  picLabel:     { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 4 },
  thumbRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumbSlot:    { alignItems: 'center', gap: 4 },
  thumbImage:   { borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border },

  backBtn:     { marginBottom: 12 },
  backBtnText: { fontSize: 12, fontFamily: fonts.body, color: colors.accent },
  tncHeader:   { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.text, marginBottom: 12, lineHeight: 18 },
  tncRow:      { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: 8 },
  tncNum:      { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.accent, minWidth: 20 },
  tncText:     { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, flex: 1, lineHeight: 18 },
});