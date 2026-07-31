import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/**
 * ConfirmDialog — generic Yes/No confirmation modal.
 *
 * Introduced for the "are you sure you want to log out?" prompt, needed
 * consistently across the guest site, Front Desk portal, and Admin
 * portal — but written generically so it can be reused for any future
 * confirm-before-acting need, not just logout.
 *
 * Self-contained and theme-aware via useTheme(), regardless of whether
 * the screen rendering it has itself been migrated to the centralized
 * theme system — so it renders correctly in both light and dark mode
 * everywhere it's used, even from a still-static-colors screen like
 * ReservationsScreen.jsx or RoomManagementScreen.jsx.
 *
 * Props:
 *  - visible: boolean
 *  - title: string
 *  - message?: string
 *  - confirmLabel?: string   default 'Yes'
 *  - cancelLabel?: string    default 'No'
 *  - destructive?: boolean   styles the confirm button as danger-red —
 *                            used for logout, and any future
 *                            irreversible/session-ending action
 *  - onConfirm: () => void
 *  - onCancel: () => void
 */
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const { colors, spacing, radius, fonts } = useTheme();
  const styles = useMemo(() => getStyles(colors, spacing, radius, fonts), [colors, spacing, radius, fonts]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, destructive && styles.confirmBtnDestructive]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={[styles.confirmText, destructive && styles.confirmTextDestructive]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getStyles(colors, spacing, radius, fonts) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    card: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
    title: { fontFamily: fonts.headingExtraBold, fontSize: 17, color: colors.primary, textAlign: 'center' },
    message: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    cancelBtn: { flex: 1, paddingVertical: spacing.sm + 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textMuted },
    confirmBtn: { flex: 1, paddingVertical: spacing.sm + 4, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    confirmBtnDestructive: { backgroundColor: '#B3261E' },
    confirmText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.onPrimary },
    confirmTextDestructive: { color: '#FFFFFF' },
  });
}