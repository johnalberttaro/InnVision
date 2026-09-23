import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, StyleSheet, Image, ActivityIndicator, Alert, Platform, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  subscribeToRoomTypes,
  subscribeToRooms,
  joinRoomsWithTypes,
  updateRoomStatus,
  createRoom,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  seedInitialRooms,
  formatCurrency,
  ROOM_STATUS,
  STATUS_META,
  statusMeta,
} from '../../utils/Roomsservice';
import { colors, spacing, radius, fonts } from '../../utils/portalTheme';

// Room-Types-only accent colors — deliberately kept local to this file
// rather than added to portalTheme.js, which every other portal screen
// shares. The header/tab-bar chrome stays the existing monochrome
// palette (consistent across all 5 tabs on this screen); gold/blue is
// used only on the new Room Types elements below (price, the "+ Add Room
// Type" button, Edit, amenity chips).
const TYPE_GOLD = '#B7862C';
const TYPE_GOLD_TINT = '#FBF2E1';
const TYPE_BLUE = '#2563EB';
const TYPE_BLUE_TINT = '#EAF1FE';

const SECTION_TITLES = {
  types: 'Room Types',
  list: 'Room List',
  availability: 'Room Availability',
  status: 'Room Status',
  maintenance: 'Room Maintenance',
};

// Sidebar sub-items (List/Types/Availability/Status/Maintenance) collapsed
// into this scrollable tab bar at the top of the screen, matching the
// treatment ReservationsScreen.jsx got. Keys match this screen's own
// `section` values directly (no namespace prefix to strip) since both
// shells already extract the bare leaf segment before passing it down —
// see FrontDeskShell.jsx (`rooms:xxx` → 'xxx') and AdminShell.jsx
// (`fd:rooms:xxx` → 'xxx').
const TABS = [
  { key: 'list',         label: 'Room List',         icon: 'list-outline' },
  { key: 'types',        label: 'Room Types',         icon: 'bed-outline' },
  { key: 'availability', label: 'Room Availability',  icon: 'checkmark-circle-outline' },
  { key: 'status',       label: 'Room Status',        icon: 'pulse-outline' },
  { key: 'maintenance',  label: 'Room Maintenance',   icon: 'construct-outline' },
];

const notifyUser = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

const confirmAction = (title, message, confirmLabel, onConfirm) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
};

export default function RoomManagementScreen({ onLogout, section = 'types' }) {
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [updatingRoomNumber, setUpdatingRoomNumber] = useState(null);
  const [seeding, setSeeding] = useState(false);
  // Lifted up from RoomListSection so the "+ Add Room" button can live in
  // the shared header (next to Reseed) instead of buried in that tab's own
  // content row — matches the reference layout the header/toolbar was
  // redesigned against.
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  // Same idea for "+ Add Room Type" on the Room Types tab — this only
  // opens the CREATE case of RoomTypeModal; per-card Edit keeps its own
  // local state inside RoomTypesSection since it's triggered per-row, not
  // from the shared header.
  const [addTypeOpen, setAddTypeOpen] = useState(false);

  // Tab bar owns which section is showing from here on; `section` is only
  // the *initial*/deep-linked value now (dashboard KPI shortcuts like
  // FrontDeskDashboardScreen's "rooms:availability" card still work — they
  // change the `section` prop, and this effect resyncs the active tab to
  // match, same as ReservationsScreen.jsx's activeTab/filterKey pattern).
  const [activeTab, setActiveTab] = useState(section);
  useEffect(() => {
    setActiveTab(section);
  }, [section]);

  useEffect(() => {
    const unsubTypes = subscribeToRoomTypes(
      (data) => { setRoomTypes(data); setLoadingTypes(false); },
      () => setLoadingTypes(false)
    );
    const unsubRooms = subscribeToRooms(
      (data) => { setRooms(data); setLoadingRooms(false); },
      () => setLoadingRooms(false)
    );
    return () => {
      unsubTypes();
      unsubRooms();
    };
  }, []);

  const roomsWithDetails = useMemo(
    () => joinRoomsWithTypes(rooms, roomTypes),
    [rooms, roomTypes]
  );

  const loading = loadingTypes || loadingRooms;
  const isEmpty = !loading && rooms.length === 0;

  const handleStatusChange = async (room, status, extra = {}) => {
    if (room.status === status && !Object.keys(extra).length) return;
    setUpdatingRoomNumber(room.roomNumber);
    try {
      await updateRoomStatus(room.roomNumber, status, extra);
    } catch (err) {
      console.error('Failed to update room status:', err);
      notifyUser('Error', 'Could not update this room. Please check your connection and try again.');
    } finally {
      setUpdatingRoomNumber(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedInitialRooms();
      notifyUser('Done', 'Seeded 3 room types and 8 rooms into the database.');
    } catch (err) {
      console.error('Failed to seed rooms:', err);
      notifyUser('Error', 'Could not seed room data. Check your Supabase connection/policies and try again.');
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedWithConfirm = () => {
    confirmAction(
      'Reseed room data?',
      'This overwrites the Twin, King, and Single Room room types, and rooms 101–108, with whatever is currently defined in Roomsservice.js. Any manual edits made directly in the Supabase table editor will be lost.',
      'Reseed',
      handleSeed
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerIconBadge}>
            <Ionicons name="bed-outline" size={18} color={colors.white} />
          </View>
          <View>
            <Text style={styles.title}>{SECTION_TITLES[activeTab] || 'Room Management'}</Text>
            <Text style={styles.subtitle}>
              {roomTypes.length} room type{roomTypes.length !== 1 ? 's' : ''} · {rooms.length} room{rooms.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={handleSeedWithConfirm}
            style={styles.reseedButton}
            disabled={seeding}
          >
            {seeding
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={styles.reseedText}>↻ Reseed Data (Dev)</Text>
            }
          </TouchableOpacity>
          {/* Only meaningful on the Room List tab — Room Types/Availability/
              Status/Maintenance don't create rooms directly. */}
          {activeTab === 'list' && (
            <TouchableOpacity style={styles.addRoomBtn} onPress={() => setAddRoomOpen(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.addRoomBtnText}>Add Room</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'types' && (
            <TouchableOpacity style={styles.addTypeBtn} onPress={() => setAddTypeOpen(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.addRoomBtnText}>Add Room Type</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tab) => (
            <RoomTabButton
              key={tab.key}
              tab={tab}
              active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centerWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : isEmpty ? (
        <View style={styles.centerWrap}>
          <Text style={styles.emptyStateTitle}>No rooms seeded yet</Text>
          <Text style={styles.emptyStateText}>
            The "rooms" table has no rows yet.{'\n'}
            Tap below to create this property's fixed inventory:{'\n'}
            3 room types (Twin, King, Single Room) and 8 rooms (101–108).{'\n'}
            {roomTypes.length > 0 ? 'This will overwrite any existing room_types rows with the correct seed data.' : ''}
          </Text>
          <TouchableOpacity
            style={[styles.seedBtn, seeding && styles.seedBtnDisabled]}
            onPress={handleSeed}
            disabled={seeding}
            activeOpacity={0.85}
          >
            {seeding
              ? <ActivityIndicator color={colors.white} size="small" />
              : <Text style={styles.seedBtnText}>Seed Sample Rooms (one-time)</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {activeTab === 'types' && (
            <RoomTypesSection
              roomTypes={roomTypes}
              rooms={rooms}
              addTypeOpen={addTypeOpen}
              onCloseAddType={() => setAddTypeOpen(false)}
            />
          )}
          {activeTab === 'list' && (
            <RoomListSection
              rooms={roomsWithDetails}
              roomTypes={roomTypes}
              modalOpen={addRoomOpen}
              onCloseModal={() => setAddRoomOpen(false)}
              updatingRoomNumber={updatingRoomNumber}
              onStatusChange={handleStatusChange}
            />
          )}
          {activeTab === 'availability' && (
            <AvailabilitySection
              rooms={roomsWithDetails}
              updatingRoomNumber={updatingRoomNumber}
              onStatusChange={handleStatusChange}
            />
          )}
          {activeTab === 'status' && (
            <StatusSection
              rooms={roomsWithDetails}
              updatingRoomNumber={updatingRoomNumber}
              onStatusChange={handleStatusChange}
            />
          )}
          {activeTab === 'maintenance' && (
            <MaintenanceSection
              rooms={roomsWithDetails}
              updatingRoomNumber={updatingRoomNumber}
              onStatusChange={handleStatusChange}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const PRICE_RANGES = [
  { value: 'all', label: 'All Prices' },
  { value: 'under2000', label: 'Under ₱2,000', test: (p) => p < 2000 },
  { value: '2000to3000', label: '₱2,000 – ₱3,000', test: (p) => p >= 2000 && p <= 3000 },
  { value: '3000to4000', label: '₱3,000 – ₱4,000', test: (p) => p > 3000 && p <= 4000 },
  { value: 'over4000', label: 'Over ₱4,000', test: (p) => p > 4000 },
];

const TYPE_SORT_OPTIONS = [
  { value: 'default', label: 'Default Order' },
  { value: 'priceAsc', label: 'Price: Low to High' },
  { value: 'priceDesc', label: 'Price: High to Low' },
  { value: 'nameAsc', label: 'Name (A–Z)' },
];

function RoomTypesSection({ roomTypes, rooms, addTypeOpen, onCloseAddType }) {
  const [search, setSearch] = useState('');
  const [bedFilter, setBedFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [editingType, setEditingType] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Exact 3/2/1-column grid: measured from the grid's OWN available width
  // (onLayout) rather than the window's, since the sidebar already eats
  // into that — this is the width actually left for cards, whatever the
  // sidebar happens to measure, so the grid genuinely fills what's left
  // instead of leaving a guessed-wrong gap.
  const [gridWidth, setGridWidth] = useState(0);

  const roomCountByType = useMemo(() => {
    const counts = {};
    rooms.forEach((r) => { counts[r.roomTypeId] = (counts[r.roomTypeId] || 0) + 1; });
    return counts;
  }, [rooms]);

  const bedOptions = useMemo(() => {
    const distinct = Array.from(new Set(roomTypes.map((rt) => rt.bed).filter(Boolean)));
    return [{ value: 'all', label: 'All Bed Types' }, ...distinct.map((b) => ({ value: b, label: b }))];
  }, [roomTypes]);

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const priceRange = PRICE_RANGES.find((r) => r.value === priceFilter);
    let list = roomTypes.filter((rt) => {
      if (bedFilter !== 'all' && rt.bed !== bedFilter) return false;
      if (priceRange && priceRange.test && !priceRange.test(rt.price ?? 0)) return false;
      if (!q) return true;
      const haystack = [rt.name, rt.bed, rt.description].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (sortBy === 'priceAsc') list = [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sortBy === 'priceDesc') list = [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    else if (sortBy === 'nameAsc') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [roomTypes, search, bedFilter, priceFilter, sortBy]);

  const handleDeleteType = (rt) => {
    const roomCount = roomCountByType[rt.id] || 0;
    confirmAction(
      `Delete "${rt.name}"?`,
      roomCount > 0
        ? `${roomCount} room${roomCount !== 1 ? 's are' : ' is'} still assigned to this type — reassign or remove ${roomCount !== 1 ? 'them' : 'it'} first.`
        : 'This cannot be undone.',
      'Delete',
      async () => {
        setDeletingId(rt.id);
        try {
          await deleteRoomType(rt.id);
        } catch (err) {
          console.error('Failed to delete room type:', err);
          notifyUser(
            err?.code === 'room-type/has-assigned-rooms' ? "Can't Delete" : 'Error',
            err?.message || 'Could not delete this room type. Please try again.'
          );
        } finally {
          setDeletingId(null);
        }
      }
    );
  };

  const columns = gridWidth >= 860 ? 3 : gridWidth >= 560 ? 2 : 1;
  const cardGap = spacing.lg;
  const cardWidth = gridWidth > 0 ? (gridWidth - cardGap * (columns - 1)) / columns : undefined;

  return (
    <View>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search room types..."
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <FilterDropdown label="All Bed Types" value={bedFilter} options={bedOptions} onChange={setBedFilter} />
        <FilterDropdown label="All Prices" value={priceFilter} options={PRICE_RANGES} onChange={setPriceFilter} />
        <FilterDropdown label="Default Order" value={sortBy} options={TYPE_SORT_OPTIONS} onChange={setSortBy} />
      </View>

      {filteredTypes.length === 0 ? (
        <Text style={styles.emptyText}>No room types match your search or filters.</Text>
      ) : (
        <View style={styles.typesGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {filteredTypes.map((rt) => (
            <RoomTypeCard
              key={rt.id}
              roomType={rt}
              roomCount={roomCountByType[rt.id] || 0}
              width={cardWidth}
              isDeleting={deletingId === rt.id}
              onEdit={() => setEditingType(rt)}
              onDelete={() => handleDeleteType(rt)}
            />
          ))}
        </View>
      )}

      <RoomTypeModal
        visible={addTypeOpen || !!editingType}
        editingType={editingType}
        onClose={() => { onCloseAddType(); setEditingType(null); }}
      />
    </View>
  );
}

function RoomTypeCard({ roomType: rt, roomCount, width, isDeleting, onEdit, onDelete }) {
  const firstImage = rt.images && rt.images.length > 0 ? rt.images[0] : null;

  return (
    <View style={[styles.typeCard, width ? { width } : { minWidth: 260, flexGrow: 1 }]}>
      {firstImage ? (
        <Image
          source={firstImage.source ? firstImage.source : { uri: firstImage.uri }}
          style={styles.typeCardImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.typeCardImage, styles.typeCardImagePlaceholder]}>
          <Ionicons name="bed-outline" size={32} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.typeCardBody}>
        <Text style={styles.typeCardTitle} numberOfLines={1}>{rt.name}</Text>

        <View style={styles.typeCardSpecs}>
          {rt.bed ? <Amenity icon="bed-outline" label={rt.bed} /> : null}
          {rt.occupancy ? <Amenity icon="people-outline" label={rt.occupancy} /> : null}
          {rt.size ? <Amenity icon="resize-outline" label={rt.size} /> : null}
        </View>

        <View style={styles.typeCardPriceRow}>
          <Text style={styles.typeCardPrice}>{formatCurrency(rt.price)}</Text>
          <Text style={styles.typeCardPerNight}>/ night</Text>
          {rt.originalPrice ? <Text style={styles.typeCardStrikePrice}>{formatCurrency(rt.originalPrice)}</Text> : null}
        </View>
        {rt.floor ? <Text style={styles.typeCardFloor}>{rt.floor}</Text> : null}

        {rt.description ? (
          <Text style={styles.typeCardDescription} numberOfLines={2}>{rt.description}</Text>
        ) : null}

        {rt.inclusions && rt.inclusions.length > 0 && (
          <View style={styles.typeCardChipsWrap}>
            {rt.inclusions.map((inc, i) => (
              <View key={i} style={styles.typeCardChip}>
                <Text style={styles.typeCardChipText} numberOfLines={1}>{inc}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.typeCardFooter}>
          <View style={styles.typeCardCountTag}>
            <Ionicons name="business-outline" size={12} color={TYPE_BLUE} />
            <Text style={styles.typeCardCountText}>{roomCount} room{roomCount !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.typeCardActions}>
            <TouchableOpacity style={styles.typeEditBtn} onPress={onEdit} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={14} color={TYPE_BLUE} />
              <Text style={styles.typeEditBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.typeDeleteBtn} onPress={onDelete} activeOpacity={0.8} disabled={isDeleting}>
              {isDeleting ? (
                <ActivityIndicator color={colors.danger} size="small" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <Text style={styles.typeDeleteBtnText}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function RoomTypeModal({ visible, editingType, onClose }) {
  const isEdit = !!editingType;
  const [name, setName] = useState('');
  const [bed, setBed] = useState('');
  const [occupancy, setOccupancy] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [floor, setFloor] = useState('');
  const [description, setDescription] = useState('');
  const [inclusionsText, setInclusionsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // This one modal instance handles both Add and Edit — reseed every
  // field whenever it opens (or switches which type it's editing) so a
  // previous edit's leftovers never bleed into the next open.
  useEffect(() => {
    if (!visible) return;
    if (editingType) {
      setName(editingType.name || '');
      setBed(editingType.bed || '');
      setOccupancy(editingType.occupancy || '');
      setSize(editingType.size || '');
      setPrice(editingType.price != null ? String(editingType.price) : '');
      setOriginalPrice(editingType.originalPrice != null ? String(editingType.originalPrice) : '');
      setFloor(editingType.floor || '');
      setDescription(editingType.description || '');
      setInclusionsText((editingType.inclusions || []).join(', '));
    } else {
      setName(''); setBed(''); setOccupancy(''); setSize('');
      setPrice(''); setOriginalPrice(''); setFloor(''); setDescription('');
      setInclusionsText('');
    }
    setError('');
  }, [visible, editingType]);

  const close = () => {
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Room type name is required.'); return; }
    const priceNum = Number(price);
    if (!price || Number.isNaN(priceNum) || priceNum <= 0) { setError('Enter a valid price.'); return; }
    const originalPriceNum = originalPrice ? Number(originalPrice) : null;
    if (originalPrice && Number.isNaN(originalPriceNum)) { setError('Original price must be a number.'); return; }

    const data = {
      name: trimmedName,
      bed: bed.trim(),
      occupancy: occupancy.trim(),
      size: size.trim(),
      price: priceNum,
      originalPrice: originalPriceNum,
      floor: floor.trim(),
      description: description.trim(),
      inclusions: inclusionsText.split(',').map((s) => s.trim()).filter(Boolean),
    };

    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await updateRoomType(editingType.id, data);
      } else {
        await createRoomType(data);
      }
      close();
    } catch (err) {
      console.error('Failed to save room type:', err);
      setError('Could not save this room type. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.dialogOverlay}>
        <View style={styles.typeDialogCard}>
          <Text style={styles.dialogTitle}>{isEdit ? 'Edit Room Type' : 'Add Room Type'}</Text>

          <ScrollView style={styles.typeDialogScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.dialogFieldLabel}>Name</Text>
            <TextInput
              style={styles.dialogInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Deluxe King"
              placeholderTextColor={colors.disabled}
            />

            <View style={styles.typeDialogRow}>
              <View style={styles.typeDialogCol}>
                <Text style={styles.dialogFieldLabel}>Bed</Text>
                <TextInput style={styles.dialogInput} value={bed} onChangeText={setBed} placeholder="e.g. 1 King Bed" placeholderTextColor={colors.disabled} />
              </View>
              <View style={styles.typeDialogCol}>
                <Text style={styles.dialogFieldLabel}>Occupancy</Text>
                <TextInput style={styles.dialogInput} value={occupancy} onChangeText={setOccupancy} placeholder="e.g. 2 Adults" placeholderTextColor={colors.disabled} />
              </View>
            </View>

            <View style={styles.typeDialogRow}>
              <View style={styles.typeDialogCol}>
                <Text style={styles.dialogFieldLabel}>Size</Text>
                <TextInput style={styles.dialogInput} value={size} onChangeText={setSize} placeholder="e.g. 28 sqm" placeholderTextColor={colors.disabled} />
              </View>
              <View style={styles.typeDialogCol}>
                <Text style={styles.dialogFieldLabel}>Floor</Text>
                <TextInput style={styles.dialogInput} value={floor} onChangeText={setFloor} placeholder="e.g. Second Floor" placeholderTextColor={colors.disabled} />
              </View>
            </View>

            <View style={styles.typeDialogRow}>
              <View style={styles.typeDialogCol}>
                <Text style={styles.dialogFieldLabel}>Price / night (₱)</Text>
                <TextInput
                  style={styles.dialogInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="e.g. 2500"
                  placeholderTextColor={colors.disabled}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                />
              </View>
              <View style={styles.typeDialogCol}>
                <Text style={styles.dialogFieldLabel}>Original Price (optional)</Text>
                <TextInput
                  style={styles.dialogInput}
                  value={originalPrice}
                  onChangeText={setOriginalPrice}
                  placeholder="e.g. 3000"
                  placeholderTextColor={colors.disabled}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                />
              </View>
            </View>

            <Text style={styles.dialogFieldLabel}>Description</Text>
            <TextInput
              style={[styles.dialogInput, styles.typeDialogTextarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Short description shown on the card"
              placeholderTextColor={colors.disabled}
              multiline
            />

            <Text style={styles.dialogFieldLabel}>Amenities (comma-separated)</Text>
            <TextInput
              style={[styles.dialogInput, styles.typeDialogTextarea]}
              value={inclusionsText}
              onChangeText={setInclusionsText}
              placeholder="Free Wi-Fi, Air conditioning, Flat-screen TV"
              placeholderTextColor={colors.disabled}
              multiline
            />

            {!!error && <Text style={styles.dialogError}>{error}</Text>}
          </ScrollView>

          <View style={styles.dialogActions}>
            <TouchableOpacity style={styles.dialogCancelBtn} onPress={close} disabled={saving}>
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dialogSubmitBtn} onPress={handleSubmit} disabled={saving}>
              {saving
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Text style={styles.dialogSubmitText}>{isEdit ? 'Save Changes' : 'Add Room Type'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RoomListSection({ rooms, roomTypes, modalOpen, onCloseModal, updatingRoomNumber, onStatusChange }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('list');

  const typeOptions = useMemo(
    () => [{ value: 'all', label: 'All Room Types' }, ...roomTypes.map((rt) => ({ value: rt.id, label: rt.name }))],
    [roomTypes]
  );
  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All Status' },
      ...Object.keys(STATUS_META).map((key) => ({ value: key, label: STATUS_META[key].label })),
    ],
    []
  );

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (typeFilter !== 'all' && room.roomTypeId !== typeFilter) return false;
      if (statusFilter !== 'all' && room.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [room.roomNumber, room.roomTypeName, statusMeta(room.status).label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rooms, search, typeFilter, statusFilter]);

  return (
    <View>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by room number, type, or status..."
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <FilterDropdown label="All Room Types" value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
        <FilterDropdown label="All Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
        <View style={styles.viewToggle}>
          <Pressable
            onPress={() => setViewMode('list')}
            style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
          >
            <Ionicons name="list-outline" size={16} color={viewMode === 'list' ? colors.white : colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => setViewMode('grid')}
            style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
          >
            <Ionicons name="grid-outline" size={16} color={viewMode === 'grid' ? colors.white : colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {filteredRooms.length === 0 ? (
        <Text style={styles.emptyText}>No rooms match your search or filters.</Text>
      ) : viewMode === 'list' ? (
        filteredRooms.map((room) => (
          <RoomRow
            key={room.roomNumber}
            room={room}
            showStatus
            isUpdating={updatingRoomNumber === room.roomNumber}
            onStatusChange={(status) => onStatusChange(room, status)}
          />
        ))
      ) : (
        <View style={styles.gridWrap}>
          {filteredRooms.map((room) => (
            <RoomGridCard
              key={room.roomNumber}
              room={room}
              isUpdating={updatingRoomNumber === room.roomNumber}
              onStatusChange={(status) => onStatusChange(room, status)}
            />
          ))}
        </View>
      )}

      <AddRoomModal visible={modalOpen} onClose={onCloseModal} roomTypes={roomTypes} existingRooms={rooms} />
    </View>
  );
}

function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.filterWrap}>
      <Pressable style={styles.filterTrigger} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.filterTriggerText} numberOfLines={1}>{selected ? selected.label : label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </Pressable>
      {open && (
        <View style={styles.filterMenu}>
          <ScrollView style={styles.filterMenuScroll} nestedScrollEnabled>
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.filterOption, opt.value === value && styles.filterOptionActive]}
                onPress={() => { onChange(opt.value); setOpen(false); }}
              >
                <Text style={[styles.filterOptionText, opt.value === value && styles.filterOptionTextActive]} numberOfLines={1}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function AddRoomModal({ visible, onClose, roomTypes, existingRooms }) {
  const [roomNumber, setRoomNumber] = useState('');
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id || null);
  const [floor, setFloor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setRoomNumber('');
    setRoomTypeId(roomTypes[0]?.id || null);
    setFloor('');
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = roomNumber.trim();
    if (!trimmed) { setError('Room number is required.'); return; }
    if (!roomTypeId) { setError('Please select a room type.'); return; }
    if (existingRooms.some((r) => r.roomNumber === trimmed)) {
      setError(`Room ${trimmed} already exists.`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await createRoom({ roomNumber: trimmed, roomTypeId, floor: floor.trim() });
      close();
    } catch (err) {
      console.error('Failed to create room:', err);
      // Postgres unique_violation on room_number, in case the client-side
      // duplicate check above raced with another admin adding the same
      // room number at the same time.
      setError(
        err?.code === '23505'
          ? `Room ${trimmed} already exists.`
          : 'Could not add this room. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.dialogOverlay}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Add Room</Text>

          <Text style={styles.dialogFieldLabel}>Room Number</Text>
          <TextInput
            style={styles.dialogInput}
            value={roomNumber}
            onChangeText={setRoomNumber}
            placeholder="e.g. 109"
            placeholderTextColor={colors.disabled}
            keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
          />

          <Text style={styles.dialogFieldLabel}>Room Type</Text>
          <View style={styles.dialogChipRow}>
            {roomTypes.length === 0 ? (
              <Text style={styles.dialogHint}>No room types yet — add one first under Room Types.</Text>
            ) : (
              roomTypes.map((rt) => (
                <TouchableOpacity
                  key={rt.id}
                  style={[styles.dialogChip, roomTypeId === rt.id && styles.dialogChipActive]}
                  onPress={() => setRoomTypeId(rt.id)}
                >
                  <Text style={[styles.dialogChipText, roomTypeId === rt.id && styles.dialogChipTextActive]}>{rt.name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <Text style={styles.dialogFieldLabel}>Floor (optional)</Text>
          <TextInput
            style={styles.dialogInput}
            value={floor}
            onChangeText={setFloor}
            placeholder="e.g. Ground Floor"
            placeholderTextColor={colors.disabled}
          />

          {!!error && <Text style={styles.dialogError}>{error}</Text>}

          <View style={styles.dialogActions}>
            <TouchableOpacity style={styles.dialogCancelBtn} onPress={close} disabled={saving}>
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dialogSubmitBtn} onPress={handleSubmit} disabled={saving}>
              {saving
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Text style={styles.dialogSubmitText}>Add Room</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AvailabilitySection({ rooms, updatingRoomNumber, onStatusChange }) {
  const available = rooms.filter((r) => r.available);
  const unavailable = rooms.filter((r) => !r.available);

  return (
    <View>
      <SectionIntro description="Which rooms are open to book right now versus already occupied, reserved, or out of service. A room counts as available only while its status is Vacant." />

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderColor: STATUS_META[ROOM_STATUS.VACANT].color }]}>
          <Text style={[styles.summaryNumber, { color: STATUS_META[ROOM_STATUS.VACANT].color }]}>{available.length}</Text>
          <Text style={styles.summaryLabel}>Available</Text>
        </View>
        <View style={[styles.summaryCard, { borderColor: colors.textMuted }]}>
          <Text style={[styles.summaryNumber, { color: colors.text }]}>{unavailable.length}</Text>
          <Text style={styles.summaryLabel}>Unavailable</Text>
        </View>
      </View>

      <Text style={styles.groupHeading}>Available</Text>
      {available.length === 0 ? (
        <Text style={styles.emptyText}>No vacant rooms right now.</Text>
      ) : (
        available.map((room) => (
          <RoomRow
            key={room.roomNumber}
            room={room}
            showStatus
            isUpdating={updatingRoomNumber === room.roomNumber}
            onStatusChange={(status) => onStatusChange(room, status)}
          />
        ))
      )}

      <Text style={[styles.groupHeading, { marginTop: spacing.lg }]}>Occupied / Reserved / Out of Service</Text>
      {unavailable.length === 0 ? (
        <Text style={styles.emptyText}>Every room is currently vacant.</Text>
      ) : (
        unavailable.map((room) => (
          <RoomRow
            key={room.roomNumber}
            room={room}
            showStatus
            isUpdating={updatingRoomNumber === room.roomNumber}
            onStatusChange={(status) => onStatusChange(room, status)}
          />
        ))
      )}
    </View>
  );
}

// The 4 statuses an admin sets directly from this screen. The 4
// housekeeping sub-states (Inspect / Needs Cleaning Again / Start
// Cleaning / In Progress) are intentionally excluded here — they're
// already fully manageable from Housekeeping → Room Cleaning Status, and
// exposing them as chips here too would let staff jump a room straight
// into "In Progress" without going through the actual cleaning cycle.
const ADMIN_STATUS_KEYS = [
  ROOM_STATUS.OCCUPIED,
  ROOM_STATUS.VACANT,
  ROOM_STATUS.RESERVED,
  ROOM_STATUS.MAINTENANCE,
];

// Icon + short button label for each of the 4 staff-settable statuses —
// used by the status summary cards and the always-visible status control
// buttons on each room card below. Kept separate from STATUS_META's own
// `label`, which is deliberately longer for other screens (e.g. "Vacant
// (Ready for Guest)") than what a compact button here has room for.
const STATUS_SUMMARY_ICONS = {
  [ROOM_STATUS.OCCUPIED]: 'person-outline',
  [ROOM_STATUS.VACANT]: 'checkmark-circle-outline',
  [ROOM_STATUS.RESERVED]: 'bookmark-outline',
  [ROOM_STATUS.MAINTENANCE]: 'construct-outline',
};
const STATUS_BUTTON_LABELS = {
  [ROOM_STATUS.OCCUPIED]: 'Occupied',
  [ROOM_STATUS.VACANT]: 'Vacant',
  [ROOM_STATUS.RESERVED]: 'Reserved',
  [ROOM_STATUS.MAINTENANCE]: 'Out of Service',
};
const STATUS_SORT_OPTIONS = [
  { value: 'roomNumber', label: 'Room Number' },
  { value: 'status', label: 'Status' },
  { value: 'floor', label: 'Floor' },
];

function StatusSection({ rooms, updatingRoomNumber, onStatusChange }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [sortBy, setSortBy] = useState('roomNumber');
  // Same own-width-measured responsive grid as Room Types (onLayout, not
  // useWindowDimensions — the sidebar's width isn't visible from this
  // file), capped at 2 columns instead of 3: these cards carry more
  // per-room detail (amenities + 4 always-visible status buttons) than a
  // room-type card, so each one needs more room to stay readable.
  const [gridWidth, setGridWidth] = useState(0);

  const counts = useMemo(() => {
    const c = {};
    ADMIN_STATUS_KEYS.forEach((key) => { c[key] = 0; });
    rooms.forEach((room) => { if (c[room.status] !== undefined) c[room.status] += 1; });
    return c;
  }, [rooms]);

  const floorOptions = useMemo(() => {
    const distinct = Array.from(new Set(rooms.map((r) => r.floor).filter(Boolean)));
    return [{ value: 'all', label: 'All Floors' }, ...distinct.map((f) => ({ value: f, label: f }))];
  }, [rooms]);

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All Statuses' },
      ...ADMIN_STATUS_KEYS.map((key) => ({ value: key, label: STATUS_BUTTON_LABELS[key] })),
    ],
    []
  );

  // Rooms mid-way through the housekeeping cleaning cycle (a known
  // STATUS_META status that isn't one of the 4 admin-settable ones) still
  // show up here so search/filters never silently drop a room — the card
  // itself swaps the button row for a read-only note for those.
  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rooms.filter((room) => {
      if (statusFilter !== 'all' && room.status !== statusFilter) return false;
      if (floorFilter !== 'all' && room.floor !== floorFilter) return false;
      if (!q) return true;
      const haystack = [room.roomNumber, room.roomTypeName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
    if (sortBy === 'status') {
      list = [...list].sort((a, b) => (a.status || '').localeCompare(b.status || ''));
    } else if (sortBy === 'floor') {
      list = [...list].sort((a, b) => (a.floor || '').localeCompare(b.floor || ''));
    } else {
      list = [...list].sort((a, b) =>
        String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true })
      );
    }
    return list;
  }, [rooms, search, statusFilter, floorFilter, sortBy]);

  const columns = gridWidth >= 760 ? 2 : 1;
  const cardGap = spacing.md;
  const cardWidth = gridWidth > 0 ? (gridWidth - cardGap * (columns - 1)) / columns : undefined;

  return (
    <View>
      <View style={styles.statusSummaryRow}>
        {ADMIN_STATUS_KEYS.map((key) => {
          const meta = STATUS_META[key];
          return (
            <View key={key} style={[styles.statusSummaryCard, { borderLeftColor: meta.color }]}>
              <View style={[styles.statusSummaryIconBadge, { backgroundColor: meta.bg }]}>
                <Ionicons name={STATUS_SUMMARY_ICONS[key]} size={16} color={meta.color} />
              </View>
              <View>
                <Text style={[styles.statusSummaryCount, { color: meta.color }]}>{counts[key]}</Text>
                <Text style={styles.statusSummaryLabel}>{STATUS_BUTTON_LABELS[key]}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by room number or room type..."
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <FilterDropdown label="All Statuses" value={statusFilter} options={statusFilterOptions} onChange={setStatusFilter} />
        <FilterDropdown label="All Floors" value={floorFilter} options={floorOptions} onChange={setFloorFilter} />
        <FilterDropdown label="Room Number" value={sortBy} options={STATUS_SORT_OPTIONS} onChange={setSortBy} />
      </View>

      {filteredRooms.length === 0 ? (
        <Text style={styles.emptyText}>No rooms match your search or filters.</Text>
      ) : (
        <View style={styles.statusGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {filteredRooms.map((room) => (
            <RoomStatusCard
              key={room.roomNumber}
              room={room}
              width={cardWidth}
              isUpdating={updatingRoomNumber === room.roomNumber}
              onStatusChange={(status) => onStatusChange(room, status)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// Compact status-management card: room info + amenities on top, then
// either the 4 always-visible status buttons (admin-settable rooms) or a
// read-only note (rooms mid-housekeeping-cycle — see the safeguard
// comment above ADMIN_STATUS_KEYS). Clicking a button calls onStatusChange
// immediately, the same updateRoomStatus path every other status control
// on this screen already uses.
function RoomStatusCard({ room, width, isUpdating, onStatusChange }) {
  const meta = statusMeta(room.status);
  const isAdminStatus = ADMIN_STATUS_KEYS.includes(room.status);
  const isCleaningCycle = !!STATUS_META[room.status] && !isAdminStatus;

  const firstImage = room.images && room.images.length > 0 ? room.images[0] : null;
  const inclusions = room.inclusions || [];
  const hasWifi = inclusions.some((i) => /wi-?fi/i.test(i));
  const hasAC = inclusions.some((i) => /air.?condition|\bac\b/i.test(i));

  return (
    <View style={[styles.statusCard, width ? { width } : { minWidth: 300, flexGrow: 1 }]}>
      <View style={styles.statusCardTopRow}>
        {firstImage ? (
          <Image source={firstImage.source ? firstImage.source : { uri: firstImage.uri }} style={styles.statusCardThumb} />
        ) : (
          <View style={[styles.statusCardThumb, styles.statusCardThumbPlaceholder]}>
            <Ionicons name="image-outline" size={16} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.statusCardTitleBlock}>
          <Text style={styles.statusCardTitle} numberOfLines={1}>Room {room.roomNumber} · {room.roomTypeName}</Text>
          {room.floor ? <Text style={styles.statusCardFloor} numberOfLines={1}>{room.floor}</Text> : null}
        </View>
        <View style={[styles.statusPill, styles.statusCardBadge, { backgroundColor: meta.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.statusPillText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.gridAmenityRow}>
        {room.bed ? <Amenity icon="bed-outline" label={room.bed} /> : null}
        {room.occupancy ? <Amenity icon="people-outline" label={room.occupancy} /> : null}
        {hasWifi ? <Amenity icon="wifi-outline" label="Wi-Fi" /> : null}
        {hasAC ? <Amenity icon="snow-outline" label="AC" /> : null}
      </View>

      {isCleaningCycle ? (
        <Text style={styles.statusCardHousekeepingNote}>
          In housekeeping cycle — managed from Housekeeping → Room Cleaning Status.
        </Text>
      ) : (
        <View style={styles.statusControlRow}>
          {isUpdating ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            ADMIN_STATUS_KEYS.map((key) => (
              <StatusControlButton
                key={key}
                statusKey={key}
                active={room.status === key}
                onPress={() => onStatusChange(key)}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// Pressable (not TouchableOpacity) — same reasoning as RoomTabButton/
// KebabButton above: react-native-web only fires onHoverIn/onHoverOut on
// Pressable for a mouse pointer, so this is simply inert (never fires) on
// a touch device, no platform check needed. Hover previews the status
// color as an outline + tinted text; the filled background stays
// reserved for the room's actual current status, so "hovering Vacant"
// and "this room is Vacant" never look identical.
function StatusControlButton({ statusKey, active, onPress }) {
  const [hovered, setHovered] = useState(false);
  const meta = STATUS_META[statusKey];
  const highlighted = active || hovered;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.statusControlBtn,
        highlighted && { borderColor: meta.color },
        active && { backgroundColor: meta.bg },
      ]}
    >
      <View style={[styles.statusControlDot, { backgroundColor: meta.color }]} />
      <Text
        style={[styles.statusControlText, highlighted && { color: meta.color, fontFamily: fonts.bodySemiBold }]}
        numberOfLines={1}
      >
        {STATUS_BUTTON_LABELS[statusKey]}
      </Text>
    </Pressable>
  );
}

function MaintenanceSection({ rooms, updatingRoomNumber, onStatusChange }) {
  const maintenanceRooms = rooms.filter((r) => r.status === ROOM_STATUS.MAINTENANCE);
  const otherRooms = rooms.filter((r) => r.status !== ROOM_STATUS.MAINTENANCE);

  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  // The room currently being flagged (opens FlagMaintenanceModal below) —
  // holding the room object itself, not just its number, so the modal has
  // everything it needs without a second lookup.
  const [flaggingRoom, setFlaggingRoom] = useState(null);
  // Same own-width-measured responsive grid as Room Types/Room Status.
  const [gridWidth, setGridWidth] = useState(0);

  const floorOptions = useMemo(() => {
    const distinct = Array.from(new Set(otherRooms.map((r) => r.floor).filter(Boolean)));
    return [{ value: 'all', label: 'All Floors' }, ...distinct.map((f) => ({ value: f, label: f }))];
  }, [otherRooms]);

  const filteredOtherRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return otherRooms.filter((room) => {
      if (floorFilter !== 'all' && room.floor !== floorFilter) return false;
      if (!q) return true;
      const haystack = [room.roomNumber, room.roomTypeName].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [otherRooms, search, floorFilter]);

  const columns = gridWidth >= 860 ? 3 : gridWidth >= 560 ? 2 : 1;
  const cardGap = spacing.md;
  const cardWidth = gridWidth > 0 ? (gridWidth - cardGap * (columns - 1)) / columns : undefined;

  return (
    <View>
      {maintenanceRooms.length === 0 ? (
        <Text style={styles.emptyText}>No rooms are currently under maintenance.</Text>
      ) : (
        <View style={styles.maintenanceCardStack}>
          {maintenanceRooms.map((room) => (
            <MaintenanceCard
              key={room.roomNumber}
              room={room}
              isUpdating={updatingRoomNumber === room.roomNumber}
              onRepair={() => onStatusChange(room, ROOM_STATUS.VACANT, { maintenanceNote: '' })}
            />
          ))}
        </View>
      )}

      <Text style={styles.groupHeading}>Other Rooms</Text>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by room number or room type..."
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <FilterDropdown label="All Floors" value={floorFilter} options={floorOptions} onChange={setFloorFilter} />
      </View>

      {filteredOtherRooms.length === 0 ? (
        <Text style={styles.emptyText}>No rooms match your search or filters.</Text>
      ) : (
        <View style={styles.maintenanceGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {filteredOtherRooms.map((room) => (
            <MaintenanceRoomCard
              key={room.roomNumber}
              room={room}
              width={cardWidth}
              onFlag={() => setFlaggingRoom(room)}
            />
          ))}
        </View>
      )}

      <FlagMaintenanceModal
        visible={!!flaggingRoom}
        room={flaggingRoom}
        onClose={() => setFlaggingRoom(null)}
        onConfirm={async (note) => {
          await onStatusChange(flaggingRoom, ROOM_STATUS.MAINTENANCE, { maintenanceNote: note });
          setFlaggingRoom(null);
        }}
      />
    </View>
  );
}

// A room actively out of service — shown full-width and stacked (rather
// than in the dense grid below) since there are usually very few of
// these at once and each one needs its note and action to stay clearly
// visible, not scanned quickly like the room list below it.
function MaintenanceCard({ room, isUpdating, onRepair }) {
  const meta = STATUS_META[ROOM_STATUS.MAINTENANCE];
  return (
    <View style={[styles.statusCard, styles.maintenanceCard, { borderLeftColor: meta.color }]}>
      <View style={styles.statusCardTopRow}>
        <View style={[styles.statusSummaryIconBadge, { backgroundColor: meta.bg }]}>
          <Ionicons name="construct-outline" size={16} color={meta.color} />
        </View>
        <View style={styles.statusCardTitleBlock}>
          <Text style={styles.statusCardTitle} numberOfLines={1}>Room {room.roomNumber} · {room.roomTypeName}</Text>
          {room.floor ? <Text style={styles.statusCardFloor} numberOfLines={1}>{room.floor}</Text> : null}
        </View>
        <View style={[styles.statusPill, styles.statusCardBadge, { backgroundColor: meta.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.statusPillText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
        </View>
      </View>

      {room.maintenanceNote ? (
        <Text style={styles.maintenanceNote}>{room.maintenanceNote}</Text>
      ) : (
        <Text style={styles.maintenanceNoteMuted}>No maintenance note provided.</Text>
      )}

      <TouchableOpacity
        style={[styles.repairBtn, isUpdating && styles.clearBtnDisabled]}
        onPress={onRepair}
        disabled={isUpdating}
        activeOpacity={0.85}
      >
        {isUpdating ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={15} color={colors.white} />
            <Text style={styles.repairBtnText}>Mark as Repaired · Set Vacant</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// Dense grid card for every room NOT currently under maintenance — same
// compact info layout as RoomStatusCard (thumbnail + title/floor +
// amenities) but with a single "Flag Out of Service" action instead of a
// 4-way status control row, since that's the only transition this section
// cares about.
function MaintenanceRoomCard({ room, width, onFlag }) {
  const firstImage = room.images && room.images.length > 0 ? room.images[0] : null;
  const inclusions = room.inclusions || [];
  const hasWifi = inclusions.some((i) => /wi-?fi/i.test(i));
  const hasAC = inclusions.some((i) => /air.?condition|\bac\b/i.test(i));

  return (
    <View style={[styles.statusCard, width ? { width } : { minWidth: 220, flexGrow: 1 }]}>
      <View style={styles.statusCardTopRow}>
        {firstImage ? (
          <Image source={firstImage.source ? firstImage.source : { uri: firstImage.uri }} style={styles.statusCardThumb} />
        ) : (
          <View style={[styles.statusCardThumb, styles.statusCardThumbPlaceholder]}>
            <Ionicons name="image-outline" size={16} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.statusCardTitleBlock}>
          <Text style={styles.statusCardTitle} numberOfLines={1}>Room {room.roomNumber} · {room.roomTypeName}</Text>
          {room.floor ? <Text style={styles.statusCardFloor} numberOfLines={1}>{room.floor}</Text> : null}
        </View>
      </View>

      <View style={styles.gridAmenityRow}>
        {room.bed ? <Amenity icon="bed-outline" label={room.bed} /> : null}
        {room.occupancy ? <Amenity icon="people-outline" label={room.occupancy} /> : null}
        {hasWifi ? <Amenity icon="wifi-outline" label="Wi-Fi" /> : null}
        {hasAC ? <Amenity icon="snow-outline" label="AC" /> : null}
      </View>

      <FlagButton onPress={onFlag} />
    </View>
  );
}

// Pressable (not TouchableOpacity) so hover works — same reasoning as
// every other hoverable control in this file: react-native-web only
// fires onHoverIn/onHoverOut on Pressable for a mouse pointer, so this is
// simply inert (never fires) on a touch device, no platform check needed.
function FlagButton({ onPress }) {
  const [hovered, setHovered] = useState(false);
  const meta = STATUS_META[ROOM_STATUS.MAINTENANCE];
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.flagBtn, hovered && { backgroundColor: meta.bg, borderColor: meta.color }]}
    >
      <Ionicons name="construct-outline" size={13} color={hovered ? meta.color : colors.textMuted} />
      <Text style={[styles.flagBtnText, hovered && { color: meta.color }]}>Flag Out of Service</Text>
    </Pressable>
  );
}

// Lightweight "why" prompt so flagging a room actually records a
// maintenance note — previously nothing in this screen ever set one
// (only the Mark-as-Repaired action above ever touched the field, and
// only to clear it), so a flagged room always showed "No maintenance
// note provided." Same dialog language as AddRoomModal/RoomTypeModal.
function FlagMaintenanceModal({ visible, room, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setNote('');
  }, [visible]);

  const close = () => {
    setNote('');
    onClose();
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(note.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.dialogOverlay}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>Flag Room {room?.roomNumber} as Out of Service</Text>

          <Text style={styles.dialogFieldLabel}>Reason (optional)</Text>
          <TextInput
            style={[styles.dialogInput, styles.typeDialogTextarea]}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. AC unit repair needed"
            placeholderTextColor={colors.disabled}
            multiline
          />

          <View style={styles.dialogActions}>
            <TouchableOpacity style={styles.dialogCancelBtn} onPress={close} disabled={submitting}>
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dialogSubmitBtn} onPress={handleConfirm} disabled={submitting}>
              {submitting
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Text style={styles.dialogSubmitText}>Flag Out of Service</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SectionIntro({ description }) {
  return (
    <View style={styles.sectionIntro}>
      <Text style={styles.sectionIntroDescription}>{description}</Text>
    </View>
  );
}

function RoomRow({ room, showStatus, editable, onlyMaintenanceToggle, chipOptions, isUpdating, onStatusChange }) {
  const meta = statusMeta(room.status);
  // The ⋮ menu (read-only rows only) reveals the same quick-edit chips an
  // `editable` row shows permanently — no new backend call, just a second
  // way to reach updateRoomStatus (via the onStatusChange this row was
  // already given) without cluttering every row with chips all the time.
  const [quickEdit, setQuickEdit] = useState(false);
  const canQuickEdit = showStatus && !editable && typeof onStatusChange === 'function';

  const chipsToShow = onlyMaintenanceToggle
    ? [ROOM_STATUS.MAINTENANCE]
    : chipOptions || Object.keys(STATUS_META);
  // Quick-edit from the ⋮ menu sticks to the same 4 staff-settable statuses
  // as the dedicated Room Status tab (ADMIN_STATUS_KEYS) — the housekeeping
  // sub-states stay off-limits here too, same reasoning as that tab.
  const quickEditChips = chipOptions || ADMIN_STATUS_KEYS;

  const firstImage = room.images && room.images.length > 0 ? room.images[0] : null;
  const inclusions = room.inclusions || [];
  const hasWifi = inclusions.some((i) => /wi-?fi/i.test(i));
  const hasAC = inclusions.some((i) => /air.?condition|\bac\b/i.test(i));

  return (
    <View style={styles.rowCard}>
      {firstImage ? (
        <Image
          source={firstImage.source ? firstImage.source : { uri: firstImage.uri }}
          style={styles.roomThumb}
        />
      ) : (
        <View style={styles.roomThumbPlaceholder}>
          <Ionicons name="image-outline" size={22} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.roomNumberChip}>
        <Text style={styles.roomNumberChipText}>{room.roomNumber}</Text>
      </View>

      <View style={styles.rowTitleBlock}>
        <Text style={styles.rowTitle} numberOfLines={1}>{room.roomTypeName}</Text>
        {room.floor ? <Text style={styles.rowFloor} numberOfLines={1}>{room.floor}</Text> : null}
      </View>

      <View style={styles.amenityRow}>
        {room.bed ? <Amenity icon="bed-outline" label={room.bed} /> : null}
        {room.occupancy ? <Amenity icon="people-outline" label={room.occupancy} /> : null}
        {hasWifi ? <Amenity icon="wifi-outline" label="Wi-Fi" /> : null}
        {hasAC ? <Amenity icon="snow-outline" label="AC" /> : null}
      </View>

      {showStatus && (
        <View style={styles.rowTrailing}>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
            <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {canQuickEdit && <KebabButton active={quickEdit} onPress={() => setQuickEdit((v) => !v)} />}
        </View>
      )}

      {editable && (
        <View style={styles.chipRow}>
          <StatusChips options={chipsToShow} currentStatus={room.status} isUpdating={isUpdating} onStatusChange={onStatusChange} />
        </View>
      )}

      {canQuickEdit && quickEdit && (
        <View style={styles.chipRow}>
          <StatusChips options={quickEditChips} currentStatus={room.status} isUpdating={isUpdating} onStatusChange={onStatusChange} />
        </View>
      )}
    </View>
  );
}

// Shared by RoomRow's `editable` chip row and its ⋮-menu quick-edit reveal
// (and reused by RoomGridCard below) — same status-chip button, several
// places it can appear.
function StatusChips({ options, currentStatus, isUpdating, onStatusChange }) {
  if (isUpdating) return <ActivityIndicator color={colors.primary} size="small" />;
  return options.map((key) => {
    const chipMeta = STATUS_META[key];
    const active = currentStatus === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => onStatusChange(key)}
        style={[
          styles.statusChip,
          { borderColor: chipMeta.color },
          active && { backgroundColor: chipMeta.bg },
        ]}
        activeOpacity={0.8}
      >
        <Text style={[styles.statusChipText, { color: chipMeta.color }]}>{chipMeta.label}</Text>
      </TouchableOpacity>
    );
  });
}

function Amenity({ icon, label }) {
  return (
    <View style={styles.amenityItem}>
      <Ionicons name={icon} size={14} color={colors.textMuted} />
      <Text style={styles.amenityText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function KebabButton({ onPress, active }) {
  const [hovered, setHovered] = useState(false);
  const on = active || hovered;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hitSlop={8}
      style={[styles.kebabBtn, on && styles.kebabBtnActive]}
    >
      <Ionicons name="ellipsis-vertical" size={16} color={on ? colors.primary : colors.textMuted} />
    </Pressable>
  );
}

// Grid-view counterpart to RoomRow — same data, same quick-edit-via-⋮
// pattern, laid out as a vertical card instead of a horizontal line. Only
// used by RoomListSection's view toggle, so it only needs the read-only
// (showStatus) case, not `editable`/`onlyMaintenanceToggle`.
function RoomGridCard({ room, isUpdating, onStatusChange }) {
  const meta = statusMeta(room.status);
  const [quickEdit, setQuickEdit] = useState(false);
  const firstImage = room.images && room.images.length > 0 ? room.images[0] : null;
  const inclusions = room.inclusions || [];
  const hasWifi = inclusions.some((i) => /wi-?fi/i.test(i));
  const hasAC = inclusions.some((i) => /air.?condition|\bac\b/i.test(i));

  return (
    <View style={styles.gridCard}>
      {firstImage ? (
        <Image source={firstImage.source ? firstImage.source : { uri: firstImage.uri }} style={styles.gridImage} />
      ) : (
        <View style={[styles.gridImage, styles.gridImagePlaceholder]}>
          <Ionicons name="image-outline" size={28} color={colors.textMuted} />
        </View>
      )}

      <View style={styles.gridBody}>
        <View style={styles.gridTitleRow}>
          <View style={styles.roomNumberChip}>
            <Text style={styles.roomNumberChipText}>{room.roomNumber}</Text>
          </View>
          <KebabButton active={quickEdit} onPress={() => setQuickEdit((v) => !v)} />
        </View>

        <Text style={[styles.rowTitle, styles.gridTitleText]} numberOfLines={1}>{room.roomTypeName}</Text>
        {room.floor ? <Text style={styles.rowFloor}>{room.floor}</Text> : null}

        <View style={[styles.statusPill, styles.gridStatusPill, { backgroundColor: meta.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
        </View>

        <View style={styles.gridAmenityRow}>
          {room.bed ? <Amenity icon="bed-outline" label={room.bed} /> : null}
          {room.occupancy ? <Amenity icon="people-outline" label={room.occupancy} /> : null}
          {hasWifi ? <Amenity icon="wifi-outline" label="Wi-Fi" /> : null}
          {hasAC ? <Amenity icon="snow-outline" label="AC" /> : null}
        </View>

        {quickEdit && (
          <View style={[styles.chipRow, styles.gridChipRowFix]}>
            <StatusChips options={ADMIN_STATUS_KEYS} currentStatus={room.status} isUpdating={isUpdating} onStatusChange={onStatusChange} />
          </View>
        )}
      </View>
    </View>
  );
}

// Pressable (not TouchableOpacity) specifically so the hover state below
// works — react-native-web fires onHoverIn/onHoverOut on Pressable for a
// mouse pointer; there's no touch equivalent, so this is simply inert
// (never fires) on a phone/tablet, no platform check needed.
function RoomTabButton({ tab, active, onPress }) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !active;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.tabBtn, active && styles.tabBtnActive, showHover && styles.tabBtnHovered]}
    >
      <Ionicons
        name={tab.icon}
        size={14}
        color={active ? colors.onPrimary : showHover ? colors.primary : colors.textMuted}
      />
      <Text
        numberOfLines={1}
        style={[styles.tabBtnText, active && styles.tabBtnTextActive, showHover && styles.tabBtnTextHovered]}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  tabBarWrap: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBarContent: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  // Hover only ever fires on web (react-native-web) — mouse-only, so it
  // naturally never triggers on a touch device. Skipped entirely when the
  // tab is already active, since the active style already gives feedback.
  tabBtnHovered: {
    backgroundColor: colors.primaryTint,
    borderColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 12,
    fontFamily: fonts.bodySemiBold,
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: colors.onPrimary,
  },
  tabBtnTextHovered: {
    color: colors.primary,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontFamily: fonts.headingExtraBold, color: colors.primary },
  subtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reseedButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reseedText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.textMuted },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyStateTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text, marginBottom: spacing.sm },
  emptyStateText: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.lg,
    maxWidth: 420,
  },
  seedBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedBtnDisabled: { opacity: 0.7 },
  seedBtnText: { color: colors.white, fontSize: 13, fontFamily: fonts.headingSemiBold, letterSpacing: 0.3 },

  content: { flex: 1 },
  contentInner: { padding: spacing.lg, paddingBottom: spacing.xxl },

  sectionIntro: { marginBottom: spacing.lg },
  sectionIntroDescription: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  addRoomBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: 999,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  addRoomBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },
  addTypeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: TYPE_GOLD, borderRadius: 999,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
    position: 'relative',
    zIndex: 30,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexGrow: 1,
    flexBasis: 240,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'web' ? spacing.sm : spacing.sm - 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },

  filterWrap: { position: 'relative', zIndex: 10 },
  filterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minWidth: 150,
  },
  filterTriggerText: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.text },
  filterMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    shadowColor: '#332B22',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    zIndex: 20,
  },
  filterMenuScroll: { maxHeight: 240 },
  filterOption: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  filterOptionActive: { backgroundColor: colors.primaryTint },
  filterOptionText: { fontSize: 13, fontFamily: fonts.body, color: colors.text },
  filterOptionTextActive: { fontFamily: fonts.bodySemiBold, color: colors.primary },

  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    overflow: 'hidden',
  },
  viewToggleBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  viewToggleBtnActive: { backgroundColor: colors.primary },

  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },

  dialogOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  dialogCard: { width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl },
  dialogTitle: { fontSize: 17, fontFamily: fonts.headingBold, color: colors.primary, marginBottom: spacing.md },
  dialogFieldLabel: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.sm },
  dialogInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    fontSize: 13, fontFamily: fonts.body, color: colors.text, backgroundColor: colors.cardAlt,
  },
  dialogChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  dialogChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: spacing.md, backgroundColor: colors.cardAlt },
  dialogChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dialogChipText: { fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.text },
  dialogChipTextActive: { color: colors.white, fontFamily: fonts.bodySemiBold },
  dialogHint: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, fontStyle: 'italic' },
  dialogError: { fontSize: 12, fontFamily: fonts.body, color: '#B3261E', marginTop: spacing.md },
  dialogActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  dialogCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  dialogCancelText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
  dialogSubmitBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  dialogSubmitText: { fontSize: 13, fontFamily: fonts.bodySemiBold, color: colors.white },

  // Room Type add/edit form — same dialog language as AddRoomModal above,
  // just taller (9 fields vs. 3) so it gets its own card with a capped
  // height and an internal scroll area instead of overflowing the modal.
  typeDialogCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  // flex:1 (not flexGrow:0) is what actually makes this scroll: it fills
  // whatever room is left between the fixed title and the fixed action
  // row within typeDialogCard's maxHeight, so 9 fields of content scroll
  // inside that space instead of pushing Cancel/Save off-screen.
  typeDialogScroll: { flex: 1 },
  typeDialogRow: { flexDirection: 'row', gap: spacing.sm },
  typeDialogCol: { flex: 1 },
  typeDialogTextarea: { minHeight: 60, textAlignVertical: 'top' },

  emptyText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: spacing.sm },

  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTopRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbFallbackIcon: { fontSize: 28 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.text, marginBottom: 2 },
  cardMeta: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  price: { fontSize: 14, fontFamily: fonts.headingExtraBold, color: colors.accent },
  perNight: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted },
  strikePrice: { fontSize: 10, fontFamily: fonts.body, color: colors.priceStrike, textDecorationLine: 'line-through' },
  idTag: { fontSize: 10, fontFamily: fonts.body, color: colors.textMuted, marginTop: 4 },
  description: { fontSize: 12, fontFamily: fonts.body, color: colors.text, marginTop: spacing.md, lineHeight: 18 },

  inclusionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  inclusionChip: {
    backgroundColor: colors.cardAlt,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  inclusionChipText: { fontSize: 10, fontFamily: fonts.body, color: colors.text },

  roomNumberBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomNumberText: { fontSize: 15, fontFamily: fonts.headingExtraBold, color: colors.primary },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusPillText: { fontSize: 13, fontFamily: fonts.bodySemiBold },

  maintenanceNote: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.text,
    marginTop: spacing.md,
    backgroundColor: '#fef3c7',
    padding: spacing.sm,
    borderRadius: radius.sm,
    lineHeight: 18,
  },
  maintenanceNoteMuted: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },
  clearBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnDisabled: { opacity: 0.7 },
  clearBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.primary },

  summaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  summaryNumber: { fontSize: 24, fontFamily: fonts.headingExtraBold },
  summaryLabel: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted, marginTop: 2 },

  groupHeading: {
    fontSize: 12,
    fontFamily: fonts.headingSemiBold,
    color: colors.text,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
    shadowColor: '#332B22',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  roomThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
  },
  roomThumbPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomNumberChip: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minWidth: 52,
    alignItems: 'center',
  },
  roomNumberChipText: { fontSize: 14, fontFamily: fonts.headingExtraBold, color: colors.primary },
  rowTitleBlock: { minWidth: 110 },
  rowTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.text },
  rowFloor: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, marginTop: 2 },

  amenityRow: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.lg,
  },
  amenityItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  amenityText: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },

  rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kebabBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kebabBtnActive: { backgroundColor: colors.primaryTint },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flexBasis: '100%', marginTop: spacing.sm },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  statusChipText: { fontSize: 11, fontFamily: fonts.bodySemiBold },

  gridCard: {
    flexGrow: 1,
    flexBasis: 260,
    maxWidth: 340,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#332B22',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  gridImage: { width: '100%', height: 140, backgroundColor: colors.cardAlt },
  gridImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  gridBody: { padding: spacing.md, gap: spacing.sm },
  gridTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gridTitleText: { fontSize: 15 },
  gridStatusPill: { alignSelf: 'flex-start' },
  gridAmenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridChipRowFix: { flexBasis: 'auto' },

  // ── Room Types grid ──────────────────────────────────────────────────
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  typeCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#332B22',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  typeCardImage: { width: '100%', height: 160, backgroundColor: colors.cardAlt },
  typeCardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  typeCardBody: { padding: spacing.md, gap: 6 },
  typeCardTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.text },
  typeCardSpecs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  typeCardPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  typeCardPrice: { fontSize: 18, fontFamily: fonts.headingExtraBold, color: TYPE_GOLD },
  typeCardPerNight: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted },
  typeCardStrikePrice: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    marginLeft: 2,
  },
  typeCardFloor: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  typeCardDescription: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted, lineHeight: 17, marginTop: 2 },
  typeCardChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  typeCardChip: {
    backgroundColor: TYPE_BLUE_TINT,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    maxWidth: '100%',
  },
  typeCardChipText: { fontSize: 10, fontFamily: fonts.bodyMedium, color: TYPE_BLUE },
  typeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  typeCardCountTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  typeCardCountText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: TYPE_BLUE },
  typeCardActions: { flexDirection: 'row', gap: spacing.xs },
  typeEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: TYPE_BLUE, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: spacing.sm,
  },
  typeEditBtnText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: TYPE_BLUE },
  typeDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.danger, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    minWidth: 32, justifyContent: 'center',
  },
  typeDeleteBtnText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.danger },

  // ── Room Status dashboard ────────────────────────────────────────────
  statusSummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  statusSummaryCard: {
    flexGrow: 1,
    flexBasis: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    shadowColor: '#332B22',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statusSummaryIconBadge: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSummaryCount: { fontSize: 17, fontFamily: fonts.headingExtraBold },
  statusSummaryLabel: { fontSize: 11, fontFamily: fonts.bodyMedium, color: colors.textMuted },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statusCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statusCardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  statusCardThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.cardAlt },
  statusCardThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  statusCardTitleBlock: { flex: 1, minWidth: 0 },
  statusCardTitle: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.text },
  statusCardFloor: { fontSize: 11, fontFamily: fonts.body, color: colors.textMuted, marginTop: 1 },
  statusCardBadge: { paddingVertical: 6, paddingHorizontal: 10 },
  statusCardHousekeepingNote: {
    fontSize: 11,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    color: colors.textMuted,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  statusControlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 30, alignItems: 'center' },
  statusControlBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '22%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  statusControlDot: { width: 7, height: 7, borderRadius: 4 },
  statusControlText: { fontSize: 10, fontFamily: fonts.bodyMedium, color: colors.textMuted },

  // ── Room Maintenance ─────────────────────────────────────────────────
  maintenanceCardStack: { gap: spacing.md, marginBottom: spacing.lg },
  // Reuses the same statusCard shell as Room Status's cards, just with a
  // bolder left border (this IS the one status this whole page is about)
  // and a touch more internal spacing since it also carries a note.
  maintenanceCard: { borderLeftWidth: 4, padding: spacing.md, gap: spacing.sm },
  repairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.sm + 2,
  },
  repairBtnText: { fontSize: 12, fontFamily: fonts.bodySemiBold, color: colors.white },

  maintenanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  flagBtnText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: colors.textMuted },
});