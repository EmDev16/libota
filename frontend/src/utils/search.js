// Search in the list of people: ignores capitals and accents ("helene" finds "Hélène"),
// every typed word must be found somewhere in the name, in any order.

export const normalize = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const searchPeople = (people, query, limit = 8) => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const scored = [];
  for (const person of people || []) {
    const first = normalize(person.firstName);
    const last = normalize(person.lastName);
    const full = `${first} ${last}`;
    if (!words.every((w) => full.includes(w))) continue;

    // names that start with the typed word come first
    const startsWith = words.some((w) => first.startsWith(w) || last.startsWith(w));
    scored.push({ person, rank: startsWith ? 0 : 1, full });
  }

  scored.sort((a, b) => a.rank - b.rank || a.full.localeCompare(b.full));
  return scored.slice(0, limit).map((s) => s.person);
};
