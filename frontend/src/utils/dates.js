// Dates are shown as dd/mm/yyyy everywhere (like in the form), whatever the browser's language.
// Dates are stored as UTC midnight, so the UTC parts are read: no day is lost near midnight.

const two = (n) => String(n).padStart(2, '0');

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (value, empty = '') => {
  const d = toDate(value);
  return d ? `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : empty;
};

export const formatDayMonth = (day, month) => `${two(day)}/${two(month)}`;

// The date on the user's own clock, as yyyy-mm-dd (sent to the dashboard so "today" is right)
export const localToday = (now = new Date()) =>
  `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
