import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HousekeepingScheduleScreen from './HousekeepingSchedule';
import RoomCleaningStatusScreen from './RoomCleaningStatusScreen';
import MaintenanceRequestScreen from './MaintenanceRequest';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

// Unlike Guest/Billing Management, Front Desk's own sidebar and Admin's
// fd:housekeeping:* mirror have always listed the exact same 3 items, so
// this is a fixed tab list (no tabKeys prop needed) — same pattern as
// Reservation Management and Room Management.
const TABS = [
  { key: 'schedule', label: 'Housekeeping Schedule', icon: 'calendar-outline' },
  { key: 'status', label: 'Room Cleaning Status', icon: 'sparkles-outline' },
  { key: 'maintenance', label: 'Maintenance Requests', icon: 'construct-outline' },
];

/**
 * HousekeepingManagementScreen — hosts the Housekeeping sub-screens behind
 * a scrollable, hoverable tab bar, same treatment as the other management
 * sections got.
 *
 * Props:
 *  - section: string        initial/deep-linked tab key (bare, e.g.
 *                           'schedule') — both shells strip their own
 *                           namespace prefix before passing this down.
 *  - staffUid / staffName   forwarded to Schedule and Maintenance Requests
 *                           for attribution. Room Cleaning Status takes no
 *                           props at all (it used to be called with an
 *                           `onLogout` that its own signature never
 *                           accepted — dropped here, it was dead).
 */
export default function HousekeepingManagementScreen({ section = 'schedule', staffUid, staffName }) {
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
          {TABS.map((tab) => (
            <HousekeepingTabButton
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {activeTab === 'schedule' && <HousekeepingScheduleScreen staffUid={staffUid} staffName={staffName} />}
      {activeTab === 'status' && <RoomCleaningStatusScreen />}
      {activeTab === 'maintenance' && <MaintenanceRequestScreen staffUid={staffUid} staffName={staffName} />}
    </View>
  );
}

// Pressable (not TouchableOpacity) specifically so the hover state below
// works — react-native-web fires onHoverIn/onHoverOut on Pressable for a
// mouse pointer; there's no touch equivalent, so this is simply inert
// (never fires) on a phone/tablet, no platform check needed.
function HousekeepingTabButton({ tab, active, onPress }) {
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
});