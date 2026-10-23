// Helpers for the gallery grid.

// https://res.cloudinary.com/<cloud>/image/upload/v1/libota/a.jpg -> a smaller copy made by Cloudinary.
// Photos kept on our own server (and anything else) are returned as they are.
export const thumbUrl = (url, width) => {
  if (typeof url !== 'string' || !/^https:\/\/res\.cloudinary\.com\//i.test(url)) return url;
  return url.replace('/upload/', `/upload/w_${width},c_limit,f_auto,q_auto/`);
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
