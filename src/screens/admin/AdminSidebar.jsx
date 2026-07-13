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
const LOGO_SOURCE = null; // ← swap to require('../../../assets/logo.png')
// ─────────────────────────────────────────────────────────────────────────

// Admin Portal menu — covers SRS Module 6 (Admin Management):
// Transaction 6.1 Manage Room Types & Rates, 6.2 Generate Occupancy &
// Revenue Reports. This is the module FrontDeskSidebar.jsx's comment
// pointed to ("they'll live in screens/admin/AdminSidebar.jsx when that
// module is built").
const MENU_SECTIONS = [
  {
    key: 'dashboard',
    icon: '📊',
    label: 'Dashboard',
  },
  {
    key: 'rooms',
    icon: '🛏',
    label: 'Room Management',
    subItems: [
      { key: 'rooms:types', label: 'Room Types & Rates' },
    ],
  },
  {
    key: 'reports',
    icon: '📈',
    label: 'Reports & Analytics',
    subItems: [
      { key: 'reports:occupancy', label: 'Occupancy Report' },
      { key: 'reports:revenue', label: 'Revenue Report' },
    ],
  },
];

/**
 * AdminSidebar — left navigation for the Admin Portal (superadmin role).
 * Structurally identical to FrontDeskSidebar.jsx by design — same
 * responsive behavior, same collapse/overlay pattern — just a different
 * (smaller, admin-scoped) menu tree and brand subtitle.
 *
 * Props:
 *  - activeKey: string             currently active menu/sub-item key
 *  - onNavigate: (key) => void     called when a leaf item is tapped
 *  - onLogout: () => void
 *  - adminName?: string
 *  - collapsed: boolean            (mobile only) whether the overlay is open
 *  - onClose: () => void           (mobile only) close the overlay
 */
export default function AdminSidebar({
  activeKey,
  onNavigate,
  onLogout,
  adminName = 'Admin',
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
      adminName={adminName}
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

function SidebarContent({ activeKey, onNavigate, onLogout, adminName }) {
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
        <Text style={styles.brandSubtitle}>Admin Portal</Text>
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
          <Text style={styles.avatarText}>{adminName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileTextWrap}>
          <Text style={styles.profileName} numberOfLines={1}>{adminName}</Text>
          <Text style={styles.profileRole} numberOfLines={1}>Administrator</Text>
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