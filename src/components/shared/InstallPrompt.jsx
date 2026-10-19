import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * InstallPrompt — "Install InnVision" card at the bottom of the guest Home
 * page (web only), with Install Now and Learn More.
 *
 *  - Android / desktop Chrome & Edge: Install Now opens the browser's own
 *    install dialog (the saved `beforeinstallprompt` event).
 *  - iPhone / iPad (Safari has no install dialog): Install Now opens the
 *    short "Share → Add to Home Screen" steps instead.
 *  - Hidden when the app is already installed (opened from the home-screen
 *    icon), after it gets installed, and for 7 days after the guest taps ✕.
 *  - Does nothing in the Expo Go / native app.
 */

const LOGO = require('../../../assets/logo.png');
const DISMISS_KEY = 'innvision_install_dismissed_at';
const DISMISS_DAYS = 7;
const SHOW_DELAY_MS = 2500;

const BG = '#17120E';
const TEXT = '#F7F2EA';
const MUTED = 'rgba(247,242,234,0.70)';
const GOLD = '#C9A14A';
const GOLD_LIGHT = '#F0D58E';
const INK = '#1C1712';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
const web = (s) => (Platform.OS === 'web' ? s : null);

// The browser can fire `beforeinstallprompt` while the loading screen is still
// showing — before this card is on screen — so it is caught here, as soon as
// the app's code loads, and kept until the guest taps Install Now.
let savedPrompt = null;
const listeners = new Set();
if (isWeb) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // use our card instead of Chrome's small default bar
    savedPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    savedPrompt = null;
    listeners.forEach((fn) => fn(true));
  });
}

const isInstalled = () => {
  if (!isWeb) return true;
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
};

const isIOS = () => {
  if (!isWeb) return false;
  const ua = window.navigator.userAgent || '';
  const iPadOS = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadOS;
};

const dismissedRecently = () => {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const rememberDismiss = () => {
  try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage blocked: fine */ }
};

export default function InstallPrompt() {
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const [canPrompt, setCanPrompt] = useState(!!savedPrompt);
  const [visible, setVisible] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (!isWeb || isInstalled() || dismissedRecently()) return undefined;
    const onChange = (installed) => {
      if (installed) { setVisible(false); setLearnOpen(false); return; }
      setCanPrompt(!!savedPrompt);
    };
    listeners.add(onChange);
    // Show only where installing is possible: a saved install dialog
    // (Chrome/Edge) or an iPhone/iPad (manual steps).
    const t = setTimeout(() => setVisible(!!savedPrompt || ios), SHOW_DELAY_MS);
    return () => { listeners.delete(onChange); clearTimeout(t); };
  }, [ios]);

  // The install dialog can become available after the delay, too.
  useEffect(() => {
    if (canPrompt && !visible && isWeb && !isInstalled() && !dismissedRecently()) {
      const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [canPrompt, visible]);

  if (!isWeb) return null;

  const install = async () => {
    if (!savedPrompt) { setLearnOpen(true); return; }
    const p = savedPrompt;
    savedPrompt = null; // the dialog can only be shown once
    setCanPrompt(false);
    try {
      p.prompt();
      const choice = await p.userChoice;
      if (choice?.outcome === 'accepted') { setVisible(false); setLearnOpen(false); }
    } catch {
      setLearnOpen(true);
    }
  };

  const dismiss = () => { rememberDismiss(); setVisible(false); };

  return (
    <>
      {visible && (
        <View style={[styles.wrap, isWide && styles.wrapWide]} pointerEvents="box-none">
          <View style={styles.card} accessibilityRole="alert">
            <View style={styles.topRow}>
              <View style={styles.logoTile}>
                <Image source={LOGO} style={styles.logo} resizeMode="contain" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>Install InnVision</Text>
                <Text style={styles.subtitle}>Open it from your home screen, like an app.</Text>
              </View>
              <TouchableOpacity onPress={dismiss} style={styles.close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={MUTED} />
              </TouchableOpacity>
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.primary} onPress={install} activeOpacity={0.88} accessibilityRole="button">
                <Ionicons name={ios && !canPrompt ? 'share-outline' : 'download-outline'} size={18} color={INK} />
                <Text style={styles.primaryText}>{ios && !canPrompt ? 'How to install' : 'Install Now'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghost} onPress={() => setLearnOpen(true)} activeOpacity={0.85} accessibilityRole="button">
                <Text style={styles.ghostText}>Learn More</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal visible={learnOpen} transparent animationType="fade" onRequestClose={() => setLearnOpen(false)}>
        <View style={[styles.backdrop, isWide && { justifyContent: 'center', padding: 24 }]}>
          <View style={[styles.sheet, isWide && styles.sheetWide]}>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              <View style={styles.sheetHead}>
                <View style={[styles.logoTile, { width: 52, height: 52, borderRadius: 15 }]}>
                  <Image source={LOGO} style={{ width: 34, height: 34 }} resizeMode="contain" />
                </View>
                <TouchableOpacity onPress={() => setLearnOpen(false)} style={styles.close} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={MUTED} />
                </TouchableOpacity>
              </View>
              <Text style={styles.sheetTitle}>Get InnVision on your phone</Text>
              <Text style={styles.sheetLead}>
                Installing adds InnVision to your home screen. It's free, takes a few seconds, and uses almost no storage.
              </Text>

              {[
                { icon: 'flash-outline', text: 'Opens straight from your home screen, full screen, no browser bar' },
                { icon: 'calendar-outline', text: 'Get to your reservations and receipts faster' },
                { icon: 'notifications-outline', text: 'See your check-in and check-out reminders' },
                { icon: 'phone-portrait-outline', text: 'Nothing to download from the Play Store or App Store' },
              ].map((b) => (
                <View key={b.text} style={styles.benefit}>
                  <View style={styles.benefitIcon}><Ionicons name={b.icon} size={16} color={GOLD_LIGHT} /></View>
                  <Text style={styles.benefitText}>{b.text}</Text>
                </View>
              ))}

              <Text style={styles.stepsHead}>{ios ? 'On iPhone or iPad (Safari)' : 'How to install'}</Text>
              {(ios
                ? ['Tap the Share button at the bottom of Safari.', 'Scroll down and tap "Add to Home Screen".', 'Tap "Add". InnVision appears on your home screen.']
                : canPrompt
                  ? ['Tap "Install now" below.', 'Confirm with "Install" in the box that appears.', 'Open InnVision from your home screen or app list.']
                  : ['Open the browser menu ⋮ (top right).', 'Tap "Install app" or "Add to Home screen".', 'Confirm. InnVision appears on your home screen.']
              ).map((s, i) => (
                <View key={s} style={styles.step}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}

              {canPrompt && (
                <TouchableOpacity style={[styles.primary, { marginTop: 20, flex: 0 }]} onPress={install} activeOpacity={0.88}>
                  <Ionicons name="download-outline" size={18} color={INK} />
                  <Text style={styles.primaryText}>Install now</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.ghost, { marginTop: 10, flex: 0 }]} onPress={() => setLearnOpen(false)} activeOpacity={0.85}>
                <Text style={styles.ghostText}>Maybe later</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 12, right: 12, bottom: 16, zIndex: 50,
    ...web({ position: 'fixed' }),
  },
  wrapWide: { left: 'auto', right: 24, bottom: 24, width: 420 },
  card: {
    backgroundColor: BG, borderRadius: 22, padding: 16,
    borderWidth: 1, borderColor: 'rgba(240,213,142,0.22)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
    ...web({
      backgroundImage: [
        'radial-gradient(ellipse at 100% 0%, rgba(201,161,74,0.28) 0%, rgba(201,161,74,0) 55%)',
        'linear-gradient(160deg, #1E1813 0%, #17120E 100%)',
      ].join(', '),
      boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
    }),
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoTile: {
    width: 50, height: 50, borderRadius: 14, backgroundColor: '#F7F2EA',
    alignItems: 'center', justifyContent: 'center',
    ...web({ backgroundImage: 'linear-gradient(160deg, #FBF7F0 0%, #EFE6D6 100%)' }),
  },
  logo: { width: 34, height: 34 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16.5, color: TEXT, letterSpacing: -0.3 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13.5, color: MUTED, marginTop: 2 },
  close: { padding: 4, alignSelf: 'flex-start' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primary: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 46, borderRadius: 13, backgroundColor: '#DDBB6C',
    ...web({
      backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
      boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 8px 20px rgba(201,161,74,0.28)',
    }),
  },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: INK },
  ghost: {
    flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 13,
    borderWidth: 1, borderColor: 'rgba(247,242,234,0.22)', backgroundColor: 'rgba(247,242,234,0.06)',
  },
  ghostText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: TEXT },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(10,8,6,0.62)', justifyContent: 'flex-end',
    ...web({ backdropFilter: 'blur(4px)' }),
  },
  sheet: {
    backgroundColor: BG, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '90%',
    borderWidth: 1, borderColor: 'rgba(240,213,142,0.18)',
    ...web({ backgroundImage: 'radial-gradient(ellipse at 100% 0%, rgba(201,161,74,0.22) 0%, rgba(201,161,74,0) 50%)' }),
  },
  sheetWide: { alignSelf: 'center', width: 480, maxWidth: '100%', borderRadius: 26 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: 'Inter_800ExtraBold', fontSize: 24, letterSpacing: -0.6, color: TEXT, marginTop: 16 },
  sheetLead: { fontFamily: 'Inter_400Regular', fontSize: 14.5, lineHeight: 22, color: MUTED, marginTop: 8, marginBottom: 14 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  benefitIcon: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(240,213,142,0.10)', borderWidth: 1, borderColor: 'rgba(240,213,142,0.22)',
  },
  benefitText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, color: TEXT },
  stepsHead: {
    fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase',
    color: GOLD_LIGHT, marginTop: 20, marginBottom: 8,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: INK },
  stepText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14.5, lineHeight: 21, color: TEXT },
});
