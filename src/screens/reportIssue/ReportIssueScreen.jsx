import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
// RESOLVED: SafeAreaView moved to 'react-native-safe-area-context' — see
// the same fix's full explanation in LoginScreen.jsx.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { RoomName } from '../../utils/roomNames';
import { useTheme } from '../../context/ThemeContext';

// Same look as My Reservations: dark top bar + hero, Inter type, gold
// accents, clean cards.
const BAR_BG = '#17120E';
const HERO_TEXT = '#F7F2EA';
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

const MAX_LEN = 500;

// key/value saved to maintenance_requests.category is unchanged.
const CATEGORIES = [
  { key: 'plumbing',   label: 'Plumbing',     hint: 'Leaks, toilet, shower', icon: 'water-outline',
    picks: ['The sink is leaking', 'The toilet won\'t flush', 'No hot water', 'The shower drain is clogged'] },
  { key: 'electrical', label: 'Electrical',   hint: 'Lights, outlets, TV',   icon: 'flash-outline',
    picks: ['A light is not working', 'An outlet has no power', 'The TV won\'t turn on', 'The key card switch isn\'t working'] },
  { key: 'hvac',       label: 'Air-con',      hint: 'Cooling, fan, noise',   icon: 'snow-outline',
    picks: ['The air-con is not cooling', 'The air-con is leaking water', 'The air-con is very noisy', 'The remote is not working'] },
  { key: 'furniture',  label: 'Furniture',    hint: 'Bed, chairs, closet',   icon: 'bed-outline',
    picks: ['The bed is broken or wobbly', 'A chair is broken', 'The closet door won\'t close', 'The curtain is damaged'] },
  { key: 'other',      label: 'Other',        hint: 'Anything else',         icon: 'construct-outline',
    picks: ['The door lock is not working', 'There is a bad smell', 'Wi-Fi is not working', 'Something else needs fixing'] },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

const REPORT_STATUS = {
  open:        { label: 'Received',    bg: '#FFF4D6', text: '#8A6A00', icon: 'time-outline' },
  in_progress: { label: 'Being fixed', bg: '#E3ECF8', text: '#2C5EA8', icon: 'construct-outline' },
  resolved:    { label: 'Fixed',       bg: '#DFF5E1', text: '#1E7B34', icon: 'checkmark-circle-outline' },
};

function formatDay(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function timeAgo(v) {
  if (!v) return '';
  const mins = Math.floor((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDay(v);
}

/**
 * ReportIssueScreen — lets a checked-in guest report a maintenance issue
 * themselves, instead of it always going through Front Desk verbally
 * (see MaintenanceRequest.jsx's "+ New Request").
 *
 * Inserts directly into maintenance_requests with status: 'open' — same
 * starting state Front Desk's own "New Request" form creates, so it
 * lands on the same Maintenance Requests board and gets assigned to
 * maintenance staff the same way, regardless of who reported it.
 *
 * DESIGN CHOICE: no priority picker. Guests default to 'normal';
 * urgency is left to staff triage. Staff can escalate it from their board.
 *
 * ELIGIBILITY: only a guest with a status = 'checked-in' reservation
 * can use this (that's the room the issue is attributed to).
 *
 * "Your reports" lists the guest's own earlier reports for this stay with
 * their status. If the database doesn't let guests read those rows, the
 * section simply stays hidden.
 */
export default function ReportIssueScreen({ user, onBackPress }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const isTablet = width >= 640;
  const { colors, spacing, radius, fonts, isDark } = useTheme();
  const styles = useMemo(
    () => getStyles(colors, spacing, radius, fonts, { isWide, isTablet, isDark }),
    [colors, spacing, radius, fonts, isWide, isTablet, isDark]
  );

  const [checkedInReservation, setCheckedInReservation] = useState(null);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [myReports, setMyReports] = useState([]);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from('reservations')
        .select('id, status, selected_rooms, guest_details, guest_email, check_in, check_out')
        .eq('user_id', user.id)
        .eq('status', 'checked-in')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled) {
        if (fetchError) console.error('Failed to load checked-in reservation:', fetchError);
        else if (data && data.length > 0) setCheckedInReservation(data[0]);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const roomNumber = (() => {
    const rooms = checkedInReservation?.selected_rooms;
    if (Array.isArray(rooms) && rooms.length > 0) {
      return rooms[0]?.roomNumber || rooms[0]?.number || rooms[0]?.room || null;
    }
    return null;
  })();

  // Guest's own earlier reports for this room (best effort).
  const loadMyReports = async () => {
    if (!user?.id || !roomNumber) return;
    const { data, error: reportsError } = await supabase
      .from('maintenance_requests')
      .select('id, category, description, status, created_at')
      .eq('reported_by', user.id)
      .eq('room_number', roomNumber)
      .order('created_at', { ascending: false })
      .limit(5);
    if (!reportsError && Array.isArray(data)) setMyReports(data);
  };
  useEffect(() => { loadMyReports(); }, [user?.id, roomNumber]);

  const handleSubmit = async () => {
    if (!category) {
      setError('Please choose what kind of issue this is.');
      return;
    }
    if (!description.trim()) {
      setError('Please tell us a little about the issue.');
      return;
    }
    if (!roomNumber) {
      setError('Could not determine your room. Please contact Front Desk directly.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('maintenance_requests').insert({
        room_number: roomNumber,
        category,
        priority: 'normal',
        description: description.trim(),
        status: 'open',
        reported_by: user.id,
      });
      if (insertError) throw insertError;

      setSubmitted(true);
      loadMyReports();
    } catch (err) {
      console.error('Failed to submit maintenance request:', err);
      setError('Something went wrong sending your report. Please try again, or contact Front Desk directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const reportAnother = () => {
    setSubmitted(false);
    setCategory(null);
    setDescription('');
    setError('');
  };

  const addPick = (text) => {
    setError('');
    setDescription((cur) => {
      const base = cur.trim();
      const next = base ? `${base}${/[.!?]$/.test(base) ? '' : '.'} ${text}` : text;
      return next.slice(0, MAX_LEN);
    });
  };

  // Tile width from the measured row so the grid never jumps around.
  const columns = isWide ? 5 : isTablet ? 3 : 2;
  const tileGap = 10;
  const tileWidth = gridWidth > 0 ? Math.floor((gridWidth - tileGap * (columns - 1)) / columns) : null;

  const selected = category ? CATEGORY_BY_KEY[category] : null;
  const canSubmit = !!category && !!description.trim() && !submitting;

  // ── Shared frame: dark top bar + hero ────────────────────────────────
  const frame = (heroTitle, heroLead, body) => (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          {onBackPress ? (
            <TouchableOpacity onPress={onBackPress} style={styles.backButton} accessibilityLabel="Go back" activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={18} color={HERO_TEXT} />
            </TouchableOpacity>
          ) : <View style={styles.headerSpacer} />}
          <Text style={styles.headerTitle}>Report an Issue</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            <Text style={styles.heroTitle} accessibilityRole="header">{heroTitle}</Text>
            {!!heroLead && <Text style={styles.heroLead}>{heroLead}</Text>}
          </View>
        </View>
        <View style={styles.contentPad}>
          <View style={styles.container}>{body}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  if (loading) {
    return frame('Report an issue', null, (
      <View style={styles.messageCard}>
        <ActivityIndicator color={GOLD} size="large" />
        <Text style={styles.messageText}>Checking your stay…</Text>
      </View>
    ));
  }

  if (!checkedInReservation) {
    return frame('Report an issue', 'Something not working in your room? We\'ll get it fixed.', (
      <View style={styles.messageCard}>
        <View style={[styles.bigIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1EADF' }]}>
          <Ionicons name="key-outline" size={30} color={isDark ? GOLD_LIGHT : '#6B4E1E'} />
        </View>
        <Text style={styles.messageTitle}>Available after check-in</Text>
        <Text style={styles.messageText}>
          You can report an issue once you've checked in to your room. If you've just checked in, give it a moment and try again.
        </Text>
        {!!onBackPress && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onBackPress} activeOpacity={0.85}>
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </TouchableOpacity>
        )}
      </View>
    ));
  }

  const roomCard = (
    <View style={styles.roomCard}>
      <View style={styles.roomIcon}>
        <Ionicons name="bed-outline" size={20} color="#231B12" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.roomEyebrow}>YOUR ROOM</Text>
        <Text style={styles.roomName} numberOfLines={1}><RoomName number={roomNumber} /></Text>
        {(checkedInReservation.check_in || checkedInReservation.check_out) && (
          <Text style={styles.roomDates}>
            {formatDay(checkedInReservation.check_in)} – {formatDay(checkedInReservation.check_out)}
          </Text>
        )}
      </View>
      <View style={styles.checkedInPill}>
        <View style={styles.checkedInDot} />
        <Text style={styles.checkedInText}>Checked in</Text>
      </View>
    </View>
  );

  const reportsList = myReports.length > 0 && (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Your reports</Text>
      {myReports.map((r, i) => {
        const st = REPORT_STATUS[r.status] || REPORT_STATUS.open;
        const cat = CATEGORY_BY_KEY[r.category];
        return (
          <View key={r.id} style={[styles.reportRow, i > 0 && styles.reportRowBorder]}>
            <View style={styles.reportIcon}>
              <Ionicons name={cat?.icon || 'construct-outline'} size={16} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.reportTitle} numberOfLines={1}>{cat?.label || 'Issue'}</Text>
              <Text style={styles.reportDesc} numberOfLines={2}>{r.description}</Text>
              <Text style={styles.reportTime}>{timeAgo(r.created_at)}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
              <Ionicons name={st.icon} size={12} color={st.text} />
              <Text style={[styles.statusPillText, { color: st.text }]}>{st.label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  if (submitted) {
    return frame('Thanks for letting us know', 'Our maintenance team has your report.', (
      <>
        <View style={styles.messageCard}>
          <View style={[styles.bigIcon, { backgroundColor: '#DFF5E1' }]}>
            <Ionicons name="checkmark" size={32} color="#1E7B34" />
          </View>
          <Text style={styles.messageTitle}>Issue reported</Text>
          <Text style={styles.messageText}>
            We've sent your report about <Text style={styles.messageStrong}><RoomName number={roomNumber} /></Text> to
            our maintenance team. Front Desk will follow up if they need anything from you.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={reportAnother} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Report another issue</Text>
            </TouchableOpacity>
            {!!onBackPress && (
              <TouchableOpacity style={styles.primaryButtonSmall} onPress={onBackPress} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {reportsList}
      </>
    ));
  }

  return frame('Report an issue', 'Something not working in your room? Tell us and our maintenance team will take care of it.', (
    <>
      {roomCard}

      <View style={styles.card}>
        {/* Step 1 */}
        <View style={styles.stepHead}>
          <View style={[styles.stepNum, category && styles.stepNumDone]}>
            {category
              ? <Ionicons name="checkmark" size={13} color="#231B12" />
              : <Text style={styles.stepNumText}>1</Text>}
          </View>
          <Text style={styles.stepTitle}>What kind of issue is it?</Text>
        </View>

        <View style={styles.tileGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.tile, tileWidth ? { width: tileWidth } : { flexBasis: '45%', flexGrow: 1 }, active && styles.tileActive]}
                onPress={() => { setCategory(c.key); setError(''); }}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.tileIcon, active && styles.tileIconActive]}>
                  <Ionicons name={c.icon} size={20} color={active ? '#231B12' : (isDark ? GOLD_LIGHT : '#6B4E1E')} />
                </View>
                <Text style={styles.tileLabel}>{c.label}</Text>
                <Text style={styles.tileHint} numberOfLines={1}>{c.hint}</Text>
                {active && (
                  <View style={styles.tileCheck}>
                    <Ionicons name="checkmark" size={11} color="#231B12" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Step 2 */}
        <View style={[styles.stepHead, { marginTop: 26 }]}>
          <View style={[styles.stepNum, description.trim() && styles.stepNumDone]}>
            {description.trim()
              ? <Ionicons name="checkmark" size={13} color="#231B12" />
              : <Text style={styles.stepNumText}>2</Text>}
          </View>
          <Text style={styles.stepTitle}>Tell us what's wrong</Text>
        </View>

        {selected && (
          <View style={styles.pickRow}>
            {selected.picks.map((p) => (
              <TouchableOpacity key={p} style={styles.pickChip} onPress={() => addPick(p)} activeOpacity={0.8}>
                <Ionicons name="add" size={13} color={colors.textMuted} />
                <Text style={styles.pickChipText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={(v) => { setDescription(v.slice(0, MAX_LEN)); if (error) setError(''); }}
          placeholder={selected ? `Describe the ${selected.label.toLowerCase()} issue — where it is and what's happening` : 'e.g. The bathroom sink is leaking under the counter'}
          placeholderTextColor={colors.disabled}
          multiline
          numberOfLines={5}
          maxLength={MAX_LEN}
        />
        <Text style={styles.counter}>{description.length}/{MAX_LEN}</Text>

        {!!error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#B3261E" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#231B12" size="small" />
          ) : (
            <>
              <Ionicons name="paper-plane-outline" size={16} color="#231B12" />
              <Text style={styles.primaryButtonText}>Send report</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.noteRow}>
          <Ionicons name="call-outline" size={14} color="#B3261E" />
          <Text style={styles.noteText}>
            <Text style={styles.noteStrong}>Emergency?</Text> For fire, flooding, gas smell or someone hurt, call the Front Desk right away.
          </Text>
        </View>
      </View>

      {reportsList}
    </>
  ));
}

function getStyles(colors, spacing, radius, fonts, { isWide, isTablet, isDark }) {
  const gutter = isTablet ? 32 : 20;
  const cardShadow = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 14px 34px rgba(0,0,0,0.35)'
    : '0 1px 2px rgba(43,36,28,0.06), 0 14px 34px rgba(43,36,28,0.09)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(43,36,28,0.08)';
  const softFill = isDark ? 'rgba(255,255,255,0.05)' : '#F6F1E8';
  const goldText = isDark ? GOLD_LIGHT : '#6B4E1E';
  const goldButton = {
    backgroundColor: '#DDBB6C',
    ...web({
      backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT} 0%, ${GOLD} 100%)`,
      boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 6px 18px rgba(201,161,74,0.28)',
    }),
  };

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

    /* Top bar */
    header: {
      backgroundColor: BAR_BG,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(247,242,234,0.08)',
      ...web({ backgroundImage: 'linear-gradient(180deg, #1B1511 0%, #17120E 100%)' }),
    },
    headerInner: {
      width: '100%', maxWidth: 1240, alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 12,
    },
    backButton: {
      width: 38, height: 38, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(247,242,234,0.08)',
      borderWidth: 1, borderColor: 'rgba(247,242,234,0.12)',
    },
    headerTitle: { fontFamily: F.semi, fontSize: 15, color: HERO_TEXT, letterSpacing: -0.2 },
    headerSpacer: { width: 38 },

    /* Hero */
    hero: {
      backgroundColor: '#221B15',
      ...web({
        backgroundImage: [
          'radial-gradient(ellipse at 88% 10%, rgba(231,203,130,0.20) 0%, rgba(231,203,130,0) 46%)',
          'linear-gradient(160deg, #17120E 0%, #2A2119 55%, #3E2E1F 100%)',
        ].join(', '),
      }),
      paddingHorizontal: gutter,
      paddingTop: isWide ? 48 : 32,
      paddingBottom: isWide ? 52 : 32,
    },
    heroInner: { width: '100%', maxWidth: 760, alignSelf: 'center' },
    heroTitle: {
      fontFamily: F.display, fontSize: isWide ? 44 : isTablet ? 36 : 30,
      lineHeight: isWide ? 48 : isTablet ? 40 : 34, letterSpacing: isWide ? -1.5 : -1, color: HERO_TEXT,
    },
    heroLead: { marginTop: 10, fontFamily: F.body, fontSize: isTablet ? 16 : 15, lineHeight: 24, color: 'rgba(247,242,234,0.70)', maxWidth: 560 },

    contentPad: { paddingHorizontal: gutter, paddingTop: isWide ? 32 : 20, paddingBottom: isWide ? 64 : 40 },
    container: { width: '100%', maxWidth: 760, alignSelf: 'center' },

    /* Room strip */
    roomCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: hairline,
      paddingVertical: 14, paddingHorizontal: isTablet ? 18 : 14,
      marginBottom: 16,
      ...web({ boxShadow: cardShadow }),
    },
    roomIcon: {
      width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      ...goldButton,
    },
    roomEyebrow: { fontFamily: F.semi, fontSize: 10.5, letterSpacing: 1.2, color: colors.textMuted },
    roomName: { fontFamily: F.display, fontSize: isTablet ? 20 : 18, letterSpacing: -0.5, color: colors.text, marginTop: 1 },
    roomDates: { fontFamily: F.body, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    checkedInPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#DFF5E1', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10,
    },
    checkedInDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1E7B34' },
    checkedInText: { fontFamily: F.semi, fontSize: 12, color: '#1E7B34' },

    card: {
      backgroundColor: colors.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: hairline,
      padding: isTablet ? 24 : 18,
      marginBottom: 16,
      ...web({ boxShadow: cardShadow }),
    },

    /* Steps */
    stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    stepNum: {
      width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
      backgroundColor: softFill, borderWidth: 1, borderColor: hairline,
    },
    stepNumDone: { ...goldButton, borderColor: 'transparent' },
    stepNumText: { fontFamily: F.bold, fontSize: 12, color: colors.textMuted },
    stepTitle: { fontFamily: F.bold, fontSize: isTablet ? 17 : 16, letterSpacing: -0.3, color: colors.text },

    /* Category tiles */
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      borderRadius: 16, borderWidth: 1.5, borderColor: hairline,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
      paddingVertical: 14, paddingHorizontal: 12,
      ...web({ cursor: 'pointer', transition: 'border-color 120ms ease, background-color 120ms ease' }),
    },
    tileActive: {
      borderColor: GOLD,
      backgroundColor: isDark ? 'rgba(201,161,74,0.12)' : '#FBF4E4',
      ...web({ boxShadow: '0 0 0 3px rgba(201,161,74,0.16)' }),
    },
    tileIcon: {
      width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      backgroundColor: softFill, marginBottom: 10,
    },
    tileIconActive: { ...goldButton },
    tileLabel: { fontFamily: F.semi, fontSize: 14, color: colors.text },
    tileHint: { fontFamily: F.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
    tileCheck: {
      position: 'absolute', top: 10, right: 10,
      width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
      ...goldButton,
    },

    /* Quick picks */
    pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    pickChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 999, borderWidth: 1, borderColor: hairline, backgroundColor: softFill,
      paddingVertical: 6, paddingHorizontal: 11,
    },
    pickChipText: { fontFamily: F.medium, fontSize: 12.5, color: colors.text },

    textArea: {
      borderWidth: 1.5, borderColor: hairline, borderRadius: 16,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, lineHeight: 21, fontFamily: F.body, color: colors.text,
      minHeight: 130, textAlignVertical: 'top',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
      ...web({ outlineStyle: 'none' }),
    },
    counter: { alignSelf: 'flex-end', fontFamily: F.body, fontSize: 11.5, color: colors.textMuted, marginTop: 6 },

    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: '#FDECEA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12,
    },
    errorText: { flex: 1, fontSize: 13, fontFamily: F.semi, color: '#B3261E' },

    primaryButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      borderRadius: 14, paddingVertical: 14, marginTop: 18,
      ...goldButton,
    },
    primaryButtonDisabled: { opacity: 0.55 },
    primaryButtonSmall: {
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 14, paddingVertical: 12, paddingHorizontal: 26,
      ...goldButton,
    },
    primaryButtonText: { fontSize: 15, fontFamily: F.semi, color: '#231B12' },

    noteRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: hairline,
    },
    noteText: { flex: 1, fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
    noteStrong: { fontFamily: F.semi, color: '#B3261E' },

    /* Your reports */
    sectionTitle: { fontFamily: F.bold, fontSize: 16, letterSpacing: -0.3, color: colors.text, marginBottom: 6 },
    reportRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
    reportRowBorder: { borderTopWidth: 1, borderTopColor: hairline },
    reportIcon: {
      width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: softFill,
    },
    reportTitle: { fontFamily: F.semi, fontSize: 14, color: colors.text },
    reportDesc: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 1 },
    reportTime: { fontFamily: F.body, fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
    statusPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9,
    },
    statusPillText: { fontFamily: F.semi, fontSize: 11.5 },

    /* Message cards (loading / not checked in / success) */
    messageCard: {
      alignItems: 'center', gap: 10,
      paddingVertical: 36, paddingHorizontal: 24, marginBottom: 16,
      backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: hairline,
      ...web({ boxShadow: cardShadow }),
    },
    bigIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    messageTitle: { fontFamily: F.display, fontSize: 20, letterSpacing: -0.5, color: colors.text, textAlign: 'center' },
    messageText: { fontSize: 14, fontFamily: F.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 420 },
    messageStrong: { fontFamily: F.semi, color: colors.text },
    buttonRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 },
    secondaryButton: {
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20,
      borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(43,36,28,0.16)',
    },
    secondaryButtonText: { fontSize: 14, fontFamily: F.semi, color: goldText },
  });
}
