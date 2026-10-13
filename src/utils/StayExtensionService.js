// StayExtensionService.js
// Client helpers for the "Extend Stay" feature. Every write goes through a
// Postgres function (sql/stay_extensions.sql), so pricing, ownership,
// availability and the folio update all happen server-side in one
// transaction — the app never sends an amount or touches the folio itself.
//
//   Guest       → requestStayExtension / cancelStayExtension
//   Front Desk  → approveStayExtension / declineStayExtension
//
// Errors come back as normal Supabase errors with a readable message
// (e.g. "Room 101 is already booked for one of those nights."), so screens
// can show err.message directly.

import { supabase } from '../services/supabase';

// Same 17% tax + service charge the booking flow uses (ReviewPayScreen /
// WalkInScreen). Only used for the on-screen preview; the server computes
// the real amount.
export const EXTENSION_TAX_RATE = 0.17;
export const MAX_EXTENSION_NIGHTS = 14;

export function extensionToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    reservationId: row.reservation_id,
    userId: row.user_id,
    extraNights: row.extra_nights,
    currentCheckOut: row.current_check_out,
    newCheckOut: row.new_check_out,
    nightlyRateTotal: Number(row.nightly_rate_total) || 0,
    subtotal: Number(row.subtotal) || 0,
    tax: Number(row.tax) || 0,
    amount: Number(row.amount) || 0,
    status: row.status,
    declineReason: row.decline_reason,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
    processedByName: row.processed_by_name,
  };
}

// Preview only — mirrors the server's math (rate × nights, tax rounded to
// the peso) so the number the guest sees matches what they're charged.
export function previewExtensionCost(nightlyRateTotal, extraNights) {
  const subtotal = Math.round((nightlyRateTotal || 0) * extraNights * 100) / 100;
  const tax = Math.round(subtotal * EXTENSION_TAX_RATE);
  return { subtotal, tax, total: subtotal + tax };
}

// Per-night total for all rooms on a reservation, from the rates the guest
// is already paying. Preview only (the server re-derives it).
export function reservationNightlyTotal(selectedRooms = []) {
  return (selectedRooms || []).reduce((sum, r) => sum + (Number(r?.price) || 0), 0);
}

export function addNights(dateValue, nights) {
  const d = new Date(dateValue);
  d.setDate(d.getDate() + nights);
  return d;
}

// ── Guest ───────────────────────────────────────────────────────────────

export async function requestStayExtension(reservationId, extraNights) {
  const { data, error } = await supabase.rpc('request_stay_extension', {
    p_reservation_id: reservationId,
    p_extra_nights: extraNights,
  });
  if (error) throw error;
  return data; // { id, extraNights, newCheckOut, amount }
}

export async function cancelStayExtension(extensionId) {
  const { error } = await supabase.rpc('cancel_stay_extension', { p_extension_id: extensionId });
  if (error) throw error;
}

// Latest request per reservation for this guest — { [reservationId]: ext }.
export async function fetchMyLatestExtensions(userId) {
  if (!userId) return {};
  const { data, error } = await supabase
    .from('stay_extensions')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  const latest = {};
  (data || []).forEach((row) => {
    if (!latest[row.reservation_id]) latest[row.reservation_id] = extensionToCamel(row);
  });
  return latest;
}

// ── Front Desk / Admin ──────────────────────────────────────────────────

// Every pending request — { [reservationId]: ext }.
export async function fetchPendingExtensions() {
  const { data, error } = await supabase
    .from('stay_extensions')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (error) throw error;
  const byReservation = {};
  (data || []).forEach((row) => { byReservation[row.reservation_id] = extensionToCamel(row); });
  return byReservation;
}

export async function approveStayExtension(extensionId, staffName) {
  const { data, error } = await supabase.rpc('approve_stay_extension', {
    p_extension_id: extensionId,
    p_staff_name: staffName || null,
  });
  if (error) throw error;
  return data; // { newCheckOut, amount, folioUpdated }
}

export async function declineStayExtension(extensionId, reason, staffName) {
  const { error } = await supabase.rpc('decline_stay_extension', {
    p_extension_id: extensionId,
    p_reason: reason || null,
    p_staff_name: staffName || null,
  });
  if (error) throw error;
}

// Live updates on stay_extensions (RLS still applies, so a guest only
// receives their own rows). Returns an unsubscribe function.
export function subscribeToStayExtensions(channelName, onChange) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stay_extensions' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
