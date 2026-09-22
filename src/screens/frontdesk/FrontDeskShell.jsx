import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import FrontDeskSidebar from './FrontDeskSidebar';
import FrontDeskDashboardScreen from './FrontDeskDashboardScreen';
import ReservationsScreen from './ReservationsScreen';
import RoomManagementScreen from './RoomManagementScreen';
import HousekeepingManagementScreen from './HousekeepingManagementScreen';
import FoodOrdersScreen from './FoodOrdersScreen';
import GuestManagementScreen from './GuestManagementScreen';
import GuestDetailsScreen from './GuestDetailsScreen';
import BillingManagementScreen from './BillingManagementScreen';
import BillingRecordDetailScreen from './BillingRecordDetailScreen';
import RecordPaymentModal from './RecordPaymentModal';
import MyProfileScreen from './MyProfileScreen';
import DashboardNavbar from '../../components/shared/DashboardNavbar';
import DashboardFooter from '../../components/shared/DashboardFooter';
import { supabase } from '../../services/supabase';
import { colors, spacing, fonts } from '../../utils/portalTheme';

const WIDE_BREAKPOINT = 1024;

export default function FrontDeskShell({ onLoggedOut, staffName, staffRole, staffUid }) {
  const [activeKey, setActiveKey] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  // Sidebar avatar — fetched here (rather than passed in from App.jsx,
  // which doesn't track it) so it stays in sync with whatever the staff
  // member sets on MyProfileScreen.jsx. Subscribed to realtime updates
  // too, so uploading a new photo there reflects in the sidebar
  // immediately without needing to reload.
  const [staffPhotoUrl, setStaffPhotoUrl] = useState(null);
  useEffect(() => {
    if (!staffUid) return;

    let cancelled = false;
    const loadPhoto = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('photo_url')
        .eq('id', staffUid)
        .single();
      if (!cancelled && !error) setStaffPhotoUrl(data?.photo_url || null);
    };
    loadPhoto();

    const channel = supabase
      .channel(`sidebar-avatar-${staffUid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${staffUid}` },
        (payload) => setStaffPhotoUrl(payload.new?.photo_url || null)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [staffUid]);

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
        staffPhotoUrl={staffPhotoUrl}
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
  // Walk-In Check-In and Tape Chart used to be routed here directly as
  // their own top-level screens. They're now tabs INSIDE
  // ReservationsScreen.jsx itself (see its TABS list), reached via the
  // generic startsWith('reservations') route below like everything else
  // in Reservation Management — ReservationsScreen recognizes
  // 'reservations:walkin'/'reservations:tapechart' as valid filterKeys
  // and embeds the right screen for them.
  if (activeKey.startsWith('reservations')) {
    return <ReservationsScreen onLogout={onLoggedOut} filterKey={activeKey} staffUid={staffUid} staffName={staffName} />;
  }
  if (activeKey.startsWith('rooms:')) {
    const section = activeKey.split(':')[1];
    return <RoomManagementScreen onLogout={onLoggedOut} section={section} />;
  }
  // Housekeeping Schedule/Room Cleaning Status/Maintenance Requests moved
  // into a scrollable tab bar at the top of HousekeepingManagementScreen.jsx
  // itself, same treatment as Reservation/Room/Guest/Billing Management.
  if (activeKey.startsWith('housekeeping:')) {
    return (
      <HousekeepingManagementScreen
        section={activeKey.split(':')[1]}
        staffUid={staffUid}
        staffName={staffName}
      />
    );
  }
  if (activeKey === 'foodorders') {
    return <FoodOrdersScreen staffUid={staffUid} staffName={staffName} />;
  }
  // Guest Profiles/Guest Records/Guest Ratings/Inquiries moved into a
  // scrollable tab bar at the top of GuestManagementScreen.jsx itself.
  // 'guests:profile' (singular) is a drill-down detail view opened by
  // tapping a row in Records or Profiles, not a tab — it has to be
  // checked before the generic startsWith('guests:') catch-all below,
  // since it also starts with 'guests:'.
  if (activeKey === 'guests:profile') {
    return <GuestDetailsScreen guestId={selectedGuestId} onBack={closeGuestProfile} />;
  }
  if (activeKey.startsWith('guests:')) {
    return (
      <GuestManagementScreen
        section={activeKey.split(':')[1]}
        tabKeys={['profiles', 'records', 'ratings', 'inquiries']}
        onSelectGuest={openGuestProfile}
      />
    );
  }
  // Billing Records/Payments/Receipts moved into a scrollable tab bar at
  // the top of BillingManagementScreen.jsx itself. 'billing:detail' is a
  // drill-down detail view opened by tapping a row in Billing Records,
  // checked first for the same reason as 'guests:profile' above.
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
  if (activeKey.startsWith('billing:')) {
    return (
      <BillingManagementScreen
        section={activeKey.split(':')[1]}
        tabKeys={['records', 'payments', 'receipts']}
        onSelectRecord={openFolioDetail}
        staffUid={staffUid}
        staffName={staffName}
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