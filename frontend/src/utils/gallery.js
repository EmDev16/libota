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
