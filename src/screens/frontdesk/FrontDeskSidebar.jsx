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
import { colors, spacing, radius, fonts } from '../../utils/theme';

const WIDE_BREAKPOINT = 1024; // sidebar is fixed/always-visible above this
const SIDEBAR_WIDTH = 264;

// ─── Logo image ───────────────────────────────────────────────────────────
const LOGO_SOURCE = require('../../../assets/logo.png');
// ─────────────────────────────────────────────────────────────────────────

// Sidebar menu structure. Each top-level item can have `subItems`; tapping
// a parent with sub-items expands/collapses them rather than navigating
// directly (parents with no sub-items, like Dashboard and Logout, navigate
// immediately on tap).
//
// NOTE: Reports & Analytics and Administration sections were removed from
// here — those are Admin Portal responsibilities, not Front Desk. They'll
// live in screens/admin/AdminSidebar.jsx when that module is built.
const MENU_SECTIONS = [
  {
    key: 'dashboard',
    icon: '🏠',
    label: 'Dashboard',
  },
  {
    key: 'reservations',
    icon: '📅',
    label: 'Reservation Management',
    subItems: [
      { key: 'reservations:all', label: 'View Reservations' },
      { key: 'reservations:pending', label: 'Pending Reservations' },
      { key: 'reservations:confirmed', label: 'Confirmed Reservations' },
      { key: 'reservations:checkins', label: 'Check-ins' },
      { key: 'reservations:checkouts', label: 'Check-outs' },
    ],
  },
  {
    key: 'rooms',
    icon: '🛏',
    label: 'Room Management',
    subItems: [
      { key: 'rooms:list', label: 'Room List' },
      { key: 'rooms:types', label: 'Room Types' },
      { key: 'rooms:availability', label: 'Room Availability' },
      { key: 'rooms:status', label: 'Room Status' },
      { key: 'rooms:maintenance', label: 'Room Maintenance' },
    ],
  },
  {
    key: 'guests',
    icon: '👥',
    label: 'Guest Management',
    subItems: [
      { key: 'guests:profiles', label: 'Guest Profiles' },
      { key: 'guests:records', label: 'Guest Records' },
      { key: 'guests:requests', label: 'Special Requests' },
    ],
  },
  {
    key: 'billing',
    icon: '💳',
    label: 'Billing Management',
    subItems: [
      { key: 'billing:records', label: 'Billing Records' },
      { key: 'billing:payments', label: 'Payments' },
      { key: 'billing:receipts', label: 'Receipts' },
      { key: 'billing:outstanding', label: 'Outstanding Balances' },
      { key: 'billing:transactions', label: 'Transaction History' },
    ],
  },
  {
    key: 'housekeeping',
    icon: '🧹',
    label: 'Housekeeping',
    subItems: [
      { key: 'housekeeping:schedule', label: 'Housekeeping Schedule' },
      { key: 'housekeeping:status', label: 'Room Cleaning Status' },
      { key: 'housekeeping:maintenance', label: 'Maintenance Requests' },
    ],
  },
];

/**
 * FrontDeskSidebar — left navigation for the Front Desk Staff portal.
 *
 * Responsive behavior:
 *  - Wide screens (>= 1024px, desktop): fixed, always-visible sidebar.
 *    `onMenuPress`/`collapsed` props are unused in this mode.
 *  - Narrow screens (< 1024px, tablet/mobile): sidebar is hidden by
 *    default and slides in as a full-height overlay when `collapsed` is
 *    false, triggered by a hamburger button the parent screen renders
 *    (see FrontDeskShell.jsx) and closed via `onClose`.
 *
 * Props:
 *  - activeKey: string             currently active menu/sub-item key
 *  - onNavigate: (key) => void     called when a leaf item is tapped
 *  - onLogout: () => void
 *  - staffName?: string
 *  - staffRole?: string
 *  - collapsed: boolean            (mobile only) whether the overlay is open
 *  - onClose: () => void           (mobile only) close the overlay
 */
export default function FrontDeskSidebar({
  activeKey,
  onNavigate,
  onLogout,
  staffName = 'Front Desk Staff',
  staffRole = 'Front Desk',
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
      staffRole={staffRole}
    />
  );

  if (isWide) {
    return <View style={styles.fixedWrap}>{content}</View>;
  }

  // Narrow screens: render as a full-height overlay modal, closeable by
  // tapping the dimmed backdrop or by navigating to an item.
  return (
    <Modal visible={collapsed} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlayBackdrop}>
        <TouchableOpacity style={styles.backdropTapArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.overlayPanel}>{content}</View>
      </View>
    </Modal>
  );
}

function SidebarContent({ activeKey, onNavigate, onLogout, staffName, staffRole }) {
  // Auto-expand whichever section contains the active leaf item, so the
  // active page is always visible without staff needing to manually
  // re-open its parent section.
  const initialExpanded = MENU_SECTIONS.find((section) =>
    section.subItems?.some((sub) => sub.key === activeKey)
  )?.key;
  const [expandedKey, setExpandedKey] = useState(initialExpanded || null);

  const toggleSection = (section) => {
    if (!section.subItems) {
      onNavigate(section.key);
      return;
    }
    setExpandedKey((prev) => (prev === section.key ? null : section.key));
  };

  return (
    <View style={styles.sidebar}>
      {/* Header */}
      <View style={styles.header}>
        {LOGO_SOURCE ? (
          <Image source={LOGO_SOURCE} style={styles.logoImage} resizeMode="contain" />
        ) : (
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>LOGO</Text>
          </View>
        )}
        <Text style={styles.brandName}>InnVision</Text>
        <Text style={styles.brandSubtitle}>Front Desk Staff Portal</Text>
      </View>

      {/* Menu */}
      <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
        {MENU_SECTIONS.map((section) => {
          const isParentActive = activeKey === section.key || section.subItems?.some((s) => s.key === activeKey);
          const isExpanded = expandedKey === section.key;

          return (
            <View key={section.key}>
              <TouchableOpacity
                style={[styles.menuItem, isParentActive && !section.subItems && styles.menuItemActive]}
                onPress={() => toggleSection(section)}
                activeOpacity={0.75}
              >
                <Text style={styles.menuIcon}>{section.icon}</Text>
                <Text style={[styles.menuLabel, isParentActive && styles.menuLabelActive]}>
                  {section.label}
                </Text>
                {section.subItems && (
                  <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
                )}
              </TouchableOpacity>

              {section.subItems && isExpanded && (
                <View style={styles.subMenu}>
                  {section.subItems.map((sub) => {
                    const isActive = activeKey === sub.key;
                    return (
                      <TouchableOpacity
                        key={sub.key}
                        style={[styles.subMenuItem, isActive && styles.subMenuItemActive]}
                        onPress={() => onNavigate(sub.key)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.subDot, isActive && styles.subDotActive]} />
                        <Text style={[styles.subMenuLabel, isActive && styles.subMenuLabelActive]}>
                          {sub.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onNavigate('logout')}
          activeOpacity={0.75}
        >
          <Text style={styles.menuIcon}>🚪</Text>
          <Text style={styles.menuLabel}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Profile footer */}
      <View style={styles.profileFooter}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{staffName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileTextWrap}>
          <Text style={styles.profileName} numberOfLines={1}>{staffName}</Text>
          <Text style={styles.profileRole} numberOfLines={1}>{staffRole}</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.quickLogout} accessibilityLabel="Log out">
          <Text style={styles.quickLogoutIcon}>⏻</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fixedWrap: {
    width: SIDEBAR_WIDTH,
    height: '100%',
  },
  overlayBackdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  overlayPanel: {
    width: SIDEBAR_WIDTH,
    height: '100%',
  },
  backdropTapArea: {
    flex: 1,
  },

  sidebar: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: colors.primary,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  logoImage: {
    width: 44,
    height: 44,
    marginBottom: spacing.sm,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoBadgeText: {
    fontSize: 8,
    fontFamily: fonts.bodySemiBold,
    color: 'rgba(255,255,255,0.6)',
  },
  brandName: {
    fontSize: 17,
    fontFamily: fonts.headingExtraBold,
    color: colors.white,
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    fontSize: 10,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 2,
  },

  // Menu
  menuScroll: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  menuItemActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  menuIcon: {
    fontSize: 16,
    width: 24,
  },
  menuLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.bodySemiBold,
    color: 'rgba(255,255,255,0.85)',
  },
  menuLabelActive: {
    color: colors.white,
  },
  chevron: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },

  // Sub-menu
  subMenu: {
    paddingBottom: spacing.xs,
  },
  subMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg + 24,
    paddingRight: spacing.lg,
  },
  subMenuItemActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  subDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginRight: spacing.sm,
  },
  subDotActive: {
    backgroundColor: colors.accent,
  },
  subMenuLabel: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.65)',
    flexShrink: 1,
  },
  subMenuLabelActive: {
    color: colors.white,
    fontFamily: fonts.bodySemiBold,
  },

  // Profile footer
  profileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.white,
    fontFamily: fonts.headingBold,
    fontSize: 14,
  },
  profileTextWrap: {
    flex: 1,
  },
  profileName: {
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
    color: colors.white,
  },
  profileRole: {
    fontSize: 10,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  quickLogout: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLogoutIcon: {
    fontSize: 14,
    color: colors.white,
  },
});