import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/theme';

/**
 * DashboardNavbar — shared top bar for both FrontDeskShell.jsx and
 * AdminShell.jsx. Replaces the two nearly-identical inline
 * `mobileTopBar` blocks that used to live separately in each shell.
 *
 * Shows the hamburger menu button only when !isWide (same condition
 * each shell already used), the shell's title, and — new — a mail icon
 * in the top-right corner with a live badge count of unread
 * ('new'-status) Inquiries, from contact_messages. Tapping it navigates
 * straight to the Inquiries screen via onInquiriesPress, so staff don't
 * have to dig through the sidebar to notice a new one came in.
 *
 * The unread count is fetched and subscribed to right here (self-
 * contained, same pattern as the other screens' realtime subscriptions)
 * rather than threaded through shell state, since nothing else in
 * either shell needs it.
 *
 * Props:
 *  - title: string — e.g. "InnVision Front Desk" / "InnVision Admin"
 *  - isWide: boolean — whether to show the hamburger button
 *  - onMenuPress: () => void — opens the mobile sidebar
 *  - onInquiriesPress: () => void — navigates to the Inquiries screen
 */
export default function DashboardNavbar({ title, isWide, onMenuPress, onInquiriesPress }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadCount = async () => {
      const { count, error } = await supabase
        .from('contact_messages')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new');
      if (error) {
        console.error('Failed to load inquiries count:', error);
        return;
      }
      setUnreadCount(count ?? 0);
    };
    loadCount();

    const channel = supabase
      .channel('navbar-inquiries-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, loadCount)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        {!isWide && (
          <TouchableOpacity
            onPress={onMenuPress}
            style={styles.menuButton}
            accessibilityLabel="Open menu"
          >
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </TouchableOpacity>
        )}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <TouchableOpacity
        style={styles.inquiriesButton}
        onPress={onInquiriesPress}
        accessibilityLabel="View inquiries"
        activeOpacity={0.7}
      >
        <Ionicons name="mail-outline" size={20} color={colors.primary} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },

  menuButton: { width: 24, height: 18, justifyContent: 'space-between' },
  menuLine: { height: 2, backgroundColor: colors.primary, borderRadius: 1 },

  title: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.primary, flexShrink: 1 },

  inquiriesButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: colors.white },
});