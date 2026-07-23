import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { subscribeToRoomTypes, deleteRoomType, formatCurrency } from '../../utils/Roomsservice';
import AddRoomTypeScreen from './AddRoomTypeScreen';

/**
 * RoomTypesRatesScreen — SRS Module 6, Transaction 6.1: Manage Room Types
 * & Rates.
 *
 * Main Success Scenario coverage:
 *  1-2. Admin navigates here / adds new or selects existing room type  → list + "Add Room Type" button
 *  3.   Admin sets/updates name, capacity, amenities, rate             → AddRoomTypeScreen.jsx
 *  4.   System saves changes, updates guest-facing availability        → createRoomType/updateRoomType,
 *                                                                          which RoomSelectionScreen (guest)
 *                                                                          and RoomTypesSection (front desk)
 *                                                                          both read live via realtime —
 *                                                                          no separate publish step.
 *  Extension: deletion is blocked while rooms reference the type       → deleteRoomType() guard
 *
 * ENHANCED (this pass):
 *  - Edit now opens the SAME AddRoomTypeScreen.jsx used for creation,
 *    pre-filled via its editingRoomType prop, instead of the old compact
 *    RoomTypeFormModal that used to live in this file — one form to
 *    maintain instead of two, and editing gets the same real image
 *    upload / amenity checklist / live validation the create flow has.
 *    The old compact modal (RoomTypeFormModal, toFormState, FormField,
 *    and their styles) has been removed entirely as dead code.
 *  - Delete now shows a themed confirmation modal instead of
 *    Alert.alert() — consistent with the dialog pattern used in front
 *    desk ReservationsScreen.jsx (a plain browser/OS alert for a
 *    destructive action stood out against the rest of the app).
 *  - Both edit-save and delete show a success toast.
 *  - Audit logging for create/update/delete happens automatically now —
 *    centralized in Roomsservice.js itself (see room_type_audit_log),
 *    not something this screen needs to trigger manually.
 */
export default function RoomTypesRatesScreen() {
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [toast, setToast] = useState(null);

  const [addScreenVisible, setAddScreenVisible] = useState(false);
  const [editingType, setEditingType] = useState(null); // non-null -> AddRoomTypeScreen opens in edit mode

  // Drives the themed delete-confirmation modal, replacing Alert.alert().
  const [deleteTarget, setDeleteTarget] = useState(null); // the room type pending deletion, or null
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToRoomTypes(
      (data) => {
        setRoomTypes(data);
        setLoading(false);
      },
      (err) => {
        setError('Could not load room types. Please try again.');
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const showToast = (message) => {
    setToast({ message });
    setTimeout(() => setToast(null), 3000);
  };

  const openAddForm = () => {
    setEditingType(null);
    setAddScreenVisible(true);
  };

  const openEditForm = (roomType) => {
    setEditingType(roomType);
    setAddScreenVisible(true);
  };

  const closeAddScreen = () => {
    setAddScreenVisible(false);
    setEditingType(null);
  };

  const handleCreated = () => {
    showToast('Room type created successfully.');
  };

  const handleUpdated = () => {
    showToast('Room type updated successfully.');
  };

  const requestDelete = (roomType) => {
    setDeleteError('');
    setDeleteTarget(roomType);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const roomType = deleteTarget;
    setDeletingId(roomType.id);
    setDeleteError('');
    try {
      await deleteRoomType(roomType.id);
      setDeleteTarget(null);
      showToast(`"${roomType.name}" was deleted.`);
    } catch (err) {
      setDeleteError(
        err.code === 'room-type/has-assigned-rooms'
          ? 'This room type cannot be deleted while rooms are assigned to it.'
          : err.message || 'Something went wrong while deleting this room type.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Room Types & Rates</Text>
            <Text style={styles.pageSubtitle}>
              Add, edit, or remove room categories. Changes apply instantly across the guest booking flow and Front Desk views.
            </Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={openAddForm} activeOpacity={0.85}>
            <Text style={styles.addButtonText}>+ Add Room Type</Text>
          </TouchableOpacity>
        </View>

        {!!error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {roomTypes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🛏️</Text>
            <Text style={styles.emptyTitle}>No room types yet</Text>
            <Text style={styles.emptySubtitle}>Add your first room type to start accepting bookings.</Text>
          </View>
        ) : (
          roomTypes.map((rt) => {
            const thumb = rt.images && rt.images.length > 0 ? rt.images[0] : null;
            return (
              <View key={rt.id} style={styles.card}>
                <View style={styles.cardTopRow}>
                  {thumb ? (
                    <Image source={{ uri: thumb.uri }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Text style={styles.thumbFallbackIcon}>🛏️</Text>
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle}>{rt.name}</Text>
                      {rt.isBookable === false && (
                        <View style={styles.draftBadge}>
                          <Text style={styles.draftBadgeText}>Draft</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {rt.bed} · {rt.occupancy} · {rt.size}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={styles.price}>{formatCurrency(rt.price)}</Text>
                      <Text style={styles.perNight}> / night </Text>
                      {rt.originalPrice ? (
                        <Text style={styles.strikePrice}>{formatCurrency(rt.originalPrice)}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.idTag}>ID: {rt.id} · {rt.floor}</Text>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => openEditForm(rt)} activeOpacity={0.75}>
                      <Ionicons name="pencil-outline" size={13} color={colors.text} />
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => requestDelete(rt)}
                      activeOpacity={0.75}
                      disabled={deletingId === rt.id}
                    >
                      {deletingId === rt.id ? (
                        <ActivityIndicator size="small" color={colors.danger} />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={13} color={colors.danger} />
                          <Text style={styles.deleteBtnText}>Delete</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                {rt.description ? <Text style={styles.description}>{rt.description}</Text> : null}
                {rt.inclusions && rt.inclusions.length > 0 && (
                  <View style={styles.inclusionsWrap}>
                    {rt.inclusions.map((inc, i) => (
                      <View key={i} style={styles.inclusionChip}>
                        <Text style={styles.inclusionChipText}>{inc}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <AddRoomTypeScreen
        visible={addScreenVisible}
        editingRoomType={editingType}
        onClose={closeAddScreen}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
      />

      {/* ── Themed delete confirmation, replacing Alert.alert() ────── */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconWrap}>
              <Ionicons name="trash-outline" size={26} color="#B3261E" />
            </View>
            <Text style={styles.dialogTitle}>Delete Room Type</Text>
            <Text style={styles.dialogMessage}>
              Are you sure you want to delete "{deleteTarget?.name}"? This cannot be undone.
            </Text>
            {!!deleteError && <Text style={styles.dialogError}>{deleteError}</Text>}
            <View style={styles.dialogActions}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setDeleteTarget(null)}
                disabled={deletingId === deleteTarget?.id}
                activeOpacity={0.85}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogDeleteBtn}
                onPress={confirmDelete}
                disabled={deletingId === deleteTarget?.id}
                activeOpacity={0.85}
              >
                {deletingId === deleteTarget?.id
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.dialogDeleteText}>Delete</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {toast && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={16} color={colors.white} />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xl, gap: spacing.md, flexWrap: 'wrap' },
  pageTitle: { fontSize: 22, fontFamily: fonts.headingExtraBold, color: colors.primary },
  pageSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4, maxWidth: 460 },
  addButton: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
  addButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.white },

  errorBanner: { backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.lg },
  errorBannerText: { fontFamily: fonts.body, fontSize: 13, color: colors.danger },

  emptyCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xxl, alignItems: 'center' },
  emptyIcon: { fontSize: 36, marginBottom: spacing.sm },
  emptyTitle: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.text, marginBottom: 4 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTopRow: { flexDirection: 'row', gap: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  thumbFallback: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  thumbFallbackIcon: { fontSize: 24 },
  cardInfo: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTitle: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.text },
  draftBadge: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm },
  draftBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.textMuted },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
  price: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.primary },
  perNight: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  strikePrice: { fontFamily: fonts.body, fontSize: 12, color: colors.priceStrike, textDecorationLine: 'line-through' },
  idTag: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted, marginTop: spacing.xs },
  cardActions: { justifyContent: 'flex-start', gap: spacing.xs },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.md },
  editBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: colors.danger, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.md },
  deleteBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.danger },
  description: { fontFamily: fonts.body, fontSize: 13, color: colors.text, marginTop: spacing.md },
  inclusionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  inclusionChip: { backgroundColor: colors.cardAlt, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: spacing.sm },
  inclusionChipText: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },

  /* Themed delete confirmation dialog */
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialogCard: { width: '100%', maxWidth: 400, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  dialogIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FBE7E7', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  dialogTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  dialogMessage: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: spacing.md },
  dialogError: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', textAlign: 'center', marginBottom: spacing.md },
  dialogActions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  dialogCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  dialogCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  dialogDeleteBtn: { flex: 1, backgroundColor: '#B3261E', borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  dialogDeleteText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

  /* Success toast */
  toast: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#1E7B34',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: { color: colors.white, fontSize: 13, fontFamily: fonts.bodySemiBold },
});