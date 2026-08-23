import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';
import { Ionicons } from '@expo/vector-icons';
import ConfirmDialog from '../../components/shared/ConfirmDialog';

const WIDE_BREAKPOINT = 1024;
const SIDEBAR_WIDTH = 264;

const LOGO_SOURCE = require('../../../assets/logo.png');

// Deliberately minimal — unlike Front Desk or Admin, Kitchen/F&B's job
// is just these four: Dashboard (today's orders/revenue/turnaround
// time at a glance), Kitchen Orders (active work — prepare, assign
// delivery, mark delivered), Order History (a read-only look back at
// what's been delivered or cancelled), and Menu Availability (toggle a
// dish on/off when ingredients run out). No sub-menus. More sections
// can be added here the same way Front Desk's menu grew over time, if
// this role's scope grows further.
const MENU_SECTIONS = [
  {
    key: 'dashboard',
    icon: 'grid-outline',
    label: 'Dashboard',
  },
  {
    key: 'kitchenorders',
    icon: 'restaurant-outline',
    label: 'Kitchen Orders',
  },
  {
    key: 'orderhistory',
    icon: 'time-outline',
    label: 'Order History',
  },
  {
    key: 'menuavailability',
    icon: 'fast-food-outline',
    label: 'Menu Availability',
  },
];

/**
 * FnbSidebar — left navigation for the Kitchen/F&B portal.
 *
 * Same responsive behavior and structure as FrontDeskSidebar.jsx (fixed
 * on wide screens, slide-in overlay on narrow ones; same profile footer
 * + logout confirmation pattern) — just a much shorter menu, since this
 * role only has one real screen so far.
 *
 * Props: same shape as FrontDeskSidebar.jsx
 *  - activeKey, onNavigate, onLogout
 *  - staffName?, staffPhotoUrl?
 *  - collapsed, onClose (mobile only)
 */
export default function FnbSidebar({
  activeKey,
  onNavigate,
  onLogout,
  staffName = 'Kitchen/F&B Staff',
  staffPhotoUrl,
  collapsed = false,
  onClose,
}) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const content = (
    <SidebarContent
      activeKey={activeKey}
      onNavigate={(key) => {
        onNavigate(key);
        if (!isWide && onClose) onClose();
      }}
      onLogout={onLogout}
      staffName={staffName}
      staffPhotoUrl={staffPhotoUrl}
    />
  );

  if (isWide) {
    return <View style={styles.fixedWrap}>{content}</View>;
  }

  return (
    <Modal visible={collapsed} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlayBackdrop}>
        <TouchableOpacity style={styles.backdropTapArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.overlayPanel}>{content}</View>
      </View>
    </Modal>
  );
}

function SidebarContent({ activeKey, onNavigate, onLogout, staffName, staffPhotoUrl }) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  // Tracks which single menu item (by key) currently has the mouse over
  // it — React Native Web forwards onMouseEnter/onMouseLeave to the
  // underlying DOM node, which is how "hover" works here (there's no
  // native RN concept of hover; on a phone/tablet these events simply
  // never fire, so this harmlessly does nothing there).
  const [hoveredKey, setHoveredKey] = useState(null);

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Image source={LOGO_SOURCE} style={styles.logoImage} resizeMode="contain" />
        <Text style={styles.brandName}>InnVision</Text>
        <Text style={styles.brandSubtitle}>Kitchen / F&amp;B Portal</Text>
      </View>

      <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
        {MENU_SECTIONS.map((section) => {
          const isActive = activeKey === section.key;
          const isHovered = hoveredKey === section.key;
          return (
            <TouchableOpacity
              key={section.key}
              style={[styles.menuItem, isActive && styles.menuItemActive, !isActive && isHovered && styles.menuItemHovered]}
              onPress={() => onNavigate(section.key)}
              onMouseEnter={() => setHoveredKey(section.key)}
              onMouseLeave={() => setHoveredKey(null)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={section.icon}
                size={18}
                color={isActive ? colors.white : 'rgba(255,255,255,0.85)'}
                style={styles.menuIcon}
              />
              <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>{section.label}</Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.menuItem, hoveredKey === 'logout' && styles.menuItemHovered]}
          onPress={() => setConfirmingLogout(true)}
          onMouseEnter={() => setHoveredKey('logout')}
          onMouseLeave={() => setHoveredKey(null)}
          activeOpacity={0.75}
        >
          <Ionicons name="log-out-outline" size={18} color="rgba(255,255,255,0.85)" style={styles.menuIcon} />
          <Text style={styles.menuLabel}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.profileFooter}>
        <TouchableOpacity
          style={styles.profileFooterMain}
          onPress={() => onNavigate('profile:me')}
          activeOpacity={0.7}
          accessibilityLabel="View my profile"
        >
          <View style={styles.avatar}>
            {staffPhotoUrl ? (
              <Image source={{ uri: staffPhotoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{staffName.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.profileTextWrap}>
            <Text style={styles.profileName} numberOfLines={1}>{staffName}</Text>
            <Text style={styles.profileRole} numberOfLines={1}>Kitchen / F&amp;B</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setConfirmingLogout(true)} style={styles.quickLogout} accessibilityLabel="Log out">
          <Ionicons name="power-outline" size={16} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={confirmingLogout}
        title="Log Out?"
        message="Are you sure you want to log out?"
        confirmLabel="Yes"
        cancelLabel="No"
        destructive
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={() => {
          setConfirmingLogout(false);
          onLogout && onLogout();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fixedWrap: { width: SIDEBAR_WIDTH, height: '100%' },
  overlayBackdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)' },
  overlayPanel: { width: SIDEBAR_WIDTH, height: '100%' },
  backdropTapArea: { flex: 1 },

  sidebar: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: colors.primary,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },

  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  logoImage: { width: 44, height: 44, marginBottom: spacing.sm },
  brandName: { fontSize: 17, fontFamily: fonts.headingExtraBold, color: colors.white, letterSpacing: 0.3 },
  brandSubtitle: { fontSize: 10, fontFamily: fonts.body, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 2 },

  menuScroll: { flex: 1, paddingVertical: spacing.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  menuItemActive: { backgroundColor: 'rgba(255,255,255,0.1)', borderLeftWidth: 3, borderLeftColor: colors.accent },
  menuItemHovered: { backgroundColor: 'rgba(255,255,255,0.06)' },
  menuIcon: { width: 24 },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: fonts.bodySemiBold, color: 'rgba(255,255,255,0.85)' },
  menuLabelActive: { color: colors.white },

  profileFooter: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  profileFooterMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, overflow: 'hidden',
  },
  avatarImage: { width: 44, height: 44 },
  avatarText: { color: colors.white, fontFamily: fonts.headingBold, fontSize: 16 },
  profileTextWrap: { flex: 1 },
  profileName: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.white },
  profileRole: { fontSize: 11, fontFamily: fonts.body, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  quickLogout: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  quickLogoutIcon: { fontSize: 14, color: colors.white },
});