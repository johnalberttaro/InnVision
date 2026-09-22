import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BillingRecordsScreen from './BillingRecordsScreen';
import PaymentsScreen from './PaymentsScreen';
import ReceiptsScreen from './ReceiptsScreen';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

// Every possible Billing Management sub-screen. Which show up as tabs is
// controlled by the `tabKeys` prop — Admin's fd:billing:* sidebar list has
// always had 2 extra entries (Outstanding Balances, Transaction History)
// that Front Desk's own sidebar never listed and that were never wired to
// a real screen (they fell through to the Shell's placeholder). Kept as
// pre-existing "coming soon" tabs here rather than quietly dropped, so
// nothing that was reachable before becomes unreachable.
const ALL_TABS = [
  { key: 'records', label: 'Billing Records', icon: 'document-text-outline' },
  { key: 'payments', label: 'Payments', icon: 'cash-outline' },
  { key: 'receipts', label: 'Receipts', icon: 'receipt-outline' },
  { key: 'outstanding', label: 'Outstanding Balances', icon: 'wallet-outline' },
  { key: 'transactions', label: 'Transaction History', icon: 'time-outline' },
];

/**
 * BillingManagementScreen — hosts the Billing Management sub-screens
 * behind a scrollable, hoverable tab bar, same treatment as Reservation
 * Management, Room Management, and Guest Management got.
 *
 * Props:
 *  - section: string        initial/deep-linked tab key (bare, e.g.
 *                           'records') — both shells strip their own
 *                           namespace prefix before passing this down.
 *  - tabKeys: string[]      which of ALL_TABS to show as buttons, in
 *                           order, for this portal.
 *  - onSelectRecord: (folio) => void   opens the folio detail drill-down.
 *  - staffUid / staffName   forwarded to PaymentsScreen for attribution.
 */
export default function BillingManagementScreen({ section = 'records', tabKeys, onSelectRecord, staffUid, staffName }) {
  const tabs = ALL_TABS.filter((t) => tabKeys.includes(t.key));

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
            <BillingTabButton
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {activeTab === 'records' && <BillingRecordsScreen onSelectRecord={onSelectRecord} />}
      {activeTab === 'payments' && <PaymentsScreen staffUid={staffUid} staffName={staffName} />}
      {activeTab === 'receipts' && <ReceiptsScreen />}
      {activeTab === 'outstanding' && <ComingSoonPanel label="Outstanding Balances" />}
      {activeTab === 'transactions' && <ComingSoonPanel label="Transaction History" />}
    </View>
  );
}

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
function BillingTabButton({ tab, active, onPress }) {
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