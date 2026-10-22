// Every birth and death of the family as one list, for the timeline page.

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// whole years between two dates (an age)
export const yearsBetween = (from, to) => {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const before =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  return before ? years - 1 : years;
};

// kind: 'all' | 'born' | 'died'. Oldest first, same day: by name.
export const buildTimeline = (people, kind = 'all') => {
  const events = [];
  for (const p of people || []) {
    const name = `${p.firstName} ${p.lastName}`.trim();
    const birth = toDate(p.birthDate);
    const death = toDate(p.deathDate);

    if (birth && kind !== 'died') {
      events.push({ key: `${p._id}-born`, personId: p._id, name, kind: 'born', date: birth, year: birth.getUTCFullYear() });
    }
    if (death && kind !== 'born') {
      events.push({
        key: `${p._id}-died`,
        personId: p._id,
        name,
        kind: 'died',
        date: death,
        year: death.getUTCFullYear(),
        age: birth && death >= birth ? yearsBetween(birth, death) : null
      });
    }
  }
  return events.sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
};

// Groups the events by year. order: 'oldest' | 'newest'
export const groupByYear = (events, order = 'newest') => {
  const groups = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last && last.year === e.year) last.events.push(e);
    else groups.push({ year: e.year, events: [e] });
  }
  return order === 'newest' ? groups.reverse().map((g) => ({ ...g, events: [...g.events].reverse() })) : groups;
};
