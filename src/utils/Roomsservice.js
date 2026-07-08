import {
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../services/firebase';

import { getPlaceholderImages } from './Roomimageplaceholders';

/**
 * Firestore-backed room data access layer.
 *
 * Two collections, matching the fixed-inventory model discussed for this
 * property:
 *
 *   roomTypes/{roomTypeId}   — the 3 room categories (Twin, King, Single
 *                              Room). Rarely changes; holds pricing,
 *                              amenities, images.
 *   rooms/{roomNumber}       — the 8 physical rooms. Each references a
 *                              roomTypeId. This is where day-to-day state
 *                              (status) lives and changes constantly.
 *
 * Both are FIXED-SIZE collections — this file intentionally has no
 * "create room" or "delete room" function for ongoing use. The only
 * mutation exposed for regular use is updateRoomStatus(), because status
 * is the one thing that legitimately changes minute-to-minute (a guest
 * checks in, housekeeping flags a repair, etc.). Room number, type, and
 * floor are set once via seedInitialRooms() (see bottom of this file) and
 * are not intended to change through the regular app UI afterwards.
 *
 * Every screen — admin Room Management AND the guest reservation flow —
 * reads through subscribeToRoomTypes / subscribeToRooms rather than
 * importing static data, so both sides of the app always see the same
 * live state.
 */

export const ROOM_STATUS = {
  VACANT: 'vacant',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
  MAINTENANCE: 'maintenance',
};

export const STATUS_META = {
  [ROOM_STATUS.VACANT]: { label: 'Vacant', color: '#16a34a', bg: '#dcfce7' },
  [ROOM_STATUS.OCCUPIED]: { label: 'Occupied', color: '#dc2626', bg: '#fee2e2' },
  [ROOM_STATUS.RESERVED]: { label: 'Reserved', color: '#7c3aed', bg: '#ede9fe' },
  [ROOM_STATUS.MAINTENANCE]: { label: 'Out of Service', color: '#d97706', bg: '#fef3c7' },
};

export const statusMeta = (status) => STATUS_META[status] || STATUS_META[ROOM_STATUS.VACANT];

// A room is bookable by a guest only when it's vacant. Centralized here
// so "availability" is always derived from status rather than stored as
// a second, potentially-inconsistent field.
export const isAvailable = (status) => status === ROOM_STATUS.VACANT;

export function formatCurrency(amount) {
  return `₱${(amount ?? 0).toLocaleString()}`;
}

/* ── Real-time subscriptions ─────────────────────────────────────────── */

// Calls onData(array) every time roomTypes changes, and keeps calling it
// live. Returns an unsubscribe function — call it on unmount.
export function subscribeToRoomTypes(onData, onError) {
  const q = query(collection(db, 'roomTypes'), orderBy('name'));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error('Failed to subscribe to roomTypes:', error);
      if (onError) onError(error);
    }
  );
}

// Calls onData(array) every time rooms changes, and keeps calling it live.
// Returns an unsubscribe function — call it on unmount.
export function subscribeToRooms(onData, onError) {
  const q = query(collection(db, 'rooms'), orderBy('roomNumber'));
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      console.error('Failed to subscribe to rooms:', error);
      if (onError) onError(error);
    }
  );
}

/* ── Join helper ──────────────────────────────────────────────────────── */

// Merges physical rooms with their room type's full display info (name,
// price, description, size/bed/occupancy, notes, amenities, images) so
// every screen — admin Room Management AND the guest-facing per-room
// cards — gets "complete" room data without that data being duplicated
// in Firestore itself. Pure function — safe to call with whatever the two
// subscriptions currently hold, on every render.
//
// `id` on the returned object is the physical room's doc ID (roomNumber),
// not the room type's ID — each physical room needs a unique key/id of
// its own when rendered as an individual card.
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

/* ── Mutations ────────────────────────────────────────────────────────── */

// The one write path this module exposes for regular use. Used by the
// admin Room Status / Availability / Maintenance views, and safe to call
// from anywhere else that legitimately changes a room's state (e.g. a
// future check-in/check-out flow). extra can carry a maintenanceNote, etc.
export async function updateRoomStatus(roomNumber, status, extra = {}) {
  await setDoc(
    doc(db, 'rooms', roomNumber),
    { status, ...extra, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* ── One-time seed ────────────────────────────────────────────────────── */
//
// This property's fixed inventory: 3 room types, 8 physical rooms
// (101–103, 108 → RM101/Twin, 105–107 → RM102/King, 104 → RM103/Single
// Room). seedInitialRooms() below writes this exact set into Firestore.
// It's meant to be called ONCE — from a temporary admin button (see
// RoomManagementScreen's empty state) — not as part of normal app flow.
// It's safe to call more than once by accident: setDoc without merge
// overwrites the same doc IDs rather than creating duplicates, so
// re-running it just resets these documents back to these starting
// values (this also means running it will overwrite any manual edits
// made directly in the Firebase console, e.g. to roomTypes' name fields
// — that's expected, not a bug).

const SEED_ROOM_TYPES = [
  {
    id: 'RM101',
    name: 'Twin',
    description: 'Two single beds, great for friends or colleagues sharing.',
    originalPrice: 2000,
    price: 1700,
    note: 'Book now, pay at hotel',
    taxNote: 'Excludes taxes and charges',
    size: '28 sqm',
    bed: '2 Single Beds',
    occupancy: '2 Adults',
    floor: 'Ground Floor',
    inclusions: [
      'Free Wi-Fi',
      'Air conditioning',
      'Flat-screen TV',
      'Private bathroom with hot & cold shower',
      'Daily housekeeping',
    ],
  },
  {
    id: 'RM102',
    name: 'King',
    description: 'One king-size bed, ideal for couples or solo travelers.',
    originalPrice: 2500,
    price: 2000,
    bbPrice: 2400,
    bbOriginalPrice: 3000,
    note: 'Book now, pay at hotel',
    taxNote: 'Excludes taxes and charges',
    size: '32 sqm',
    bed: '1 King Bed',
    occupancy: '2 Adults',
    floor: 'Ground Floor',
    inclusions: [
      'Free Wi-Fi',
      'Air conditioning',
      'Flat-screen TV',
      'Private bathroom with hot & cold shower',
      'Daily housekeeping',
      'Mini refrigerator',
      'City view window',
    ],
  },
  {
    id: 'RM103',
    name: 'Single Room',
    description: 'One single bed, ideal for solo travelers and short stays.',
    originalPrice: 1500,
    price: 1200,
    note: 'Book now, pay at hotel',
    taxNote: 'Excludes taxes and charges',
    size: '20 sqm',
    bed: '1 Single Bed',
    occupancy: '1 Adult',
    floor: 'Ground Floor',
    inclusions: [
      'Free Wi-Fi',
      'Air conditioning',
      'Flat-screen TV',
      'Private bathroom with hot & cold shower',
      'Daily housekeeping',
    ],
  },
];

const SEED_ROOMS = [
  { roomNumber: '101', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
  { roomNumber: '102', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.OCCUPIED },
  { roomNumber: '103', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.RESERVED },
  { roomNumber: '104', roomTypeId: 'RM103', floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
  {
    roomNumber: '105',
    roomTypeId: 'RM102',
    floor: 'Ground Floor',
    status: ROOM_STATUS.MAINTENANCE,
    maintenanceNote: 'AC unit repair — scheduled for completion this week.',
  },
  { roomNumber: '106', roomTypeId: 'RM102', floor: 'Ground Floor', status: ROOM_STATUS.OCCUPIED },
  { roomNumber: '107', roomTypeId: 'RM102', floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
  { roomNumber: '108', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.VACANT },
];

// Writes all 2 room types + 7 rooms to Firestore. Call this from a
// button, not automatically on app load — it's a one-time setup action.
export async function seedInitialRooms() {
  for (const roomType of SEED_ROOM_TYPES) {
    const { id, ...data } = roomType;
    await setDoc(doc(db, 'roomTypes', id), {
      ...data,
      images: getPlaceholderImages(id),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }

  for (const room of SEED_ROOMS) {
    const { roomNumber, ...data } = room;
    await setDoc(doc(db, 'rooms', roomNumber), {
      roomNumber,
      ...data,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  }
}