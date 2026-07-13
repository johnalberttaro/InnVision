import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import AdminSidebar from './AdminSidebar';
import AdminDashboardScreen from './AdmindashboardScreen';
import RoomTypesRatesScreen from './RoomTypeRatesScreen';
import { colors, spacing, fonts } from '../../utils/theme';

const WIDE_BREAKPOINT = 1024;

/**
 * AdminShell — top-level shell for the Admin Portal (superadmin role).
 * Mirrors frontdesk/FrontDeskShell.jsx: sidebar + routed content area +
 * mobile hamburger topbar. Covers SRS Module 6 (Admin Management):
 *  - 6.1 Manage Room Types & Rates → RoomTypesRatesScreen (built)
 *  - 6.2 Generate Occupancy & Revenue Reports → placeholder for now
 */
export default function AdminShell({ onLoggedOut, adminName }) {
  const [activeKey, setActiveKey] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const handleNavigate = (key) => {
    if (key === 'logout') {
      onLoggedOut();
      return;
    }
    setActiveKey(key);
  };

  return (
    <View style={styles.screen}>
      <AdminSidebar
        activeKey={activeKey}
        onNavigate={handleNavigate}
        onLogout={onLoggedOut}
        adminName={adminName}
        collapsed={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <View style={styles.contentArea}>
        {!isWide && (
          <View style={styles.mobileTopBar}>
            <TouchableOpacity
              onPress={() => setMobileSidebarOpen(true)}
              style={styles.menuButton}
              accessibilityLabel="Open menu"
            >
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </TouchableOpacity>
            <Text style={styles.mobileTopBarTitle}>InnVision Admin</Text>
          </View>
        )}

        <View style={styles.screenContent}>
          {renderActiveScreen(activeKey)}
        </View>
      </View>
    </View>
  );
}

function renderActiveScreen(activeKey) {
  if (activeKey === 'dashboard') {
    return <AdminDashboardScreen />;
  }
  if (activeKey === 'rooms:types') {
    return <RoomTypesRatesScreen />;
  }
  // Reports & Analytics (SRS Transaction 6.2) — not built yet.
  return <PlaceholderScreen activeKey={activeKey} />;
}

function PlaceholderScreen({ activeKey }) {
  return (
    <View style={styles.placeholderWrap}>
      <Text style={styles.placeholderIcon}>🚧</Text>
      <Text style={styles.placeholderTitle}>Coming soon</Text>
      <Text style={styles.placeholderSubtitle}>
        The "{activeKey}" section hasn't been built yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  contentArea: { flex: 1 },
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuButton: { width: 26, height: 18, justifyContent: 'space-between', marginRight: spacing.md },
  menuLine: { height: 2, borderRadius: 1, backgroundColor: colors.primary },
  mobileTopBarTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
  screenContent: { flex: 1 },
  placeholderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  placeholderIcon: { fontSize: 40, marginBottom: spacing.md },
  placeholderTitle: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.xs },
  placeholderSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center' },
});