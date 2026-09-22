import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GuestProfileTableScreen from './GuestProfileTableScreen';
import GuestRecordsScreen from './GuestRecordsScreen';
import GuestRatingsScreen from '../admin/GuestRatingsScreen';
import InquiriesScreen from './InquiriesScreen';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

// Every possible Guest Management sub-screen. Which of these actually show
// up as tabs is controlled by the `tabKeys` prop — Front Desk's own
// sidebar and Admin's "Front Desk Operations" mirror don't offer quite the
// same set (Admin's fd:guests:* list has never included Ratings/Inquiries,
// and separately lists a not-yet-built "Special Requests"), so this stays
// as one shared component with a per-portal tab subset rather than two
// diverging copies. See FrontDeskShell.jsx / AdminShell.jsx for the actual
// tabKeys each portal passes.
const ALL_TABS = [
  { key: 'profiles', label: 'Guest Profiles', icon: 'people-outline' },
  { key: 'records', label: 'Guest Records', icon: 'folder-outline' },
  { key: 'ratings', label: 'Guest Ratings', icon: 'star-outline' },
  { key: 'inquiries', label: 'Inquiries', icon: 'help-circle-outline' },
  { key: 'requests', label: 'Special Requests', icon: 'alert-circle-outline' },
];

/**
 * GuestManagementScreen — hosts the Guest Management sub-screens behind a
 * scrollable, hoverable tab bar, same treatment as Reservation Management
 * and Room Management got. Sidebar sub-items (Guest Profiles/Guest
 * Records/Guest Ratings/Inquiries/Special Requests) collapsed into this.
 *
 * Props:
 *  - section: string        initial/deep-linked tab key (bare, e.g.
 *                           'profiles') — both shells already strip their
 *                           own namespace prefix before passing this down.
 *  - tabKeys: string[]      which of ALL_TABS to show as buttons, in
 *                           order, for this portal.
 *  - onSelectGuest: (guest) => void   opens the guest detail drill-down;
 *                           forwarded to whichever child needs it.
 */
export default function GuestManagementScreen({ section = 'profiles', tabKeys, onSelectGuest }) {
  const tabs = ALL_TABS.filter((t) => tabKeys.includes(t.key));

  // Tab bar owns which section is showing from here on; `section` is only
  // the *initial*/deep-linked value (the top navbar's Inquiries shortcut,
  // for instance, still works — it changes the `section` prop and this
  // effect resyncs the active tab, same pattern as every other tab bar
  // built this session).
  const [activeTab, setActiveTab] = useState(section);
  useEffect(() => {
    setActiveTab(section);
  }, [section]);

  return (
    <View style={styles.screen}>
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {tabs.map((tab) => (
            <GuestTabButton
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {activeTab === 'profiles' && <GuestProfileTableScreen onSelectGuest={onSelectGuest} />}
      {activeTab === 'records' && <GuestRecordsScreen onSelectGuest={onSelectGuest} />}
      {activeTab === 'ratings' && <GuestRatingsScreen />}
      {activeTab === 'inquiries' && <InquiriesScreen />}
      {activeTab === 'requests' && <ComingSoonPanel label="Special Requests" />}
    </View>
  );
}

// A pre-existing "not built yet" placeholder — Special Requests has always
// routed here (AdminShell.jsx's generic PlaceholderScreen fallback), this
// just keeps that same message now that it lives inside the tab bar
// instead of falling through the Shell's own switch.
function ComingSoonPanel({ label }) {
  return (
    <View style={styles.centerWrap}>
      <Text style={styles.comingSoonIcon}>🚧</Text>
      <Text style={styles.comingSoonTitle}>Coming soon</Text>
      <Text style={styles.comingSoonSubtitle}>The "{label}" section hasn't been built yet.</Text>
    </View>
  );
}

// Pressable (not TouchableOpacity) specifically so the hover state below
// works — react-native-web fires onHoverIn/onHoverOut on Pressable for a
// mouse pointer; there's no touch equivalent, so this is simply inert
// (never fires) on a phone/tablet, no platform check needed.
function GuestTabButton({ tab, active, onPress }) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !active;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.tabBtn, active && styles.tabBtnActive, showHover && styles.tabBtnHovered]}
    >
      <Ionicons
        name={tab.icon}
        size={14}
        color={active ? colors.onPrimary : showHover ? colors.primary : colors.textMuted}
      />
      <Text
        numberOfLines={1}
        style={[styles.tabBtnText, active && styles.tabBtnTextActive, showHover && styles.tabBtnTextHovered]}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  tabBarWrap: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBarContent: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabBtnHovered: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: colors.onPrimary,
  },
  tabBtnTextHovered: {
    color: colors.primary,
  },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  comingSoonIcon: { fontSize: 40, marginBottom: spacing.md },
  comingSoonTitle: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.xs },
  comingSoonSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },
});