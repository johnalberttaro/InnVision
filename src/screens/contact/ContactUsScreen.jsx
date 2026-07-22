import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, fonts, radius } from '../../utils/theme';

/**
 * ContactUsScreen — hotel info, inquiry form, map placeholder, social
 * links, and FAQ. Saves inquiries to Supabase's `contact_messages` table.
 *
 * MIGRATED TO SUPABASE. Per an earlier decision, only a logged-in user
 * can submit an inquiry (matches the contact_messages_insert_own RLS
 * policy, which requires an authenticated session and auth.uid() =
 * user_id) — this screen didn't previously receive a `user` prop, so it
 * now fetches the current user itself via supabase.auth.getUser() (same
 * self-contained pattern as MyReservationsScreen.jsx) rather than
 * requiring an App.jsx change. If nobody's logged in, the form shows a
 * "please log in" message instead of submitting.
 *
 * Dark mode: follows the device's OS-level dark mode setting via
 * useColorScheme(). Brand colors (primary/accent/hero) come from theme.js
 * and are shared across both modes; neutral surface colors swap locally.
 *
 * Props:
 *  - onBack: () => void
 */

const HOTEL_INFO = {
  name: 'InnVision Training Hotel',
  address: 'Consolatrix College of Toledo City, Inc., Toledo City, Cebu, Philippines',
  phone: '0970 175 6831',
  email: 'info@innvision.edu.ph',
  hours: 'Front Desk: Open 24/7  •  Office: Mon–Fri, 8:00 AM – 5:00 PM',
};

const SOCIAL_LINKS = {
  facebook:  'https://facebook.com/innvision',
  instagram: 'https://instagram.com/innvision',
  email:     `mailto:${HOTEL_INFO.email}`,
};

const FAQS = [
  {
    q: 'Do I need an account to book a room?',
    a: 'No. InnVision supports hybrid guest access — you can reserve a room with or without creating an account.',
  },
  {
    q: 'How can I check my reservation status?',
    a: 'Use the "Find My Booking" feature on the home page and search by the phone number you booked with, or your reservation reference.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We currently accept GCash, Maya, Maribank, and GoTyme, alongside pay-at-hotel options.',
  },
  {
    q: 'Can I cancel or modify my reservation?',
    a: 'Please contact our front desk directly using the phone number or email above, and our staff will assist you.',
  },
];

function getPalette(isDark) {
  return isDark
    ? {
        background: '#121212',
        card: '#1E1E1E',
        cardAlt: '#252525',
        border: '#333333',
        text: '#F5F5F5',
        textMuted: '#A0A0A0',
        inputBg: '#252525',
      }
    : {
        background: colors.background,
        card: colors.card,
        cardAlt: colors.cardAlt,
        border: colors.border,
        text: colors.text,
        textMuted: colors.textMuted,
        inputBg: colors.white,
      };
}

export default function ContactUsScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isDark = useColorScheme() === 'dark';
  const p = getPalette(isDark);
  const styles = getStyles(p);

  const [fullName, setFullName] = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');

  const [errors, setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | 'signed-out' | null

  const [openFaq, setOpenFaq] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null));
  }, []);

  const validate = () => {
    const next = {};
    if (!fullName.trim()) next.fullName = 'Please enter your full name.';
    if (!email.trim()) {
      next.email = 'Please enter your email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Please enter a valid email address.';
    }
    if (!subject.trim()) next.subject = 'Please enter a subject.';
    if (!message.trim()) next.message = 'Please enter your message.';
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
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  };

  const handleCall = () => Linking.openURL(`tel:${HOTEL_INFO.phone.replace(/\s+/g, '')}`);
  const handleEmail = () => Linking.openURL(`mailto:${HOTEL_INFO.email}`);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, isWide && styles.headerWide]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={isWide && styles.wideContainer}>
          <View style={styles.contentPad}>

            {/* ── Hotel Info (brand block + icon-chip details) ────── */}
            <View style={styles.card}>
              <View style={styles.brandBlock}>
                <View style={styles.logoBadge}>
                  <Ionicons name="business-outline" size={24} color={colors.white} />
                </View>
                <Text style={styles.brandName}>{HOTEL_INFO.name}</Text>
                <Text style={styles.brandTagline}>We're here to help, anytime you need us</Text>
              </View>

              <View style={styles.brandDivider} />

              <View style={[styles.infoGrid, isWide && styles.infoGridWide]}>
                <View style={[styles.infoChip, isWide && styles.infoChipWide]}>
                  <View style={styles.infoIconWrap}>
                    <Ionicons name="location-outline" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Address</Text>
                    <Text style={styles.infoValue}>{HOTEL_INFO.address}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.infoChip, isWide && styles.infoChipWide]}
                  onPress={handleCall}
                  activeOpacity={0.7}
                >
                  <View style={styles.infoIconWrap}>
                    <Ionicons name="call-outline" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Contact Number</Text>
                    <Text style={[styles.infoValue, styles.infoLink]}>{HOTEL_INFO.phone}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.infoChip, isWide && styles.infoChipWide]}
                  onPress={handleEmail}
                  activeOpacity={0.7}
                >
                  <View style={styles.infoIconWrap}>
                    <Ionicons name="mail-outline" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Email Address</Text>
                    <Text style={[styles.infoValue, styles.infoLink]}>{HOTEL_INFO.email}</Text>
                  </View>
                </TouchableOpacity>

                <View style={[styles.infoChip, isWide && styles.infoChipWide]}>
                  <View style={styles.infoIconWrap}>
                    <Ionicons name="time-outline" size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Operating Hours</Text>
                    <Text style={styles.infoValue}>{HOTEL_INFO.hours}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ── Contact Form ───────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.primary} />
                <Text style={styles.cardTitle}>Send Us a Message</Text>
              </View>

              {submitStatus === 'success' && (
                <View style={styles.successBanner}>
                  <Ionicons name="checkmark-circle" size={18} color="#1E7B34" />
                  <Text style={styles.successBannerText}>
                    Thanks! Your message has been sent — we'll get back to you soon.
                  </Text>
                </View>
              )}
              {submitStatus === 'signed-out' && (
                <View style={styles.errorBanner}>
                  <Ionicons name="log-in-outline" size={18} color={colors.danger} />
                  <Text style={styles.errorBannerText}>
                    Please log in to your account before sending an inquiry.
                  </Text>
                </View>
              )}
              {submitStatus === 'error' && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={colors.danger} />
                  <Text style={styles.errorBannerText}>
                    Something went wrong sending your message. Please try again.
                  </Text>
                </View>
              )}

              <View style={[styles.formRow, isWide && styles.formRowWide]}>
                <FormField
                  wide={isWide}
                  icon="person-outline"
                  label="Full Name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Juan Dela Cruz"
                  error={errors.fullName}
                  styles={styles}
                  palette={p}
                />
                <FormField
                  wide={isWide}
                  icon="mail-outline"
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  error={errors.email}
                  styles={styles}
                  palette={p}
                />
              </View>

              <View style={[styles.formRow, isWide && styles.formRowWide]}>
                <FormField
                  wide={isWide}
                  icon="call-outline"
                  label="Phone Number (optional)"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="0970 175 6831"
                  keyboardType="phone-pad"
                  styles={styles}
                  palette={p}
                />
                <FormField
                  wide={isWide}
                  icon="pricetag-outline"
                  label="Subject"
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="What's this about?"
                  error={errors.subject}
                  styles={styles}
                  palette={p}
                />
              </View>

              <FormField
                icon="document-text-outline"
                label="Message"
                value={message}
                onChangeText={setMessage}
                placeholder="Type your message here..."
                error={errors.message}
                multiline
                styles={styles}
                palette={p}
              />

              <TouchableOpacity
                style={[styles.sendButton, submitting && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : (
                    <>
                      <Ionicons name="send" size={15} color={colors.white} />
                      <Text style={styles.sendButtonText}>Send Inquiry</Text>
                    </>
                  )
                }
              </TouchableOpacity>
            </View>

            {/* ── Location ───────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="map-outline" size={18} color={colors.primary} />
                <Text style={styles.cardTitle}>Find Us</Text>
              </View>
              <TouchableOpacity style={styles.mapPlaceholder} onPress={handleGetDirections} activeOpacity={0.85}>
                <View style={styles.mapPinRing}>
                  <Ionicons name="location" size={22} color={colors.primary} />
                </View>
                <Text style={styles.mapPlaceholderText}>{HOTEL_INFO.address}</Text>
                <Text style={styles.mapTapHint}>Tap to open in Maps</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.directionsButton} onPress={handleGetDirections} activeOpacity={0.85}>
                <Ionicons name="navigate-outline" size={16} color={colors.white} />
                <Text style={styles.directionsButtonText}>Get Directions</Text>
              </TouchableOpacity>
            </View>

            {/* ── Social ─────────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="share-social-outline" size={18} color={colors.primary} />
                <Text style={styles.cardTitle}>Follow Us</Text>
              </View>
              <View style={styles.socialRow}>
                <SocialButton
                  icon="logo-facebook"
                  label="Facebook"
                  onPress={() => Linking.openURL(SOCIAL_LINKS.facebook)}
                  styles={styles}
                />
                <SocialButton
                  icon="logo-instagram"
                  label="Instagram"
                  onPress={() => Linking.openURL(SOCIAL_LINKS.instagram)}
                  styles={styles}
                />
                <SocialButton
                  icon="mail-outline"
                  label="Email"
                  onPress={() => Linking.openURL(SOCIAL_LINKS.email)}
                  styles={styles}
                />
              </View>
            </View>

            {/* ── FAQ ────────────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="help-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.cardTitle}>Frequently Asked Questions</Text>
              </View>
              {FAQS.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <TouchableOpacity
                    key={item.q}
                    style={[styles.faqRow, i === FAQS.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => setOpenFaq(isOpen ? null : i)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.faqQuestionRow}>
                      <Text style={styles.faqQuestion}>{item.q}</Text>
                      <View style={[styles.faqChevronWrap, isOpen && styles.faqChevronWrapOpen]}>
                        <Ionicons
                          name={isOpen ? 'remove' : 'add'}
                          size={16}
                          color={isOpen ? colors.white : colors.primary}
                        />
                      </View>
                    </View>
                    {isOpen && <Text style={styles.faqAnswer}>{item.a}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ── Reusable form field ─────────────────────────────────────────────── */
function FormField({ label, error, multiline, icon, wide, styles, palette, ...inputProps }) {
  return (
    <View style={[styles.fieldWrap, wide && styles.fieldWrapWide]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[
        styles.fieldInputRow,
        multiline && styles.fieldInputRowMultiline,
        error && styles.fieldInputRowError,
      ]}>
        {!!icon && (
          <Ionicons
            name={icon}
            size={16}
            color={palette.textMuted}
            style={multiline ? styles.fieldIconTop : styles.fieldIcon}
          />
        )}
        <TextInput
          style={[styles.fieldInput, multiline && styles.fieldInputMultiline]}
          placeholderTextColor={palette.textMuted}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...inputProps}
        />
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

/* ── Reusable social button ───────────────────────────────────────────── */
function SocialButton({ icon, label, onPress, styles }) {
  return (
    <TouchableOpacity style={styles.socialButton} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.socialIconRing}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.socialButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ── Styles (built from the light/dark palette) ──────────────────────── */
function getStyles(p) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: p.background,
    },
    scroll: {
      flex: 1,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.heroBackground,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    headerWide: {
      paddingHorizontal: spacing.xxl * 2,
    },
    backButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: fonts.headingSemiBold,
      color: colors.white,
      letterSpacing: 0.3,
    },
    headerSpacer: {
      width: 36,
    },

    wideContainer: {
      maxWidth: 800,
      alignSelf: 'center',
      width: '100%',
    },
    contentPad: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },

    card: {
      backgroundColor: p.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 2,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    cardTitle: {
      fontSize: 16,
      fontFamily: fonts.headingExtraBold,
      color: colors.aboutAccent,
    },

    /* Brand block */
    brandBlock: {
      alignItems: 'center',
      paddingBottom: spacing.md,
    },
    logoBadge: {
      width: 52,
      height: 52,
      borderRadius: radius.lg,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    brandName: {
      fontSize: 18,
      fontFamily: fonts.headingExtraBold,
      color: p.text,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    brandTagline: {
      fontSize: 12,
      fontFamily: fonts.bodyMedium,
      color: p.textMuted,
      textAlign: 'center',
    },
    brandDivider: {
      height: 1,
      backgroundColor: p.border,
      marginBottom: spacing.lg,
    },

    /* Hotel info chips */
    infoGrid: {
      gap: spacing.md,
    },
    infoGridWide: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    infoChip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: p.cardAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    infoChipWide: {
      width: '48%',
    },
    infoIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    infoLabel: {
      fontSize: 10,
      fontFamily: fonts.bodySemiBold,
      color: p.textMuted,
      letterSpacing: 0.4,
      marginBottom: 2,
      textTransform: 'uppercase',
    },
    infoValue: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: p.text,
      lineHeight: 18,
    },
    infoLink: {
      color: colors.primary,
      fontFamily: fonts.bodySemiBold,
    },

    /* Form */
    formRow: {
      gap: 0,
    },
    formRowWide: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    fieldWrap: {
      marginBottom: spacing.md,
    },
    fieldWrapWide: {
      flex: 1,
    },
    fieldLabel: {
      fontSize: 12,
      fontFamily: fonts.bodySemiBold,
      color: p.textMuted,
      marginBottom: spacing.xs,
    },
    fieldInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.md,
      backgroundColor: p.inputBg,
      paddingHorizontal: spacing.md,
    },
    fieldInputRowMultiline: {
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
    },
    fieldInputRowError: {
      borderColor: colors.danger,
    },
    fieldIcon: {
      marginRight: spacing.sm,
    },
    fieldIconTop: {
      marginRight: spacing.sm,
      marginTop: spacing.sm + 2,
    },
    fieldInput: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      fontSize: 13,
      fontFamily: fonts.body,
      color: p.text,
    },
    fieldInputMultiline: {
      minHeight: 90,
      paddingTop: spacing.xs,
    },
    fieldError: {
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.danger,
      marginTop: spacing.xs,
    },

    successBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: '#e8f5e9',
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    successBannerText: {
      flex: 1,
      fontSize: 12,
      fontFamily: fonts.bodyMedium,
      color: '#1E7B34',
      lineHeight: 17,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.dangerBg,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    errorBannerText: {
      flex: 1,
      fontSize: 12,
      fontFamily: fonts.bodyMedium,
      color: colors.danger,
      lineHeight: 17,
    },

    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.xs,
    },
    sendButtonDisabled: {
      opacity: 0.7,
    },
    sendButtonText: {
      color: colors.white,
      fontFamily: fonts.headingSemiBold,
      fontSize: 14,
      letterSpacing: 0.3,
    },

    /* Map */
    mapPlaceholder: {
      minHeight: 150,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: p.border,
      borderStyle: 'dashed',
      backgroundColor: p.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      marginBottom: spacing.md,
    },
    mapPinRing: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primaryTint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    mapPlaceholderText: {
      fontSize: 12,
      fontFamily: fonts.bodyMedium,
      color: p.text,
      textAlign: 'center',
    },
    mapTapHint: {
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.primary,
      marginTop: 2,
    },
    directionsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 2,
    },
    directionsButtonText: {
      color: colors.white,
      fontFamily: fonts.headingSemiBold,
      fontSize: 13,
    },

    /* Social */
    socialRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    socialButton: {
      alignItems: 'center',
      gap: spacing.xs,
    },
    socialIconRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primaryTint,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    socialButtonText: {
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
      color: p.text,
    },

    /* FAQ */
    faqRow: {
      paddingVertical: spacing.md,
      borderBottomWidth: 0.5,
      borderBottomColor: p.border,
    },
    faqQuestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    faqQuestion: {
      flex: 1,
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: p.text,
    },
    faqChevronWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    faqChevronWrapOpen: {
      backgroundColor: colors.primary,
    },
    faqAnswer: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: p.textMuted,
      lineHeight: 18,
      marginTop: spacing.sm,
      paddingRight: spacing.xl,
    },
  });
}