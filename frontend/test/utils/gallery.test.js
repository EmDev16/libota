import { describe, it, expect } from 'vitest';
import { thumbUrl, aspectOf, layoutColumns, columnCount, parseTags } from '../../src/utils/gallery';

const photo = (id, width, height) => ({ id, width, height });

describe('thumbUrl', () => {
  it('asks Cloudinary for a smaller copy', () => {
    expect(thumbUrl('https://res.cloudinary.com/x/image/upload/v1/libota/a.jpg', 600)).toBe(
      'https://res.cloudinary.com/x/image/upload/w_600,c_limit,f_auto,q_auto/v1/libota/a.jpg'
    );
  });
  it('leaves other addresses alone', () => {
    expect(thumbUrl('/uploads/a.jpg', 600)).toBe('/uploads/a.jpg');
    expect(thumbUrl('', 600)).toBe('');
  });
});

describe('aspectOf', () => {
  it('is width divided by height, square when unknown', () => {
    expect(aspectOf(photo(1, 4000, 2000))).toBe(2);
    expect(aspectOf(photo(2, 2000, 4000))).toBe(0.5);
    expect(aspectOf({ id: 3 })).toBe(1);
  });
});

describe('layoutColumns', () => {
  it('keeps every photo exactly once', () => {
    const photos = Array.from({ length: 23 }, (_, i) => photo(i, 1000 + i * 37, 700 + ((i * 91) % 900)));
    const columns = layoutColumns(photos, 4);
    expect(columns).toHaveLength(4);
    expect(columns.flat().map((p) => p.id).sort((a, b) => a - b)).toEqual(photos.map((p) => p.id));
  });

  it('keeps the columns about equally tall with a mix of formats', () => {
    const formats = [[4, 3], [3, 4], [1, 1], [16, 9], [9, 16], [3, 2]];
    const photos = Array.from({ length: 60 }, (_, i) => photo(i, formats[i % 6][0] * 100, formats[i % 6][1] * 100));
    const heights = layoutColumns(photos, 4).map((col) => col.reduce((sum, p) => sum + 1 / aspectOf(p), 0));
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeLessThan(2); // less than two picture widths of difference
  });

  it('puts the first photos side by side across the top', () => {
    const columns = layoutColumns([photo(1, 100, 100), photo(2, 100, 100), photo(3, 100, 100)], 3);
    expect(columns.map((c) => c.map((p) => p.id))).toEqual([[1], [2], [3]]);
  });

  it('copes with no photos and with a bad column count', () => {
    expect(layoutColumns([], 3)).toEqual([[], [], []]);
    expect(layoutColumns([photo(1, 1, 1)], 0)).toEqual([[photo(1, 1, 1)]]);
  });
});

describe('columnCount', () => {
  it('uses 2 columns on a phone and more on wide screens', () => {
    expect(columnCount(360)).toBe(2);
    expect(columnCount(700)).toBe(3);
    expect(columnCount(1200)).toBe(4);
  });
});

describe('parseTags', () => {
  it('cleans, lowercases and removes doubles', () => {
    expect(parseTags('Wedding, #family  gathering ,wedding,,')).toEqual(['wedding', 'family gathering']);
    expect(parseTags('')).toEqual([]);
  });
});
