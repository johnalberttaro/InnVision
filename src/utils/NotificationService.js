// NotificationService.js
// Guest notifications — reads the existing `notifications` table (the same
// one Front Desk writes reservation updates to) through the functions in
// sql/guest_deadline_notifications.sql, so a guest only ever sees and
// updates their own rows.
//
// Deadline notifications (type 'deadline_<checkin|checkout>_<upcoming|reached>')
// are created by the database itself: on a 15-minute schedule, and whenever
// checkMyDeadlines() runs (the bell calls it when the app opens and every few
// minutes while it stays open). The database prevents duplicates.

import { supabase } from '../services/supabase';

export async function checkMyDeadlines() {
  const { data, error } = await supabase.rpc('check_my_deadlines');
  if (error) throw error;
  return data || 0; // number of new notifications created
}

export async function fetchMyNotifications(limit = 50) {
  const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: limit });
  if (error) throw error;
  return (data || []).map((n) => ({
    id: String(n.id),
    type: n.type || '',
    title: n.title || 'Notification',
    message: n.message || '',
    reservationId: n.reservation_id || null,
    read: !!n.read,
    createdAt: n.created_at || null,
    deadlineAt: n.deadline_at || null,
  }));
}

// ids omitted → mark every one of the guest's notifications read.
export async function markNotificationsRead(ids) {
  const { error } = await supabase.rpc('mark_my_notifications_read', {
    p_ids: ids && ids.length ? ids.map(String) : null,
  });
  if (error) throw error;
}

// Live updates for this guest's own notifications. Returns an unsubscribe.
export function subscribeToMyNotifications(userId, onChange) {
  const channel = supabase
    .channel(`guest-notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// The booking a notification is about — guests can already read their own
// reservations (My Reservations does the same query).
export async function fetchBookingSummary(reservationId) {
  if (!reservationId) return null;
  const { data, error } = await supabase
    .from('reservations')
    .select('id, status, check_in, check_out, nights, room_type, selected_rooms, total_amount, payment_status')
    .eq('id', reservationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    reference: `RES-${String(data.id).slice(0, 8).toUpperCase()}`,
    status: data.status,
    checkIn: data.check_in,
    checkOut: data.check_out,
    nights: data.nights,
    roomType: data.room_type,
    rooms: (data.selected_rooms || []).map((r) => r?.roomNumber).filter(Boolean),
    totalAmount: data.total_amount,
    paymentStatus: data.payment_status,
  };
}

// What a notification looks like in the list: kind decides the colour and
// icon so upcoming vs. passed deadlines are obvious at a glance.
export function notificationMeta(type = '') {
  // Booking not confirmed by the front desk yet.
  if (type === 'deadline_checkin_pending') {
    return { kind: 'pending', label: 'Awaiting confirmation', icon: 'hourglass-outline', color: '#9A6700', bg: '#FFF4D6' };
  }
  // Check-in is a friendly reminder only — guests may arrive any time.
  if (type.startsWith('deadline_checkin')) {
    return { kind: 'checkin', label: 'Check-in reminder', icon: 'bed-outline', color: '#2C5EA8', bg: '#E3ECF8' };
  }
  if (type.startsWith('deadline_') && type.endsWith('_upcoming')) {
    return { kind: 'upcoming', label: 'Upcoming deadline', icon: 'time-outline', color: '#9A6700', bg: '#FFF4D6' };
  }
  if (type.startsWith('deadline_') && type.endsWith('_reached')) {
    return { kind: 'reached', label: 'Deadline reached', icon: 'alert-circle-outline', color: '#B3261E', bg: '#FCE1E1' };
  }
  if (type.includes('declined') || type.includes('cancel')) {
    return { kind: 'info', label: 'Booking update', icon: 'close-circle-outline', color: '#B3261E', bg: '#FCE1E1' };
  }
  if (type.includes('refund')) {
    return { kind: 'info', label: 'Refund', icon: 'cash-outline', color: '#1E7B34', bg: '#DFF5E1' };
  }
  if (type.includes('stay_extension')) {
    return { kind: 'info', label: 'Stay extension', icon: 'calendar-outline', color: '#2C5EA8', bg: '#E3ECF8' };
  }
  return { kind: 'info', label: 'Booking update', icon: 'checkmark-circle-outline', color: '#1E7B34', bg: '#DFF5E1' };
}
