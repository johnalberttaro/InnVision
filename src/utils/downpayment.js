// downpayment.js — the downpayment rule and the wording shown to guests and
// staff, shared by Review & Pay, the e-wallet step, My Reservations, the
// staff Reservations screen and BillingService.
//
// The rule itself lives in ONE place: the booking_settings row in Supabase
// (sql/downpayment.sql). The database uses it to set every guest booking's
// downpayment; this file reads the same row so the amounts the guest sees
// before booking match what gets saved. DEFAULTS are only a fallback while
// that row is loading or if it can't be read.

import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

export const DOWNPAYMENT_DEFAULTS = {
  rate: 0.3,              // 30% of the total, rounded to a whole peso
  dueHours: 24,           // pay at hotel: due this long after booking (or by check-in)
  cancelWindowHours: 24,  // downpayment refundable only if cancelled within this
};

let cached = null;
let inflight = null;

export async function loadDownpaymentSettings() {
  if (cached) return cached;
  if (!inflight) {
    inflight = (async () => {
      try {
        const { data, error } = await supabase
          .from('booking_settings')
          .select('downpayment_rate, downpayment_due_hours, cancel_window_hours')
          .eq('id', 1)
          .maybeSingle();
        if (error || !data) throw error || new Error('No booking_settings row');
        cached = {
          rate: Number(data.downpayment_rate),
          dueHours: Number(data.downpayment_due_hours) || DOWNPAYMENT_DEFAULTS.dueHours,
          cancelWindowHours: Number(data.cancel_window_hours) || DOWNPAYMENT_DEFAULTS.cancelWindowHours,
        };
        if (!Number.isFinite(cached.rate)) cached.rate = DOWNPAYMENT_DEFAULTS.rate;
      } catch (err) {
        console.warn('Using default downpayment settings:', err?.message || err);
        cached = { ...DOWNPAYMENT_DEFAULTS };
      } finally {
        inflight = null;
      }
      return cached;
    })();
  }
  return inflight;
}

/** React hook: the settings, starting from the defaults until loaded. */
export function useDownpaymentSettings() {
  const [settings, setSettings] = useState(cached || DOWNPAYMENT_DEFAULTS);
  useEffect(() => {
    let alive = true;
    loadDownpaymentSettings().then((s) => alive && setSettings(s));
    return () => { alive = false; };
  }, []);
  return settings;
}

/**
 * Same formula as the database: round(total × rate), never below 0 and never
 * more than the total. A free stay (total 0) has no downpayment.
 */
export function computeDownpayment(total, rate = DOWNPAYMENT_DEFAULTS.rate) {
  const t = Math.max(Number(total) || 0, 0);
  const downpayment = t > 0 ? Math.min(Math.max(Math.round(t * rate), 0), t) : 0;
  return { downpayment, balance: Math.max(t - downpayment, 0) };
}

export const formatPeso = (value) => {
  const n = Number(value ?? 0);
  return `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatDueDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const METHOD_LABELS = {
  gcash: 'GCash', maya: 'Maya', gotyme: 'GoTyme', maribank: 'Maribank',
  cash: 'Cash', card: 'Card', online: 'E-wallet',
};
export const downpaymentMethodLabel = (method) =>
  METHOD_LABELS[(method || '').toLowerCase()] || (method ? method.charAt(0).toUpperCase() + method.slice(1) : '—');

/**
 * Everything a screen needs about one reservation's downpayment, from a
 * snake_case reservations row or the camelCase shape the screens use.
 * applies = false for reservations made before this feature (or free
 * stays): those behave exactly as before.
 */
export function getDownpaymentInfo(r) {
  if (!r) return { applies: false };
  const status = r.downpaymentStatus ?? r.downpayment_status ?? null;
  const amount = Number(r.downpaymentAmount ?? r.downpayment_amount ?? 0);
  if (!status || !(amount > 0)) return { applies: false };

  const total = Number(r.totalAmount ?? r.total_amount ?? 0);
  const dueAt = r.downpaymentDueAt ?? r.downpayment_due_at ?? null;
  const bookingStatus = (r.status || '').toLowerCase();
  const beforeCheckIn = ['pending', 'upcoming'].includes(bookingStatus);
  const overdue = status === 'pending' && beforeCheckIn && !!dueAt && new Date(dueAt).getTime() < Date.now();
  const paid = ['paid', 'refund_pending', 'refunded'].includes(status);

  return {
    applies: true,
    status,
    amount,
    total,
    balance: Math.max(total - amount, 0),
    dueAt,
    paidAt: r.downpaymentPaidAt ?? r.downpayment_paid_at ?? null,
    method: r.downpaymentMethod ?? r.downpayment_method ?? null,
    recordedByName: r.downpaymentRecordedByName ?? r.downpayment_recorded_by_name ?? null,
    paid,
    overdue,
    awaiting: status === 'pending' && beforeCheckIn,
  };
}

/** Badge text + colours for a downpayment status. */
export function downpaymentBadge(info) {
  if (!info?.applies) return null;
  if (info.overdue) return { label: 'Downpayment overdue', bg: '#FCE1E1', text: '#B3261E', icon: 'alert-circle-outline' };
  switch (info.status) {
    case 'paid':           return { label: 'Downpayment paid',     bg: '#DFF5E1', text: '#1E7B34', icon: 'checkmark-circle-outline' };
    case 'pending':        return { label: 'Downpayment required', bg: '#FFF4D6', text: '#8A6A00', icon: 'time-outline' };
    case 'refund_pending': return { label: 'Refund pending',       bg: '#E3ECF8', text: '#2C5EA8', icon: 'cash-outline' };
    case 'refunded':       return { label: 'Downpayment refunded', bg: '#EEEEF0', text: '#55555A', icon: 'cash-outline' };
    default:               return null;
  }
}

/** The plain-language reminder, used everywhere it's shown. */
export function downpaymentReminder({ amount, balance, cancelWindowHours = DOWNPAYMENT_DEFAULTS.cancelWindowHours }) {
  return (
    `A downpayment of ${formatPeso(amount)} is required to secure your reservation. ` +
    `The remaining balance of ${formatPeso(balance)} is payable at the hotel. ` +
    `Downpayments are refundable only if you cancel within ${cancelWindowHours} hours of booking.`
  );
}

/** The required checkbox sentence on Review & Pay. */
export function downpaymentAgreement({ amount, balance }) {
  return (
    `I understand that a downpayment of ${formatPeso(amount)} is required to secure my reservation ` +
    `and the balance of ${formatPeso(balance)} is payable at the hotel.`
  );
}
