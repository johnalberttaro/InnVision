import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import AdminSidebar from './Adminsidebar';
import AdminDashboardScreen from './Admindashboardscreen';
import AdminBookingsScreen from './Adminbookingsscreen';
import RoomManagementScreen from './Roommanagementscreen';
import GuestRecordsScreen from './Guestrecordsscreen';
import GuestProfileScreen from './Guestprofilescreen';
import { colors, spacing, fonts } from '../../utils/theme';

const WIDE_BREAKPOINT = 1024;

/**
 * AdminShell — top-level admin layout: sidebar (fixed on desktop,
 * collapsible overlay on mobile/tablet) + whichever section is active.
 *
 * Wired to real screens: 'dashboard', the reservation-related keys
 * (AdminBookingsScreen), every 'rooms:*' key (RoomManagementScreen),
 * 'guests:records' (GuestRecordsScreen — the master guest directory), and
 * now 'guests:profile' (GuestProfileScreen — the single-guest dossier,
 * opened by tapping a card in Guest Records; it is NOT a separate sidebar
 * item, just a detail view layered on top of Guest Records). Every other
 * sidebar item still renders a "Coming soon" placeholder — Guest History,
 * Special Requests, Billing, Housekeeping, Reports, and Administration
 * haven't been built yet.
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

  // Which guest's dossier is currently open, if any. Only meaningful while
  // activeKey === 'guests:profile'; cleared on the way back out so a stale
  // id can't linger and get reused if the admin navigates elsewhere and
  // back into Guest Records without going through a fresh selection.
  const [selectedGuestId, setSelectedGuestId] = useState(null);

  const handleNavigate = (key) => {
    if (key === 'logout') {
      handleLogout();
      return;
    }
    // Navigating anywhere via the sidebar always leaves any open guest
    // profile behind, since 'guests:profile' isn't itself a sidebar item.
    setSelectedGuestId(null);
    setActiveKey(key);
  };

  const openGuestProfile = (guest) => {
    setSelectedGuestId(guest.id);
    setActiveKey('guests:profile');
  };

  const closeGuestProfile = () => {
    setSelectedGuestId(null);
    setActiveKey('guests:records');
  };

  // App.jsx's handleLogout already calls signOut(auth) and resets screen
  // state — this just delegates to it rather than duplicating that work.
  const handleLogout = () => {
    onLoggedOut();
  };

  return (
    <View style={styles.screen}>
      <AdminSidebar
        activeKey={activeKey === 'guests:profile' ? 'guests:records' : activeKey}
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
          {renderActiveScreen(activeKey, onLoggedOut, selectedGuestId, openGuestProfile, closeGuestProfile)}
        </View>
      </View>
    </View>
  );
}

function renderActiveScreen(activeKey, onLoggedOut, selectedGuestId, openGuestProfile, closeGuestProfile) {
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
  if (activeKey === 'guests:records') {
    return <GuestRecordsScreen onSelectGuest={openGuestProfile} />;
  }
  if (activeKey === 'guests:profile') {
    return <GuestProfileScreen guestId={selectedGuestId} onBack={closeGuestProfile} />;
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