// The birthday emoji on the tree cards.
//   today            -> 🥳
//   in 1 to 7 days   -> 🎂 (with the date and the number of days as tooltip)
// Deceased people and people without a birth date never get one.

export const SOON_DAYS = 7;
export const EMOJI_TODAY = '🥳';
export const EMOJI_SOON = '🎂';

const DAY = 24 * 60 * 60 * 1000;
const two = (n) => String(n).padStart(2, '0');

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// 29 February is celebrated on 28 February in years that have no 29 February
const birthdayIn = (birth, year) => {
  let day = birth.getUTCDate();
  if (birth.getUTCMonth() === 1 && day === 29 && !isLeap(year)) day = 28;
  return new Date(Date.UTC(year, birth.getUTCMonth(), day));
};

// today: 'yyyy-mm-dd' (the viewer's own date)
export const birthdayInfo = (person, today) => {
  if (!person || person.deathDate || !person.birthDate) return null;
  const birth = new Date(person.birthDate);
  const now = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(now.getTime()) || birth > now) return null;

  let next = birthdayIn(birth, now.getUTCFullYear());
  if (next < now) next = birthdayIn(birth, now.getUTCFullYear() + 1);

  return {
    daysAway: Math.round((next - now) / DAY),
    turns: next.getUTCFullYear() - birth.getUTCFullYear(),
    label: `${two(birth.getUTCDate())}/${two(birth.getUTCMonth() + 1)}`
  };
};

// { emoji, title } for the corner of a card, or null
export const birthdayBadge = (person, today, labels = {}) => {
  const info = birthdayInfo(person, today);
  if (!info || info.daysAway > SOON_DAYS) return null;

  if (info.daysAway === 0) {
    return {
      emoji: EMOJI_TODAY,
      title: `${labels.today || 'Birthday today'} · ${info.turns}`
    };
  }
  const when =
    info.daysAway === 1 ? labels.tomorrow || 'Tomorrow' : `${labels.inDays || 'In'} ${info.daysAway} ${labels.days || 'days'}`;
  return { emoji: EMOJI_SOON, title: `${when} · ${info.label} · ${info.turns}` };
};
