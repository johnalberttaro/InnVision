// Helpers for building a month grid (Sun-start weeks, with leading/trailing
// days from adjacent months grayed out) used by RangeCalendar.

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getWeekdayLabels() {
  return WEEKDAY_LABELS;
}

export function getMonthLabel(year, month) {
  return `${MONTH_LABELS[month]} ${year}`;
}

/**
 * Returns a flat array of 42 cells (6 weeks) for the given year/month (0-indexed month).
 * Each cell: { date: Date, inMonth: boolean }
 */
export function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sunday

  const cells = [];
  // Leading days from previous month
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: d, inMonth: false });
  }
  // Days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  // Trailing days to fill out the last week (up to 6 rows of 7 = 42 cells)
  while (cells.length < 42) {
    const lastDate = cells[cells.length - 1].date;
    const next = new Date(lastDate);
    next.setDate(next.getDate() + 1);
    cells.push({ date: next, inMonth: false });
  }
  return cells;
}

export function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBeforeDay(a, b) {
  // true if a is strictly before b, comparing dates only (ignoring time)
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return aa.getTime() < bb.getTime();
}

export function isWithinRange(date, start, end) {
  if (!start || !end) return false;
  return !isBeforeDay(date, start) && isBeforeDay(date, end);
}

export function addMonths(year, month, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
