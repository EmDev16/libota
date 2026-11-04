// Helpers for the gallery grid.

// https://res.cloudinary.com/<cloud>/image/upload/v1/libota/a.jpg -> a smaller copy made by Cloudinary.
// Photos kept on our own server (and anything else) are returned as they are.
export const thumbUrl = (url, width, quality = 'good') => {
  if (typeof url !== 'string' || !/^https:\/\/res\.cloudinary\.com\//i.test(url)) return url;
  return url.replace('/upload/', `/upload/w_${width},c_limit,f_auto,q_auto:${quality}/`);
};

// Width divided by height; photos without a known size count as square
export const aspectOf = (photo) =>
  photo && photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1;

// Spreads the photos over `count` columns so the columns end up about equally tall, whatever mix of
// vertical, horizontal and square pictures there is. Each photo goes into the shortest column, in order,
// so the newest photos stay near the top.
export const layoutColumns = (photos, count) => {
  const n = Math.max(1, Math.floor(count) || 1);
  const columns = Array.from({ length: n }, () => []);
  const heights = new Array(n).fill(0);
  for (const photo of photos) {
    let shortest = 0;
    for (let i = 1; i < n; i += 1) if (heights[i] < heights[shortest] - 1e-9) shortest = i;
    columns[shortest].push(photo);
    heights[shortest] += 1 / aspectOf(photo); // height of the picture for a column of width 1
  }
  return columns;
};

// A number between 0 and 1 that is always the same for the same text (to give every photo its own "luck")
const luckOf = (text) => {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

// How many columns a photo takes. Vertical and square photos take one. Horizontal ones sometimes take
// two, and wide ones sometimes three, so the gallery looks like a pile of photos and not like a grid.
export const spanOf = (photo, columns) => {
  const ratio = aspectOf(photo);
  const luck = luckOf(photo.id ?? photo.image ?? '');
  let span = 1;
  if (ratio >= 1.8 && columns >= 4) span = luck < 0.35 ? 3 : luck < 0.8 ? 2 : 1;
  else if (ratio >= 1.3) span = luck < 0.6 ? 2 : 1;
  return Math.min(span, columns);
};

// Lays the photos out as a collage in a container of `width` pixels with `count` columns.
// Wide photos cover several columns. For every place the next photo that fits best is taken from the
// next few (so no holes stay open), which mixes the order a little. Returns
// { items: [{ photo, left, top, width, height }], height } in pixels.
export const layoutCollage = (photos, width, count, gap = 10, lookahead = 6) => {
  const n = Math.max(1, Math.floor(count) || 1);
  const columnWidth = Math.max(1, (width - gap * (n - 1)) / n);
  const heights = new Array(n).fill(0);
  const items = [];
  const pending = [...(photos || [])];
  let waited = 0; // how many times the first photo was passed over

  while (pending.length > 0) {
    let best = null;
    // a photo that has waited long enough is placed now, wherever it fits best
    const window = waited >= 8 ? 1 : Math.min(lookahead, pending.length);
    for (let i = 0; i < window; i += 1) {
      const photo = pending[i];
      const wanted = spanOf(photo, n);
      // a wide photo may also take fewer columns when that fills a low place better
      for (let span = wanted; span >= 1; span -= 1) {
        for (let start = 0; start + span <= n; start += 1) {
          let top = 0;
          let waste = 0;
          for (let c = start; c < start + span; c += 1) top = Math.max(top, heights[c]);
          for (let c = start; c < start + span; c += 1) waste += top - heights[c];
          // low and tight first; the photos near the front of the list are preferred a little
          const cost = top + waste * 3 + i * 0.15 * columnWidth + (wanted - span) * 0.4 * columnWidth;
          if (!best || cost < best.cost - 1e-9) best = { cost, index: i, photo, span, start, top };
        }
      }
    }
    const boxWidth = best.span * columnWidth + (best.span - 1) * gap;
    const height = boxWidth / aspectOf(best.photo);
    items.push({
      photo: best.photo,
      left: best.start * (columnWidth + gap),
      top: best.top,
      width: boxWidth,
      height
    });
    for (let c = best.start; c < best.start + best.span; c += 1) heights[c] = best.top + height + gap;
    waited = best.index === 0 ? 0 : waited + 1;
    pending.splice(best.index, 1);
  }
  return { items, height: Math.max(0, Math.max(...heights) - gap) };
};

// How many columns fit in a container of this width (pixels)
export const columnCount = (width) => {
  if (width < 520) return 2;
  if (width < 820) return 3;
  return 4;
};

// "wedding, #Family  gathering" -> ['wedding', 'family gathering']
export const parseTags = (text) =>
  [
    ...new Set(
      String(text || '')
        .split(',')
        .map((t) => t.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase())
        .filter(Boolean)
    )
  ];

// Reads the pixel size of an image file in the browser (null when it cannot be read)
export const readImageSize = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    img.src = url;
  });

// One tag as typed: "#Family  Gathering" -> "family gathering"
export const normTag = (text) =>
  String(text || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Number of single-letter changes between two words (a missed letter, a swapped letter...)
export const levenshtein = (a, b) => {
  const x = String(a);
  const y = String(b);
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= y.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[y.length];
};

const key = (s) => normTag(s);

// What to offer while somebody types an album, tag or name:
//  - exact: the existing value that is the same text (other capitals), if any
//  - matches: existing values that contain the text
//  - near: existing values that are one or two letters away ("wedding" for "weding")
// Values that are already chosen are left out.
export const suggestOptions = (text, options, chosen = [], limit = 12) => {
  const q = key(text);
  const taken = new Set(chosen.map(key));
  const free = (options || []).filter((o) => !taken.has(key(o)));
  if (!q) return { exact: null, matches: free.slice(0, limit), near: [] };
  const exact = (options || []).find((o) => key(o) === q) || null;
  const matches = free
    .filter((o) => key(o).includes(q) && key(o) !== q)
    .sort((a, b) => Number(key(b).startsWith(q)) - Number(key(a).startsWith(q)) || a.localeCompare(b))
    .slice(0, limit);
  const limitDistance = q.length <= 4 ? 1 : 2;
  const near =
    q.length >= 3
      ? free
          .filter((o) => key(o) !== q && !key(o).includes(q) && levenshtein(key(o), q) <= limitDistance)
          .sort((a, b) => levenshtein(key(a), q) - levenshtein(key(b), q))
          .slice(0, 5)
      : [];
  return { exact, matches, near };
};
