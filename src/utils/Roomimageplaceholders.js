/**
 * Centralized room image configuration.
 *
 * PLACEHOLDER DATA — every URL below is a temporary Unsplash stock photo,
 * not a real photo of this property. They exist purely so room cards have
 * something to render during development.
 *
 * When real photos are ready (either hosted files or Firebase Storage
 * download URLs), swap them in HERE ONLY. Nothing else in the app needs
 * to change — Firestore documents, join logic, and every screen that
 * renders a room card all just read whatever `uri` is returned by
 * getPlaceholderImages(roomTypeId), so this file is the single point of
 * truth for imagery.
 *
 * To integrate Firebase Storage later:
 *   1. Upload real photos to Storage (e.g. `rooms/{roomTypeId}/1.jpg`).
 *   2. Replace the `uri` strings below with the resulting download URLs
 *      (getDownloadURL(ref(storage, path))), or fetch them dynamically
 *      and cache the result — either way, only this file changes.
 *   3. Everything downstream (roomsService.js, RoomManagementScreen.jsx,
 *      seedRooms.js, and any guest-facing screens) keeps working as-is.
 */

export const PLACEHOLDER_ROOM_IMAGES = {
  RM101: [
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
  RM102: [
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
};

// Generic fallback used only if a roomTypeId has no entry above — keeps
// the UI from breaking rather than crashing on a missing image set.
const FALLBACK_IMAGES = [
  {
    uri: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&h=500&fit=crop&crop=center',
    label: 'Room',
  },
];

export function getPlaceholderImages(roomTypeId) {
  return PLACEHOLDER_ROOM_IMAGES[roomTypeId] || FALLBACK_IMAGES;
}