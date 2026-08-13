import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Switch,
  Modal,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../../services/supabase';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

// Fixed category set — matches CATEGORY_ORDER used everywhere else
// this schema shows up (OrderFoodScreen.jsx, KitchenOrdersScreen.jsx,
// MenuAvailabilityScreen.jsx) — a chip picker rather than free text,
// since letting admin type an arbitrary category would silently break
// the category icon/ordering logic those other screens rely on.
const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Main', 'Beverages', 'Dessert', 'Snacks'];
const CATEGORY_ICON = {
  Breakfast: 'sunny-outline',
  Lunch: 'partly-sunny-outline',
  Dinner: 'moon-outline',
  Main: 'restaurant-outline',
  Snacks: 'fast-food-outline',
  Dessert: 'ice-cream-outline',
  Beverages: 'cafe-outline',
};

/**
 * AddFoodItemScreen — Admin creates/edits a food menu item, including a
 * real photo upload (food-menu-images Supabase Storage bucket — see
 * 010_food_service_menu_images_bucket.sql). Same real-upload pattern
 * AddRoomTypeScreen.jsx already established for room types (create the
 * record first so there's a real id to store the photo under, then
 * attach the resulting public URL), simplified for a single photo
 * instead of a gallery and a fixed category chip picker instead of a
 * free-text amenity list.
 *
 * Deliberately admin-only, matching food_menu_items_admin_all's own
 * comment in 001_food_service_phase1.sql — F&B can toggle availability
 * (MenuAvailabilityScreen.jsx) but creating/pricing dishes stays here.
 *
 * Props:
 *  - visible: boolean
 *  - onClose: () => void
 *  - editingItem: object | null — pass an existing food_menu_items row
 *    to open in edit mode, pre-filled. Omit or null for create mode.
 *  - onSaved: () => void — called after a successful create or update
 */
export default function AddFoodItemScreen({ visible, onClose, editingItem, onSaved }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isEditing = !!editingItem;

  const [step, setStep] = useState('form'); // 'form' | 'success'
  const [touched, setTouched] = useState({});

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Main');
  const [available, setAvailable] = useState(true);

  const [existingPhotoUrl, setExistingPhotoUrl] = useState(null);
  const [pickedPhoto, setPickedPhoto] = useState(null); // { uri, base64? }

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!visible) return;
    if (editingItem) {
      setName(editingItem.name || '');
      setDescription(editingItem.description || '');
      setPrice(editingItem.price != null ? String(editingItem.price) : '');
      setCategory(editingItem.category || 'Main');
      setAvailable(editingItem.available ?? true);
      setExistingPhotoUrl(editingItem.photo_url || null);
      setPickedPhoto(null);
      setErrors({});
      setTouched({});
    } else {
      resetForm();
    }
  }, [visible, editingItem]);

  const resetForm = () => {
    setName(''); setDescription(''); setPrice(''); setCategory('Main'); setAvailable(true);
    setExistingPhotoUrl(null); setPickedPhoto(null);
    setErrors({}); setTouched({});
  };

  const handleClose = () => {
    resetForm();
    setStep('form');
    onClose();
  };

  const pickPhoto = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: Platform.OS !== 'web', // native uploads need base64; see ProfileScreen.jsx for why fetch/blob is unreliable there
    });
    if (result.canceled || !result.assets?.length) return;
    setPickedPhoto(result.assets[0]);
    setExistingPhotoUrl(null); // the freshly picked photo replaces whatever was there
  };

  const computeErrors = () => {
    const e = {};
    if (!name.trim()) e.name = 'Dish name is required.';
    if (!price.trim()) e.price = 'Price is required.';
    else if (isNaN(Number(price)) || Number(price) <= 0) e.price = 'Enter a valid price.';
    return e;
  };

  const validate = () => {
    const e = computeErrors();
    setErrors(e);
    setTouched({ name: true, price: true });
    return Object.keys(e).length === 0;
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(computeErrors());
  };

  const fieldError = (field) => (touched[field] ? errors[field] : undefined);

  const uploadPhoto = async (itemId) => {
    try {
      let body;
      if (Platform.OS === 'web') {
        const response = await fetch(pickedPhoto.uri);
        body = await response.blob();
      } else {
        if (!pickedPhoto.base64) return null;
        body = decodeBase64(pickedPhoto.base64);
      }
      const path = `${itemId}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('food-menu-images')
        .upload(path, body, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('food-menu-images').getPublicUrl(path);
      return `${urlData.publicUrl}?t=${Date.now()}`;
    } catch (err) {
      console.error('Failed to upload menu item photo:', err);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const formData = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        category,
        available,
      };

      let targetId = editingItem?.id;
      let photoAttachFailed = false;

      if (isEditing) {
        const { error } = await supabase.from('food_menu_items').update(formData).eq('id', targetId);
        if (error) throw error;
      } else {
        // Created first (without a photo), so there's a real id to
        // store the uploaded photo under — same reasoning
        // AddRoomTypeScreen.jsx uses for room type photos.
        const { data, error } = await supabase.from('food_menu_items').insert(formData).select().single();
        if (error) throw error;
        targetId = data.id;
      }

      if (pickedPhoto) {
        const uploadedUrl = await uploadPhoto(targetId);
        if (uploadedUrl) {
          const { error: photoError } = await supabase
            .from('food_menu_items')
            .update({ photo_url: uploadedUrl })
            .eq('id', targetId);
          if (photoError) {
            console.error('Failed to attach uploaded photo to menu item:', photoError);
            photoAttachFailed = true;
          }
        } else {
          photoAttachFailed = true;
        }
      }

      setStep('success');
      setErrors(photoAttachFailed ? { photoAttachFailed: true } : {});
      onSaved && onSaved();
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} menu item:`, err);
      setErrors({ submit: `Could not ${isEditing ? 'update' : 'create'} this dish. Please try again.` });
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnother = () => {
    resetForm();
    setStep('form');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBackBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 'success' ? (isEditing ? 'Dish Updated' : 'Dish Added') : (isEditing ? 'Edit Dish' : 'Add New Dish')}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {step === 'form' ? (
          <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}>
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Dish Name <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={[styles.input, fieldError('name') && styles.inputError]}
                value={name}
                onChangeText={setName}
                onBlur={() => handleBlur('name')}
                placeholder="e.g. Chicken Adobo"
                placeholderTextColor={colors.disabled}
              />
              {!!fieldError('name') && <Text style={styles.fieldErrorText}>{fieldError('name')}</Text>}

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="A short description guests will see"
                placeholderTextColor={colors.disabled}
                multiline
              />

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Price (₱) <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={[styles.input, fieldError('price') && styles.inputError]}
                value={price}
                onChangeText={setPrice}
                onBlur={() => handleBlur('price')}
                placeholder="0.00"
                placeholderTextColor={colors.disabled}
                keyboardType="decimal-pad"
              />
              {!!fieldError('price') && <Text style={styles.fieldErrorText}>{fieldError('price')}</Text>}

              <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Category <Text style={styles.required}>*</Text></Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                      onPress={() => setCategory(cat)}
                    >
                      <Ionicons name={CATEGORY_ICON[cat]} size={14} color={active ? colors.white : colors.textMuted} />
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.switchRow, { marginTop: spacing.md }]}>
                <View>
                  <Text style={styles.switchLabel}>Available</Text>
                  <Text style={styles.switchSubLabel}>Off means guests won't see this dish at all until you switch it back on.</Text>
                </View>
                <Switch value={available} onValueChange={setAvailable} trackColor={{ false: colors.disabled, true: colors.primary }} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Photo</Text>
              <Text style={styles.photoHint}>Optional — dishes without a photo show a category icon instead.</Text>
              {(pickedPhoto || existingPhotoUrl) ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: pickedPhoto?.uri || existingPhotoUrl }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.photoRemoveBtn}
                    onPress={() => { setPickedPhoto(null); setExistingPhotoUrl(null); }}
                  >
                    <Ionicons name="close" size={14} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.photoAddBtn} onPress={pickPhoto}>
                  <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
                  <Text style={styles.photoAddBtnText}>Add Photo</Text>
                </TouchableOpacity>
              )}
              {(pickedPhoto || existingPhotoUrl) && (
                <TouchableOpacity style={styles.photoChangeBtn} onPress={pickPhoto}>
                  <Text style={styles.photoChangeBtnText}>Change Photo</Text>
                </TouchableOpacity>
              )}
            </View>

            {!!errors.submit && <Text style={styles.submitError}>{errors.submit}</Text>}
            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.submitBtnText}>{isEditing ? 'Save Changes' : 'Add Dish'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <View style={styles.successContent}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color="#1E7B34" />
            </View>
            <Text style={styles.successTitle}>{isEditing ? 'Dish updated!' : 'Dish added to the menu!'}</Text>
            <Text style={styles.successSubtitle}>
              {name} is now {available ? 'visible to guests' : 'saved but marked unavailable'} in Room Service.
            </Text>
            {!!errors.photoAttachFailed && (
              <View style={styles.attachWarning}>
                <Ionicons name="alert-circle-outline" size={16} color="#7A5C00" />
                <Text style={styles.attachWarningText}>The dish saved, but its photo didn't upload. You can add one from Edit.</Text>
              </View>
            )}
            <View style={styles.successActions}>
              <TouchableOpacity style={styles.successSecondaryBtn} onPress={handleClose}>
                <Text style={styles.successSecondaryBtnText}>Done</Text>
              </TouchableOpacity>
              {!isEditing && (
                <TouchableOpacity style={styles.successPrimaryBtn} onPress={handleAddAnother}>
                  <Text style={styles.successPrimaryBtnText}>Add Another</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = {
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBackBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },

  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  scrollContentDesktop: { maxWidth: 640, width: '100%', alignSelf: 'center', paddingTop: spacing.xl },

  section: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.md,
  },

  fieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, marginBottom: spacing.xs },
  required: { color: '#B3261E' },
  fieldErrorText: { fontSize: 11, fontFamily: fonts.body, color: '#B3261E', marginTop: 3 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    fontSize: 13, fontFamily: fonts.body, color: colors.text, backgroundColor: colors.cardAlt,
  },
  inputError: { borderColor: '#B3261E' },
  textArea: { minHeight: 64, textAlignVertical: 'top' },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: spacing.md, backgroundColor: colors.cardAlt,
  },
  categoryChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  categoryChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  switchLabel: { fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.text },
  switchSubLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, maxWidth: 260 },

  photoHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },
  photoPreviewWrap: { width: 140, height: 140, borderRadius: radius.md, overflow: 'hidden', position: 'relative' },
  photoPreview: { width: '100%', height: '100%' },
  photoRemoveBtn: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  photoAddBtn: {
    width: 140, height: 140, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddBtnText: { fontSize: 11, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  photoChangeBtn: { marginTop: spacing.sm },
  photoChangeBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },

  submitError: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', textAlign: 'center', marginBottom: spacing.sm },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.white },

  successContent: { flex: 1, padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  successIconWrap: { marginBottom: spacing.md },
  successTitle: { fontSize: 20, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.xs, textAlign: 'center' },
  successSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg, maxWidth: 340 },
  attachWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    backgroundColor: '#FFF4D6', borderRadius: radius.md, padding: spacing.md,
    maxWidth: 360, marginBottom: spacing.lg,
  },
  attachWarningText: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: '#7A5C00', lineHeight: 17 },

  successActions: { flexDirection: 'row', gap: spacing.sm, width: '100%', maxWidth: 360 },
  successSecondaryBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center' },
  successSecondaryBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  successPrimaryBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center' },
  successPrimaryBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
};