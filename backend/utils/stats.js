// Numbers for the dashboard: counts, ages, names, generations, growth and birthdays.
// A plain function without database access, so it is easy to test.

const DAY = 24 * 60 * 60 * 1000;

const asDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// "2026-10-22" -> UTC midnight of that day. Anything else -> null.
const parseDay = (text) => {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fullName = (p) => `${p.firstName} ${p.lastName}`.trim();
const idOf = (x) => String(x && x._id ? x._id : x);

// Years between two dates (whole years, like an age)
const yearsBetween = (from, to) => {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeBirthday =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
};

// Most common values (only those that appear at least twice), most common first
const topValues = (values, limit = 5) => {
  const counts = new Map();
  for (const v of values) {
    const clean = String(v || '').trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase();
    const entry = counts.get(key) || { name: clean, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
};

// Generation of everybody: someone without parents is generation 1, a child is one more than
// its parents, and partners share the later of their two generations.
const generationsOf = (people) => {
  const byId = new Map(people.map((p) => [idOf(p), p]));
  const gen = new Map(people.map((p) => [idOf(p), 0]));

  for (let round = 0; round < people.length + 2; round++) {
    let changed = false;
    for (const p of people) {
      const id = idOf(p);
      let g = gen.get(id);
      for (const parent of p.parents || []) {
        const pg = gen.get(idOf(parent));
        if (pg !== undefined && pg + 1 > g) g = pg + 1;
      }
      for (const spouse of p.spouses || []) {
        const sg = gen.get(idOf(spouse));
        if (sg !== undefined && sg > g) g = sg;
      }
      if (g !== gen.get(id)) {
        gen.set(id, g);
        changed = true;
      }
    }
    if (!changed) break; // (a loop in the data stops after the rounds above)
  }
  return { gen, byId };
};

// The birthday of `birth` in `year`; 29 February becomes 28 February in other years
const birthdayIn = (birth, year) => {
  let day = birth.getUTCDate();
  if (birth.getUTCMonth() === 1 && day === 29 && !isLeap(year)) day = 28;
  return new Date(Date.UTC(year, birth.getUTCMonth(), day));
};

function computeStats(people, { today, birthdayDays = 30 } = {}) {
  const now = parseDay(today) || parseDay(new Date().toISOString().slice(0, 10));
  const list = Array.isArray(people) ? people : [];

  const living = list.filter((p) => !p.deathDate);
  const deceased = list.filter((p) => p.deathDate);

  // couples: each pair once
  const pairs = new Set();
  for (const p of list) {
    for (const s of p.spouses || []) pairs.add([idOf(p), idOf(s)].sort().join('|'));
  }

  // generations
  const { gen } = generationsOf(list);
  const sizes = [];
  for (const g of gen.values()) sizes[g] = (sizes[g] || 0) + 1;
  const generationSizes = Array.from(sizes, (n) => n || 0);
  let largest = null;
  generationSizes.forEach((size, i) => {
    if (!largest || size > largest.size) largest = { number: i + 1, size };
  });

  // age at death
  const lifespans = deceased
    .map((p) => {
      const b = asDate(p.birthDate);
      const d = asDate(p.deathDate);
      return b && d && d >= b ? yearsBetween(b, d) : null;
    })
    .filter((n) => n !== null);
  const averageLifespan = lifespans.length
    ? Math.round((lifespans.reduce((a, b) => a + b, 0) / lifespans.length) * 10) / 10
    : null;

  // oldest and youngest living
  const livingWithBirth = living
    .map((p) => ({ p, birth: asDate(p.birthDate) }))
    .filter((x) => x.birth && x.birth <= now)
    .sort((a, b) => a.birth - b.birth);
  const asAge = (x) => ({ id: idOf(x.p), name: fullName(x.p), age: yearsBetween(x.birth, now) });
  // average age of the living family (people with a birth date)
  const ages = livingWithBirth.map((x) => yearsBetween(x.birth, now));
  const averageAge = ages.length ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10 : null;
  const oldestLiving = livingWithBirth.length ? asAge(livingWithBirth[0]) : null;
  const youngestLiving = livingWithBirth.length ? asAge(livingWithBirth[livingWithBirth.length - 1]) : null;

  // growth: people born per decade, and the running total
  const perDecade = new Map();
  for (const p of list) {
    const b = asDate(p.birthDate);
    if (!b) continue;
    const decade = Math.floor(b.getUTCFullYear() / 10) * 10;
    perDecade.set(decade, (perDecade.get(decade) || 0) + 1);
  }
  const growth = [];
  if (perDecade.size) {
    const decades = [...perDecade.keys()];
    let total = 0;
    for (let d = Math.min(...decades); d <= Math.max(...decades); d += 10) {
      const born = perDecade.get(d) || 0;
      total += born;
      growth.push({ decade: d, born, total });
    }
  }

  // birthdays in the next days (living people with a full birth date)
  const birthdays = [];
  for (const p of living) {
    const birth = asDate(p.birthDate);
    if (!birth || birth > now) continue;
    let next = birthdayIn(birth, now.getUTCFullYear());
    if (next < now) next = birthdayIn(birth, now.getUTCFullYear() + 1);
    const daysAway = Math.round((next - now) / DAY);
    if (daysAway > birthdayDays) continue;
    birthdays.push({
      id: idOf(p),
      name: fullName(p),
      day: birth.getUTCDate(),
      month: birth.getUTCMonth() + 1,
      turns: next.getUTCFullYear() - birth.getUTCFullYear(),
      daysAway
    });
  }
  birthdays.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));

  // born or died on this day of the year, in any year
  const onThisDay = [];
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  for (const p of list) {
    const b = asDate(p.birthDate);
    const d = asDate(p.deathDate);
    if (b && b.getUTCMonth() === month && b.getUTCDate() === day && b.getUTCFullYear() < now.getUTCFullYear()) {
      onThisDay.push({ id: idOf(p), name: fullName(p), kind: 'born', year: b.getUTCFullYear() });
    }
    if (d && d.getUTCMonth() === month && d.getUTCDate() === day && d.getUTCFullYear() < now.getUTCFullYear()) {
      onThisDay.push({ id: idOf(p), name: fullName(p), kind: 'died', year: d.getUTCFullYear() });
    }
  }
  onThisDay.sort((a, b) => a.year - b.year);

  const recentlyAdded = [...list]
    .filter((p) => asDate(p.createdAt))
    .sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt))
    .slice(0, 5)
    .map((p) => ({ id: idOf(p), name: fullName(p), createdAt: asDate(p.createdAt) }));

  return {
    today: now.toISOString().slice(0, 10),
    total: list.length,
    living: living.length,
    deceased: deceased.length,
    couples: pairs.size,
    generations: generationSizes.length,
    generationSizes,
    largestGeneration: largest,
    averageLifespan,
    averageAge,
    ageSample: ages.length,
    lifespanSample: lifespans.length,
    oldestLiving,
    youngestLiving,
    topFirstNames: topValues(list.map((p) => p.firstName)),
    topLastNames: topValues(list.map((p) => p.lastName)),
    growth,
    birthdays,
    onThisDay,
    recentlyAdded
  };
}

module.exports = { computeStats, parseDay };
