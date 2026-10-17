import React from 'react';
import { View, Text, Image, StyleSheet, Linking, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';

// Logo fills the slot completely (see paymentSlot below, same dimensions,
// zero padding) — resizeMode="cover" scales each logo up to fill the box
// and crops any overflow, rather than shrinking to fit inside it.
const LOGO_SIZE = { width: 68, height: 36 };

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

const DEFAULT_EMAIL = 'hmdepartment@gmail.com';

/**
 * AppFooter — shared bottom block on the guest pages: who runs the hotel,
 * the contact e-mail, and the accepted (simulated) e-wallets.
 * Render at the bottom of a screen's ScrollView content (not fixed/floating).
 *
 * Wide screens (>=768px): two columns (about + contact | payments) inside
 * the same 800px content width as the rest of the page. Phones: stacked.
 *
 * Props:
 *  - email?: string  (default 'hmdepartment@gmail.com')
 */
export default function AppFooter({ email = DEFAULT_EMAIL }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const handleEmail = () => {
    Linking.openURL(`mailto:${email}`).catch(() => {});
  };

  return (
    <View style={styles.outer}>
      <View style={[styles.wrap, isWide && styles.wrapWide]}>
        <View style={[styles.columns, isWide && styles.columnsWide]}>
          {/* About + contact */}
          <View style={[styles.col, isWide && styles.colWideLeft]}>
            <Text style={styles.name}>InnVision</Text>
            <Text style={[styles.tagline, isWide && styles.textLeft]}>
              Training hotel of the Hospitality Management Department,{'\n'}
              Consolatrix College of Toledo City, Inc.
            </Text>

            <Text style={[styles.sectionLabel, isWide && styles.textLeft]}>CONTACT US</Text>
            <TouchableOpacity
              style={styles.emailBtn}
              onPress={handleEmail}
              activeOpacity={0.75}
              accessibilityRole="link"
              accessibilityLabel={`Email ${email}`}
            >
              <Ionicons name="mail-outline" size={15} color={colors.white} />
              <Text style={styles.emailText}>{email}</Text>
            </TouchableOpacity>
          </View>

          {/* Payments */}
          <View style={[styles.col, isWide && styles.colWideRight]}>
            <Text style={[styles.sectionLabel, isWide && styles.textRight]}>WE ACCEPT</Text>
            <View style={[styles.paymentRow, isWide && styles.paymentRowWide]}>
              {PAYMENT_METHODS.map((pm) => (
                <View key={pm.key} style={styles.paymentSlot} accessibilityLabel={pm.label}>
                  {pm.icon}
                </View>
              ))}
            </View>
            <Text style={[styles.paymentNote, isWide && styles.textRight]}>
              Online e-wallet payments are simulated for demonstration.
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.copyright}>
          © {new Date().getFullYear()} InnVision Training Hotel · Consolatrix College of Toledo City, Inc.
        </Text>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  wrapWide: {
    maxWidth: 800,
  },

  columns: { alignItems: 'center', gap: spacing.lg },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  col: { alignItems: 'center', width: '100%' },
  colWideLeft: { alignItems: 'flex-start', width: 'auto', flex: 1, paddingRight: spacing.lg },
  colWideRight: { alignItems: 'flex-end', width: 'auto' },
  textLeft: { textAlign: 'left' },
  textRight: { textAlign: 'right' },

  name: {
    fontSize: 18,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -0.4,
    color: colors.white,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  emailText: {
    fontSize: 13,
    fontFamily: fonts.bodySemiBold,
    color: colors.white,
  },

  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  paymentRowWide: { justifyContent: 'flex-end', maxWidth: 4 * 68 + 3 * 8 + 8 },
  paymentSlot: {
    width: 68,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
  },
  paymentNote: {
    fontSize: 10,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.55)',
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  copyright: {
    fontSize: 10,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
});