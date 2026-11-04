// Puts the photos of the gallery in a mixed order, so photos of one album (or of one year, when there
// is no album) do not come in a block. The order is random, but the same for the same seed.

// Small seeded random number generator: same seed, same order
const random = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = (list, rand) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// The group a photo belongs to for mixing: its album, or its year when it has no album
const groupOf = (photo) => (photo.album ? `album:${photo.album}` : `year:${photo.year || ''}`);

export const mixPhotos = (photos, seed = 1) => {
  const rand = random(seed);
  const groups = new Map();
  for (const photo of photos || []) {
    const key = groupOf(photo);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  }
  const piles = [...groups.values()].map((pile) => shuffle(pile, rand));

  // Every pile is spread evenly over the whole list: the k-th photo of a pile of n gets a place around
  // k/n, with a little randomness, and everything is sorted by that place. A big album is therefore
  // never a block, not even at the end.
  const placed = [];
  for (const pile of piles) {
    pile.forEach((photo, k) => placed.push({ photo, at: (k + rand()) / pile.length }));
  }
  return placed.sort((x, y) => x.at - y.at).map((x) => x.photo);
};
