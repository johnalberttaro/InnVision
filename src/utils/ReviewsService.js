// ReviewsService.js
// Shared Supabase read/write helpers for the Guest Ratings feature (post-stay
// room ratings + post-order food ratings). Backed by the `reviews` table —
// see sql/reviews_table.sql for the schema, RLS policies, and the two
// partial unique indexes that stop a guest submitting more than one review
// per reservation/order.
//
// One shared `type: 'room' | 'food'` table rather than two separate tables,
// since both are the exact same shape (rating + optional comment tied to
// one guest + one thing they experienced) — the only real difference is
// which foreign key is populated (reservation_id vs order_id), which the
// two submit* helpers below handle so call sites never touch that detail.

import { supabase } from '../services/supabase';

/**
 * Submit a room-stay rating. Called from MyReservationsScreen.jsx once a
 * reservation's status is 'checked-out'.
 */
export async function submitRoomReview({ userId, guestName, reservationId, subjectLabel, rating, comment }) {
  const { error } = await supabase.from('reviews').insert({
    type: 'room',
    user_id: userId,
    guest_name: guestName,
    reservation_id: reservationId,
    subject_label: subjectLabel,
    rating,
    comment: comment?.trim() || null,
  });
  if (error) throw error;
}

/**
 * Submit a food-order rating. Called from OrderFoodScreen.jsx once an
 * order's status is 'delivered'.
 */
export async function submitFoodReview({ userId, guestName, orderId, subjectLabel, rating, comment }) {
  const { error } = await supabase.from('reviews').insert({
    type: 'food',
    user_id: userId,
    guest_name: guestName,
    order_id: orderId,
    subject_label: subjectLabel,
    rating,
    comment: comment?.trim() || null,
  });
  if (error) throw error;
}

/**
 * Which reservation/order ids (of the given type) this guest has already
 * rated — lets a screen hide the "Rate" prompt for ones already done
 * without a separate round-trip per item. Returns a Set of ids for O(1)
 * lookup against a list of reservations/orders being rendered.
 */
export async function fetchReviewedIds(userId, type) {
  if (!userId) return new Set();
  const column = type === 'room' ? 'reservation_id' : 'order_id';
  const { data, error } = await supabase
    .from('reviews')
    .select(column)
    .eq('user_id', userId)
    .eq('type', type);
  if (error) throw error;
  return new Set((data || []).map((r) => r[column]).filter(Boolean));
}

/**
 * Staff-facing: every review of a given type (or both, if type is
 * omitted), newest first. Used by GuestRatingsScreen.jsx (Admin + Front
 * Desk). Averages are computed client-side from this same fetch rather
 * than a separate aggregate query — the review volume for a training
 * hotel project is small enough that this is simpler than adding a
 * Postgres RPC, matching how other dashboards in this app (e.g. revenue
 * report) already compute their own summaries from a raw row fetch.
 */
export async function fetchAllReviews(type) {
  // Joined to profiles(photo_url) the same way GuestRecordsScreen.jsx
  // does — reviews.user_id is nullable (a review could theoretically
  // exist without a live account), so this is a best-effort join, not
  // a guarantee every row has a photo.
  let query = supabase.from('reviews').select('*, profiles(photo_url)').order('created_at', { ascending: false });
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, photo_url: r.profiles?.photo_url || null }));
}

/** Simple average helper — returns null (not 0) for an empty list, so callers can show "No ratings yet" instead of a misleading 0.0. */
export function averageRating(reviews) {
  if (!reviews || reviews.length === 0) return null;
  const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  return sum / reviews.length;
}