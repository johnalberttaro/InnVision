// FeedbackService.js
// Staff-facing read helper for the `feedback` table — the guest's overall
// "How was your experience?" rating + comment, submitted from the
// home-screen FeedbackWidget (src/components/shared/FeedbackWidget.jsx).
//
// Unlike `reviews` (see ReviewsService.js), `feedback` stores no
// denormalized guest name — FeedbackWidget.jsx only ever inserts
// { user_id, rating, feedback_text } — so every row here needs a real
// join against `profiles` to resolve who submitted it, not just the
// photo_url lookup the other staff-facing list screens in this app
// (GuestRatingsScreen, GuestRecordsScreen, GuestDetailsScreen, ...)
// already do against an otherwise-complete row.
//
// REQUIRES a Supabase RLS policy that lets staff SELECT from `feedback`
// — see migration_out/20261002_feedback_staff_select_policy.sql.
// `feedback` has only ever had an insert policy for the submitting
// guest (it was write-only until this screen), so without that
// migration applied, fetchAllFeedback() below comes back empty — no
// error, just zero rows — for anyone who isn't each row's own
// submitting guest. Same silent-filtering behavior as any other
// RLS-protected table in this app.

import { supabase } from '../services/supabase';

/**
 * Staff-facing: every feedback submission, newest first, with the
 * submitting guest's name/email/photo resolved from `profiles`. Used by
 * GuestFeedbackScreen.jsx (Admin → Reports & Analytics).
 */
export async function fetchAllFeedback() {
  const { data, error } = await supabase
    .from('feedback')
    .select('*, profiles(first_name, last_name, display_name, email, photo_url)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => {
    const p = row.profiles || {};
    // Same display-name fallback chain Profilescreen.jsx uses for the
    // guest's own name: display_name, else first+last, else 'Guest'.
    const guestName = p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Guest';
    return {
      ...row,
      guest_name: guestName,
      guest_email: p.email || null,
      photo_url: p.photo_url || null,
    };
  });
}

/**
 * Simple average helper — returns null (not 0) for an empty list, so
 * callers can show "—" instead of a misleading 0.0. Mirrors
 * ReviewsService.averageRating exactly.
 */
export function averageRating(feedbackRows) {
  if (!feedbackRows || feedbackRows.length === 0) return null;
  const sum = feedbackRows.reduce((acc, r) => acc + (r.rating || 0), 0);
  return sum / feedbackRows.length;
}