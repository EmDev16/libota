import { describe, it, expect } from 'vitest';
import { normalizeRelationships, MODERN_SIZES } from '../../src/utils/treeLayout';
import { calculateGraphLayout, calculateGraphLayoutFor } from '../../src/utils/graphLayout';
import fakeFamily from '../fixtures/fake-family-40.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const person = (id, extra = {}) => ({
  _id: id,
  firstName: id,
  lastName: 'Test',
  gender: 'male',
  parents: [],
  children: [],
  spouses: [],
  ...extra
});

const layoutOf = (people) => calculateGraphLayout(normalizeRelationships(people));
const cardsOf = (layout) => layout.nodes.filter((n) => n.type === 'personNode');
const cardOf = (layout, id) => cardsOf(layout).find((n) => n.id === id);
const childEdges = (layout) => layout.edges.filter((e) => e.id.startsWith('child-'));

// Ruth and Marthe are sisters. Ruth married André, Marthe married Moise;
// André and Moise both have their parents in the tree too.
const twoFamiliesMeet = () => [
  person('david', { spouses: ['rebecca'], children: ['ruth', 'marthe'] }),
  person('rebecca', { gender: 'female', spouses: ['david'], children: ['ruth', 'marthe'] }),
  person('ruth', { gender: 'female', parents: ['david', 'rebecca'], spouses: ['andre'], children: ['nsonga'] }),
  person('marthe', { gender: 'female', parents: ['david', 'rebecca'], spouses: ['moise'] }),
  person('andre', { parents: ['papa-d', 'mama-d'], spouses: ['ruth'], children: ['nsonga'] }),
  person('papa-d', { spouses: ['mama-d'], children: ['andre'] }),
  person('mama-d', { gender: 'female', spouses: ['papa-d'], children: ['andre'] }),
  person('moise', { parents: ['papa-m', 'mama-m'], spouses: ['marthe'] }),
  person('papa-m', { spouses: ['mama-m'], children: ['moise'] }),
  person('mama-m', { gender: 'female', spouses: ['papa-m'], children: ['moise'] }),
  person('nsonga', { gender: 'female', parents: ['ruth', 'andre'] })
];

// Everything that must be true for any family
function expectSoundLayout(rawPeople) {
  const people = normalizeRelationships(rawPeople);
  const layout = calculateGraphLayout(people);
  const cards = cardsOf(layout);
  const at = new Map(cards.map((c) => [c.id, c.position]));

  // everybody once
  expect(cards).toHaveLength(people.length);
  expect(new Set(cards.map((c) => c.id)).size).toBe(people.length);

  people.forEach((p) => {
    // children below all of their parents
    p.parents
      .filter((id) => at.has(id))
      .forEach((parent) => expect(at.get(p._id).y).toBeGreaterThan(at.get(parent).y));
    // partners on one row
    p.spouses.filter((id) => at.has(id)).forEach((s) => expect(at.get(s).y).toBe(at.get(p._id).y));
    // a line comes down to every child
    if (p.parents.some((id) => at.has(id))) {
      expect(childEdges(layout).some((e) => e.target === p._id)).toBe(true);
    }
  });

  // no two cards on top of each other
  const rows = new Map();
  cards.forEach((c) => {
    if (!rows.has(c.position.y)) rows.set(c.position.y, []);
    rows.get(c.position.y).push(c.position.x);
  });
  rows.forEach((xs) => {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThan(MODERN_SIZES.NODE_W - 1);
    }
  });

  // every number is a real number
  cards.forEach((c) => {
    expect(Number.isFinite(c.position.x)).toBe(true);
    expect(Number.isFinite(c.position.y)).toBe(true);
  });
  return layout;
}

// Small random families (with cousins marrying, remarriages, several partners)
function randomFamily(seed, maxPartners) {
  let state = seed * 104729 + 7;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const people = [];
  const make = () => {
    const p = person(`p${people.length}`);
    people.push(p);
    return p;
  };
  const marry = (a, b) => {
    if (a === b || a.spouses.includes(b._id)) return;
    if (a.spouses.length >= maxPartners || b.spouses.length >= maxPartners) return;
    if (a.parents.some((x) => b.parents.includes(x))) return;
    a.spouses.push(b._id);
    b.spouses.push(a._id);
  };

  let generation = [make(), make(), make(), make()];
  marry(generation[0], generation[1]);
  marry(generation[2], generation[3]);
  if (random() < 0.5) marry(generation[1], generation[2]);

  for (let g = 0; g < 4 && generation.length > 0; g++) {
    const next = [];
    people.forEach((a) =>
      a.spouses.forEach((sid) => {
        const b = people.find((x) => x._id === sid);
        if (a._id < b._id && (generation.includes(a) || generation.includes(b))) {
          for (let i = Math.floor(random() * 3); i > 0; i--) {
            const child = make();
            child.parents = [a._id, b._id];
            a.children.push(child._id);
            b.children.push(child._id);
            next.push(child);
          }
        }
      })
    );
    next.forEach((child) => {
      if (random() < 0.8) {
        const other = random() < 0.6 ? next[Math.floor(random() * next.length)] : make();
        marry(child, other);
      }
    });
    generation = next;
  }
  return people;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateGraphLayout', () => {
  describe('a couple whose two families are both in the tree', () => {
    it('draws every person once, with the parents of both partners above them', () => {
      const layout = expectSoundLayout(twoFamiliesMeet());

      const y = (id) => cardOf(layout, id).position.y;
      expect(y('ruth')).toBeGreaterThan(y('david'));
      expect(y('andre')).toBeGreaterThan(y('papa-d'));
      expect(y('nsonga')).toBeGreaterThan(y('ruth'));
    });

    it('keeps Ruth and André next to each other', () => {
      const layout = layoutOf(twoFamiliesMeet());
      const ruth = cardOf(layout, 'ruth').position;
      const andre = cardOf(layout, 'andre').position;

      expect(ruth.y).toBe(andre.y);
      expect(Math.abs(ruth.x - andre.x)).toBe(MODERN_SIZES.NODE_W + MODERN_SIZES.PARTNER_GAP);
    });

    it('hangs both sisters from their parents', () => {
      const layout = layoutOf(twoFamiliesMeet());
      const sources = childEdges(layout)
        .filter((e) => e.target === 'ruth' || e.target === 'marthe')
        .map((e) => e.source);

      expect(sources).toHaveLength(2);
      expect(new Set(sources).size).toBe(1);
      expect(sources[0]).toContain('david');
    });

    it('orders the families so that no lines cross', () => {
      const layout = layoutOf(twoFamiliesMeet());
      const x = (id) => cardOf(layout, id).position.x;

      // André's parents on the left of Ruth's parents, because André is left of Ruth
      const andreFirst = x('andre') < x('ruth');
      expect(x('papa-d') < x('david')).toBe(andreFirst);
      // Marthe's husband's parents on the right
      expect(x('papa-m')).toBeGreaterThan(x('david'));
    });
  });

  describe('partners', () => {
    it('puts a person with two partners between them', () => {
      const layout = expectSoundLayout([
        person('jean', { spouses: ['carine', 'rose'], children: ['david', 'joel'] }),
        person('carine', { gender: 'female', spouses: ['jean'], children: ['david'] }),
        person('rose', { gender: 'female', spouses: ['jean'], children: ['joel'] }),
        person('david', { parents: ['jean', 'carine'] }),
        person('joel', { parents: ['jean', 'rose'] })
      ]);
      const x = (id) => cardOf(layout, id).position.x;

      expect(Math.abs(x('jean') - x('carine'))).toBe(MODERN_SIZES.NODE_W + MODERN_SIZES.PARTNER_GAP);
      expect(Math.abs(x('jean') - x('rose'))).toBe(MODERN_SIZES.NODE_W + MODERN_SIZES.PARTNER_GAP);
      expect(Math.sign(x('carine') - x('jean'))).not.toBe(Math.sign(x('rose') - x('jean')));
    });

    it('can show a person with three or four partners', () => {
      [3, 4].forEach((count) => {
        const partners = Array.from({ length: count }, (_, i) => `w${i}`);
        const people = [
          person('man', { spouses: partners, children: partners.map((w) => `kid-${w}`) }),
          ...partners.map((w) =>
            person(w, { gender: 'female', spouses: ['man'], children: [`kid-${w}`] })
          ),
          ...partners.map((w) => person(`kid-${w}`, { parents: ['man', w] }))
        ];
        const layout = expectSoundLayout(people);

        // all of them on one row, one line per partnership
        expect(layout.nodes.filter((n) => n.type === 'unionNode')).toHaveLength(count);
      });
    });
  });

  describe('every family', () => {
    it('is sound for the 40 people of the fake family', () => {
      expectSoundLayout(fakeFamily.people || fakeFamily);
    });

    it('is sound for 300 random families, with up to 4 partners each', () => {
      for (let seed = 1; seed <= 100; seed++) {
        expectSoundLayout(randomFamily(seed, 2));
        expectSoundLayout(randomFamily(seed, 3));
        expectSoundLayout(randomFamily(seed, 4));
      }
    });

    it('puts a founder right above their children, not at the very top', () => {
      // The Smiths have children in generation 2; the Joneses only in generation 3
      const layout = expectSoundLayout([
        person('gp1', { spouses: ['gp2'], children: ['a'] }),
        person('gp2', { spouses: ['gp1'], children: ['a'] }),
        person('a', { parents: ['gp1', 'gp2'], spouses: ['b'], children: ['c'] }),
        person('b', { spouses: ['a'], children: ['c'] }),
        person('c', { parents: ['a', 'b'], spouses: ['d'] }),
        person('d', { parents: ['jo1', 'jo2'], spouses: ['c'] }),
        person('jo1', { spouses: ['jo2'], children: ['d'] }),
        person('jo2', { spouses: ['jo1'], children: ['d'] })
      ]);
      const step = MODERN_SIZES.NODE_H + MODERN_SIZES.ROW_GAP;

      // the Joneses sit one row above their child D, who is on the same row as C
      expect(cardOf(layout, 'jo1').position.y).toBe(cardOf(layout, 'd').position.y - step);
    });
  });

  describe('unlinked people', () => {
    it('are left out of the tree and shown in a row at the bottom when asked', () => {
      const people = normalizeRelationships([
        person('a', { spouses: ['b'] }),
        person('b', { spouses: ['a'] }),
        person('loner')
      ]);
      const tree = calculateGraphLayoutFor(people, '', 'Unlinked');
      const loner = cardOf(tree, 'loner');

      expect(loner.position.y).toBeGreaterThan(cardOf(tree, 'a').position.y);
      expect(tree.nodes.some((n) => n.type === 'labelNode' && n.data.label === 'Unlinked')).toBe(true);
    });

    it('are not shown when the tree is limited to one person', () => {
      const people = normalizeRelationships([
        person('a', { spouses: ['b'] }),
        person('b', { spouses: ['a'] }),
        person('loner')
      ]);
      const tree = calculateGraphLayoutFor(people, 'a');

      expect(cardOf(tree, 'loner')).toBe(undefined);
      expect(cardOf(tree, 'a')).toBeTruthy();
    });
  });

  describe('calculateGraphLayoutFor with a selected person', () => {
    it('shows the person, their ancestors and descendants', () => {
      const tree = calculateGraphLayoutFor(normalizeRelationships(twoFamiliesMeet()), 'ruth');
      const ids = cardsOf(tree).map((c) => c.id);

      expect(ids).toContain('ruth');
      expect(ids).toContain('david');
      expect(ids).toContain('nsonga');
      expect(ids).toContain('andre');
    });
  });

  describe('the lines for the traditional view', () => {
    it('has one line to every child and one for every partnership', () => {
      const layout = layoutOf(twoFamiliesMeet());

      expect(layout.geometry.children).toHaveLength(childEdges(layout).length);
      expect(layout.geometry.unions).toHaveLength(layout.nodes.filter((n) => n.type === 'unionNode').length);
      expect(layout.size.width).toBeGreaterThan(0);
      expect(layout.size.height).toBeGreaterThan(0);
    });
  });
});
