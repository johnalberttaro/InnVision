import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import FrontDeskSidebar from './FrontDeskSidebar';
import FrontDeskDashboardScreen from './FrontDeskDashboardScreen';
import ReservationsScreen from './ReservationsScreen';
import RoomManagementScreen from './RoomManagementScreen';
import RoomCleaningStatusScreen from './RoomCleaningStatusScreen';
import HousekeepingScheduleScreen from './HousekeepingSchedule';
import MaintenanceRequestScreen from './MaintenanceRequest';
import GuestRecordsScreen from './GuestRecordsScreen';
import GuestDetailsScreen from './GuestDetailsScreen';
import GuestProfileTableScreen from './GuestProfileTableScreen';
import InquiriesScreen from './InquiriesScreen';
import BillingRecordsScreen from './BillingRecordsScreen';
import BillingRecordDetailScreen from './BillingRecordDetailScreen';
import RecordPaymentModal from './RecordPaymentModal';
import PaymentsScreen from './PaymentsScreen';
import ReceiptsScreen from './ReceiptsScreen';
import MyProfileScreen from './MyProfileScreen';
import DashboardNavbar from '../../components/shared/DashboardNavbar';
import DashboardFooter from '../../components/shared/DashboardFooter';
import { colors, spacing, fonts } from '../../utils/theme';

const WIDE_BREAKPOINT = 1024;

export default function FrontDeskShell({ onLoggedOut, staffName, staffRole, staffUid }) {
  const [activeKey, setActiveKey] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [selectedGuestId, setSelectedGuestId] = useState(null);
  const [profileOrigin, setProfileOrigin] = useState('guests:records');

  // Which folio's detail view is currently open, if any. Same pattern as
  // selectedGuestId/profileOrigin above — 'billing:detail' isn't itself a
  // sidebar item, it's a detail view opened by tapping a row in
  // 'billing:records', and "back" needs to return to whichever billing
  // screen opened it.
  const [selectedFolioId, setSelectedFolioId] = useState(null);
  const [folioOrigin, setFolioOrigin] = useState('billing:records');

  // Which folio the Record Payment modal is currently open for, if any.
  // Kept separate from selectedFolioId since the modal can be triggered
  // from other places later (e.g. Outstanding Balances) without needing
  // to navigate into the detail view first.
  const [paymentModalFolio, setPaymentModalFolio] = useState(null);

  // Bumped after a successful payment so BillingRecordDetailScreen (keyed
  // on this + selectedFolioId) remounts and re-fetches fresh totals
  // instead of showing stale amountPaid/remainingBalance after the modal closes.
  const [folioRefreshTick, setFolioRefreshTick] = useState(0);

  const handleNavigate = (key) => {
    if (key === 'logout') {
      handleLogout();
      return;
    }
    setSelectedGuestId(null);
    setSelectedFolioId(null);
    setActiveKey(key);
  };

  // Opened by tapping a card in either Guest Records or Guest Profiles.
  // Both now route to the same real detail screen (GuestDetailsScreen —
  // reservation summary + special requests), NOT the Guest Profiles
  // table.
  const openGuestProfile = (guest) => {
    setProfileOrigin(activeKey === 'guests:profiles' ? 'guests:profiles' : 'guests:records');
    setSelectedGuestId(guest.id);
    setActiveKey('guests:profile');
  };

  const closeGuestProfile = () => {
    setSelectedGuestId(null);
    setActiveKey(profileOrigin);
  };

  // Opened by tapping a row in Billing Records (and later, potentially,
  // Outstanding Balances too — this fn doesn't care which billing screen
  // called it, it just remembers via folioOrigin).
  const openFolioDetail = (folio) => {
    setFolioOrigin(activeKey.startsWith('billing:') ? activeKey : 'billing:records');
    setSelectedFolioId(folio.id);
    setActiveKey('billing:detail');
  };

  const closeFolioDetail = () => {
    setSelectedFolioId(null);
    setActiveKey(folioOrigin);
  };

  const openPaymentModal = (folio) => {
    setPaymentModalFolio(folio);
  };

  const closePaymentModal = () => {
    setPaymentModalFolio(null);
  };

  // Called by RecordPaymentModal after recordPayment() succeeds. Closes
  // the modal and bumps folioRefreshTick so the detail view (if open)
  // re-fetches the folio's updated totals and new payment history entry.
  const handlePaymentSuccess = () => {
    setPaymentModalFolio(null);
    setFolioRefreshTick((t) => t + 1);
  };

  const handleLogout = () => {
    onLoggedOut();
  };

  return (
    <View style={styles.screen}>
      <FrontDeskSidebar
        activeKey={
          activeKey === 'guests:profile'
            ? profileOrigin
            : activeKey === 'billing:detail'
            ? folioOrigin
            : activeKey
        }
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        staffName={staffName}
        staffRole={staffRole}
        collapsed={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <View style={styles.contentArea}>
        <DashboardNavbar
          title="InnVision Front Desk"
          isWide={isWide}
          onMenuPress={() => setMobileSidebarOpen(true)}
          onInquiriesPress={() => handleNavigate('guests:inquiries')}
        />

        <View style={styles.screenContent}>
          {renderActiveScreen(
            activeKey,
            onLoggedOut,
            selectedGuestId,
            openGuestProfile,
            closeGuestProfile,
            selectedFolioId,
            openFolioDetail,
            closeFolioDetail,
            openPaymentModal,
            folioRefreshTick,
            staffUid,
            staffName
          )}
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

function renderActiveScreen(
  activeKey,
  onLoggedOut,
  selectedGuestId,
  openGuestProfile,
  closeGuestProfile,
  selectedFolioId,
  openFolioDetail,
  closeFolioDetail,
  openPaymentModal,
  folioRefreshTick,
  staffUid,
  staffName
) {
  if (activeKey === 'dashboard') {
    return <FrontDeskDashboardScreen />;
  }
  if (activeKey === 'profile:me') {
    return <MyProfileScreen staffUid={staffUid} />;
  }
  if (activeKey.startsWith('reservations')) {
    return <ReservationsScreen onLogout={onLoggedOut} filterKey={activeKey} />;
  }
  if (activeKey.startsWith('rooms:')) {
    const section = activeKey.split(':')[1];
    return <RoomManagementScreen onLogout={onLoggedOut} section={section} />;
  }
  // Housekeeping — 'housekeeping:status' is the same underlying feature
  // as RoomCleaningStatusScreen. 'housekeeping:schedule' now routes to
  // the real staff-assignment task board. Maintenance Requests still
  // falls through to the placeholder until that screen is built.
  if (activeKey === 'housekeeping:schedule') {
    return <HousekeepingScheduleScreen staffUid={staffUid} staffName={staffName} />;
  }
  if (activeKey === 'housekeeping:status') {
    return <RoomCleaningStatusScreen onLogout={onLoggedOut} />;
  }
  if (activeKey === 'housekeeping:maintenance') {
    return <MaintenanceRequestScreen staffUid={staffUid} staffName={staffName} />;
  }
  if (activeKey === 'guests:records') {
    return <GuestRecordsScreen onSelectGuest={openGuestProfile} />;
  }
  if (activeKey === 'guests:profiles') {
    return <GuestProfileTableScreen onSelectGuest={openGuestProfile} />;
  }
  if (activeKey === 'guests:inquiries') {
    return <InquiriesScreen />;
  }
  if (activeKey === 'guests:profile') {
    return <GuestDetailsScreen guestId={selectedGuestId} onBack={closeGuestProfile} />;
  }
  // Billing Management — only 'billing:records' and its detail view are
  // wired up so far. Outstanding Balances and Transaction History still
  // fall through to the placeholder below until those screens are built.
  if (activeKey === 'billing:records') {
    return <BillingRecordsScreen onSelectRecord={openFolioDetail} />;
  }
  if (activeKey === 'billing:payments') {
    return <PaymentsScreen staffUid={staffUid} staffName={staffName} />;
  }
  if (activeKey === 'billing:receipts') {
    return <ReceiptsScreen />;
  }
  if (activeKey === 'billing:detail') {
    return (
      <BillingRecordDetailScreen
        key={`${selectedFolioId}-${folioRefreshTick}`}
        folioId={selectedFolioId}
        onBack={closeFolioDetail}
        onRecordPayment={openPaymentModal}
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