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
 * ROOM STATUS — single unified field driving occupancy AND housekeeping.
 *
 * Previously occupancy (vacant/occupied/reserved/maintenance) and
 * housekeeping (dirty/in_progress/clean/inspected) were two independent
 * fields on the room doc. They're merged here into one `status` field
 * because the front-desk workflow needs them to interact directly:
 * checking a guest OUT must immediately take the room out of the
 * available pool and into the cleaning cycle (Inspect), and only a room
 * that has come all the way through that cycle to VACANT is bookable
 * again. Two independent fields made that guarantee hard to express and
 * easy to get out of sync (e.g. a room could be "clean" but still show
 * as bookable while a guest was mid-stay, or vice versa).
 *
 * Lifecycle:
 *   VACANT --(guest checks in)--> OCCUPIED
 *   OCCUPIED --(guest checks out)--> INSPECT
 *   INSPECT --(passes inspection)--> START_CLEANING
 *   INSPECT --(fails inspection)--> NEEDS_CLEANING_AGAIN
 *   NEEDS_CLEANING_AGAIN --(begin cleaning)--> START_CLEANING
 *   START_CLEANING --(cleaning underway)--> IN_PROGRESS
 *   IN_PROGRESS --(cleaning finished)--> VACANT
 *   VACANT --(manual, e.g. mid-stay re-clean)--> NEEDS_CLEANING_AGAIN
 *
 * RESERVED and MAINTENANCE are independent side-states an admin can set
 * manually from Room Management (not part of the automatic cycle above).
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

// No fallback to VACANT here on purpose: a room with a missing or
// unrecognized status is NOT the same as a room that's actually vacant,
// and defaulting the display to "Vacant" for that case previously made
// broken data invisible — the badge said Vacant while isAvailable()
// (which has no such fallback) correctly kept the room out of Room
// Selection, so the UI and the booking logic silently disagreed.
const UNKNOWN_STATUS_META = { label: 'Unknown Status', color: '#6b7280', bg: '#e5e7eb' };

export const statusMeta = (status) => STATUS_META[status] || UNKNOWN_STATUS_META;

// The 5-step housekeeping cycle, in workflow order — used by Room
// Cleaning Status to know which statuses it manages vs. which ones
// (OCCUPIED / RESERVED / MAINTENANCE) are out of its scope.
export const CLEANING_WORKFLOW_STATUSES = [
  ROOM_STATUS.INSPECT,
  ROOM_STATUS.NEEDS_CLEANING_AGAIN,
  ROOM_STATUS.START_CLEANING,
  ROOM_STATUS.IN_PROGRESS,
  ROOM_STATUS.VACANT,
];

// Primary "advance" action for each step of the cleaning cycle. INSPECT
// has a second, alternate action (branch to NEEDS_CLEANING_AGAIN instead
// of straight to START_CLEANING) — handled separately in the screen,
// since a room can fail inspection.
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

// A room only counts as bookable/available once it has come all the way
// through the cleaning cycle. Every other status (including OCCUPIED and
// MAINTENANCE) is excluded automatically since none of them equal VACANT.
export function isAvailable(status) {
  return status === ROOM_STATUS.VACANT;
}

export function formatCurrency(amount) {
  return `₱${(amount ?? 0).toLocaleString()}`;
}

/* ── Real-time subscriptions ─────────────────────────────────────────── */

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

// Single write path for the unified status field — used by Room
// Management (admin-set statuses like RESERVED/MAINTENANCE), Room
// Cleaning Status (advancing the 5-step cycle), and Reservation
// Management (auto-set OCCUPIED on check-in / INSPECT on check-out).
export async function updateRoomStatus(roomNumber, status, extra = {}) {
  await setDoc(
    doc(db, 'rooms', roomNumber),
    { status, ...extra, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/* ── One-time seed ────────────────────────────────────────────────────── */

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