// supabase/functions/admin-reset-password/index.js
//
// Lets an administrator set a new password for a Front Desk account
// whose staff member has forgotten theirs — the same idea as the
// default password an admin already sets when creating an account
// (see FrontDeskAccountScreen.jsx). The staff member logs back in with
// whatever the admin gives them, then changes it themselves from My
// Profile (see MyProfileScreen.jsx's Change Password section).
//
// WHY THIS HAS TO BE AN EDGE FUNCTION, NOT CLIENT CODE:
// Changing another user's password requires Supabase's Admin API
// (`auth.admin.updateUserById`), which only works with the
// `service_role` key. That key bypasses every Row Level Security
// policy in the project — it must NEVER be shipped inside the app
// bundle. The `EXPO_PUBLIC_` prefix used for the anon key exists
// specifically to mark "safe to expose to the client" — service_role
// is the opposite of that. It can only be used from trusted,
// server-side code, which is exactly what an Edge Function is: it runs
// on Supabase's servers, and its secrets are never sent to the app.
//
// Plain JavaScript here, not TypeScript — Deno (what Edge Functions
// run on) supports both natively with no build step either way, and
// the rest of this project is JavaScript throughout, so there's no
// reason to introduce TypeScript for just this one file.
//
// AUTHORIZATION — this function does not just trust the client, it
// re-checks everything server-side:
//   1. Requires a valid, currently-logged-in session (the caller's own
//      JWT, sent as the Authorization header — Supabase's client SDK
//      does this automatically when you call supabase.functions.invoke()).
//   2. Looks up the CALLER's own profile and requires role = 'admin'.
//      A front desk account cannot call this to reset someone else's
//      (or its own) password.
//   3. Looks up the TARGET account and requires role = 'frontdesk' —
//      this keeps the action scoped the same way the Front Desk
//      Accounts screen itself is scoped (an admin resets front desk
//      passwords here, not another admin's password).
//
// DEPLOYING THIS FUNCTION (from the project root, with the Supabase
// CLI installed and `supabase login` already run):
//   supabase functions deploy admin-reset-password
//
// The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
// referenced below are provided automatically by Supabase for every
// Edge Function — you don't need to set them yourself. Find the
// service_role key under Project Settings > API in the Supabase
// dashboard if you ever need it for something else, but never put it
// in the app's own .env file — only Edge Functions should ever see it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header.' }, 401);
    }

    const { staffUid, newPassword } = await req.json();
    if (!staffUid || typeof newPassword !== 'string' || newPassword.length < 8) {
      return jsonResponse(
        { error: 'staffUid and a newPassword of at least 8 characters are required.' },
        400
      );
    }

    // Scoped to the CALLER's own JWT — used only to verify who's
    // asking. This client can do nothing the caller themselves
    // couldn't already do through the normal app.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return jsonResponse({ error: 'Not authenticated.' }, 401);
    }

    // service_role client — the only one allowed to read other
    // people's profiles or call the Admin API. Never derived from
    // anything the request itself sent.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();
    if (callerProfileError || callerProfile?.role !== 'admin') {
      return jsonResponse({ error: 'Only administrators can reset a password.' }, 403);
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', staffUid)
      .single();
    if (targetProfileError || !targetProfile) {
      return jsonResponse({ error: 'That staff account could not be found.' }, 404);
    }
    if (targetProfile.role !== 'frontdesk') {
      return jsonResponse({ error: 'This action only resets Front Desk account passwords.' }, 403);
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(staffUid, {
      password: newPassword,
    });
    if (updateError) throw updateError;

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('admin-reset-password error:', err);
    return jsonResponse({ error: err?.message || 'Unexpected error.' }, 500);
  }
});