-- InnVision — 2026-10-02: let Admin read the `feedback` table.
--
-- `feedback` (the guest's overall "How was your experience?" rating +
-- comment, submitted from the home-screen FeedbackWidget) has only ever
-- had an insert policy for the submitting guest — nothing in the app
-- read it back until the new GuestFeedbackScreen.jsx (Admin → Reports &
-- Analytics → Guest Feedback). With RLS on and no SELECT policy,
-- Postgres silently returns zero rows to anyone querying the table —
-- not an error, just an empty result — so without this, that screen
-- loads cleanly and shows "No feedback yet." even with real submissions
-- sitting in the table.
--
-- Scoped to the 'admin' role only, matching the screen's own Admin-only
-- scope for now (see GuestFeedbackScreen.jsx's header comment). Widen
-- this (e.g. OR current_user_role() = 'frontdesk'::user_role) if the
-- screen is ever mirrored into another portal, the way Guest Ratings
-- already is.
--
-- Safe to re-run — DROP ... IF EXISTS first, same as every other policy
-- migration in this folder.

DROP POLICY IF EXISTS feedback_select_admin ON feedback;

CREATE POLICY feedback_select_admin ON feedback
FOR SELECT
USING (
  COALESCE(current_user_role() = 'admin'::user_role, false)
);