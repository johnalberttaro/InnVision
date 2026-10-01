import React, { useState, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import FnbSidebar from './FnbSidebar';
import FnbDashboardScreen from './FnbDashboardScreen';
import KitchenOrdersScreen from './KitchenOrdersScreen';
import OrderHistoryScreen from './OrderHistoryScreen';
import MenuAvailabilityScreen from './MenuAvailabilityScreen';
import MyProfileScreen from '../frontdesk/MyProfileScreen';
import DashboardFooter from '../../components/shared/DashboardFooter';
import DashboardNavbar from '../../components/shared/DashboardNavbar';
import { supabase } from '../../services/supabase';
import { colors } from '../../utils/portalTheme';

const WIDE_BREAKPOINT = 1024;

/**
 * FnbShell — the Kitchen/F&B portal, Phase 3 of the Food Service module.
 *
 * Same shape as FrontDeskShell.jsx (sidebar + top bar + content area +
 * footer, same responsive sidebar-overlay behavior, same live-synced
 * sidebar avatar), scaled down to what this role actually needs:
 *  - Dashboard — today's orders, revenue, average escalated-to-delivered
 *    time, and top items, at a glance.
 *  - Kitchen Orders — active work: prepare an escalated order, assign
 *    a delivery staff member, mark an order delivered + record how it
 *    was paid.
 *  - Order History — a read-only look back at every order that's
 *    reached Delivered or Cancelled.
 *  - Menu Availability — toggle a dish on/off when ingredients or
 *    recipes are missing; guests stop seeing it immediately since
 *    OrderFoodScreen.jsx's own menu query already filters to
 *    available = true.
 *  - My Profile — reused directly from the Front Desk portal
 *    (frontdesk/MyProfileScreen.jsx) rather than duplicated. That
 *    screen only ever needed `staffUid` to begin with, so it was
 *    already role-agnostic; no changes needed to share it here.
 *
 * Uses DashboardNavbar.jsx directly for its top bar (title, bell,
 * clock + weather) rather than a hand-rolled one, scoped down with
 * notificationTypes={['foodorder_escalated']} — fires when Front Desk
 * escalates an order to the kitchen (food_orders.escalated_at), NOT
 * when a guest first places one. Reservations, room charges, and plain
 * "new food order" (Front Desk's own signal to go escalate it) are
 * concerns this portal has no screen for or no action to take on yet.
 * KitchenOrdersScreen.jsx (see playNewOrderChime()/
 * triggerNewOrderPulse() there, which this screen embeds) still
 * handles the in-the-moment sound + visual pulse while actively on
 * that screen; this bell is what lets a staff member sitting on
 * Dashboard/Order History/Menu Availability notice a new order came in
 * and jump straight to it, which the chime alone can't do from outside
 * Kitchen Orders.
 *
 * Props:
 *  - onLoggedOut: () => void
 *  - staffName: string
 *  - staffUid: string
 */
export default function FnbShell({ onLoggedOut, staffName, staffUid }) {
  const [activeKey, setActiveKey] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  // Sidebar avatar — same live-synced pattern as FrontDeskShell.jsx: if
  // this staff member updates their photo on My Profile, it reflects in
  // the sidebar immediately without a reload.
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
      .channel(`fnb-sidebar-avatar-${staffUid}`)
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

  // Note: logout does NOT go through this — FnbSidebar's Logout button
  // calls onLogout directly (after its own confirm dialog), same as
  // every other portal's sidebar. This only ever handles real screen
  // navigation.
  const handleNavigate = (key) => setActiveKey(key);

  // Bell only ever carries 'foodorder_escalated' here (see
  // notificationTypes below), so the mapping is a one-liner — straight
  // to Kitchen Orders, the same screen the in-app chime/pulse already
  // lives on.
  const handleNotificationNavigate = (type) => {
    if (type === 'foodorder_escalated') handleNavigate('kitchenorders');
  };

  return (
    <View style={styles.screen}>
      <FnbSidebar
        activeKey={activeKey}
        onNavigate={handleNavigate}
        onLogout={onLoggedOut}
        staffName={staffName}
        staffPhotoUrl={staffPhotoUrl}
        collapsed={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <View style={styles.contentArea}>
        <DashboardNavbar
          title="InnVision Kitchen / F&B"
          isWide={isWide}
          onMenuPress={() => setMobileSidebarOpen(true)}
          staffUid={staffUid}
          notificationTypes={['foodorder_escalated']}
          onNotificationNavigate={handleNotificationNavigate}
        />

        <View style={styles.screenContent}>
          {activeKey === 'profile:me' ? (
            <MyProfileScreen staffUid={staffUid} />
          ) : activeKey === 'orderhistory' ? (
            <OrderHistoryScreen staffUid={staffUid} staffName={staffName} />
          ) : activeKey === 'menuavailability' ? (
            <MenuAvailabilityScreen staffUid={staffUid} staffName={staffName} />
          ) : activeKey === 'kitchenorders' ? (
            <KitchenOrdersScreen staffUid={staffUid} staffName={staffName} />
          ) : (
            <FnbDashboardScreen staffUid={staffUid} staffName={staffName} onNavigate={handleNavigate} />
          )}
        </View>

        <DashboardFooter />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  contentArea: { flex: 1 },
  screenContent: { flex: 1 },
});