/**
 * seedRooms.js — ONE-TIME setup script.
 *
 * Your Firestore project currently has NO `roomTypes` or `rooms`
 * collection (confirmed from the console: only `guests`, `notifications`,
 * `reservations` exist). This script creates both collections and
 * populates them with the property's fixed inventory:
 *
 *   roomTypes: RM101 (Twin), RM102 (King)      — 2 docs
 *   rooms:     101–107                          — 7 docs
 *              101–104 → RM101 (Twin)
 *              105–107 → RM102 (King)
 *
 * Run this ONCE. It's idempotent (safe to re-run — setDoc overwrites the
 * same doc IDs rather than duplicating), but it is NOT how you add rooms
 * going forward — the app has no "add room" UI on purpose, since this
 * property has a fixed room count. To change inventory later, edit the
 * SEED_ROOM_TYPES / SEED_ROOMS arrays below and re-run.
 *
 * HOW TO RUN:
 *   1. Place this file at src/scripts/seedRooms.js — NOT at the project
 *      root. Your project nests everything under src/ (src/services,
 *      src/utils, src/screens...), and the require() paths below assume
 *      that same depth (one level up from src/scripts/ lands at src/).
 *   2. Make sure `src/services/firebase.js` exports `db` configured with
 *      your real Firebase project credentials (the same file every other
 *      screen already imports from).
 *   3. From your project root:
 *        node src/scripts/seedRooms.js
 *      (If your project uses ES modules / Expo, you may need to run this
 *      via `npx babel-node src/scripts/seedRooms.js` instead — the logic
 *      itself doesn't depend on React Native, only on Node understanding
 *      the import syntax in firebase.js.)
 *   4. Check the Firestore console — you should see `roomTypes` (2 docs)
 *      and `rooms` (7 docs) appear alongside your existing collections.
 */

const { doc, setDoc, serverTimestamp } = require('firebase/firestore');
const { db } = require('../services/firebase');
const { getPlaceholderImages } = require('../utils/Roomimageplaceholders');

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
];

// Fixed physical room inventory — 7 rooms total, per the property's
// actual room count. Status values here are just reasonable starting
// points; admins change them afterwards through the Room Management
// screen, which writes to Firestore directly.
const SEED_ROOMS = [
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

async function seed() {
  console.log('Seeding roomTypes...');
  for (const roomType of SEED_ROOM_TYPES) {
    const { id, ...data } = roomType;
    await setDoc(doc(db, 'roomTypes', id), {
      ...data,
      images: getPlaceholderImages(id), // centralized, swap later in roomImagePlaceholders.js
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    console.log(`  ✓ roomTypes/${id} (${data.name})`);
  }

  console.log('Seeding rooms...');
  for (const room of SEED_ROOMS) {
    const { roomNumber, ...data } = room;
    await setDoc(doc(db, 'rooms', roomNumber), {
      roomNumber,
      ...data,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    console.log(`  ✓ rooms/${roomNumber} (${data.roomTypeId}, ${data.status})`);
  }

  console.log('Done. 2 room types + 7 rooms seeded.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});