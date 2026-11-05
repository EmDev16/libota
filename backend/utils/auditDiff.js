// What changed in a logged action, in words a person can read (used by the activity log).
const FIELDS = ['firstName', 'lastName', 'birthDate', 'deathDate', 'birthApprox', 'deathApprox', 'deceased', 'gender', 'description', 'photo', 'parents', 'spouses', 'formerSpouses'];
const LINKS = ['parents', 'spouses', 'formerSpouses'];
const ddmmyyyy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

const PHOTO_FIELDS = ['caption', 'album', 'tags', 'hiddenTags', 'people', 'takenYear', 'takenDate'];
const LISTS = [...LINKS, 'tags', 'hiddenTags', 'people'];
const isEmpty = (value) => value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0);

// What changed, in words a person can read. For an added or deleted item one side is empty, so
// the result lists what it had.
const diff = (before, after, fields = FIELDS) => {
  if (!before && !after) return [];
  before = before || {};
  after = after || {};
  const names = { ...(before.linkNames || {}), ...(after.linkNames || {}) };
  const show = (field, snap) => {
    const value = snap[field];
    if (LINKS.includes(field)) return (value || []).map((id) => names[id] || '?').join(', ');
    if (field === 'tags' || field === 'hiddenTags') return (value || []).map((t) => `#${t}`).join(' ');
    if (field === 'people') return (value || []).join(', ');
    if (field === 'birthDate' || field === 'deathDate' || field === 'takenDate') return ddmmyyyy(value);
    if (field === 'photo') return value ? 'photo' : '';
    if (typeof value === 'boolean') return value ? '✓' : '–';
    return value == null ? '' : String(value);
  };
  const same = (field) => {
    if (LISTS.includes(field)) {
      const key = (snap) => [...(snap[field] || [])].map((x) => (field === 'people' ? x : String(x))).sort().join('|');
      return key(before) === key(after);
    }
    if (isEmpty(before[field]) && isEmpty(after[field])) return true;
    return (before[field] ?? '') === (after[field] ?? '');
  };
  return fields.filter((field) => !same(field)).map((field) => ({ field, from: show(field, before), to: show(field, after) }));
};

// The list of changes shown with an entry
const changesOf = (e) => {
  switch (e.action) {
    case 'person.update':
      return diff(e.before, e.after);
    case 'person.create':
      return diff(null, e.after);
    case 'person.delete':
      return diff(e.before, null);
    case 'gallery.update':
      return diff(e.before, e.after, PHOTO_FIELDS);
    case 'gallery.create':
      return diff(null, e.after, PHOTO_FIELDS);
    case 'gallery.delete':
      return diff(e.before, null, PHOTO_FIELDS);
    default:
      return [];
  }
};

module.exports = { diff, changesOf, FIELDS, PHOTO_FIELDS, LINKS };
