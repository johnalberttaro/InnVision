import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Shared dark top for the guest info pages (About, Contact Us): a slim bar
// with a back button and the page name, then a hero with a big headline —
// same look as the Home page (HomeScreen.jsx / HomeHeader.jsx).
const BG = '#17120E';
const TEXT = '#F7F2EA';
const MUTED = 'rgba(247,242,234,0.70)';
const web = (style) => (Platform.OS === 'web' ? style : null);

/**
 * Props:
 *  - title: string          page name in the top bar
 *  - onBack: () => void
 *  - headline: string       big hero line
 *  - lead?: string          one or two sentences under it
 *  - children?: node        optional hero actions (buttons) under the lead
 */
export default function GuestPageTop({ title, onBack, headline, lead, children }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const isTablet = width >= 640;
  const titleSize = isWide ? 56 : isTablet ? 44 : 34;

  return (
    <View>
      <View style={styles.bar}>
        <View style={styles.barInner}>
          <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.barTitle}>{title}</Text>
          <View style={styles.backSpacer} />
        </View>
      </View>

      <View style={[styles.hero, { paddingTop: isWide ? 64 : 40, paddingBottom: isWide ? 72 : 44, paddingHorizontal: isTablet ? 32 : 20 }]}>
        <View style={styles.heroInner}>
          <Text
            style={[styles.headline, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.05), letterSpacing: -(titleSize * 0.034) }]}
            accessibilityRole="header"
          >
            {headline}
          </Text>
          {!!lead && <Text style={[styles.lead, { fontSize: isTablet ? 18 : 16, lineHeight: isTablet ? 29 : 25 }]}>{lead}</Text>}
          {children ? <View style={styles.actions}>{children}</View> : null}
        </View>
      </View>
    </View>
  );
}

// Hero buttons, shared by the pages that use this top.
export function HeroButton({ label, icon, onPress, variant = 'primary' }) {
  const primary = variant === 'primary';
  return (
    <TouchableOpacity
      style={primary ? styles.btnPrimary : styles.btnGhost}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      {!!icon && <Ionicons name={icon} size={16} color={primary ? '#231B12' : TEXT} />}
      <Text style={primary ? styles.btnPrimaryText : styles.btnGhostText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(247,242,234,0.08)',
    ...web({ backgroundImage: 'linear-gradient(180deg, #1B1511 0%, #17120E 100%)' }),
  },
  barInner: {
    width: '100%', maxWidth: 1240, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  back: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(247,242,234,0.08)',
    borderWidth: 1, borderColor: 'rgba(247,242,234,0.12)',
  },
  backSpacer: { width: 38 },
  barTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: TEXT, letterSpacing: -0.2 },

  hero: {
    backgroundColor: '#221B15',
    ...web({
      backgroundImage: [
        'radial-gradient(ellipse at 88% 10%, rgba(231,203,130,0.20) 0%, rgba(231,203,130,0) 46%)',
        'radial-gradient(ellipse at 0% 100%, rgba(150,104,58,0.28) 0%, rgba(150,104,58,0) 50%)',
        'linear-gradient(160deg, #17120E 0%, #2A2119 55%, #3E2E1F 100%)',
      ].join(', '),
    }),
  },
  heroInner: { width: '100%', maxWidth: 1160, alignSelf: 'center' },
  headline: { fontFamily: 'Inter_800ExtraBold', color: TEXT, maxWidth: 820 },
  lead: { marginTop: 18, fontFamily: 'Inter_400Regular', color: MUTED, maxWidth: 640, letterSpacing: -0.1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 28 },

  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#DDBB6C',
    ...web({
      backgroundImage: 'linear-gradient(180deg, #F0D58E 0%, #C9A14A 100%)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 10px 26px rgba(201,161,74,0.32)',
    }),
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 22,
  },
  btnPrimaryText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#231B12', letterSpacing: -0.1 },
  btnGhost: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(247,242,234,0.22)',
    backgroundColor: 'rgba(247,242,234,0.06)',
  },
  btnGhostText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: TEXT, letterSpacing: -0.1 },
});