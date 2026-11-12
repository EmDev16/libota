import { describe, it, expect } from 'vitest';
import { liveRoute } from '../../src/utils/edgeRoute';

// down from the parent, across to the trunk, down the trunk, across to the child, down into the child
const route = [
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 300, y: 40 },
  { x: 300, y: 200 },
  { x: 500, y: 200 },
  { x: 500, y: 260 }
];

describe('a line that follows its cards', () => {
  it('stays the same when the cards have not moved', () => {
    expect(liveRoute(route, 100, 0, 500, 260)).toEqual(route);
  });

  it('follows the parent: the first pieces move, the trunk stays', () => {
    const moved = liveRoute(route, 140, 10, 500, 260);
    expect(moved[0]).toEqual({ x: 140, y: 10 });
    expect(moved[1]).toEqual({ x: 140, y: 40 }); // still straight down from the parent
    expect(moved[2]).toEqual({ x: 300, y: 40 });
    expect(moved[3]).toEqual({ x: 300, y: 200 });
  });

  it('follows the child: the last pieces move, the trunk stays', () => {
    const moved = liveRoute(route, 100, 0, 620, 300);
    expect(moved[5]).toEqual({ x: 620, y: 300 });
    expect(moved[4]).toEqual({ x: 620, y: 200 }); // still straight down into the child
    expect(moved[3]).toEqual({ x: 300, y: 200 });
  });

  it('keeps every piece straight', () => {
    const moved = liveRoute(route, 40, -20, 700, 330);
    for (let i = 1; i < moved.length; i++) {
      expect(moved[i].x === moved[i - 1].x || moved[i].y === moved[i - 1].y).toBe(true);
    }
  });

  it('copes with a line of two points and with no route', () => {
    expect(liveRoute([{ x: 1, y: 2 }, { x: 1, y: 9 }], 5, 6, 7, 8)).toEqual([{ x: 5, y: 6 }, { x: 7, y: 8 }]);
    expect(liveRoute(undefined, 1, 2, 3, 4)).toBeUndefined();
  });
});
