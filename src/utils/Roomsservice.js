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

// ── Housekeeping status — separate concept from occupancy status above.
// A room can be OCCUPIED (a guest is staying) and CLEAN (housekeeping
// serviced it that morning) at the same time — these two fields are
// intentionally independent so one doesn't get clobbered updating the
// other.
export const HOUSEKEEPING_STATUS = {
  CLEAN: 'clean',
  DIRTY: 'dirty',
  IN_PROGRESS: 'in_progress',
  INSPECTED: 'inspected',
};

export const HOUSEKEEPING_STATUS_META = {
  [HOUSEKEEPING_STATUS.CLEAN]: { label: 'Clean', color: '#16a34a', bg: '#dcfce7' },
  [HOUSEKEEPING_STATUS.DIRTY]: { label: 'Needs Cleaning', color: '#dc2626', bg: '#fee2e2' },
  [HOUSEKEEPING_STATUS.IN_PROGRESS]: { label: 'In Progress', color: '#d97706', bg: '#fef3c7' },
  [HOUSEKEEPING_STATUS.INSPECTED]: { label: 'Inspected', color: '#7c3aed', bg: '#ede9fe' },
};

export const housekeepingStatusMeta = (status) =>
  HOUSEKEEPING_STATUS_META[status] || HOUSEKEEPING_STATUS_META[HOUSEKEEPING_STATUS.CLEAN];

// A room's cleaning cycle always moves forward through this sequence.
// Used by Room Cleaning Status to know what the "next" button should do.
export const NEXT_HOUSEKEEPING_STATUS = {
  [HOUSEKEEPING_STATUS.DIRTY]: HOUSEKEEPING_STATUS.IN_PROGRESS,
  [HOUSEKEEPING_STATUS.IN_PROGRESS]: HOUSEKEEPING_STATUS.CLEAN,
  [HOUSEKEEPING_STATUS.CLEAN]: HOUSEKEEPING_STATUS.INSPECTED,
  [HOUSEKEEPING_STATUS.INSPECTED]: null, // end of the cycle until the room is dirtied again at next checkout
};

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
      housekeepingStatus: room.housekeepingStatus || HOUSEKEEPING_STATUS.CLEAN,
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

export async function updateRoomStatus(roomNumber, status, extra = {}) {
  await setDoc(
    doc(db, 'rooms', roomNumber),
    { status, ...extra, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Sibling to updateRoomStatus() above, but for the independent
// housekeeping cycle. Deliberately does NOT touch the occupancy `status`
// field — merge:true means only housekeepingStatus (+ extra) change,
// everything else on the room doc is left alone.
export async function updateRoomHousekeepingStatus(roomNumber, housekeepingStatus, extra = {}) {
  await setDoc(
    doc(db, 'rooms', roomNumber),
    { housekeepingStatus, ...extra, housekeepingUpdatedAt: serverTimestamp() },
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
  { roomNumber: '101', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.VACANT, housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN },
  { roomNumber: '102', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.OCCUPIED, housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN },
  { roomNumber: '103', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.RESERVED, housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN },
  { roomNumber: '104', roomTypeId: 'RM103', floor: 'Ground Floor', status: ROOM_STATUS.VACANT, housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN },
  {
    roomNumber: '105',
    roomTypeId: 'RM102',
    floor: 'Ground Floor',
    status: ROOM_STATUS.MAINTENANCE,
    housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN,
    maintenanceNote: 'AC unit repair — scheduled for completion this week.',
  },
  { roomNumber: '106', roomTypeId: 'RM102', floor: 'Ground Floor', status: ROOM_STATUS.OCCUPIED, housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN },
  { roomNumber: '107', roomTypeId: 'RM102', floor: 'Ground Floor', status: ROOM_STATUS.VACANT, housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN },
  { roomNumber: '108', roomTypeId: 'RM101', floor: 'Ground Floor', status: ROOM_STATUS.VACANT, housekeepingStatus: HOUSEKEEPING_STATUS.CLEAN },
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