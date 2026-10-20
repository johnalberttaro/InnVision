// stayTimes.js — one place that turns a reservation into its real
// timeline, so every screen shows the same, accurate thing:
//
//   Booked on     — when the guest made the reservation (created_at)
//   Stay dates    — the dates they booked (check_in → check_out). These are
//                   calendar dates only; the stored time is just midnight,
//                   so no time is shown for them.
//   Checked in    — the exact date AND time the Front Desk checked them in
//                   (checked_in_at)
//   Checked out   — the exact date AND time they checked out (checked_out_at)
//
// Works with snake_case rows or the camelCase shape the screens use.

export const CHECK_IN_TIME_LABEL = '2:00 PM';
export const CHECK_OUT_TIME_LABEL = '12:00 noon';

const pick = (r, camel, snake) => (r ? (r[camel] ?? r[snake] ?? null) : null);

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "Oct 20, 2026" */
export function formatStayDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

/** "Oct 20, 2026 · 2:35 PM" */
export function formatStamp(v) {
  const d = toDate(v);
  if (!d) return '—';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** "Oct 20 – Oct 24, 2026" (year shown once when both are in the same year) */
export function formatStayRange(checkIn, checkOut) {
  const a = toDate(checkIn);
  const b = toDate(checkOut);
  if (!a || !b) return `${formatStayDate(checkIn)} – ${formatStayDate(checkOut)}`;
  if (a.getFullYear() === b.getFullYear()) {
    const left = a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${left} – ${formatStayDate(b)}`;
  }
  return `${formatStayDate(a)} – ${formatStayDate(b)}`;
}

/** Nights between the booked dates. */
export function stayNights(checkIn, checkOut) {
  const a = toDate(checkIn);
  const b = toDate(checkOut);
  if (!a || !b) return null;
  return Math.max(Math.round((dayOnly(b) - dayOnly(a)) / 864e5), 0);
}

/**
 * The reservation's timeline, ready to show as rows:
 *   [{ key, label, value, note, tone, icon }]
 * tone: 'done' | 'waiting' | 'warn' | 'muted'
 */
export function getStayTimeline(r) {
  if (!r) return [];
  const status = pick(r, 'status', 'status');
  const createdAt = pick(r, 'createdAt', 'created_at');
  const checkIn = pick(r, 'checkIn', 'check_in');
  const checkOut = pick(r, 'checkOut', 'check_out');
  const checkedInAt = pick(r, 'checkedInAt', 'checked_in_at');
  const checkedOutAt = pick(r, 'checkedOutAt', 'checked_out_at');
  const cancelledAt = pick(r, 'cancelledAt', 'cancelled_at');
  const noShowAt = pick(r, 'noShowAt', 'no_show_at');

  const nights = pick(r, 'nights', 'nights') ?? stayNights(checkIn, checkOut);
  const rows = [];

  rows.push({
    key: 'booked',
    label: 'Booked on',
    value: formatStamp(createdAt),
    tone: 'done',
    icon: 'create-outline',
  });

  rows.push({
    key: 'stay',
    label: 'Stay dates',
    value: formatStayRange(checkIn, checkOut),
    note: nights != null ? `${nights} night${nights === 1 ? '' : 's'}` : null,
    tone: 'muted',
    icon: 'calendar-outline',
  });

  // Cancelled / declined / no-show: no arrival to record.
  if (status === 'cancelled' || status === 'declined' || status === 'no-show') {
    const label = status === 'cancelled' ? 'Cancelled' : status === 'declined' ? 'Declined' : 'No show';
    const when = status === 'cancelled' ? cancelledAt : status === 'no-show' ? noShowAt : null;
    rows.push({
      key: 'closed',
      label,
      value: when ? formatStamp(when) : 'Did not stay',
      tone: 'warn',
      icon: status === 'no-show' ? 'person-remove-outline' : 'close-circle-outline',
    });
    return rows;
  }

  rows.push(checkedInAt
    ? { key: 'in', label: 'Checked in', value: formatStamp(checkedInAt), tone: 'done', icon: 'log-in-outline' }
    : {
        key: 'in', label: 'Checked in', value: 'Not yet',
        note: checkIn ? `Expected from ${CHECK_IN_TIME_LABEL}, ${formatStayDate(checkIn)}` : null,
        tone: 'waiting', icon: 'log-in-outline',
      });

  if (checkedOutAt) {
    const left = toDate(checkedOutAt);
    const due = toDate(checkOut);
    let note = null;
    if (left && due) {
      if (dayOnly(left) < dayOnly(due)) note = `Early checkout (booked until ${formatStayDate(due)})`;
      else if (dayOnly(left) > dayOnly(due)) note = `Late checkout (was due ${formatStayDate(due)})`;
    }
    rows.push({ key: 'out', label: 'Checked out', value: formatStamp(checkedOutAt), note, tone: note && note.startsWith('Late') ? 'warn' : 'done', icon: 'log-out-outline' });
  } else {
    rows.push({
      key: 'out', label: 'Checked out', value: 'Not yet',
      note: checkOut ? `Due by ${CHECK_OUT_TIME_LABEL}, ${formatStayDate(checkOut)}` : null,
      tone: 'waiting', icon: 'log-out-outline',
    });
  }
  return rows;
}
