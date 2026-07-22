import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import AdminSidebar from './AdminSidebar';
import AdminDashboardScreen from './AdmindashboardScreen';
import RoomTypesRatesScreen from './RoomTypeRatesScreen';
import FrontDeskAccountsScreen from './FrontDeskAccountScreen';
import FrontDeskStaffScreen from './FrontDeskStaffScreen';
import OccupancyReportScreen from './OccupancyReportScreen';
import RevenueReportScreen from './RevenueReportScreen';
import FrontDeskDashboardScreen from '../frontdesk/FrontDeskDashboardScreen';
import ReservationsScreen from '../frontdesk/ReservationsScreen';
import RoomManagementScreen from '../frontdesk/RoomManagementScreen';
import RoomCleaningStatusScreen from '../frontdesk/RoomCleaningStatusScreen';
import HousekeepingScheduleScreen from '../frontdesk/HousekeepingSchedule';
import MaintenanceRequestScreen from '../frontdesk/MaintenanceRequest';
import GuestRecordsScreen from '../frontdesk/GuestRecordsScreen';
import GuestDetailsScreen from '../frontdesk/GuestDetailsScreen';
import GuestProfileTableScreen from '../frontdesk/GuestProfileTableScreen';
import InquiriesScreen from '../frontdesk/InquiriesScreen';
import BillingRecordsScreen from '../frontdesk/BillingRecordsScreen';
import BillingRecordDetailScreen from '../frontdesk/BillingRecordDetailScreen';
import RecordPaymentModal from '../frontdesk/RecordPaymentModal';
import DashboardNavbar from '../../components/shared/DashboardNavbar';
import DashboardFooter from '../../components/shared/DashboardFooter';
import PaymentsScreen from '../frontdesk/PaymentsScreen';
import ReceiptsScreen from '../frontdesk/ReceiptsScreen';
import { colors, spacing, fonts } from '../../utils/theme';

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
  if (activeKey === 'staff:accounts') {
    return <FrontDeskAccountsScreen />;
  }
  if (activeKey === 'staff:frontdesk') {
    return <FrontDeskStaffScreen />;
  }
  if (activeKey === 'reports:occupancy') {
    return <OccupancyReportScreen />;
  }
  if (activeKey === 'reports:revenue') {
    return <RevenueReportScreen />;
  }

  // ── Front Desk Operations (admin can do everything a front desk member can) ──
  if (activeKey.startsWith('fd:reservations')) {
    return <ReservationsScreen onLogout={props.onLoggedOut} filterKey={activeKey.replace('fd:', '')} />;
  }
  if (activeKey.startsWith('fd:rooms:')) {
    const section = activeKey.split(':')[2];
    return <RoomManagementScreen onLogout={props.onLoggedOut} section={section} />;
  }
  if (activeKey === 'fd:housekeeping:schedule') {
    return <HousekeepingScheduleScreen staffUid={props.staffUid} staffName={props.staffName} />;
  }
  if (activeKey === 'fd:housekeeping:status') {
    return <RoomCleaningStatusScreen onLogout={props.onLoggedOut} />;
  }
  if (activeKey === 'fd:housekeeping:maintenance') {
    return <MaintenanceRequestScreen staffUid={props.staffUid} staffName={props.staffName} />;
  }
  if (activeKey === 'fd:guests:records') {
    return <GuestRecordsScreen onSelectGuest={props.openGuestProfile} />;
  }
  if (activeKey === 'fd:guests:profiles') {
    return <GuestProfileTableScreen onSelectGuest={props.openGuestProfile} />;
  }
  if (activeKey === 'fd:guests:inquiries') {
    return <InquiriesScreen />;
  }
  if (activeKey === 'fd:guests:profile') {
    return <GuestDetailsScreen guestId={props.selectedGuestId} onBack={props.closeGuestProfile} />;
  }
  if (activeKey === 'fd:billing:records') {
    return <BillingRecordsScreen onSelectRecord={props.openFolioDetail} />;
  }
  if (activeKey === 'fd:billing:payments') {
    return <PaymentsScreen staffUid={props.staffUid} staffName={props.staffName} />;
  }
  if (activeKey === 'fd:billing:receipts') {
    return <ReceiptsScreen />;
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