import { supabase } from '../services/supabase';
import { getPlaceholderImages } from './Roomimageplaceholders';

/**
 * ROOM STATUS — see room_status enum in the Supabase schema for the full
 * 8-state workflow this drives. Same lifecycle as before the migration:
 *
 *   VACANT --(guest checks in)--> OCCUPIED
 *   OCCUPIED --(guest checks out)--> INSPECT
 *   INSPECT --(passes inspection)--> START_CLEANING
 *   INSPECT --(fails inspection)--> NEEDS_CLEANING_AGAIN
 *   NEEDS_CLEANING_AGAIN --(begin cleaning)--> START_CLEANING
 *   START_CLEANING --(cleaning underway)--> IN_PROGRESS
 *   IN_PROGRESS --(cleaning finished)--> VACANT
 *   VACANT --(manual, e.g. mid-stay re-clean)--> NEEDS_CLEANING_AGAIN
 *
 * RESERVED and MAINTENANCE are independent side-states set manually from
 * Room Management, same as before.
 *
 * MIGRATED TO SUPABASE. Every exported function below keeps the exact
 * same name and returns the exact same camelCase shape it did with
 * Firestore — RoomTypeRatesScreen.jsx, RoomManagementScreen.jsx,
 * RoomCleaningStatusScreen.jsx, and RoomSelectionScreen.jsx all import
 * only from this file and never touch the database directly, so NONE of
 * those screens needed to change for this migration. All the snake_case
 * <-> camelCase translation happens right here.
 *
 * FIXED BUG carried over from Firestore: `deletedAt` (soft-delete) used
 * to be written by deleteRoomType() but never actually filtered out of
 * any read — so a "deleted" room type never really disappeared from any
 * screen. subscribeToRoomTypes() below now filters deleted_at is null.
 */
export const ROOM_STATUS = {
  OCCUPIED: 'occupied',
  INSPECT: 'inspect',
  NEEDS_CLEANING_AGAIN: 'needs_cleaning_again',
  START_CLEANING: 'start_cleaning',
  IN_PROGRESS: 'in_progress',
  VACANT: 'vacant',
  RESERVED: 'reserved',
  MAINTENANCE: 'maintenance',
};

export const STATUS_META = {
  [ROOM_STATUS.OCCUPIED]:             { label: 'Occupied',                 color: '#dc2626', bg: '#fee2e2' },
  [ROOM_STATUS.INSPECT]:              { label: 'Inspect',                  color: '#7c3aed', bg: '#ede9fe' },
  [ROOM_STATUS.NEEDS_CLEANING_AGAIN]: { label: 'Needs Cleaning Again',     color: '#dc2626', bg: '#fee2e2' },
  [ROOM_STATUS.START_CLEANING]:       { label: 'Start Cleaning',           color: '#d97706', bg: '#fef3c7' },
  [ROOM_STATUS.IN_PROGRESS]:          { label: 'In Progress',              color: '#d97706', bg: '#fef3c7' },
  [ROOM_STATUS.VACANT]:               { label: 'Vacant (Ready for Guest)', color: '#16a34a', bg: '#dcfce7' },
  [ROOM_STATUS.RESERVED]:             { label: 'Reserved',                 color: '#7c3aed', bg: '#ede9fe' },
  [ROOM_STATUS.MAINTENANCE]:          { label: 'Out of Service',           color: '#d97706', bg: '#fef3c7' },
};

const UNKNOWN_STATUS_META = { label: 'Unknown Status', color: '#6b7280', bg: '#e5e7eb' };
export const statusMeta = (status) => STATUS_META[status] || UNKNOWN_STATUS_META;

export const CLEANING_WORKFLOW_STATUSES = [
  ROOM_STATUS.INSPECT,
  ROOM_STATUS.NEEDS_CLEANING_AGAIN,
  ROOM_STATUS.START_CLEANING,
  ROOM_STATUS.IN_PROGRESS,
  ROOM_STATUS.VACANT,
];

export const NEXT_CLEANING_STATUS = {
  [ROOM_STATUS.INSPECT]:              ROOM_STATUS.START_CLEANING,
  [ROOM_STATUS.NEEDS_CLEANING_AGAIN]: ROOM_STATUS.START_CLEANING,
  [ROOM_STATUS.START_CLEANING]:       ROOM_STATUS.IN_PROGRESS,
  [ROOM_STATUS.IN_PROGRESS]:          ROOM_STATUS.VACANT,
};

export const CLEANING_ACTION_LABEL = {
  [ROOM_STATUS.INSPECT]:              'Start Cleaning',
  [ROOM_STATUS.NEEDS_CLEANING_AGAIN]: 'Start Cleaning',
  [ROOM_STATUS.START_CLEANING]:       'Mark In Progress',
  [ROOM_STATUS.IN_PROGRESS]:          'Mark Vacant (Ready for Guest)',
};

export function isAvailable(status) {
  return status === ROOM_STATUS.VACANT;
}

export function formatCurrency(amount) {
  return `₱${(amount ?? 0).toLocaleString()}`;
}

/* ── snake_case (DB) <-> camelCase (app) mapping ─────────────────────── */

function roomTypeToCamel(rt) {
  return {
    id: rt.id,
    name: rt.name,
    description: rt.description,
    price: rt.price,
    originalPrice: rt.original_price,
    bbPrice: rt.bb_price,
    bbOriginalPrice: rt.bb_original_price,
    note: rt.note,
    taxNote: rt.tax_note,
    size: rt.size,
    bed: rt.bed,
    occupancy: rt.occupancy,
    floor: rt.floor,
    inclusions: rt.inclusions || [],
    images: rt.images || [],
    isBookable: rt.is_bookable ?? true,
    createdAt: rt.created_at,
    updatedAt: rt.updated_at,
  };
}

function roomToCamel(r) {
  return {
    id: r.room_number,          // matches old behavior: Firestore doc ID was the room number
    roomNumber: r.room_number,
    roomTypeId: r.room_type_id,
    floor: r.floor,
    status: r.status,
    maintenanceNote: r.maintenance_note,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

/* ── Join helper — unchanged, pure JS, no DB calls ───────────────────── */

export function joinRoomsWithTypes(rooms, roomTypes) {
  const typesById = {};
  roomTypes.forEach((rt) => { typesById[rt.id] = rt; });

  return rooms.map((room) => {
    const type = typesById[room.roomTypeId] || null;
    return {
      id: room.roomNumber,
      roomNumber: room.roomNumber,
      roomTypeId: room.roomTypeId,
      floor: room.floor,
      status: room.status,
      maintenanceNote: room.maintenanceNote,
      roomTypeName: type ? type.name : 'Unknown Type',
      price: type ? type.price : null,
      originalPrice: type ? type.originalPrice : null,
      bbPrice: type ? type.bbPrice : undefined,
      bbOriginalPrice: type ? type.bbOriginalPrice : undefined,
      description: type ? type.description : '',
      size: type ? type.size : '',
      bed: type ? type.bed : '',
      occupancy: type ? type.occupancy : '',
      note: type ? type.note : '',
      taxNote: type ? type.taxNote : '',
      inclusions: type ? type.inclusions || [] : [],
      images: type ? type.images || [] : [],
      available: isAvailable(room.status),
    };
  });
}

/* ── Real-time subscriptions ─────────────────────────────────────────── */

export function subscribeToRoomTypes(onData, onError) {
  const load = async () => {
    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .is('deleted_at', null) // fixes the dormant soft-delete bug — see file header
      .order('name');
    if (error) {
      console.error('Failed to load room_types:', error);
      if (onError) onError(error);
      return;
    }
    onData((data || []).map(roomTypeToCamel));
  };
  load();

  const channel = supabase
    .channel('room_types-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_types' }, load)
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToRooms(onData, onError) {
  const load = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('room_number');
    if (error) {
      console.error('Failed to load rooms:', error);
      if (onError) onError(error);
      return;
    }
    onData((data || []).map(roomToCamel));
  };
  load();

  const channel = supabase
    .channel('rooms-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, load)
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/* ── Mutations ────────────────────────────────────────────────────────── */

// Single write path for the status field, same role as before. `extra`
// only ever carries { maintenanceNote } in practice (from
// RoomManagementScreen's "clear note on mark vacant" action) — mapped to
// snake_case here.
export async function updateRoomStatus(roomNumber, status, extra = {}) {
  const patch = { status, updated_at: new Date().toISOString() };
  if ('maintenanceNote' in extra) patch.maintenance_note = extra.maintenanceNote;

  const { error } = await supabase
    .from('rooms')
    .update(patch)
    .eq('room_number', roomNumber);
  if (error) throw error;
}

export async function createRoomType(data) {
  const { data: inserted, error } = await supabase
    .from('room_types')
    .insert({
      name: data.name,
      description: data.description,
      price: data.price,
      original_price: data.originalPrice,
      bb_price: data.bbPrice,
      bb_original_price: data.bbOriginalPrice,
      note: data.note,
      tax_note: data.taxNote,
      size: data.size,
      bed: data.bed,
      occupancy: data.occupancy,
      floor: data.floor,
      inclusions: data.inclusions || [],
      images: data.images || [],
      is_bookable: data.isBookable ?? true,
    })
    .select('id')
    .single();
  if (error) throw error;
  await logRoomTypeAudit(inserted.id, data.name, 'created');
  return inserted.id;
}

export async function updateRoomType(roomTypeId, data, options = {}) {
  const patch = { updated_at: new Date().toISOString() };
  if ('name' in data) patch.name = data.name;
  if ('description' in data) patch.description = data.description;
  if ('price' in data) patch.price = data.price;
  if ('originalPrice' in data) patch.original_price = data.originalPrice;
  if ('bbPrice' in data) patch.bb_price = data.bbPrice;
  if ('bbOriginalPrice' in data) patch.bb_original_price = data.bbOriginalPrice;
  if ('note' in data) patch.note = data.note;
  if ('taxNote' in data) patch.tax_note = data.taxNote;
  if ('size' in data) patch.size = data.size;
  if ('bed' in data) patch.bed = data.bed;
  if ('occupancy' in data) patch.occupancy = data.occupancy;
  if ('floor' in data) patch.floor = data.floor;
  if ('inclusions' in data) patch.inclusions = data.inclusions;
  if ('images' in data) patch.images = data.images;
  if ('isBookable' in data) patch.is_bookable = data.isBookable;

  const { error } = await supabase.from('room_types').update(patch).eq('id', roomTypeId);
  if (error) throw error;

  if (options.skipAudit) return;

  // Name might not be part of this particular update — fetch it fresh
  // if needed, so the audit log always has a real name snapshot rather
  // than a blank one.
  let auditName = data.name;
  if (!auditName) {
    const { data: row } = await supabase.from('room_types').select('name').eq('id', roomTypeId).single();
    auditName = row?.name || 'Unknown room type';
  }
  const changedFields = Object.keys(patch).filter((k) => k !== 'updated_at');
  await logRoomTypeAudit(roomTypeId, auditName, 'updated', `Changed: ${changedFields.join(', ')}`);
}

// Writes one row to room_type_audit_log — called from create/update/
// delete below so every caller gets audit logging automatically,
// without each screen needing to remember to log it separately. Never
// throws: a logging failure shouldn't block the actual operation that
// already succeeded.
async function logRoomTypeAudit(roomTypeId, roomTypeName, action, details) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    let performedByName = user?.email || null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, first_name, last_name')
        .eq('id', user.id)
        .single();
      if (profile) {
        performedByName =
          profile.display_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || performedByName;
      }
    }
    await supabase.from('room_type_audit_log').insert({
      room_type_id: roomTypeId,
      room_type_name: roomTypeName,
      action,
      performed_by: user?.id || null,
      performed_by_name: performedByName,
      details: details || null,
    });
  } catch (err) {
    console.error('Failed to write room type audit log:', err);
  }
}

export async function deleteRoomType(roomTypeId) {
  const { data: roomTypeRow, error: nameError } = await supabase
    .from('room_types')
    .select('name')
    .eq('id', roomTypeId)
    .single();
  if (nameError) throw nameError;

  const { data: assignedRooms, error: checkError } = await supabase
    .from('rooms')
    .select('id')
    .eq('room_type_id', roomTypeId)
    .limit(1);
  if (checkError) throw checkError;

  if (assignedRooms && assignedRooms.length > 0) {
    const error = new Error('This room type cannot be deleted while rooms are assigned to it.');
    error.code = 'room-type/has-assigned-rooms';
    throw error;
  }

  const { error } = await supabase
    .from('room_types')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', roomTypeId);
  if (error) throw error;

  await logRoomTypeAudit(roomTypeId, roomTypeRow.name, 'deleted');
}

/* ── One-time seed ────────────────────────────────────────────────────── */

const SEED_ROOM_TYPES = [
  {
    placeholderKey: 'RM101',
    name: 'Twin',
    description: 'Two single beds, great for friends or colleagues sharing.',
    original_price: 2000,
    price: 1700,
    note: 'Book now, pay at hotel',
    tax_note: 'Excludes taxes and charges',
    size: '28 sqm',
    bed: '2 Single Beds',
    occupancy: '2 Adults',
    floor: 'Ground Floor',
    inclusions: [
      'Free Wi-Fi', 'Air conditioning', 'Flat-screen TV',
      'Private bathroom with hot & cold shower', 'Daily housekeeping',
    ],
  },
  {
    placeholderKey: 'RM102',
    name: 'King',
    description: 'One king-size bed, ideal for couples or solo travelers.',
    original_price: 2500,
    price: 2000,
    bb_price: 2400,
    bb_original_price: 3000,
    note: 'Book now, pay at hotel',
    tax_note: 'Excludes taxes and charges',
    size: '32 sqm',
    bed: '1 King Bed',
    occupancy: '2 Adults',
    floor: 'Ground Floor',
    inclusions: [
      'Free Wi-Fi', 'Air conditioning', 'Flat-screen TV',
      'Private bathroom with hot & cold shower', 'Daily housekeeping',
      'Mini refrigerator', 'City view window',
    ],
  },
  {
    placeholderKey: 'RM103',
    name: 'Single Room',
    description: 'One single bed, ideal for solo travelers and short stays.',
    original_price: 1500,
    price: 1200,
    note: 'Book now, pay at hotel',
    tax_note: 'Excludes taxes and charges',
    size: '20 sqm',
    bed: '1 Single Bed',
    occupancy: '1 Adult',
    floor: 'Ground Floor',
    inclusions: [
      'Free Wi-Fi', 'Air conditioning', 'Flat-screen TV',
      'Private bathroom with hot & cold shower', 'Daily housekeeping',
    ],
  },
];

const SEED_ROOMS_BY_TYPE_NAME = [
  { roomNumber: '101', typeName: 'Twin',        floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
  { roomNumber: '102', typeName: 'Twin',        floor: 'Ground Floor', status: ROOM_STATUS.OCCUPIED },
  { roomNumber: '103', typeName: 'Twin',        floor: 'Ground Floor', status: ROOM_STATUS.RESERVED },
  { roomNumber: '104', typeName: 'Single Room', floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
  {
    roomNumber: '105', typeName: 'King', floor: 'Ground Floor', status: ROOM_STATUS.MAINTENANCE,
    maintenanceNote: 'AC unit repair — scheduled for completion this week.',
  },
  { roomNumber: '106', typeName: 'King', floor: 'Ground Floor', status: ROOM_STATUS.OCCUPIED },
  { roomNumber: '107', typeName: 'King', floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
  { roomNumber: '108', typeName: 'Twin', floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
];

// NOTE: room type IDs are now Postgres-generated UUIDs instead of the
// fixed 'RM101'/'RM102'/'RM103' strings Firestore used, so seeding looks
// types up by name after inserting them, then wires rooms to those IDs.
// Adds a single physical room — e.g. "Room 109" — to an existing room
// type. New rooms default to VACANT (ready to use) since there's no
// prior guest/cleaning history to account for; front desk can change
// that afterward from Room Status if it actually needs inspecting first
// (e.g. a newly renovated room).
export async function createRoom({ roomNumber, roomTypeId, floor, status }) {
  const { error } = await supabase.from('rooms').insert({
    room_number: roomNumber,
    room_type_id: roomTypeId,
    floor: floor || null,
    status: status || ROOM_STATUS.VACANT,
  });
  if (error) throw error;
}

export async function seedInitialRooms() {
  const insertedTypes = {};
  for (const { placeholderKey, ...rt } of SEED_ROOM_TYPES) {
    const { data, error } = await supabase
      .from('room_types')
      .insert({ ...rt, images: getPlaceholderImages(placeholderKey) })
      .select('id, name')
      .single();
    if (error) throw error;
    insertedTypes[data.name] = data.id;
  }

  const roomRows = SEED_ROOMS_BY_TYPE_NAME.map(({ roomNumber, typeName, floor, status, maintenanceNote }) => ({
    room_number: roomNumber,
    room_type_id: insertedTypes[typeName],
    floor,
    status,
    maintenance_note: maintenanceNote || null,
  }));

  const { error: roomsError } = await supabase.from('rooms').insert(roomRows);
  if (roomsError) throw roomsError;
}