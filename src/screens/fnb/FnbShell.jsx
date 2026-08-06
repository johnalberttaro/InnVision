import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FnbSidebar from './FnbSidebar';
import KitchenOrdersScreen from './KitchenOrdersScreen';
import OrderHistoryScreen from './OrderHistoryScreen';
import MenuAvailabilityScreen from './MenuAvailabilityScreen';
import MyProfileScreen from '../frontdesk/MyProfileScreen';
import DashboardFooter from '../../components/shared/DashboardFooter';
import { supabase } from '../../services/supabase';
import { colors, spacing, fonts } from '../../utils/theme';

const WIDE_BREAKPOINT = 1024;

/**
 * FnbShell — the Kitchen/F&B portal, Phase 3 of the Food Service module.
 *
 * Same shape as FrontDeskShell.jsx (sidebar + top bar + content area +
 * footer, same responsive sidebar-overlay behavior, same live-synced
 * sidebar avatar), scaled down to what this role actually needs:
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
 * No DashboardNavbar reuse here — that shared component's notification
 * bell is wired specifically to guest inquiries (contact_messages), a
 * Front Desk/Admin concern that doesn't apply to Kitchen/F&B staff. A
 * plain top bar (title + mobile menu button only) avoids showing a
 * bell tied to a feature this role doesn't use.
 *
 * Props:
 *  - onLoggedOut: () => void
 *  - staffName: string
 *  - staffUid: string
 */
export default function FnbShell({ onLoggedOut, staffName, staffUid }) {
  const [activeKey, setActiveKey] = useState('kitchenorders');
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
        <View style={styles.topBar}>
          {!isWide && (
            <TouchableOpacity onPress={() => setMobileSidebarOpen(true)} style={styles.menuButton} accessibilityLabel="Open menu">
              <Ionicons name="menu" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          <Text style={styles.topBarTitle}>InnVision Kitchen / F&amp;B</Text>
        </View>

        <View style={styles.screenContent}>
          {activeKey === 'profile:me' ? (
            <MyProfileScreen staffUid={staffUid} />
          ) : activeKey === 'orderhistory' ? (
            <OrderHistoryScreen staffUid={staffUid} staffName={staffName} />
          ) : activeKey === 'menuavailability' ? (
            <MenuAvailabilityScreen staffUid={staffUid} staffName={staffName} />
          ) : (
            <KitchenOrdersScreen staffUid={staffUid} staffName={staffName} />
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
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  menuButton: { marginRight: spacing.md },
  topBarTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary },
  screenContent: { flex: 1 },
});