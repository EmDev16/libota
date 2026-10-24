// Families by last name, for "show the descendants of the oldest <name>".
//
// A last name can be one word ("Mbala") or several ("Mbala Venia"). Choosing "Mbala" means every person
// whose last name has the word Mbala in it, so Mbala Venia belongs to it too. Choosing "Mbala Venia"
// means only that exact last name. "Venia" alone is another family than "Mbala" alone.

const clean = (text) => String(text || '').trim().replace(/\s+/g, ' ');
const norm = (text) => clean(text).toLowerCase();
const words = (text) => norm(text).split(/[\s-]+/).filter(Boolean);

// [{ value, label, count }] sorted by name. value is "word:mbala" or "full:mbala venia".
export const familyOptions = (people) => {
  const map = new Map();
  const put = (value, label, id) => {
    const entry = map.get(value) || { value, label, ids: new Set() };
    entry.ids.add(id);
    map.set(value, entry);
  };
  for (const p of people || []) {
    const full = clean(p.lastName);
    if (!full) continue;
    const parts = full.split(/[\s-]+/).filter(Boolean);
    parts.forEach((word) => put(`word:${word.toLowerCase()}`, word, p._id));
    if (parts.length > 1) put(`full:${norm(full)}`, full, p._id);
  }
  return [...map.values()]
    .map(({ value, label, ids }) => ({ value, label, count: ids.size }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value));
};

export const peopleOfFamily = (people, value) => {
  if (!value) return [];
  const [kind, ...rest] = value.split(':');
  const wanted = rest.join(':');
  return (people || []).filter((p) => (kind === 'full' ? norm(p.lastName) === wanted : words(p.lastName).includes(wanted)));
};

const birthTime = (p) => {
  const time = p.birthDate ? new Date(p.birthDate).getTime() : NaN;
  return Number.isNaN(time) ? Infinity : time;
};

// The oldest of the family (by birth date; people without one come last)
export const oldestOfFamily = (people, value) => {
  const members = peopleOfFamily(people, value);
  if (members.length === 0) return null;
  return [...members].sort(
    (a, b) =>
      birthTime(a) - birthTime(b) ||
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
  )[0];
};
