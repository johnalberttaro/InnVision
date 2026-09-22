import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import AdminSidebar from './AdminSidebar';
import AdminDashboardScreen from './AdmindashboardScreen';
import RoomTypesRatesScreen from './RoomTypeRatesScreen';
import FoodMenuScreen from './FoodMenuScreen';
import FrontDeskAccountsScreen from './FrontDeskAccountScreen';
import FnbAccountsScreen from './FnbAccountScreen';
import StaffRoleAccountScreen from './StaffRoleAccountScreen';
import FrontDeskStaffScreen from './FrontDeskStaffScreen';
import OccupancyReportScreen from './OccupancyReportScreen';
import RevenueReportScreen from './RevenueReportScreen';
import GuestRatingsScreen from './GuestRatingsScreen';
import FrontDeskDashboardScreen from '../frontdesk/FrontDeskDashboardScreen';
import ReservationsScreen from '../frontdesk/ReservationsScreen';
import RoomManagementScreen from '../frontdesk/RoomManagementScreen';
import HousekeepingManagementScreen from '../frontdesk/HousekeepingManagementScreen';
import GuestDetailsScreen from '../frontdesk/GuestDetailsScreen';
import GuestManagementScreen from '../frontdesk/GuestManagementScreen';
import BillingManagementScreen from '../frontdesk/BillingManagementScreen';
import BillingRecordDetailScreen from '../frontdesk/BillingRecordDetailScreen';
import RecordPaymentModal from '../frontdesk/RecordPaymentModal';
import DashboardNavbar from '../../components/shared/DashboardNavbar';
import DashboardFooter from '../../components/shared/DashboardFooter';
import { colors, spacing, fonts } from '../../utils/portalTheme';

const WIDE_BREAKPOINT = 1024;

/**
 * AdminShell — top-level shell for the Admin Portal (superadmin role).
 *
 * The Admin has the MOST access: it keeps its own admin-only sections
 * (Room Types & Rates editor, Staff management, Reports) AND operates the
 * entire Front Desk portal from inside the Admin Portal via the
 * "Front Desk Operations" sidebar section. Those `fd:*` keys reuse the
 * exact same screens the Front Desk staff use, so an admin can do
 * everything a front desk member can — and more.
 *
 * The front-desk screens expect a `staffUid`/`staffName` acting identity
 * (used for payment attribution, etc.). The admin acts under their own
 * name; `staffUid` is left null since the admin isn't a front-desk auth
 * user — payment attribution will show the admin name via `staffName`.
 */
export default function AdminShell({ onLoggedOut, adminName }) {
  const [activeKey, setActiveKey] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const staffName = adminName || 'Administrator';
  const staffUid = null;

  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [profileOrigin, setProfileOrigin] = useState('fd:guests:records');

  const [selectedFolioId, setSelectedFolioId] = useState(null);
  const [folioOrigin, setFolioOrigin] = useState('fd:billing:records');

  const [paymentModalFolio, setPaymentModalFolio] = useState(null);
  const [folioRefreshTick, setFolioRefreshTick] = useState(0);

  const handleNavigate = (key) => {
    if (key === 'logout') {
      onLoggedOut();
      return;
    }
    // Leaving any detail view resets the transient selection state.
    setSelectedGuestId(null);
    setSelectedFolioId(null);
    setActiveKey(key);
  };

  const openGuestProfile = (guest) => {
    setProfileOrigin(activeKey === 'fd:guests:profiles' ? 'fd:guests:profiles' : 'fd:guests:records');
    setSelectedGuestId(guest.id);
    setActiveKey('fd:guests:profile');
  };

  const closeGuestProfile = () => {
    setSelectedGuestId(null);
    setActiveKey(profileOrigin);
  };

  const openFolioDetail = (folio) => {
    setFolioOrigin(activeKey.startsWith('fd:billing:') ? activeKey : 'fd:billing:records');
    setSelectedFolioId(folio.id);
    setActiveKey('fd:billing:detail');
  };

  const closeFolioDetail = () => {
    setSelectedFolioId(null);
    setActiveKey(folioOrigin);
  };

  const openPaymentModal = (folio) => setPaymentModalFolio(folio);
  const closePaymentModal = () => setPaymentModalFolio(null);

  const handlePaymentSuccess = () => {
    setPaymentModalFolio(null);
    setFolioRefreshTick((t) => t + 1);
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
        <DashboardNavbar
          title="InnVision Admin"
          isWide={isWide}
          onMenuPress={() => setMobileSidebarOpen(true)}
          onInquiriesPress={() => handleNavigate('fd:guests:inquiries')}
        />

        <View style={styles.screenContent}>
          {renderActiveScreen({
            activeKey,
            onNavigate: handleNavigate,
            onLoggedOut,
            staffName,
            staffUid,
            selectedGuestId,
            openGuestProfile,
            closeGuestProfile,
            selectedFolioId,
            openFolioDetail,
            closeFolioDetail,
            openPaymentModal,
            folioRefreshTick,
          })}
        </View>

        <DashboardFooter />
      </View>

      <RecordPaymentModal
        visible={!!paymentModalFolio}
        folio={paymentModalFolio}
        staffUid={staffUid}
        staffName={staffName}
        onClose={closePaymentModal}
        onSuccess={handlePaymentSuccess}
      />
    </View>
  );
}

function renderActiveScreen(props) {
  const { activeKey } = props;

  if (activeKey === 'dashboard') {
    return <AdminDashboardScreen onNavigate={props.onNavigate} />;
  }
  if (activeKey === 'rooms:types') {
    return <RoomTypesRatesScreen />;
  }
  if (activeKey === 'food:menu') {
    return <FoodMenuScreen />;
  }
  if (activeKey === 'staff:accounts') {
    return <FrontDeskAccountsScreen />;
  }
  if (activeKey === 'staff:fnb') {
    return <FnbAccountsScreen />;
  }
  if (activeKey === 'staff:frontdesk') {
    return <FrontDeskStaffScreen />;
  }
  if (activeKey === 'staff:housekeeping') {
    return <StaffRoleAccountScreen role="housekeeping" roleLabel="Housekeeping" />;
  }
  if (activeKey === 'staff:maintenance') {
    return <StaffRoleAccountScreen role="maintenance" roleLabel="Maintenance" />;
  }
  if (activeKey === 'reports:occupancy') {
    return <OccupancyReportScreen />;
  }
  if (activeKey === 'reports:revenue') {
    return <RevenueReportScreen />;
  }
  if (activeKey === 'reports:ratings') {
    return <GuestRatingsScreen />;
  }

  // ── Front Desk Operations (admin can do everything a front desk member can) ──
  if (activeKey.startsWith('fd:reservations')) {
    return (
      <ReservationsScreen
        onLogout={props.onLoggedOut}
        filterKey={activeKey.replace('fd:', '')}
        staffName={props.staffName}
        staffUid={props.staffUid}
      />
    );
  }
  if (activeKey.startsWith('fd:rooms:')) {
    const section = activeKey.split(':')[2];
    return <RoomManagementScreen onLogout={props.onLoggedOut} section={section} />;
  }
  // Housekeeping Schedule/Room Cleaning Status/Maintenance Requests moved
  // into a scrollable tab bar at the top of HousekeepingManagementScreen.jsx
  // itself, same treatment as everything else in Front Desk Operations.
  if (activeKey.startsWith('fd:housekeeping:')) {
    return (
      <HousekeepingManagementScreen
        section={activeKey.split(':')[2]}
        staffUid={props.staffUid}
        staffName={props.staffName}
      />
    );
  }
  // 'fd:guests:profile' (singular) is a drill-down detail view opened by
  // tapping a row in Guest Records/Profiles, not a tab — checked before
  // the generic startsWith('fd:guests:') catch-all below, since it also
  // starts with 'fd:guests:'.
  if (activeKey === 'fd:guests:profile') {
    return <GuestDetailsScreen guestId={props.selectedGuestId} onBack={props.closeGuestProfile} />;
  }
  if (activeKey.startsWith('fd:guests:')) {
    // Admin's own sidebar only ever listed Profiles/Records/Special
    // Requests here (never Ratings — that gap predates this refactor).
    // Inquiries isn't in the tab list either, but the top navbar's
    // inquiries shortcut still lands on 'fd:guests:inquiries' directly,
    // and GuestManagementScreen renders that content regardless of which
    // tabs are visible, so it keeps working exactly as before.
    return (
      <GuestManagementScreen
        section={activeKey.split(':')[2]}
        tabKeys={['profiles', 'records', 'requests']}
        onSelectGuest={props.openGuestProfile}
      />
    );
  }
  if (activeKey === 'fd:billing:detail') {
    return (
      <BillingRecordDetailScreen
        key={`${props.selectedFolioId}-${props.folioRefreshTick}`}
        folioId={props.selectedFolioId}
        onBack={props.closeFolioDetail}
        onRecordPayment={props.openPaymentModal}
      />
    );
  }
  if (activeKey.startsWith('fd:billing:')) {
    return (
      <BillingManagementScreen
        section={activeKey.split(':')[2]}
        tabKeys={['records', 'payments', 'receipts', 'outstanding', 'transactions']}
        onSelectRecord={props.openFolioDetail}
        staffUid={props.staffUid}
        staffName={props.staffName}
      />
    );
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