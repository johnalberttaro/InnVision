// ─────────────────────────────────────────────────────────────────────────
// ⚠️ DEPRECATED as the app's live data source.
//
// Room Management now reads from Firestore in real time via
// utils/roomsService.js (subscribeToRoomTypes / subscribeToRooms), not
// from this file. ROOM_RATES and ROOMS below are kept only as:
//   1. A readable reference for the data shape.
//   2. The seed values scripts/seedRooms.js used to originally populate
//      Firestore (that script keeps its own copy so it has zero runtime
//      dependency on this file — edit seedRooms.js directly if you need
//      to re-seed with different starting data).
//
// `formatCurrency` below is still actively used across the app and is
// safe to keep importing from here — it's also re-exported from
// roomsService.js for any new code.
// ─────────────────────────────────────────────────────────────────────────

// Sample room rate categories for the student PMS prototype.
// In a real system this would come from an availability/rates API.
export const ROOM_RATES = [
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
    images: [
      {
        uri: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&h=500&fit=crop&crop=center',
        label: 'Twin Room',
      },
      {
        uri: 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=800&h=500&fit=crop&crop=center',
        label: 'Bathroom',
      },
      {
        uri: 'https://images.unsplash.com/photo-1506059612708-99d6c258160e?w=800&h=500&fit=crop&crop=center',
        label: 'City View',
      },
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
    images: [
      {
        uri: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800&h=500&fit=crop&crop=center',
        label: 'King Room',
      },
      {
        uri: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&h=500&fit=crop&crop=center',
        label: 'Bathroom',
      },
      {
        uri: 'https://images.unsplash.com/photo-1529290130-4ca3753253ae?w=800&h=500&fit=crop&crop=center',
        label: 'City View',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Individual physical rooms.
//
// The hotel has a fixed room count, so this list is the single source of
// truth for every room on the property — Room List, Room Availability,
// Room Status, and Room Maintenance in the admin panel are all just
// filtered/derived views over this array. Nothing is created or deleted
// at runtime; to change room inventory, edit this array directly.
//
// Fields:
//   roomNumber       — unique physical room number/label (e.g. "101")
//   roomTypeId       — references an id in ROOM_RATES above
//   floor            — display floor (single-floor building for now)
//   status           — one of: 'vacant' | 'occupied' | 'reserved' | 'maintenance'
//   maintenanceNote  — optional, shown only when status === 'maintenance'
//
// TEMPORARY sample data — replace with the final fixed room list.
// ─────────────────────────────────────────────────────────────────────────
export const ROOMS = [
  { roomNumber: '101', roomTypeId: 'RM101', floor: 'Ground Floor', status: 'vacant' },
  { roomNumber: '102', roomTypeId: 'RM101', floor: 'Ground Floor', status: 'occupied' },
  { roomNumber: '103', roomTypeId: 'RM101', floor: 'Ground Floor', status: 'reserved' },
  { roomNumber: '104', roomTypeId: 'RM101', floor: 'Ground Floor', status: 'vacant' },
  {
    roomNumber: '105',
    roomTypeId: 'RM102',
    floor: 'Ground Floor',
    status: 'maintenance',
    maintenanceNote: 'AC unit repair — scheduled for completion this week.',
  },
  { roomNumber: '106', roomTypeId: 'RM102', floor: 'Ground Floor', status: 'occupied' },
  { roomNumber: '107', roomTypeId: 'RM102', floor: 'Ground Floor', status: 'vacant' },
];

export function formatCurrency(amount) {
  return `₱${amount.toLocaleString()}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Join helpers — used by RoomManagementScreen so every view stays in sync
// automatically whenever ROOM_RATES or ROOMS changes, with no duplicate
// data entry required anywhere else in the app.
// ─────────────────────────────────────────────────────────────────────────

// Look up a room type by id. Returns undefined if not found (e.g. a room
// references a roomTypeId that doesn't exist in ROOM_RATES — this should
// not happen with valid data, but callers should guard against it).
export function getRoomTypeById(roomTypeId) {
  return ROOM_RATES.find((rt) => rt.id === roomTypeId);
}

// Every physical room, merged with its room type's display info.
export function getRoomsWithTypeDetails() {
  return ROOMS.map((room) => {
    const roomType = getRoomTypeById(room.roomTypeId);
    return {
      ...room,
      roomTypeName: roomType ? roomType.name : 'Unknown Type',
      roomTypePrice: roomType ? roomType.price : null,
    };
  });
}

// Rooms filtered by status, still merged with room type info.
export function getRoomsByStatus(status) {
  return getRoomsWithTypeDetails().filter((room) => room.status === status);
}