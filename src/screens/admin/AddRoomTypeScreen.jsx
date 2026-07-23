import React, { useState, useEffect } from 'react';
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
import { colors, spacing, radius, fonts } from '../../utils/theme';
import { createRoomType, updateRoomType, formatCurrency } from '../../utils/Roomsservice';

const COMMON_AMENITIES = [
  'Free Wi-Fi',
  'Air conditioning',
  'Flat-screen TV',
  'Private bathroom',
  'Daily housekeeping',
  'Mini refrigerator',
  'City view window',
  'Work desk',
  'Room service',
  'Non-smoking',
];

const AMENITY_ICONS = {
  'Free Wi-Fi': 'wifi-outline',
  'Air conditioning': 'snow-outline',
  'Flat-screen TV': 'tv-outline',
  'Private bathroom': 'water-outline',
  'Daily housekeeping': 'sparkles-outline',
  'Mini refrigerator': 'cube-outline',
  'City view window': 'business-outline',
  'Work desk': 'desktop-outline',
  'Room service': 'restaurant-outline',
  'Non-smoking': 'ban-outline',
};

/**
 * AddRoomTypeScreen — full-screen room type creation AND editing flow.
 * Originally create-only, with a separate compact RoomTypeFormModal
 * handling edits — that split was later removed (RoomTypeRatesScreen.jsx
 * now opens THIS screen for both, passing editingRoomType to pre-fill
 * every field when editing) so there's one form to maintain, and editing
 * gets the same real image upload / amenity checklist / live validation
 * the create flow already had.
 *
 * FIXES A KNOWN GAP: room type images have only ever been local device
 * URIs since the original Firestore-era app — a photo picked on one
 * device was never visible anywhere else, including the guest-facing
 * booking flow, since nothing was ever actually uploaded anywhere. This
 * screen uploads to a real Supabase Storage bucket (room-type-images)
 * instead.
 *
 * Flow: the room type is created FIRST (without images), so it has a
 * real id to organize uploaded photos under (room-type-images/{id}/...),
 * then updateRoomType() attaches the resulting public URLs afterward —
 * avoids orphaned temp-path uploads if creation itself ever failed.
 *
 * "Confirm availability" is a real is_bookable toggle (new column, not
 * just a UI label) — lets admin stage a room type as a draft before it's
 * visible to guests, then flip it live later from here or the edit modal.
 *
 * On success, shows a preview card of the new room type (same visual
 * shape a guest would see it in) plus "Add Another" / "Done".
 *
 * Props:
 *  - visible: boolean
 *  - onClose: () => void
 *  - editingRoomType: object | null   pass an existing room type (as
 *    returned by subscribeToRoomTypes/roomTypeToCamel) to open in edit
 *    mode, pre-filled. Omit or pass null for create mode.
 *  - onCreated: () => void   called after a successful create, so the
 *    parent list can refresh (though it's already realtime-subscribed,
 *    this is a cheap safety net)
 *  - onUpdated: () => void   same, called after a successful edit save
 */
export default function AddRoomTypeScreen({ visible, onClose, onCreated, onUpdated, editingRoomType }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isEditing = !!editingRoomType;

  const [step, setStep] = useState('form'); // 'form' | 'success'
  const [createdRoomType, setCreatedRoomType] = useState(null);
  const [touched, setTouched] = useState({}); // drives live/inline validation as fields are blurred

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('');
  const [bed, setBed] = useState('');
  const [occupancy, setOccupancy] = useState('');
  const [floor, setFloor] = useState('');

  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [includeBreakfastOption, setIncludeBreakfastOption] = useState(false);
  const [bbPrice, setBbPrice] = useState('');
  const [bbOriginalPrice, setBbOriginalPrice] = useState('');

  // Fine-print lines shown under the rate on the guest booking screen
  // (RateCard.jsx). Defaulted to the same wording the original seed room
  // types used, so admin doesn't have to retype boilerplate — still
  // editable per room type if the terms genuinely differ.
  const [note, setNote] = useState('Book now, pay at hotel');
  const [taxNote, setTaxNote] = useState('Excludes taxes and charges');

  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [customAmenity, setCustomAmenity] = useState('');

  // Already-uploaded images (edit mode only) vs freshly picked local
  // assets that still need uploading — kept separate because only the
  // latter need to go through uploadPickedImages() on submit.
  const [existingImages, setExistingImages] = useState([]);
  const [pickedImages, setPickedImages] = useState([]); // [{ uri, label }]
  const [isBookable, setIsBookable] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Pre-fills every field from the room type being edited whenever the
  // screen opens in edit mode. Runs off `visible` (not just
  // editingRoomType) so re-opening to edit the SAME room type twice in a
  // row still re-syncs fresh values each time, in case it changed
  // elsewhere between edits.
  useEffect(() => {
    if (!visible) return;
    if (editingRoomType) {
      setName(editingRoomType.name || '');
      setDescription(editingRoomType.description || '');
      setSize(editingRoomType.size || '');
      setBed(editingRoomType.bed || '');
      setOccupancy(editingRoomType.occupancy || '');
      setFloor(editingRoomType.floor || '');
      setPrice(editingRoomType.price != null ? String(editingRoomType.price) : '');
      setOriginalPrice(editingRoomType.originalPrice != null ? String(editingRoomType.originalPrice) : '');
      const hasBreakfast = editingRoomType.bbPrice != null;
      setIncludeBreakfastOption(hasBreakfast);
      setBbPrice(hasBreakfast ? String(editingRoomType.bbPrice) : '');
      setBbOriginalPrice(editingRoomType.bbOriginalPrice != null ? String(editingRoomType.bbOriginalPrice) : '');
      setNote(editingRoomType.note || 'Book now, pay at hotel');
      setTaxNote(editingRoomType.taxNote || 'Excludes taxes and charges');
      setSelectedAmenities(editingRoomType.inclusions || []);
      setExistingImages(editingRoomType.images || []);
      setPickedImages([]);
      setIsBookable(editingRoomType.isBookable ?? true);
      setErrors({});
      setTouched({});
    } else {
      resetForm();
    }
  }, [visible, editingRoomType]);

  const resetForm = () => {
    setName(''); setDescription(''); setSize(''); setBed(''); setOccupancy(''); setFloor('');
    setPrice(''); setOriginalPrice(''); setIncludeBreakfastOption(false); setBbPrice(''); setBbOriginalPrice('');
    setNote('Book now, pay at hotel'); setTaxNote('Excludes taxes and charges');
    setSelectedAmenities([]); setCustomAmenity('');
    setExistingImages([]); setPickedImages([]); setIsBookable(true);
    setErrors({}); setTouched({}); setCreatedRoomType(null);
  };

  const handleClose = () => {
    resetForm();
    setStep('form');
    onClose();
  };

  const toggleAmenity = (item) => {
    setSelectedAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  const addCustomAmenity = () => {
    const trimmed = customAmenity.trim();
    if (!trimmed || selectedAmenities.includes(trimmed)) return;
    setSelectedAmenities((prev) => [...prev, trimmed]);
    setCustomAmenity('');
  };

  const removeAmenity = (item) => {
    setSelectedAmenities((prev) => prev.filter((a) => a !== item));
  };

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: Platform.OS !== 'web', // native uploads need base64; see ProfileScreen.jsx for why fetch/blob is unreliable there
      allowsMultipleSelection: true, // pick several photos in one go instead of one tap per photo
      selectionLimit: 8,
    });
    if (result.canceled || !result.assets?.length) return;
    setPickedImages((prev) => [...prev, ...result.assets]);
  };

  const removeImage = (index) => {
    setPickedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (index) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Computes the full error set from current field values — used both
  // for the final submit check and, per-field, for live/inline
  // validation as each field is blurred.
  const computeErrors = () => {
    const e = {};
    if (!name.trim()) e.name = 'Room type name is required.';
    if (!price.trim()) e.price = 'Price is required.';
    else if (isNaN(Number(price)) || Number(price) <= 0) e.price = 'Enter a valid price.';
    if (originalPrice.trim() && (isNaN(Number(originalPrice)) || Number(originalPrice) <= 0)) {
      e.originalPrice = 'Enter a valid price or leave blank.';
    }
    return e;
  };

  const validate = () => {
    const e = computeErrors();
    setErrors(e);
    setTouched({ name: true, price: true, originalPrice: true });
    return Object.keys(e).length === 0;
  };

  // Marks a field touched and re-runs validation immediately — this is
  // what makes validation "live": an error shows the moment the admin
  // leaves an invalid field, not only after they hit submit.
  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors(computeErrors());
  };

  // Only shows an error for a field the admin has actually interacted
  // with — never flags a field red before they've had a chance to fill
  // it in.
  const fieldError = (field) => (touched[field] ? errors[field] : undefined);

  const uploadPickedImages = async (roomTypeId) => {
    const uploaded = [];
    for (let i = 0; i < pickedImages.length; i++) {
      const asset = pickedImages[i];
      try {
        let body;
        if (Platform.OS === 'web') {
          const response = await fetch(asset.uri);
          body = await response.blob();
        } else {
          if (!asset.base64) continue;
          body = decodeBase64(asset.base64);
        }
        const path = `${roomTypeId}/${i}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('room-type-images')
          .upload(path, body, { upsert: true, contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('room-type-images').getPublicUrl(path);
        uploaded.push({ uri: `${urlData.publicUrl}?t=${Date.now()}`, label: name.trim() });
      } catch (err) {
        console.error(`Failed to upload room type image ${i}:`, err);
        // Continue with the rest — a partial photo set is better than
        // blocking the whole room type from being created.
      }
    }
    return uploaded;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const formData = {
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        originalPrice: originalPrice.trim() ? Number(originalPrice) : null,
        bbPrice: includeBreakfastOption && bbPrice.trim() ? Number(bbPrice) : null,
        bbOriginalPrice: includeBreakfastOption && bbOriginalPrice.trim() ? Number(bbOriginalPrice) : null,
        size: size.trim(),
        bed: bed.trim(),
        occupancy: occupancy.trim(),
        floor: floor.trim(),
        inclusions: selectedAmenities,
        note: note.trim(),
        taxNote: taxNote.trim(),
        isBookable,
      };

      const targetId = isEditing ? editingRoomType.id : await createRoomType({ ...formData, images: [] });

      // Upload only the NEWLY picked images — existing ones (kept, i.e.
      // not removed from existingImages) are already in storage and
      // don't need re-uploading.
      let newlyUploaded = [];
      if (pickedImages.length > 0) {
        newlyUploaded = await uploadPickedImages(targetId);
      }
      const finalImages = [...existingImages, ...newlyUploaded];

      if (isEditing) {
        await updateRoomType(targetId, { ...formData, images: finalImages });
      } else if (finalImages.length > 0) {
        // FIXED BUG: this follow-up attach call used to run unguarded —
        // by this point the room type record itself was ALREADY created
        // successfully, so a failure here isn't a creation failure. It
        // was incorrectly surfacing as "Could not create this room
        // type" even when the room type WAS created (just without its
        // photos attached), which is exactly what was observed: the new
        // room type showed up in the list, the error still displayed,
        // and the photo never showed. Isolated in its own try/catch so
        // a failure here degrades to a warning instead of a false
        // failure — the room type still gets created, just flagged so
        // the admin knows to re-add the photo via Edit.
        let attachFailed = false;
        try {
          await updateRoomType(targetId, { images: finalImages }, { skipAudit: true });
        } catch (attachErr) {
          console.error('Failed to attach uploaded photos to the new room type:', attachErr);
          attachFailed = true;
        }
        if (attachFailed) {
          setCreatedRoomType({ id: targetId, ...formData, images: [], photoAttachFailed: true });
          setStep('success');
          onCreated && onCreated();
          setSaving(false);
          return;
        }
      }

      setCreatedRoomType({ id: targetId, ...formData, images: finalImages });
      setStep('success');
      if (isEditing) {
        onUpdated && onUpdated();
      } else {
        onCreated && onCreated();
      }
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} room type:`, err);
      let message = `Could not ${isEditing ? 'update' : 'create'} this room type. Please try again.`;
      if (err?.code === '23505') {
        // Postgres unique_violation — room_types.name has a UNIQUE
        // constraint, so this specifically means the name is already
        // taken by another room type, not a generic failure.
        message = `A room type named "${name.trim()}" already exists. Please choose a different name.`;
      }
      setErrors({ submit: message });
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
            {step === 'success'
              ? (isEditing ? 'Room Type Updated' : 'Room Type Created')
              : (isEditing ? 'Edit Room Type' : 'Add Room Type')}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {step === 'form' ? (
          <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]}>
            {/* ── Basic Info ─────────────────────────────────── */}
            <Section title="Basic Info" icon="information-circle-outline" complete={!!name.trim()}>
              <Field label="Room Type Name" required error={fieldError('name')} icon="bed-outline">
                <TextInput
                  style={styles.inputFlex}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => handleBlur('name')}
                  placeholder="e.g. Deluxe King"
                  placeholderTextColor={colors.disabled}
                />
              </Field>
              <Field label="Description">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="A short description guests will see"
                  placeholderTextColor={colors.disabled}
                  multiline
                />
              </Field>
              <View style={[styles.fieldRow, !isDesktop && styles.fieldRowMobile]}>
                <Field label="Size" style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="resize-outline">
                  <TextInput style={styles.inputFlex} value={size} onChangeText={setSize} placeholder="e.g. 28 sqm" placeholderTextColor={colors.disabled} />
                </Field>
                <Field label="Bed" style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="bed-outline">
                  <TextInput style={styles.inputFlex} value={bed} onChangeText={setBed} placeholder="e.g. 1 King Bed" placeholderTextColor={colors.disabled} />
                </Field>
              </View>
              <View style={[styles.fieldRow, !isDesktop && styles.fieldRowMobile]}>
                <Field label="Occupancy" style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="people-outline">
                  <TextInput style={styles.inputFlex} value={occupancy} onChangeText={setOccupancy} placeholder="e.g. 2 Adults" placeholderTextColor={colors.disabled} />
                </Field>
                <Field label="Floor" style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="layers-outline">
                  <TextInput style={styles.inputFlex} value={floor} onChangeText={setFloor} placeholder="e.g. Ground Floor" placeholderTextColor={colors.disabled} />
                </Field>
              </View>
            </Section>

            {/* ── Rates ──────────────────────────────────────── */}
            <Section title="Rates" icon="cash-outline" complete={!!price.trim() && !isNaN(Number(price))}>
              <View style={[styles.fieldRow, !isDesktop && styles.fieldRowMobile]}>
                <Field label="Price" required error={fieldError('price')} style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="pricetag-outline">
                  <TextInput style={styles.inputFlex} value={price} onChangeText={setPrice} onBlur={() => handleBlur('price')} placeholder="1700" keyboardType="numeric" placeholderTextColor={colors.disabled} />
                </Field>
                <Field label="Original Price" error={fieldError('originalPrice')} style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="pricetags-outline">
                  <TextInput style={styles.inputFlex} value={originalPrice} onChangeText={setOriginalPrice} onBlur={() => handleBlur('originalPrice')} placeholder="2000 (optional)" keyboardType="numeric" placeholderTextColor={colors.disabled} />
                </Field>
              </View>
              {!!price.trim() && !isNaN(Number(price)) && (
                <Text style={styles.pricePreview}>
                  Guests will see: <Text style={styles.pricePreviewAmount}>{formatCurrency(Number(price))}</Text>
                  <Text style={styles.pricePreviewUnit}> / night</Text>
                  {!!originalPrice.trim() && !isNaN(Number(originalPrice)) && Number(originalPrice) > Number(price) && (
                    <Text style={styles.pricePreviewStrike}>  {formatCurrency(Number(originalPrice))}</Text>
                  )}
                </Text>
              )}

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Offer a breakfast-included rate</Text>
                <Switch
                  value={includeBreakfastOption}
                  onValueChange={setIncludeBreakfastOption}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
              {includeBreakfastOption && (
                <View style={[styles.fieldRow, !isDesktop && styles.fieldRowMobile]}>
                  <Field label="Breakfast Price" style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="restaurant-outline">
                    <TextInput style={styles.inputFlex} value={bbPrice} onChangeText={setBbPrice} placeholder="2400" keyboardType="numeric" placeholderTextColor={colors.disabled} />
                  </Field>
                  <Field label="Breakfast Original Price" style={isDesktop ? { flex: 1 } : { width: '100%' }} icon="restaurant-outline">
                    <TextInput style={styles.inputFlex} value={bbOriginalPrice} onChangeText={setBbOriginalPrice} placeholder="3000" keyboardType="numeric" placeholderTextColor={colors.disabled} />
                  </Field>
                </View>
              )}

              <Field label="Rate Note" icon="document-text-outline">
                <TextInput style={styles.inputFlex} value={note} onChangeText={setNote} placeholder="e.g. Book now, pay at hotel" placeholderTextColor={colors.disabled} />
              </Field>
              <Field label="Tax Note" icon="receipt-outline">
                <TextInput style={styles.inputFlex} value={taxNote} onChangeText={setTaxNote} placeholder="e.g. Excludes taxes and charges" placeholderTextColor={colors.disabled} />
              </Field>
              <Text style={styles.fieldHint}>These two lines show as fine print under the rate on the guest booking screen.</Text>
            </Section>

            {/* ── Amenities ──────────────────────────────────── */}
            <Section title="Amenities" icon="checkmark-done-outline" complete={selectedAmenities.length > 0}>
              <View style={styles.amenityGrid}>
                {COMMON_AMENITIES.map((item) => {
                  const active = selectedAmenities.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.amenityChip, active && styles.amenityChipActive]}
                      onPress={() => toggleAmenity(item)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={AMENITY_ICONS[item] || 'checkmark-circle-outline'}
                        size={14}
                        color={active ? colors.white : colors.textMuted}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.amenityChipText, active && styles.amenityChipTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.customAmenityRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={customAmenity}
                  onChangeText={setCustomAmenity}
                  placeholder="Add a custom amenity"
                  placeholderTextColor={colors.disabled}
                  onSubmitEditing={addCustomAmenity}
                />
                <TouchableOpacity style={styles.customAmenityAddBtn} onPress={addCustomAmenity}>
                  <Ionicons name="add" size={18} color={colors.white} />
                </TouchableOpacity>
              </View>

              {selectedAmenities.filter((a) => !COMMON_AMENITIES.includes(a)).length > 0 && (
                <View style={styles.amenityGrid}>
                  {selectedAmenities.filter((a) => !COMMON_AMENITIES.includes(a)).map((item) => (
                    <View key={item} style={[styles.amenityChip, styles.amenityChipActive]}>
                      <Text style={[styles.amenityChipText, styles.amenityChipTextActive]}>{item}</Text>
                      <TouchableOpacity onPress={() => removeAmenity(item)} style={{ marginLeft: 6 }}>
                        <Ionicons name="close" size={13} color={colors.white} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* ── Photos ─────────────────────────────────────── */}
            <Section title="Photos" icon="image-outline" complete={existingImages.length + pickedImages.length > 0}>
              <Text style={styles.photoHint}>The first photo is used as the cover image guests see first. You can select multiple photos at once.</Text>
              <View style={styles.photoGrid}>
                {existingImages.map((img, i) => (
                  <View key={`existing-${i}`} style={styles.photoThumbWrap}>
                    <Image source={{ uri: img.uri }} style={styles.photoThumb} />
                    {i === 0 && (
                      <View style={styles.coverBadge}>
                        <Text style={styles.coverBadgeText}>Cover</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeExistingImage(i)}>
                      <Ionicons name="close" size={12} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
                {pickedImages.map((img, i) => (
                  <View key={`new-${i}`} style={styles.photoThumbWrap}>
                    <Image source={{ uri: img.uri }} style={styles.photoThumb} />
                    {existingImages.length === 0 && i === 0 && (
                      <View style={styles.coverBadge}>
                        <Text style={styles.coverBadgeText}>Cover</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removeImage(i)}>
                      <Ionicons name="close" size={12} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.photoAddBtn} onPress={pickImage}>
                  <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
                  <Text style={styles.photoAddBtnText}>Add Photo</Text>
                </TouchableOpacity>
              </View>
            </Section>

            {/* ── Availability ───────────────────────────────── */}
            <Section title="Availability" icon="eye-outline">
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Available for guest booking</Text>
                  <Text style={styles.switchSubLabel}>
                    {isBookable
                      ? 'Guests will see this room type immediately after creation.'
                      : "Saved as a draft — guests won't see it until you turn this on."}
                  </Text>
                </View>
                <Switch
                  value={isBookable}
                  onValueChange={setIsBookable}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            </Section>

            {!!errors.submit && <Text style={styles.submitError}>{errors.submit}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.submitBtnText}>{isEditing ? 'Save Changes' : 'Create Room Type'}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.successContent}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color="#1E7B34" />
            </View>
            <Text style={styles.successTitle}>{isEditing ? 'Room Type Updated!' : 'Room Type Created!'}</Text>
            <Text style={styles.successSubtitle}>
              "{createdRoomType?.name}" has been {isEditing ? 'updated' : 'added'}{createdRoomType?.isBookable ? ' and is live for guests.' : ' as a draft.'}
            </Text>

            {createdRoomType?.photoAttachFailed && (
              <View style={styles.attachWarning}>
                <Ionicons name="warning-outline" size={16} color="#9A7B00" />
                <Text style={styles.attachWarningText}>
                  The room type was saved, but the photo couldn't be attached. Open Edit to try adding it again.
                </Text>
              </View>
            )}

            {/* Preview card — same visual shape a guest would see */}
            <View style={styles.previewCard}>
              {createdRoomType?.images?.[0] ? (
                <Image source={{ uri: createdRoomType.images[0].uri }} style={styles.previewImage} />
              ) : (
                <View style={[styles.previewImage, styles.previewImagePlaceholder]}>
                  <Ionicons name="image-outline" size={28} color={colors.disabled} />
                </View>
              )}
              <View style={styles.previewBody}>
                <View style={styles.previewTopRow}>
                  <Text style={styles.previewName}>{createdRoomType?.name}</Text>
                  <View style={[styles.previewAvailBadge, !createdRoomType?.isBookable && styles.previewAvailBadgeDraft]}>
                    <Text style={styles.previewAvailBadgeText}>
                      {createdRoomType?.isBookable ? 'Live' : 'Draft'}
                    </Text>
                  </View>
                </View>
                {!!createdRoomType?.description && (
                  <Text style={styles.previewDescription} numberOfLines={2}>{createdRoomType.description}</Text>
                )}
                <View style={styles.previewPriceRow}>
                  {!!createdRoomType?.originalPrice && (
                    <Text style={styles.previewOriginalPrice}>{formatCurrency(createdRoomType.originalPrice)}</Text>
                  )}
                  <Text style={styles.previewPrice}>{formatCurrency(createdRoomType?.price)}<Text style={styles.previewPriceUnit}> /night</Text></Text>
                </View>
                {createdRoomType?.inclusions?.length > 0 && (
                  <View style={styles.previewAmenityRow}>
                    {createdRoomType.inclusions.slice(0, 3).map((a) => (
                      <View key={a} style={styles.previewAmenityChip}>
                        <Text style={styles.previewAmenityText}>{a}</Text>
                      </View>
                    ))}
                    {createdRoomType.inclusions.length > 3 && (
                      <Text style={styles.previewAmenityMore}>+{createdRoomType.inclusions.length - 3} more</Text>
                    )}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.successActions}>
              {!isEditing && (
                <TouchableOpacity style={styles.successSecondaryBtn} onPress={handleAddAnother} activeOpacity={0.85}>
                  <Text style={styles.successSecondaryBtnText}>Add Another</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.successPrimaryBtn, isEditing && { flex: 1 }]} onPress={handleClose} activeOpacity={0.85}>
                <Text style={styles.successPrimaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

/* ── Small layout helpers ─────────────────────────────────────────── */
function Section({ title, icon, complete, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
        {complete && (
          <View style={styles.sectionCompleteBadge}>
            <Ionicons name="checkmark" size={11} color="#1E7B34" />
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function Field({ label, required, error, style, icon, children }) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      <Text style={styles.fieldLabel}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      {icon ? (
        <View style={[styles.inputIconRow, error && styles.inputIconRowError]}>
          <Ionicons name={icon} size={15} color={colors.textMuted} style={styles.inputIcon} />
          {children}
        </View>
      ) : (
        children
      )}
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
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
  scrollContentDesktop: { maxWidth: 720, width: '100%', alignSelf: 'center', paddingTop: spacing.xl },

  section: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  sectionTitle: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.text, letterSpacing: 0.2 },
  sectionCompleteBadge: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#DFF5E1',
    alignItems: 'center', justifyContent: 'center', marginLeft: 2,
  },

  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldRowMobile: { flexDirection: 'column', gap: 0 },
  pricePreview: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: -spacing.xs, marginBottom: spacing.md },
  pricePreviewAmount: { fontFamily: fonts.headingSemiBold, color: colors.primary },
  pricePreviewUnit: { fontFamily: fonts.body, color: colors.textMuted },
  pricePreviewStrike: { fontFamily: fonts.body, color: colors.disabled, textDecorationLine: 'line-through' },
  fieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, marginBottom: spacing.xs },
  required: { color: '#B3261E' },
  fieldError: { fontSize: 11, fontFamily: fonts.body, color: '#B3261E', marginTop: 3 },
  fieldHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: -spacing.xs },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    fontSize: 13, fontFamily: fonts.body, color: colors.text, backgroundColor: colors.cardAlt,
  },
  textArea: { minHeight: 64, textAlignVertical: 'top' },

  inputIconRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, backgroundColor: colors.cardAlt, gap: spacing.xs,
  },
  inputIconRowError: { borderColor: '#B3261E' },
  inputIcon: { flexShrink: 0 },
  inputFlex: {
    flex: 1, paddingVertical: spacing.sm,
    fontSize: 13, fontFamily: fonts.body, color: colors.text,
  },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  switchLabel: { fontSize: 13, fontFamily: fonts.bodyMedium, color: colors.text },
  switchSubLabel: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2, maxWidth: 260 },

  amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  amenityChip: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: spacing.md, backgroundColor: colors.cardAlt,
  },
  amenityChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  amenityChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  amenityChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },

  customAmenityRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  customAmenityAddBtn: {
    width: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.sm,
  },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoHint: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },
  photoThumbWrap: { width: 84, height: 84, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 2, alignItems: 'center',
  },
  coverBadgeText: { fontSize: 9, fontFamily: fonts.bodySemiBold, color: colors.white, letterSpacing: 0.3 },
  photoRemoveBtn: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  photoAddBtn: {
    width: 84, height: 84, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  photoAddBtnText: { fontSize: 10, fontFamily: fonts.bodyMedium, color: colors.textMuted },

  submitError: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', textAlign: 'center', marginBottom: spacing.sm },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 14, fontFamily: fonts.headingSemiBold, color: colors.white },

  successContent: { padding: spacing.xl, alignItems: 'center' },
  successIconWrap: { marginTop: spacing.lg, marginBottom: spacing.md },
  successTitle: { fontSize: 20, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.xs },
  successSubtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl, maxWidth: 320 },
  attachWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    backgroundColor: '#FFF4D6', borderRadius: radius.md, padding: spacing.md,
    maxWidth: 360, marginBottom: spacing.lg, marginTop: -spacing.md,
  },
  attachWarningText: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: '#7A5C00', lineHeight: 17 },

  previewCard: {
    width: '100%', maxWidth: 400, backgroundColor: colors.white, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.xl,
  },
  previewImage: { width: '100%', height: 160 },
  previewImagePlaceholder: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  previewBody: { padding: spacing.md },
  previewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewName: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
  previewAvailBadge: { backgroundColor: '#DFF5E1', borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm },
  previewAvailBadgeDraft: { backgroundColor: colors.cardAlt },
  previewAvailBadgeText: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: '#1E7B34' },
  previewDescription: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },
  previewPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: spacing.sm },
  previewOriginalPrice: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, textDecorationLine: 'line-through' },
  previewPrice: { fontSize: 18, fontFamily: fonts.headingExtraBold, color: colors.primary },
  previewPriceUnit: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  previewAmenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.sm, alignItems: 'center' },
  previewAmenityChip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 2, paddingHorizontal: spacing.sm },
  previewAmenityText: { fontSize: 10, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  previewAmenityMore: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted },

  successActions: { flexDirection: 'row', gap: spacing.sm, width: '100%', maxWidth: 400 },
  successSecondaryBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center' },
  successSecondaryBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  successPrimaryBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.md, alignItems: 'center' },
  successPrimaryBtnText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },
};