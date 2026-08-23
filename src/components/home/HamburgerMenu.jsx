import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fonts } from '../../utils/theme';
import ConfirmDialog from '../shared/ConfirmDialog';

const logo = require('../../../assets/logo.png');

/**
 * HamburgerMenu — full-screen slide-up menu for narrow/mobile screens.
 *
 * Props:
 *  - visible:         boolean
 *  - onClose:         () => void
 *  - onProfilePress:  () => void  — navigate to ProfileScreen
 *  - onAboutPress:    () => void  — navigate to AboutScreen
 *  - onContactPress:  () => void  — navigate to ContactUsScreen
 *  - onFindBooking:   () => void  — navigate to BookingLookupScreen
 *  - onOrderFood:     () => void  — navigate to OrderFoodScreen (only shown when authenticated)
 *  - onLogout:        () => void  — sign out (only shown when authenticated)
 *  - isAuthenticated: boolean     — show Profile/Order Food/Sign Out items only when logged in
 */
export default function HamburgerMenu({
  visible,
  onClose,
  onProfilePress,
  onAboutPress,
  onContactPress,
  onFindBooking,
  onOrderFood,
  onReportIssue,
  onLogout,
  isAuthenticated,
}) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const menuItems = [
    {
      label: 'About',
      icon: 'information-circle-outline',
      onPress: () => {
        onClose();
        onAboutPress && onAboutPress();
      },
    },
    { label: 'Promos',     icon: 'pricetag-outline', onPress: onClose },
    {
      label: 'Contact Us',
      icon: 'call-outline',
      onPress: () => {
        onClose();
        onContactPress && onContactPress();
      },
    },
    {
      label: 'My Reservations',
      icon: 'calendar-outline',
      onPress: () => {
        onClose();
        onFindBooking && onFindBooking();
      },
    },
    ...(isAuthenticated
      ? [
          {
            label: 'Order Food',
            icon: 'restaurant-outline',
            onPress: () => {
              onClose();
              onOrderFood && onOrderFood();
            },
          },
          {
            label: 'Report an Issue',
            icon: 'build-outline',
            onPress: () => {
              onClose();
              onReportIssue && onReportIssue();
            },
          },
          {
            label: 'Profile',
            icon: 'person-circle-outline',
            onPress: () => {
              onClose();
              onProfilePress && onProfilePress();
            },
          },
        ]
      : []
    ),
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBadge}>
              <Image source={logo} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.title}>InnVision</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Close menu">
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Menu Items */}
        <View style={styles.menuList}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.75}
            >
              <View style={styles.menuItemLeft}>
                <Ionicons
                  name={item.icon}
                  size={22}
                  color="rgba(255,255,255,0.85)"
                />
                <Text style={styles.menuItemText}>
                  {item.label}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color="rgba(255,255,255,0.4)"
              />
            </TouchableOpacity>
          ))}
        </View>

        {isAuthenticated && (
          <TouchableOpacity
            style={styles.signOutItem}
            onPress={() => setConfirmingLogout(true)}
            activeOpacity={0.75}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out-outline" size={20} color="#FF8A80" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.placeholderNote}>
          These sections are placeholders for the student prototype.
        </Text>
      </SafeAreaView>

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
          onClose();
          onLogout && onLogout();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.heroBackground,
    paddingHorizontal: spacing.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.lg,
    marginBottom: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 22,
    height: 22,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingExtraBold,
    color: colors.white,
    letterSpacing: 0.3,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // Menu items
  menuList: {
    gap: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: fonts.headingSemiBold,
    color: colors.white,
  },

  // Sign out — visually separated from the main list, tinted to signal
  // it ends the session rather than navigating somewhere.
  signOutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  signOutText: {
    fontSize: 16,
    fontFamily: fonts.headingSemiBold,
    color: '#FF8A80',
  },

  // Footer note
  placeholderNote: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.5)',
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});