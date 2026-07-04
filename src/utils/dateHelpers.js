// Date helpers for the reservation form.

export function formatDate(date) {
  if (!date) return 'Select date';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString(undefined, options);
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isCheckOutValid(checkIn, checkOut) {
  if (!checkIn || !checkOut) return true; // nothing to compare yet
  return startOfDay(checkOut).getTime() > startOfDay(checkIn).getTime();
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const ms = startOfDay(checkOut).getTime() - startOfDay(checkIn).getTime();
  const nights = Math.round(ms / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 0;
}
