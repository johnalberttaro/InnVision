import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { useTheme } from '../../context/ThemeContext';
import Appfooter from '../../components/shared/Appfooter';
import GuestPageTop, { HeroButton } from '../../components/shared/GuestPageTop';

/**
 * ContactUsScreen — how to reach the hotel, an inquiry form, FAQ and
 * directions. Inquiries are saved to Supabase's `contact_messages` table.
 *
 * REDESIGNED (Oct 2026) to match the Home page: dark top + hero (shared
 * GuestPageTop) with Email / Directions buttons, contact cards, the form
 * beside the FAQ on wide screens, then the shared footer (new here).
 * The phone number was removed (same as the footer); the contact e-mail is
 * hmdepartment@gmail.com.
 *
 * Form behaviour is unchanged: only a signed-in guest can send (matches the
 * contact_messages_insert_own RLS policy — auth.uid() = user_id); the
 * screen reads the current user itself via supabase.auth.getUser().
 *
 * Props:
 *  - onBack: () => void
 */

const HOTEL_INFO = {
  name: 'InnVision Training Hotel',
  address: 'Consolatrix College of Toledo City, Inc., Toledo City, Cebu, Philippines',
  email: 'hmdepartment@gmail.com',
  hoursFrontDesk: 'Front desk: open 24 hours',
  hoursOffice: 'Office: Monday to Friday, 8:00 AM – 5:00 PM',
};

const FAQS = [
  {
    q: 'Do I need an account to book a room?',
    a: 'Yes. Sign in or create an account to book. Your account keeps your reservations, receipts and booking history in one place.',
  },
  {
    q: 'How can I check my reservation status?',
    a: 'Sign in and open My Reservations. Each booking shows its status, and you get notifications when the front desk confirms it.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'Pay at the hotel, or pay online with GCash, Maya, Maribank or GoTyme. Online payments in this system are simulated for demonstration.',
  },
  {
    q: 'Can I cancel or change my reservation?',
    a: 'Yes. Sign in and open My Reservations to cancel or request a longer stay. For anything else, send us a message or email us.',
  },
];

const GOLD = '#C9A14A';
const GOLD_LIGHT = '#F0D58E';
const F = {
  display: 'Inter_800ExtraBold',
  bold: 'Inter_700Bold',
  semi: 'Inter_600SemiBold',
  medium: 'Inter_500Medium',
  body: 'Inter_400Regular',
};
const web = (style) => (Platform.OS === 'web' ? style : null);

export default function ContactUsScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const isTablet = width >= 640;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, { isWide, isTablet, isDark }), [colors, isWide, isTablet, isDark]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');

  const [errors, setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | 'signed-out' | null

  const [openFaq, setOpenFaq] = useState(0);

  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null));
  }, []);

  const validate = () => {
    const next = {};
    if (!fullName.trim()) next.fullName = 'Enter your full name.';
    if (!email.trim()) {
      next.email = 'Enter your email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!subject.trim()) next.subject = 'Enter a subject.';
    if (!message.trim()) next.message = 'Enter your inquiry.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSend = async () => {
    setSubmitStatus(null);
    if (!validate()) return;

    if (!currentUser?.id) {
      setSubmitStatus('signed-out');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('contact_messages').insert({
        user_id: currentUser.id,
        name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        subject: subject.trim(),
        message: message.trim(),
        status: 'new',
      });
      if (error) throw error;

      setSubmitStatus('success');
      setFullName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setMessage('');
      setErrors({});
    } catch (err) {
      console.error('Failed to send inquiry:', err);
      setSubmitStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGetDirections = () => {
    const destination = encodeURIComponent(HOTEL_INFO.address);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`).catch(() => {});
  };
  const handleEmail = () => Linking.openURL(`mailto:${HOTEL_INFO.email}`).catch(() => {});

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <GuestPageTop
          title="Contact Us"
          onBack={onBack}
          headline="Questions about a stay or an event? We're here to help."
          lead="Reach the Hospitality Management Department about bookings, the Conference Room, the Banquet Hall, or the training hotel itself."
        >
          <HeroButton label="Email us" icon="mail-outline" onPress={handleEmail} />
          <HeroButton label="Get directions" icon="navigate-outline" onPress={handleGetDirections} variant="ghost" />
        </GuestPageTop>

        {/* ── Ways to reach us ───────────────────────────────────── */}
        <View style={styles.section}>
          <View style={[styles.inner, styles.infoGrid]}>
            <InfoCard
              styles={styles}
              icon="mail-outline"
              title="Email"
              value={HOTEL_INFO.email}
              hint="We reply on office days."
              onPress={handleEmail}
            />
            <InfoCard
              styles={styles}
              icon="location-outline"
              title="Address"
              value={HOTEL_INFO.address}
              hint="Open in Maps"
              onPress={handleGetDirections}
            />
            <InfoCard
              styles={styles}
              icon="time-outline"
              title="Hours"
              value={HOTEL_INFO.hoursFrontDesk}
              hint={HOTEL_INFO.hoursOffice}
            />
          </View>
        </View>

        {/* ── Form + FAQ ─────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionTint]}>
          <View style={[styles.inner, styles.twoCol]}>
            {/* Form */}
            <View style={[styles.card, styles.formCard]}>
              <Text style={styles.cardTitle} accessibilityRole="header">Send an inquiry</Text>
              <Text style={styles.cardLead}>Ask about your stay, a booking or an event. Sign in first so we can link your inquiry to your account and room.</Text>

              {submitStatus === 'success' && (
                <Banner styles={styles} tone="success" icon="checkmark-circle"
                  text="Inquiry sent. The Front Desk will get back to you soon." />
              )}
              {submitStatus === 'signed-out' && (
                <Banner styles={styles} tone="error" icon="log-in-outline"
                  text="Sign in to your account, then send your inquiry." />
              )}
              {submitStatus === 'error' && (
                <Banner styles={styles} tone="error" icon="alert-circle"
                  text="Your inquiry wasn't sent. Check your connection and try again." />
              )}

              <View style={styles.formRow}>
                <FormField styles={styles} colors={colors} half={isTablet}
                  icon="person-outline" label="Full name" value={fullName} onChangeText={setFullName}
                  placeholder="Juan Dela Cruz" error={errors.fullName} />
                <FormField styles={styles} colors={colors} half={isTablet}
                  icon="mail-outline" label="Email" value={email} onChangeText={setEmail}
                  placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" error={errors.email} />
              </View>
              <View style={styles.formRow}>
                <FormField styles={styles} colors={colors} half={isTablet}
                  icon="call-outline" label="Phone number (optional)" value={phone} onChangeText={setPhone}
                  placeholder="09XX XXX XXXX" keyboardType="phone-pad" />
                <FormField styles={styles} colors={colors} half={isTablet}
                  icon="pricetag-outline" label="Subject" value={subject} onChangeText={setSubject}
                  placeholder="What's this about?" error={errors.subject} />
              </View>
              <FormField styles={styles} colors={colors}
                icon="document-text-outline" label="Your inquiry" value={message} onChangeText={setMessage}
                placeholder="Type your inquiry here, e.g. Can I get an extra blanket in my room?" error={errors.message} multiline />

              <TouchableOpacity
                style={[styles.sendButton, submitting && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={submitting}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {submitting
                  ? <ActivityIndicator color="#231B12" size="small" />
                  : (
                    <>
                      <Ionicons name="send" size={15} color="#231B12" />
                      <Text style={styles.sendButtonText}>Send inquiry</Text>
                    </>
                  )}
              </TouchableOpacity>
            </View>

            {/* FAQ */}
            <View style={styles.faqCol}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Common questions</Text>
              <View style={styles.faqList}>
                {FAQS.map((item, i) => {
                  const isOpen = openFaq === i;
                  return (
                    <TouchableOpacity
                      key={item.q}
                      style={[styles.faqRow, i === FAQS.length - 1 && styles.faqRowLast]}
                      onPress={() => setOpenFaq(isOpen ? null : i)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                    >
                      <View style={styles.faqQuestionRow}>
                        <Text style={styles.faqQuestion}>{item.q}</Text>
                        <View style={[styles.faqToggle, isOpen && styles.faqToggleOpen]}>
                          <Ionicons name={isOpen ? 'remove' : 'add'} size={16} color={isOpen ? '#231B12' : styles.goldIcon.color} />
                        </View>
                      </View>
                      {isOpen && <Text style={styles.faqAnswer}>{item.a}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* ── Find us ────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.inner}>
            <TouchableOpacity style={styles.findUs} onPress={handleGetDirections} activeOpacity={0.9} accessibilityRole="button">
              <View style={styles.findUsPin}>
                <Ionicons name="location" size={22} color="#231B12" />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <Text style={styles.findUsTitle}>Find us</Text>
                <Text style={styles.findUsText}>{HOTEL_INFO.address}</Text>
              </View>
              <View style={styles.findUsAction}>
                <Text style={styles.findUsActionText}>Get directions</Text>
                <Ionicons name="navigate-outline" size={15} color="#F7F2EA" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <Appfooter />
      </ScrollView>
    </View>
  );
}

function InfoCard({ styles, icon, title, value, hint, onPress }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.infoCard} {...(onPress ? { onPress, activeOpacity: 0.85, accessibilityRole: 'button' } : {})}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={styles.goldIcon.color} />
      </View>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      {!!hint && <Text style={[styles.infoHint, onPress && styles.infoHintLink]}>{hint}</Text>}
    </Wrap>
  );
}

function Banner({ styles, tone, icon, text }) {
  const ok = tone === 'success';
  return (
    <View style={[styles.banner, ok ? styles.bannerOk : styles.bannerErr]}>
      <Ionicons name={icon} size={18} color={ok ? '#1E7B34' : '#B3261E'} />
      <Text style={[styles.bannerText, { color: ok ? '#1E5B2C' : '#8C1D18' }]}>{text}</Text>
    </View>
  );
}

function FormField({ label, error, multiline, icon, half, styles, colors, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.fieldWrap, half && styles.fieldWrapHalf]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[
        styles.fieldInputRow,
        multiline && styles.fieldInputRowMultiline,
        focused && styles.fieldInputRowFocused,
        !!error && styles.fieldInputRowError,
      ]}>
        {!!icon && (
          <Ionicons name={icon} size={16} color={colors.textMuted} style={multiline ? styles.fieldIconTop : null} />
        )}
        <TextInput
          style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          numberOfLines={multiline ? 5 : 1}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

function getStyles(colors, { isWide, isTablet, isDark }) {
  const gutter = isTablet ? 32 : 20;
  const cardShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 14px 34px rgba(0,0,0,0.35)'
    : '0 1px 2px rgba(43,36,28,0.06), 0 14px 34px rgba(43,36,28,0.09)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,36,28,0.08)';
  const goldText = isDark ? GOLD_LIGHT : '#6B4E1E';

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, #1E1A14 0%, #17130F 100%)'
          : 'linear-gradient(180deg, #FBF8F3 0%, #F4EDE2 100%)',
      }),
    },
    scroll: { flex: 1 },
    goldIcon: { color: goldText },

    section: { paddingHorizontal: gutter, paddingVertical: isWide ? 72 : 48 },
    sectionTint: {
      backgroundColor: colors.cardAlt,
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 100%)'
          : 'linear-gradient(180deg, #F3EBDD 0%, #EFE5D4 100%)',
      }),
    },
    inner: { width: '100%', maxWidth: 1160, alignSelf: 'center' },
    sectionTitle: {
      fontFamily: F.display, fontSize: isTablet ? 30 : 26, lineHeight: isTablet ? 34 : 30,
      letterSpacing: isTablet ? -1 : -0.8, color: colors.text,
    },

    /* Info cards */
    infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
    infoCard: {
      width: isWide ? '31%' : isTablet ? '46%' : '100%', flexGrow: 1,
      backgroundColor: colors.card, borderRadius: 20, padding: 22,
      borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
    },
    infoIcon: {
      width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(240,213,142,0.16)' : '#E9D6A6',
      ...web({
        backgroundImage: isDark
          ? 'linear-gradient(180deg, rgba(240,213,142,0.22) 0%, rgba(201,161,74,0.14) 100%)'
          : 'linear-gradient(180deg, #F6E7BF 0%, #E9D19A 100%)',
      }),
      marginBottom: 16,
    },
    infoTitle: { fontFamily: F.semi, fontSize: 13, color: colors.textMuted },
    infoValue: { marginTop: 4, fontFamily: F.bold, fontSize: 16, lineHeight: 23, letterSpacing: -0.3, color: colors.text },
    infoHint: { marginTop: 6, fontFamily: F.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },
    infoHintLink: { color: goldText, fontFamily: F.semi },

    /* Form + FAQ */
    twoCol: { flexDirection: isWide ? 'row' : 'column', gap: isWide ? 48 : 40, alignItems: 'flex-start' },
    card: {
      backgroundColor: colors.card, borderRadius: 22,
      borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
    },
    formCard: { flex: isWide ? 1.25 : undefined, width: isWide ? undefined : '100%', padding: isTablet ? 28 : 20 },
    cardTitle: { fontFamily: F.display, fontSize: isTablet ? 24 : 22, letterSpacing: -0.7, color: colors.text },
    cardLead: { marginTop: 4, marginBottom: 18, fontFamily: F.body, fontSize: 14, lineHeight: 21, color: colors.textMuted },

    banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 16 },
    bannerOk: { backgroundColor: '#DFF5E1' },
    bannerErr: { backgroundColor: '#FCE1E1' },
    bannerText: { flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 19 },

    formRow: { flexDirection: isTablet ? 'row' : 'column', gap: isTablet ? 14 : 0 },
    fieldWrap: { marginBottom: 14 },
    fieldWrapHalf: { flex: 1 },
    fieldLabel: { fontFamily: F.semi, fontSize: 13, color: colors.text, marginBottom: 6 },
    fieldInputRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(43,36,28,0.14)', borderRadius: 12,
      paddingHorizontal: 14, minHeight: 48,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFDF9',
    },
    fieldInputRowMultiline: { alignItems: 'flex-start', paddingVertical: 12, minHeight: 130 },
    fieldInputRowFocused: { borderColor: GOLD, ...web({ boxShadow: '0 0 0 3px rgba(201,161,74,0.20)' }) },
    fieldInputRowError: { borderColor: '#B3261E' },
    fieldIconTop: { marginTop: 2 },
    fieldInput: {
      flex: 1, fontFamily: F.body, fontSize: 15, color: colors.text, paddingVertical: 12,
      ...web({ outlineStyle: 'none' }),
    },
    fieldInputMultiline: { minHeight: 104, paddingVertical: 0 },
    fieldError: { marginTop: 5, fontFamily: F.medium, fontSize: 12, color: '#B3261E' },

    sendButton: {
      marginTop: 6,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: '#DDBB6C',
      ...web({
        backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
        boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 10px 26px rgba(201,161,74,0.30)',
      }),
      borderRadius: 12, paddingVertical: 15,
    },
    sendButtonDisabled: { opacity: 0.6 },
    sendButtonText: { fontFamily: F.semi, fontSize: 15, color: '#231B12', letterSpacing: -0.1 },

    faqCol: { flex: isWide ? 1 : undefined, width: isWide ? undefined : '100%' },
    faqList: { marginTop: 18 },
    faqRow: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(43,36,28,0.12)' },
    faqRowLast: { borderBottomWidth: 0 },
    faqQuestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
    faqQuestion: { flex: 1, fontFamily: F.bold, fontSize: 16, lineHeight: 22, letterSpacing: -0.3, color: colors.text },
    faqToggle: {
      width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: isDark ? 'rgba(240,213,142,0.35)' : 'rgba(107,78,30,0.30)',
    },
    faqToggleOpen: {
      borderColor: 'transparent', backgroundColor: '#DDBB6C',
      ...web({ backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)` }),
    },
    faqAnswer: { marginTop: 10, fontFamily: F.body, fontSize: 14, lineHeight: 22, color: colors.textMuted, paddingRight: 40 },

    /* Find us */
    findUs: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18,
      padding: isTablet ? 28 : 20, borderRadius: 22,
      backgroundColor: '#221B15',
      ...web({
        backgroundImage: 'radial-gradient(ellipse at 100% 0%, rgba(231,203,130,0.20) 0%, rgba(231,203,130,0) 55%), linear-gradient(135deg, #1B1511 0%, #3A2B1D 100%)',
        boxShadow: '0 20px 50px rgba(23,18,14,0.25)',
      }),
    },
    findUsPin: {
      width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#DDBB6C',
      ...web({ backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)` }),
    },
    findUsTitle: { fontFamily: F.display, fontSize: 20, letterSpacing: -0.6, color: '#F7F2EA' },
    findUsText: { marginTop: 3, fontFamily: F.body, fontSize: 14, lineHeight: 21, color: 'rgba(247,242,234,0.72)' },
    findUsAction: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12,
      borderWidth: 1, borderColor: 'rgba(247,242,234,0.22)', backgroundColor: 'rgba(247,242,234,0.06)',
    },
    findUsActionText: { fontFamily: F.semi, fontSize: 14, color: '#F7F2EA' },
  });
}
