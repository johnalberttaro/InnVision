import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

const ROLE_TITLES = {
  admin: 'Administrator',
  frontdesk: 'Front Desk',
};

const CATEGORY_ICONS = {
  Rooms: 'bed-outline',
  'Staff Accounts': 'people-outline',
  Reports: 'bar-chart-outline',
  'Front Desk Operations': 'briefcase-outline',
  Reservations: 'calendar-outline',
  Billing: 'cash-outline',
  'Rooms & Housekeeping': 'bed-outline',
  Guests: 'people-outline',
  'Your Account': 'person-circle-outline',
};

// Each role gets its own questions — nothing is shared between portals,
// so a Front Desk user never sees admin-only steps and vice versa. Menu
// names in the answers ("Reservations → Check-ins", etc.) are the real
// sidebar/tab labels in that role's portal.
//
// Entry shape: { category, q, a?: string, steps?: string[], tip?: string }
//  - a:     a short plain answer
//  - steps: a numbered how-to (rendered as a step list)
//  - tip:   an optional note shown in a callout under the answer
const ACCOUNT_ANSWER = {
  category: 'Your Account',
  q: 'How do I change my password, photo or phone number?',
  steps: [
    'Tap your name or photo at the bottom of the sidebar to open My Profile.',
    'Update your photo or phone number, or use Change Password (you will need your current password).',
  ],
  tip: 'To log out, tap the power icon next to your name.',
};

const FAQS = {
  admin: [
    {
      category: 'Rooms',
      q: 'How do I add a room type or change its rate?',
      steps: [
        'Open Room Management → Room Types & Rates.',
        'Tap "+ Add Room Type" and fill in the details and rate.',
        'To change an existing room type, select it from the list and edit its details or rate.',
      ],
    },
    {
      category: 'Staff Accounts',
      q: 'How do I create an account for a staff member?',
      steps: [
        'Open the Staff menu.',
        'Choose the role: Front Desk, Housekeeping or Maintenance Accounts.',
        'Create the account and set a default password.',
      ],
      tip: 'The role decides which portal the person sees when they log in. Ask them to change the default password in My Profile after their first login.',
    },
    {
      category: 'Staff Accounts',
      q: 'A staff member forgot their password. What do I do?',
      steps: [
        'Open the Staff menu and go to that role\'s account list.',
        'Use the row actions on their account (for example Reset Password).',
        'Set a new password for them.',
      ],
      tip: 'They can change it again themselves in My Profile.',
    },
    {
      category: 'Reports',
      q: 'What do the Occupancy and Revenue reports show?',
      a: 'Open Reports & Analytics. The Occupancy Report shows how full the hotel is over time, and the Revenue Report shows what the hotel has earned.',
    },
    {
      category: 'Reports',
      q: 'What is the difference between Guest Ratings and Guest Feedback?',
      a: 'Guest Ratings collects the reviews guests leave after their stay. You can filter by star rating and search by name. Guest Feedback shows the overall "How was your experience?" rating guests submit from the app home screen.',
      tip: 'Low scores (1 to 2 stars) are counted under "Needs Attention" on the Guest Feedback page.',
    },
    {
      category: 'Front Desk Operations',
      q: 'Can I do front desk work from the Admin Portal?',
      a: 'Yes. The Front Desk Operations menu opens the same screens the front desk uses: Reservations, Room Management, Guest Management, Billing Management and Housekeeping.',
    },
    ACCOUNT_ANSWER,
  ],

  frontdesk: [
    {
      category: 'Reservations',
      q: 'How do I check in a guest?',
      steps: [
        'Open Reservations.',
        'Find the confirmed reservation (the Confirmed or Check-ins tab helps).',
        'Tap "Check In Guest".',
      ],
      tip: 'A billing folio is created automatically at check-in.',
    },
    {
      category: 'Reservations',
      q: 'How do I check out a guest, and what if they still owe money?',
      steps: ['Open Reservations → Check-outs.', 'Tap "Check Out Guest".'],
      tip: 'If the guest still has an outstanding balance, the system warns you first. Record the payment, or choose "Check Out Anyway" only if you are sure.',
    },
    {
      category: 'Reservations',
      q: 'A guest walked in without a booking. How do I register them?',
      steps: ['Open Reservations → Walk-In tab.', 'Complete the form with the room, dates and guest details.'],
    },
    {
      category: 'Reservations',
      q: 'How can I see which rooms are free over several days?',
      a: 'Use Reservations → Tape Chart. It shows each room across a timeline, so you can see booked and open dates at a glance.',
    },
    {
      category: 'Reservations',
      q: 'Where do I handle a guest\'s refund?',
      a: 'Open Reservations → Refunds. It lists the cancelled reservations that have a refund waiting to be handled.',
    },
    {
      category: 'Billing',
      q: 'How do I record a payment?',
      steps: [
        'Open Billing Management → Payments.',
        'Find the folio. This tab lists folios with a balance still due.',
        'Tap it to record the payment.',
      ],
      tip: 'To see a folio\'s full details, tap it in the Billing Records tab.',
    },
    {
      category: 'Billing',
      q: 'Where can I see who still owes money, and past receipts?',
      a: 'In Billing Management, the Outstanding Balances tab lists unpaid and partially paid folios (you can search and sort). The Receipts tab lists every receipt generated, and Transaction History shows payments and balance overrides.',
    },
    {
      category: 'Rooms & Housekeeping',
      q: 'How do I check a room\'s status or cleaning progress?',
      a: 'Room Management has Room Status and Room Availability tabs. Housekeeping has the Housekeeping Schedule and Room Cleaning Status tabs.',
    },
    {
      category: 'Guests',
      q: 'Where do I see guest records and reviews?',
      a: 'Open Guest Management. Guest Profiles and Guest Records hold guest information, and the Guest Ratings tab shows the reviews guests have left.',
    },
    ACCOUNT_ANSWER,
  ],
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Renders text with every match of `term` highlighted.
function Highlight({ text, term, style }) {
  const t = term.trim();
  if (!t) return <Text style={style}>{text}</Text>;
  const parts = text.split(new RegExp(`(${escapeRegExp(t)})`, 'ig'));
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.toLowerCase() === t.toLowerCase() ? (
          <Text key={i} style={styles.highlight}>{part}</Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

/**
 * StaffHelpScreen — the "Help & FAQ" center for the Admin and Front Desk
 * portals. Each role sees only its own questions (see FAQS).
 *
 * Layout: a dark hero with the search box, topic chips with counts, then
 * the questions grouped by topic. Answers expand in place as either a
 * short paragraph or a numbered step list, with an optional tip callout.
 * Matches are highlighted while searching, and a short result list opens
 * itself so the answer is visible right away.
 *
 * Props:
 *  - role: 'admin' | 'frontdesk'
 */
export default function StaffHelpScreen({ role = 'admin' }) {
  const items = useMemo(
    () => (FAQS[role] || FAQS.admin).map((item, index) => ({ ...item, id: index })),
    [role]
  );
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [openIds, setOpenIds] = useState(() => new Set());
  const [hoveredId, setHoveredId] = useState(null);
  const [hoveredChip, setHoveredChip] = useState(null);

  const categories = useMemo(() => {
    const order = [];
    const counts = {};
    items.forEach((item) => {
      if (!counts[item.category]) {
        counts[item.category] = 0;
        order.push(item.category);
      }
      counts[item.category] += 1;
    });
    return order.map((name) => ({ name, count: counts[name] }));
  }, [items]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory !== 'All' && item.category !== activeCategory) return false;
      if (!term) return true;
      const haystack = [item.q, item.a, item.tip, ...(item.steps || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [items, query, activeCategory]);

  const groups = useMemo(() => {
    const order = [];
    const map = {};
    filtered.forEach((item) => {
      if (!map[item.category]) {
        map[item.category] = [];
        order.push(item.category);
      }
      map[item.category].push(item);
    });
    return order.map((category) => ({ category, entries: map[category] }));
  }, [filtered]);

  const searching = query.trim().length > 0;
  const autoOpen = searching && filtered.length <= 3;
  const allOpen = filtered.length > 0 && filtered.every((item) => openIds.has(item.id));

  const toggle = (id) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (allOpen) filtered.forEach((item) => next.delete(item.id));
      else filtered.forEach((item) => next.add(item.id));
      return next;
    });

  const chips = [{ name: 'All', count: items.length }, ...categories];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{(ROLE_TITLES[role] || 'Staff').toUpperCase()} PORTAL</Text>
              <Text style={styles.heroTitle}>Help Center</Text>
              <Text style={styles.heroSubtitle}>
                Quick answers for your day-to-day tasks. Search, or pick a topic below.
              </Text>
            </View>
            <View style={styles.heroIcon}>
              <Ionicons name="help-buoy-outline" size={30} color={colors.white} />
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a question or a keyword, e.g. check-out, refund, password"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Topic chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {chips.map((chip) => {
            const active = activeCategory === chip.name;
            const hovered = hoveredChip === chip.name && !active;
            return (
              <Pressable
                key={chip.name}
                onPress={() => setActiveCategory(chip.name)}
                onHoverIn={() => setHoveredChip(chip.name)}
                onHoverOut={() => setHoveredChip(null)}
                style={[styles.chip, active && styles.chipActive, hovered && styles.chipHovered]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.name}</Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{chip.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Result bar */}
        <View style={styles.resultBar}>
          <Text style={styles.resultText}>
            {searching
              ? `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'} for "${query.trim()}"`
              : `${filtered.length} ${filtered.length === 1 ? 'question' : 'questions'}`}
          </Text>
          {filtered.length > 0 && !autoOpen && (
            <Pressable onPress={toggleAll} style={styles.expandBtn}>
              <Ionicons name={allOpen ? 'remove-circle-outline' : 'add-circle-outline'} size={15} color={colors.primary} />
              <Text style={styles.expandBtnText}>{allOpen ? 'Collapse all' : 'Expand all'}</Text>
            </Pressable>
          )}
        </View>

        {/* Questions */}
        {groups.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search-outline" size={26} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No matching questions</Text>
            <Text style={styles.emptyText}>
              Try a different word, or clear the search to browse every topic.
            </Text>
            {(searching || activeCategory !== 'All') && (
              <Pressable
                style={styles.emptyBtn}
                onPress={() => {
                  setQuery('');
                  setActiveCategory('All');
                }}
              >
                <Text style={styles.emptyBtnText}>Clear search and filters</Text>
              </Pressable>
            )}
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.category} style={styles.group}>
              <View style={styles.groupHeader}>
                <View style={styles.groupIcon}>
                  <Ionicons name={CATEGORY_ICONS[group.category] || 'help-circle-outline'} size={15} color={colors.primary} />
                </View>
                <Text style={styles.groupTitle}>{group.category}</Text>
                <Text style={styles.groupCount}>{group.entries.length}</Text>
              </View>

              <View style={styles.card}>
                {group.entries.map((item, i) => {
                  const isOpen = autoOpen || openIds.has(item.id);
                  const hovered = hoveredId === item.id;
                  return (
                    <View key={item.id} style={i > 0 && styles.rowBorder}>
                      <Pressable
                        onPress={() => toggle(item.id)}
                        onHoverIn={() => setHoveredId(item.id)}
                        onHoverOut={() => setHoveredId(null)}
                        style={[styles.questionRow, (hovered || isOpen) && styles.questionRowActive]}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                      >
                        <Highlight text={item.q} term={query} style={styles.question} />
                        <View style={[styles.chevron, isOpen && styles.chevronOpen]}>
                          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color={isOpen ? colors.onPrimary : colors.textMuted} />
                        </View>
                      </Pressable>

                      {isOpen && (
                        <View style={styles.answerWrap}>
                          {!!item.a && <Highlight text={item.a} term={query} style={styles.answer} />}

                          {!!item.steps && (
                            <View style={styles.steps}>
                              {item.steps.map((step, n) => (
                                <View key={n} style={styles.stepRow}>
                                  <View style={styles.stepNum}>
                                    <Text style={styles.stepNumText}>{n + 1}</Text>
                                  </View>
                                  <Highlight text={step} term={query} style={styles.stepText} />
                                </View>
                              ))}
                            </View>
                          )}

                          {!!item.tip && (
                            <View style={styles.tip}>
                              <Ionicons name="bulb-outline" size={16} color={colors.primary} style={styles.tipIcon} />
                              <Highlight text={item.tip} term={query} style={styles.tipText} />
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {/* Footer */}
        <View style={styles.footerCard}>
          <View style={styles.footerIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.footerTextWrap}>
            <Text style={styles.footerTitle}>Can't find what you need?</Text>
            <Text style={styles.footerText}>
              {role === 'admin'
                ? 'Contact the InnVision development team and describe what you were trying to do.'
                : 'Ask your administrator or supervisor, and tell them what you were trying to do.'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, flexGrow: 1 },
  column: { width: '100%', maxWidth: 880, alignSelf: 'center' },

  // Hero
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  heroTextWrap: { flex: 1, minWidth: 0 },
  heroEyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10.5,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  heroTitle: { fontFamily: fonts.headingExtraBold, fontSize: 26, color: colors.white },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 4, lineHeight: 19 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 3,
  },
  searchInput: { flex: 1, minWidth: 0, padding: 0, fontFamily: fonts.body, fontSize: 13.5, color: colors.text },

  // Chips
  chipScroll: { flexGrow: 0, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipHovered: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text },
  chipTextActive: { color: colors.onPrimary },
  chipCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  chipCountText: { fontFamily: fonts.bodySemiBold, fontSize: 10.5, color: colors.textMuted },
  chipCountTextActive: { color: colors.onPrimary },

  // Result bar
  resultBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  resultText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textMuted },
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  expandBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primary },

  // Groups
  group: { marginBottom: spacing.lg },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  groupIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.text,
  },
  groupCount: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textMuted },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },

  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
  },
  questionRowActive: { backgroundColor: colors.primaryTint },
  question: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 20, color: colors.text },
  chevron: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronOpen: { backgroundColor: colors.primary },

  // Answers
  answerWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.md,
    backgroundColor: colors.primaryTint,
  },
  answer: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 21, color: colors.text },
  steps: { gap: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.onPrimary },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 21, color: colors.text },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    padding: spacing.md,
  },
  tipIcon: { marginTop: 2 },
  tipText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.textMuted },

  highlight: { backgroundColor: '#FFE9A8', color: colors.text },

  // Empty state
  empty: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: colors.text },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  emptyBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  emptyBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.onPrimary },

  // Footer
  footerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  footerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTextWrap: { flex: 1, minWidth: 0 },
  footerTitle: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: colors.text },
  footerText: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
});