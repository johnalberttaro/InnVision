// roomNames.js — show rooms by NAME ("Room 2", "Conference Room") instead of
// their number on screens that only store numbers (billing folios store
// room_numbers). Includes removed rooms and room types too, so an old folio
// still shows the right name.

import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { supabase } from '../services/supabase';
import { compareRoomsForList } from './Roomsservice';

let cache = null;        // { [roomNumber]: roomTypeName }
let inflight = null;
const listeners = new Set();

async function loadRoomNames() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [{ data: rooms, error: e1 }, { data: types, error: e2 }] = await Promise.all([
        supabase.from('rooms').select('room_number, room_type_id'),
        supabase.from('room_types').select('id, name'),
      ]);
      if (e1 || e2) throw e1 || e2;
      const typeName = {};
      (types || []).forEach((t) => { typeName[String(t.id)] = t.name; });
      const map = {};
      (rooms || []).forEach((r) => {
        const name = typeName[String(r.room_type_id)];
        if (name) map[String(r.room_number)] = name;
      });
      cache = map;
      listeners.forEach((fn) => fn(cache));
    } catch (err) {
      console.warn('Could not load room names:', err?.message || err);
      if (!cache) cache = {};
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
}

/** Names for a list of room numbers — unique, in order. Unknown → "Room". */
export function roomNamesFrom(map, numbers) {
  const list = Array.isArray(numbers) ? numbers : [numbers].filter(Boolean);
  const out = [];
  list.forEach((n) => {
    const name = (map && map[String(n)]) || 'Room';
    if (!out.includes(name)) out.push(name);
  });
  return out;
}

/**
 * React hook: returns roomNames(numbers) → ['Room 2', ...]. Loads once and
 * is shared by every screen that uses it.
 */
export function useRoomNames() {
  const [map, setMap] = useState(cache || {});
  useEffect(() => {
    const fn = (m) => setMap({ ...m });
    listeners.add(fn);
    if (!cache) loadRoomNames();
    else setMap({ ...cache });
    return () => { listeners.delete(fn); };
  }, []);
  return (numbers) => roomNamesFrom(map, numbers);
}

/** Non-hook version (e.g. inside print/share helpers). */
export async function getRoomNames(numbers) {
  const m = cache || (await loadRoomNames());
  return roomNamesFrom(m, numbers);
}

/** React hook: nameOf(roomNumber) → 'Room 2' (one room). */
export function useRoomNameOf() {
  const names = useRoomNames();
  return (number) => names([number])[0];
}

/**
 * Inline room name for a room number, e.g.
 *   <Text style={styles.badge}><RoomName number={task.roomNumber} /></Text>
 * Shows "Room" until the names have loaded.
 */
export function RoomName({ number }) {
  const nameOf = useRoomNameOf();
  return React.createElement(Text, null, nameOf(number));
}

/** Sort anything with a roomNumber in Room List order (Room 1, Room 2, …). */
export function sortByRoomName(list, nameOf, key = (x) => x.roomNumber) {
  return [...(list || [])].sort((a, b) =>
    compareRoomsForList(
      { roomTypeName: nameOf(key(a)), roomNumber: key(a) },
      { roomTypeName: nameOf(key(b)), roomNumber: key(b) }
    )
  );
}
