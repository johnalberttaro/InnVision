import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { launchImageLibraryAsync, MediaTypeOptions } from 'expo-image-picker';
import {
  subscribeToRoomTypes,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  formatCurrency,
} from '../../utils/Roomsservice';

/**
 * RoomTypesRatesScreen — SRS Module 6, Transaction 6.1: Manage Room Types
 * & Rates.
 *
 * Main Success Scenario coverage:
 *  1-2. Admin navigates here / adds new or selects existing room type  → list + "Add Room Type" button
 *  3.   Admin sets/updates name, capacity, amenities, rate             → RoomTypeFormModal
 *  4.   System saves changes, updates guest-facing availability        → createRoomType/updateRoomType,
 *                                                                          which RoomSelectionScreen (guest)
 *                                                                          and RoomTypesSection (front desk)
 *                                                                          both read live via onSnapshot —
 *                                                                          no separate publish step.
 *  Extension: deletion is blocked while rooms reference the type       → deleteRoomType() guard
 */
export default function RoomTypesRatesScreen() {
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingType, setEditingType] = useState(null); // null = "add new"
  const [deletingId, setDeletingId] = useState(null);

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

  const openAddForm = () => {
    setEditingType(null);
    setFormVisible(true);
  };

  const openEditForm = (roomType) => {
    setEditingType(roomType);
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingType(null);
  };

  const handleSave = async (formData) => {
    if (editingType) {
      await updateRoomType(editingType.id, formData);
    } else {
      await createRoomType(formData);
    }
    closeForm();
  };

  const handleDelete = (roomType) => {
    Alert.alert(
      'Delete Room Type',
      `Are you sure you want to delete "${roomType.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(roomType.id);
            try {
              await deleteRoomType(roomType.id);
            } catch (err) {
              Alert.alert(
                err.code === 'room-type/has-assigned-rooms' ? 'Cannot Delete' : 'Error',
                err.message || 'Something went wrong while deleting this room type.'
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
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
                    <Text style={styles.cardTitle}>{rt.name}</Text>
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
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(rt)}
                      activeOpacity={0.75}
                      disabled={deletingId === rt.id}
                    >
                      {deletingId === rt.id ? (
                        <ActivityIndicator size="small" color={colors.danger} />
                      ) : (
                        <Text style={styles.deleteBtnText}>Delete</Text>
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

      <RoomTypeFormModal
        visible={formVisible}
        initialData={editingType}
        onClose={closeForm}
        onSave={handleSave}
      />
    </View>
  );
}

/* ── Add/Edit form modal ─────────────────────────────────────────────── */

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  originalPrice: '',
  size: '',
  bed: '',
  occupancy: '',
  floor: '',
  inclusionsText: '',
  images: [],
};

function toFormState(roomType) {
  if (!roomType) return { ...EMPTY_FORM };
  return {
    name: roomType.name || '',
    description: roomType.description || '',
    price: roomType.price != null ? String(roomType.price) : '',
    originalPrice: roomType.originalPrice != null ? String(roomType.originalPrice) : '',
    size: roomType.size || '',
    bed: roomType.bed || '',
    occupancy: roomType.occupancy || '',
    floor: roomType.floor || '',
    inclusionsText: (roomType.inclusions || []).join(', '),
    images: Array.isArray(roomType.images) ? roomType.images.map((img) => ({ uri: img.uri, label: img.label || '' })) : [],
  };
}

function RoomTypeFormModal({ visible, initialData, onClose, onSave }) {
  const [form, setForm] = useState(() => toFormState(initialData));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Re-sync form state whenever a different room type is opened for
  // editing, or when switching from edit → add.
  useEffect(() => {
    if (visible) {
      setForm(toFormState(initialData));
      setErrors({});
    }
  }, [visible, initialData]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }));
  };

  // Pick one or more photos from the device library and append them as
  // { uri } entries. expo-image-picker returns a local file:// URI — these
  // are stored as-is on the room type doc (no Firebase Storage upload is
  // wired up yet), so they persist as long as the doc is unchanged.
  const pickImages = async () => {
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: 8,
      });
      if (result.canceled || !result.assets) return;
      const picked = result.assets.map((asset) => ({ uri: asset.uri, label: '' }));
      setForm((prev) => ({ ...prev, images: [...prev.images, ...picked].slice(0, 8) }));
    } catch (err) {
      console.error('Image picker failed:', err);
    }
  };

  const removeImage = (index) => {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Room type name is required.';
    if (!form.occupancy.trim()) next.occupancy = 'Capacity is required (e.g. "2 Adults").';
    const priceNum = Number(form.price);
    if (!form.price.trim() || Number.isNaN(priceNum) || priceNum <= 0) {
      next.price = 'Enter a valid rate greater than 0.';
    }
    if (form.originalPrice.trim()) {
      const originalNum = Number(form.originalPrice);
      if (Number.isNaN(originalNum) || originalNum < 0) {
        next.originalPrice = 'Enter a valid amount.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const inclusions = form.inclusionsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        originalPrice: form.originalPrice.trim() ? Number(form.originalPrice) : null,
        size: form.size.trim(),
        bed: form.bed.trim(),
        occupancy: form.occupancy.trim(),
        floor: form.floor.trim(),
        inclusions,
        images: form.images,
      });
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save this room type. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!initialData;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <ScrollView contentContainerStyle={styles.modalScrollWrap} keyboardShouldPersistTaps="handled">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Room Type' : 'Add Room Type'}</Text>

            <FormField label="Room Name *" value={form.name} onChangeText={(v) => setField('name', v)} error={errors.name} placeholder="e.g. Deluxe Twin" />
            <FormField label="Description" value={form.description} onChangeText={(v) => setField('description', v)} placeholder="Short description shown to guests" multiline />

            <View style={styles.row}>
              <FormField style={styles.rowItem} label="Rate / night (₱) *" value={form.price} onChangeText={(v) => setField('price', v)} error={errors.price} placeholder="e.g. 1700" keyboardType="numeric" />
              <FormField style={styles.rowItem} label="Original Price (₱)" value={form.originalPrice} onChangeText={(v) => setField('originalPrice', v)} error={errors.originalPrice} placeholder="Optional strike-through price" keyboardType="numeric" />
            </View>

            <View style={styles.row}>
              <FormField style={styles.rowItem} label="Capacity *" value={form.occupancy} onChangeText={(v) => setField('occupancy', v)} error={errors.occupancy} placeholder="e.g. 2 Adults" />
              <FormField style={styles.rowItem} label="Bed Setup" value={form.bed} onChangeText={(v) => setField('bed', v)} placeholder="e.g. 2 Single Beds" />
            </View>

            <View style={styles.row}>
              <FormField style={styles.rowItem} label="Room Size" value={form.size} onChangeText={(v) => setField('size', v)} placeholder="e.g. 28 sqm" />
              <FormField style={styles.rowItem} label="Floor" value={form.floor} onChangeText={(v) => setField('floor', v)} placeholder="e.g. Ground Floor" />
            </View>

            <FormField label="Amenities (comma-separated)" value={form.inclusionsText} onChangeText={(v) => setField('inclusionsText', v)} placeholder="Free Wi-Fi, Air conditioning, Flat-screen TV" multiline />

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Room Images</Text>
              <View style={styles.imageGrid}>
                {form.images.map((img, i) => (
                  <View key={i} style={styles.imageTile}>
                    <Image source={{ uri: img.uri }} style={styles.imageThumb} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.imageRemove}
                      onPress={() => removeImage(i)}
                      accessibilityLabel="Remove image"
                      activeOpacity={0.75}
                    >
                      <Text style={styles.imageRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {form.images.length < 8 && (
                  <TouchableOpacity
                    style={styles.imageAddTile}
                    onPress={pickImages}
                    accessibilityLabel="Add room image"
                    activeOpacity={0.8}
                  >
                    <Text style={styles.imageAddIcon}>+</Text>
                    <Text style={styles.imageAddText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.imageHint}>Up to 8 photos. Picked from your device gallery.</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.75} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.buttonDisabled]} onPress={handleSubmit} activeOpacity={0.85} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function FormField({ label, value, onChangeText, error, placeholder, multiline, keyboardType, style }) {
  return (
    <View style={[styles.fieldGroup, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.disabled}
        multiline={multiline}
        keyboardType={keyboardType}
      />
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
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
  addButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg },
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
  cardTitle: { fontFamily: fonts.headingBold, fontSize: 16, color: colors.text },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
  price: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.primary },
  perNight: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  strikePrice: { fontFamily: fonts.body, fontSize: 12, color: colors.priceStrike, textDecorationLine: 'line-through' },
  idTag: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted, marginTop: spacing.xs },
  cardActions: { justifyContent: 'flex-start', gap: spacing.xs },
  editBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: spacing.md },
  editBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text },
  deleteBtn: { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: spacing.md, alignItems: 'center' },
  deleteBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.danger },
  description: { fontFamily: fonts.body, fontSize: 13, color: colors.text, marginTop: spacing.md },
  inclusionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  inclusionChip: { backgroundColor: colors.cardAlt, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: spacing.sm },
  inclusionChipText: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },

  /* Modal */
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  modalScrollWrap: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  modalTitle: { fontFamily: fonts.headingExtraBold, fontSize: 18, color: colors.primary, marginBottom: spacing.lg },

  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },

  fieldGroup: { marginBottom: spacing.md },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, marginBottom: spacing.xs },
  input: { height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, paddingHorizontal: spacing.md, fontFamily: fonts.body, fontSize: 13, color: colors.text, outlineStyle: 'none' },
  inputMultiline: { height: 66, paddingVertical: spacing.sm, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  fieldError: { fontFamily: fonts.body, fontSize: 11, color: colors.danger, marginTop: 4 },

  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  cancelBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.lg, minWidth: 130, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: colors.white },
  buttonDisabled: { opacity: 0.7 },

  /* Images */
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  imageTile: { width: 76, height: 76, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  imageThumb: { width: '100%', height: '100%' },
  imageRemove: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveText: { color: colors.white, fontSize: 11, fontFamily: fonts.bodySemiBold },
  imageAddTile: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAddIcon: { fontSize: 22, color: colors.textMuted, fontFamily: fonts.headingBold },
  imageAddText: { fontSize: 9, color: colors.textMuted, fontFamily: fonts.bodySemiBold, marginTop: 2 },
  imageHint: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
});