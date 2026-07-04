import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import AdminSidebar from './Adminsidebar';
import AdminDashboardScreen from './Admindashboardscreen';
import AdminBookingsScreen from './Adminbookingsscreen';
import RoomManagementScreen from './Roommanagementscreen';
import { colors, spacing, fonts } from '../../utils/theme';

const WIDE_BREAKPOINT = 1024;

/**
 * AdminShell — top-level admin layout: sidebar (fixed on desktop,
 * collapsible overlay on mobile/tablet) + whichever section is active.
 *
 * Wired to real screens: 'dashboard', the reservation-related keys
 * (AdminBookingsScreen), and every 'rooms:*' key (RoomManagementScreen —
 * one shared, fully read-only screen covering Room Types, Room List,
 * Room Availability, Room Status, and Room Maintenance, since the hotel's
 * room inventory is fixed and defined entirely in roomRates.js). Every
 * other sidebar item still renders a "Coming soon" placeholder — the
 * sidebar itself is fully built per the spec, but Guest Management,
 * Billing, Housekeeping, Reports, and Administration haven't been built
 * yet.
 *
 * Props:
 *  - onLoggedOut: () => void   called after sign-out, to leave the admin area entirely
 *  - adminName?: string
 *  - adminRole?: string
 */
export default function AdminShell({ onLoggedOut, adminName, adminRole }) {
  const [activeKey, setActiveKey] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const handleNavigate = (key) => {
    if (key === 'logout') {
      handleLogout();
      return;
    }
    setActiveKey(key);
  };

  // App.jsx's handleLogout already calls signOut(auth) and resets screen
  // state — this just delegates to it rather than duplicating that work.
  const handleLogout = () => {
    onLoggedOut();
  };

  return (
    <View style={styles.screen}>
      <AdminSidebar
        activeKey={activeKey}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        adminName={adminName}
        adminRole={adminRole}
        collapsed={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <View style={styles.contentArea}>
        {/* Mobile-only top bar with the hamburger trigger — the sidebar
            itself has no fixed/visible trigger on narrow screens, since
            it's an overlay that needs to be explicitly opened. */}
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
          {renderActiveScreen(activeKey, onLoggedOut)}
        </View>
      </View>
    </View>
  );
}

function renderActiveScreen(activeKey, onLoggedOut) {
  if (activeKey === 'dashboard') {
    return <AdminDashboardScreen />;
  }
  if (activeKey.startsWith('reservations')) {
    return <AdminBookingsScreen onLogout={onLoggedOut} filterKey={activeKey} />;
  }
  if (activeKey.startsWith('rooms:')) {
    const section = activeKey.split(':')[1]; // types | list | availability | status | maintenance
    return <RoomManagementScreen onLogout={onLoggedOut} section={section} />;
  }
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
  screen: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  contentArea: {
    flex: 1,
  },
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuButton: {
    width: 26,
    height: 18,
    justifyContent: 'space-between',
    marginRight: spacing.md,
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  mobileTopBarTitle: {
    fontSize: 15,
    fontFamily: fonts.headingBold,
    color: colors.primary,
  },
  screenContent: {
    flex: 1,
  },
  placeholderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  placeholderTitle: {
    fontSize: 18,
    fontFamily: fonts.headingBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  placeholderSubtitle: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});