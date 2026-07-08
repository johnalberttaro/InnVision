import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useTheme } from '../../context/ThemeContext';

/**
 * BookingLookupScreen — "Find My Booking" for unregistered (and registered)
 * guests, accessible without signing in.
 *
 * MIGRATED TO CENTRALIZED THEME (useTheme()). Two fixes made during
 * migration:
 *  - `input`'s background was `colors.white` (invariant) — changed to
 *    `colors.cardAlt` to match the input-background convention already
 *    established on LoginScreen.
 *  - `searchButton`'s icon/spinner color was `colors.white` sitting on
 *    `colors.primary` (which flips) — changed to `onPrimary`.
 *  - Status badge colors (pending/checked-in/declined) are intentionally
 *    left as fixed hex, matching the same precedent already set on
 *    ProfileScreen and the admin Room Management screen — semantic status
 *    chips stay constant regardless of theme.
 *
 * Accepts any of the following, auto-detected from what's typed:
 *  - Reservation reference / document ID — matched by exact Firestore
 *    document ID lookup. Note: reservations don't currently store a
 *    separate short "reference code," so this requires the guest's exact
 *    reservation document ID (e.g. from their confirmation screen/email).
 *    If you'd like a shorter, guest-friendly reference code instead, that
 *    would need to be generated and stored when a reservation is created.
 *  - Email address — matched against reservations.guestDetails.email.
 *    Note: this assumes guest bookings store an email under
 *    guestDetails.email. If your reservation form doesn't currently
 *    collect email for walk-in/guest bookings, this path will simply
 *    return no results until that field exists.
 *  - Phone number — matched against reservations.guestDetails.phone,
 *    trying a couple of common formats (with/without the +63 prefix)
 *    since guests may type it differently than it was originally entered.
 *
 * Props:
 *  - onBack: () => void
 */
export default function BookingLookupScreen({ onBack }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [searched, setSearched]   = useState(false);
  const [error, setError]         = useState('');
  const [results, setResults]     = useState([]);

  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  const looksLikeEmail = (value) => value.includes('@');
  const looksLikePhone = (value) => {
    const digits = value.replace(/[^\d]/g, '');
    return digits.length >= 7;
  };

  const formatDateRange = (checkIn, checkOut) => {
    try {
      return `${new Date(checkIn).toLocaleDateString()} – ${new Date(checkOut).toLocaleDateString()}`;
    } catch {
      return `${checkIn} – ${checkOut}`;
    }
  };

  const getGuestName = (item) => {
    if (!item.guestDetails) return item.guestName || '—';
    const { firstName, lastName } = item.guestDetails;
    return `${firstName || ''} ${lastName || ''}`.trim() || '—';
  };

  const statusStyle = (status) => {
    switch (status) {
      case 'upcoming':    return { bg: colors.primaryTint, text: colors.primary };
      case 'pending':     return { bg: '#FFF4D6', text: '#9A7B00' };
      case 'checked-in':  return { bg: '#DFF5E1', text: '#1E7B34' };
      case 'checked-out': return { bg: colors.cardAlt, text: colors.textMuted };
      case 'declined':    return { bg: '#FCE1E1', text: '#B3261E' };
      default:            return { bg: colors.cardAlt, text: colors.textMuted };
    }
  };

  const runResultQuery = async (q) => {
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return docs;
  };

  const handleSearch = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSearched(true);

    try {
      if (looksLikeEmail(trimmed)) {
        // Email search
        const q = query(
          collection(db, 'reservations'),
          where('guestDetails.email', '==', trimmed.toLowerCase())
        );
        setResults(await runResultQuery(q));
      } else if (looksLikePhone(trimmed)) {
        // Phone search — try a few common formats since guests may type
        // "0970 175 6831" while it was stored as "+639701756831", etc.
        const digits = trimmed.replace(/[^\d+]/g, '');
        const candidates = new Set([digits]);
        if (digits.startsWith('0')) candidates.add(`+63${digits.slice(1)}`);
        if (digits.startsWith('63')) candidates.add(`+${digits}`);
        if (digits.startsWith('+63')) candidates.add(`0${digits.slice(3)}`);

        const q = query(
          collection(db, 'reservations'),
          where('guestDetails.phone', 'in', Array.from(candidates).slice(0, 10))
        );
        setResults(await runResultQuery(q));
      } else {
        // Treat as a reservation reference / document ID
        const snap = await getDoc(doc(db, 'reservations', trimmed));
        setResults(snap.exists() ? [{ id: snap.id, ...snap.data() }] : []);
      }
    } catch (err) {
      console.error('Booking lookup failed:', err);
      setError('Something went wrong while searching. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, isWide && styles.headerWide]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find My Booking</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={isWide && styles.wideContainer}>
          <View style={styles.contentPad}>

            {/* Search card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Look Up Your Reservation</Text>
              <Text style={styles.helperText}>
                Enter your reservation reference number, the email address,
                or the phone number you booked with.
              </Text>

              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Reference, email, or phone number"
                  placeholderTextColor={colors.textMuted}
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSearch}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={[styles.searchButton, !input.trim() && styles.searchButtonDisabled]}
                  onPress={handleSearch}
                  disabled={!input.trim() || loading}
                  activeOpacity={0.85}
                >
                  {loading
                    ? <ActivityIndicator color={colors.onPrimary} size="small" />
                    : <Ionicons name="search" size={18} color={colors.onPrimary} />
                  }
                </TouchableOpacity>
              </View>
            </View>

            {/* Results */}
            {searched && !loading && (
              error ? (
                <View style={styles.messageCard}>
                  <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                  <Text style={styles.messageText}>{error}</Text>
                </View>
              ) : results.length === 0 ? (
                <View style={styles.messageCard}>
                  <Ionicons name="search-outline" size={22} color={colors.textMuted} />
                  <Text style={styles.messageText}>
                    No booking found. Double-check your reference number, email,
                    or phone number and try again.
                  </Text>
                </View>
              ) : (
                results.map((r) => {
                  const s = statusStyle(r.status);
                  return (
                    <View key={r.id} style={styles.card}>
                      <View style={styles.resHeader}>
                        <Text style={styles.resId}>#{r.id.slice(0, 10).toUpperCase()}</Text>
                        <View style={[styles.badge, { backgroundColor: s.bg }]}>
                          <Text style={[styles.badgeText, { color: s.text }]}>
                            {(r.status || 'unknown').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.resGuestName}>{getGuestName(r)}</Text>
                      <View style={styles.resGrid}>
                        <View style={styles.resItem}>
                          <Text style={styles.resItemLabel}>Room type</Text>
                          <Text style={styles.resItemValue}>{r.roomType || 'Not selected'}</Text>
                        </View>
                        <View style={styles.resItem}>
                          <Text style={styles.resItemLabel}>Dates</Text>
                          <Text style={styles.resItemValue}>{formatDateRange(r.checkIn, r.checkOut)}</Text>
                        </View>
                        <View style={styles.resItem}>
                          <Text style={styles.resItemLabel}>Nights</Text>
                          <Text style={styles.resItemValue}>{r.nights ?? '—'}</Text>
                        </View>
                        <View style={styles.resItem}>
                          <Text style={styles.resItemLabel}>Guests</Text>
                          <Text style={styles.resItemValue}>
                            {r.totals?.totalAdults ?? 0} Adult{r.totals?.totalAdults !== 1 ? 's' : ''} +{' '}
                            {r.totals?.totalChildren ?? 0} Child{r.totals?.totalChildren !== 1 ? 'ren' : ''}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )
            )}

          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
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
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 16,
      fontFamily: fonts.headingExtraBold,
      color: colors.aboutAccent,
      marginBottom: spacing.xs,
    },
    helperText: {
      fontSize: 12,
      fontFamily: fonts.body,
      color: colors.textMuted,
      lineHeight: 18,
      marginBottom: spacing.lg,
    },

    inputRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.text,
      backgroundColor: colors.cardAlt,
    },
    searchButton: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchButtonDisabled: {
      opacity: 0.5,
    },

    messageCard: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    messageText: {
      fontSize: 13,
      fontFamily: fonts.body,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },

    resHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    resId: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },
    badge: {
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: fonts.bodySemiBold,
      letterSpacing: 0.4,
    },
    resGuestName: {
      fontSize: 15,
      fontFamily: fonts.headingBold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    resGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    resItem: {
      minWidth: 120,
    },
    resItemLabel: {
      fontSize: 11,
      fontFamily: fonts.body,
      color: colors.textMuted,
      marginBottom: 2,
    },
    resItemValue: {
      fontSize: 13,
      fontFamily: fonts.bodySemiBold,
      color: colors.text,
    },
  });
}