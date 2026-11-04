import { describe, it, expect } from 'vitest';
import { mixPhotos } from '../../src/utils/mix';

const photos = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, album: 'Wedding', year: 2020 })),
  ...Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, album: 'Trip', year: 2019 })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, album: '', year: 2018 }))
];
const longestRun = (list) => {
  let best = 0;
  let run = 0;
  let prev = '';
  list.forEach((p) => {
    run = p.id[0] === prev ? run + 1 : 1;
    prev = p.id[0];
    best = Math.max(best, run);
  });
  return best;
};

describe('mixing the gallery', () => {
  it('keeps every photo exactly once', () => {
    const mixed = mixPhotos(photos, 7);
    expect(mixed).toHaveLength(60);
    expect(new Set(mixed.map((p) => p.id)).size).toBe(60);
  });

  it('does not leave an album in a block', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(longestRun(mixPhotos(photos, seed))).toBeLessThanOrEqual(6);
    }
  });

  it('gives the same order for the same seed, and another order for another seed', () => {
    const ids = (seed) => mixPhotos(photos, seed).map((p) => p.id).join();
    expect(ids(3)).toBe(ids(3));
    expect(ids(3)).not.toBe(ids(4));
  });

  it('handles an empty or tiny gallery', () => {
    expect(mixPhotos([], 1)).toEqual([]);
    expect(mixPhotos([{ id: 'x' }], 1)).toHaveLength(1);
  });
});
