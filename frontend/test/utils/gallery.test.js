import { describe, it, expect } from 'vitest';
import { thumbUrl, aspectOf, spanOf, layoutCollage, layoutColumns, columnCount, parseTags, normTag, levenshtein, suggestOptions } from '../../src/utils/gallery';

const photo = (id, width, height) => ({ id, width, height });

describe('thumbUrl', () => {
  it('asks Cloudinary for a smaller copy', () => {
    expect(thumbUrl('https://res.cloudinary.com/x/image/upload/v1/libota/a.jpg', 600)).toBe(
      'https://res.cloudinary.com/x/image/upload/w_600,c_limit,f_auto,q_auto:good/v1/libota/a.jpg'
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

describe('tag helpers', () => {
  it('cleans a tag like the server does', () => {
    expect(normTag(' #Family  Gathering ')).toBe('family gathering');
  });

  it('counts letter changes', () => {
    expect(levenshtein('wedding', 'weding')).toBe(1);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'ab')).toBe(2);
  });

  it('offers existing values, also when a letter is missed', () => {
    const options = ['wedding', 'christmas 2019', 'holiday', 'Wedding Party'];
    expect(suggestOptions('weding', options).near).toEqual(['wedding']);
    expect(suggestOptions('wedd', options).matches).toEqual(['wedding', 'Wedding Party']);
    expect(suggestOptions('Wedding', options).exact).toBe('wedding');
    expect(suggestOptions('', options).matches).toHaveLength(4);
  });

  it('leaves out what is already chosen', () => {
    expect(suggestOptions('', ['a', 'b'], ['A']).matches).toEqual(['b']);
  });
});

describe('spanOf', () => {
  it('gives vertical and square photos one column', () => {
    expect(spanOf(photo('a', 800, 1200), 4)).toBe(1);
    expect(spanOf(photo('b', 1000, 1000), 4)).toBe(1);
    expect(spanOf(photo('c'), 4)).toBe(1); // size unknown
  });

  it('lets horizontal photos take two or three columns, never more than there are', () => {
    const spans = new Set();
    for (let i = 0; i < 200; i += 1) spans.add(spanOf(photo(`wide-${i}`, 2000, 1000), 4));
    expect([...spans].sort()).toEqual([1, 2, 3]);
    for (let i = 0; i < 50; i += 1) expect(spanOf(photo(`w-${i}`, 3000, 1000), 2)).toBeLessThanOrEqual(2);
  });

  it('is always the same for the same photo', () => {
    expect(spanOf(photo('same', 2000, 1000), 4)).toBe(spanOf(photo('same', 2000, 1000), 4));
  });
});

describe('layoutCollage', () => {
  const mixed = Array.from({ length: 60 }, (_, i) =>
    photo(`p${i}`, [1600, 1000, 1200, 2400][i % 4], [1000, 1500, 1200, 1000][i % 4])
  );

  it('places every photo once, inside the container, without overlap', () => {
    const { items, height } = layoutCollage(mixed, 1000, 4);
    expect(items).toHaveLength(60);
    expect(new Set(items.map((x) => x.photo.id)).size).toBe(60);
    items.forEach((x) => {
      expect(x.left).toBeGreaterThanOrEqual(0);
      expect(x.left + x.width).toBeLessThanOrEqual(1000 + 1e-6);
      expect(x.top + x.height).toBeLessThanOrEqual(height + 1e-6);
    });
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        const apart =
          a.left + a.width <= b.left + 1e-6 || b.left + b.width <= a.left + 1e-6 ||
          a.top + a.height <= b.top + 1e-6 || b.top + b.height <= a.top + 1e-6;
        expect(apart).toBe(true);
      }
    }
  });

  it('keeps the shape of every photo', () => {
    layoutCollage(mixed, 1000, 4).items.forEach((x) => {
      expect(x.width / x.height).toBeCloseTo(aspectOf(x.photo), 5);
    });
  });

  it('uses wide boxes for some horizontal photos', () => {
    const { items } = layoutCollage(mixed, 1000, 4);
    const columnWidth = (1000 - 30) / 4;
    expect(items.some((x) => x.width > columnWidth * 1.5)).toBe(true);
    expect(items.some((x) => x.width > columnWidth * 2.5)).toBe(true);
  });

  it('leaves little empty space', () => {
    const { items, height } = layoutCollage(mixed, 1000, 4);
    const used = items.reduce((sum, x) => sum + x.width * x.height, 0);
    expect(used / (1000 * height)).toBeGreaterThan(0.85);
  });

  it('copes with no photos, one photo and a bad column count', () => {
    expect(layoutCollage([], 800, 3)).toEqual({ items: [], height: 0 });
    expect(layoutCollage([photo('a', 100, 100)], 800, 0).items).toHaveLength(1);
  });
});
