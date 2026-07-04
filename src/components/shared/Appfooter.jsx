import React from 'react';
import { View, Text, Image, StyleSheet, Linking, TouchableOpacity, useWindowDimensions } from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';

// Logo fills the slot completely (see paymentSlot below, same dimensions,
// zero padding) — resizeMode="cover" scales each logo up to fill the box
// and crops any overflow, rather than shrinking to fit inside it.
const LOGO_SIZE = { width: 76, height: 40 };

// Payment method logos — real image files from assets/payments/.
const PAYMENT_METHODS = [
  {
    key: 'gcash',
    label: 'GCash',
    icon: <Image source={require('../../../assets/payments/gcash.png')} style={LOGO_SIZE} resizeMode="cover" />,
  },
  {
    key: 'maya',
    label: 'Maya',
    icon: <Image source={require('../../../assets/payments/maya.png')} style={LOGO_SIZE} resizeMode="cover" />,
  },
  {
    key: 'maribank',
    label: 'Maribank',
    icon: <Image source={require('../../../assets/payments/maribank.png')} style={LOGO_SIZE} resizeMode="cover" />,
  },
  {
    key: 'gotyme',
    label: 'GoTyme',
    icon: <Image source={require('../../../assets/payments/gotyme.png')} style={LOGO_SIZE} resizeMode="cover" />,
  },
];

/**
 * AppFooter — shared bottom block: contact info + payment method logos.
 * Render at the bottom of a screen's ScrollView content (not fixed/floating).
 *
 * On wide screens (>=768px), the footer's content column matches the same
 * 800px max-width used by the rest of the page content, so it lines up
 * with sections above it instead of spanning full browser width.
 *
 * Props:
 *  - phone?: string  (default '0970 175 6831')
 */
export default function AppFooter({ phone = '0970 175 6831' }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const handleCall = () => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  };

  return (
    <View style={styles.outer}>
      <View style={[styles.wrap, isWide && styles.wrapWide]}>
        <Text style={styles.name}>InnVision</Text>

        <TouchableOpacity onPress={handleCall} activeOpacity={0.7}>
          <Text style={styles.contact}>📞 {phone}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>WE ACCEPT</Text>
        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map((pm) => (
            <View key={pm.key} style={styles.paymentSlot}>
              {pm.icon}
            </View>
          ))}
        </View>

        <Text style={styles.copyright}>© {new Date().getFullYear()} InnVision. All rights reserved.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-width dark band — background always spans edge to edge
  outer: {
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  // Inner content column — capped to match the rest of the page on wide screens
  wrap: {
    width: '100%',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  wrapWide: {
    maxWidth: 800,
  },
  name: {
    fontSize: 16,
    fontFamily: fonts.headingBold,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  contact: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    color: colors.white,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: spacing.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  paymentSlot: {
    width: 76,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
  },
  copyright: {
    fontSize: 10,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.55)',
  },
});