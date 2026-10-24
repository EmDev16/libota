import { describe, it, expect } from 'vitest';
import {
  getDescendantsWithPartners,
  normalizeRelationships,
  calculateGenerationalLevels,
  calculateTraditionalLayout,
  calculateModernLayout,
  findUnlinkedPeople,
  getGenerationLabel,
  MODERN_SIZES
} from '../../src/utils/treeLayout';
import fakeFamily from '../fixtures/fake-family-40.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A person with no links; every test only states the links it cares about
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

// What the app does after loading: clean up the links, then build the tree
const buildTree = (people, rootPersonId = null) =>
  calculateTraditionalLayout(normalizeRelationships(people), rootPersonId);

const ids = (people) => people.map((p) => p._id);
const childrenOf = (node) =>
  node.links.length > 0 ? node.links.flatMap((l) => l.children) : node.children;

// Every person id in a tree, in the order they are shown
const allIds = (nodes) =>
  nodes.flatMap((n) => [...ids(n.couple), ...allIds(childrenOf(n))]);

const findNode = (nodes, id) => {
  for (const n of nodes) {
    if (ids(n.couple).includes(id)) return n;
    const inside = findNode(childrenOf(n), id);
    if (inside) return inside;
  }
  return null;
};

// Anna + Ben, with Cleo (born 1990) and Dan (born 1985)
const familyOfFour = () => [
  person('anna', { spouses: ['ben'], children: ['cleo', 'dan'] }),
  person('ben', { spouses: ['anna'], children: ['cleo', 'dan'] }),
  person('cleo', { parents: ['anna', 'ben'], birthDate: '1990-01-01' }),
  person('dan', { parents: ['anna', 'ben'], birthDate: '1985-01-01' })
];

// Jean was married to Carine (son David), then to Rose (son Joel)
const twoPartnerFamily = () => [
  person('jean', { spouses: ['carine', 'rose'], children: ['david', 'joel'] }),
  person('carine', { spouses: ['jean'], children: ['david'] }),
  person('rose', { spouses: ['jean'], children: ['joel'] }),
  person('david', { parents: ['jean', 'carine'] }),
  person('joel', { parents: ['jean', 'rose'] })
];

// The same, and Carine later married Marc (daughter Ruth)
const remarriedFamily = () => [
  person('jean', { spouses: ['carine', 'rose'], children: ['david', 'joel'] }),
  person('carine', { spouses: ['jean', 'marc'], children: ['david', 'ruth'] }),
  person('rose', { spouses: ['jean'], children: ['joel'] }),
  person('marc', { spouses: ['carine'], children: ['ruth'] }),
  person('david', { parents: ['jean', 'carine'] }),
  person('joel', { parents: ['jean', 'rose'] }),
  person('ruth', { parents: ['carine', 'marc'] })
];

// ---------------------------------------------------------------------------
// normalizeRelationships
// ---------------------------------------------------------------------------

describe('normalizeRelationships', () => {
  it('turns populated objects into plain string ids', () => {
    const [kid] = normalizeRelationships([
      person('mom', { children: [{ _id: 'kid', firstName: 'Kid' }] }),
      person('kid', { parents: [{ _id: 'mom', firstName: 'Mom' }] })
    ]).filter((p) => p._id === 'kid');

    expect(kid.parents).toEqual(['mom']);
  });

  it('makes parent and child links work in both directions', () => {
    const result = normalizeRelationships([
      person('mom'),
      person('kid', { parents: ['mom'] })
    ]);

    expect(result.find((p) => p._id === 'mom').children).toEqual(['kid']);
  });

  it('makes a link stored only on the parent work for the child too', () => {
    const result = normalizeRelationships([
      person('mom', { children: ['kid'] }),
      person('kid')
    ]);

    expect(result.find((p) => p._id === 'kid').parents).toEqual(['mom']);
  });

  it('makes spouse links work in both directions', () => {
    const result = normalizeRelationships([
      person('a', { spouses: ['b'] }),
      person('b')
    ]);

    expect(result.find((p) => p._id === 'b').spouses).toEqual(['a']);
  });

  it('treats two people with a common child as a couple', () => {
    const result = normalizeRelationships([
      person('mom'),
      person('dad'),
      person('kid', { parents: ['mom', 'dad'] })
    ]);

    expect(result.find((p) => p._id === 'mom').spouses).toEqual(['dad']);
    expect(result.find((p) => p._id === 'dad').spouses).toEqual(['mom']);
  });

  it('does not invent people for links that point nowhere', () => {
    const result = normalizeRelationships([person('kid', { parents: ['ghost'] })]);

    expect(ids(result)).toEqual(['kid']);
  });

  it('does not change the data it is given', () => {
    const input = [person('mom', { children: ['kid'] }), person('kid')];
    const before = JSON.stringify(input);

    normalizeRelationships(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it('does not list the same person twice', () => {
    const result = normalizeRelationships([
      person('mom', { children: ['kid', 'kid'] }),
      person('kid', { parents: ['mom'] })
    ]);

    expect(result.find((p) => p._id === 'mom').children).toEqual(['kid']);
  });
});

// ---------------------------------------------------------------------------
// calculateGenerationalLevels / getGenerationLabel / findUnlinkedPeople
// ---------------------------------------------------------------------------

describe('calculateGenerationalLevels', () => {
  it('puts parents on level 0 and each generation one level lower', () => {
    const people = normalizeRelationships([
      ...familyOfFour(),
      person('eli', { parents: ['cleo'] })
    ]);
    const levels = calculateGenerationalLevels(people);

    expect(levels.get('anna')).toBe(0);
    expect(levels.get('cleo')).toBe(1);
    expect(levels.get('eli')).toBe(2);
  });
});

describe('getGenerationLabel', () => {
  it('names the generations around the selected person', () => {
    expect(getGenerationLabel(0, 1)).toBe('Parents');
    expect(getGenerationLabel(1, 1)).toBe('Selected Generation');
    expect(getGenerationLabel(3, 1)).toBe('Grandchildren');
  });
});

describe('findUnlinkedPeople', () => {
  it('returns only people without any parent, child or partner', () => {
    const people = normalizeRelationships([...familyOfFour(), person('loner')]);

    expect(ids(findUnlinkedPeople(people))).toEqual(['loner']);
  });
});

// ---------------------------------------------------------------------------
// calculateTraditionalLayout (the family tree structure)
// ---------------------------------------------------------------------------

describe('calculateTraditionalLayout', () => {
  it('shows a couple as one row with their children underneath', () => {
    const tree = buildTree(familyOfFour());

    expect(tree).toHaveLength(1);
    expect(ids(tree[0].couple).sort()).toEqual(['anna', 'ben']);
    expect(tree[0].children).toHaveLength(2);
  });

  it('lists siblings oldest first', () => {
    const [root] = buildTree(familyOfFour());

    expect(root.children.map((c) => c.couple[0]._id)).toEqual(['dan', 'cleo']);
  });

  it('puts a child with one known parent under that parent', () => {
    const [root] = buildTree([
      person('mom', { children: ['kid'] }),
      person('kid', { parents: ['mom'] })
    ]);

    expect(ids(root.couple)).toEqual(['mom']);
    expect(root.children.map((c) => c.couple[0]._id)).toEqual(['kid']);
  });

  it('does not start a second family for someone who married in', () => {
    // The in-law comes first in the list, on purpose
    const tree = buildTree([
      person('inlaw', { spouses: ['son'] }),
      person('grandpa', { children: ['son'] }),
      person('son', { parents: ['grandpa'], spouses: ['inlaw'] })
    ]);

    expect(tree).toHaveLength(1);
    expect(allIds(tree).sort()).toEqual(['grandpa', 'inlaw', 'son']);
  });

  describe('a person with two partners', () => {
    it('is shown between the two partners', () => {
      const tree = buildTree(twoPartnerFamily());

      expect(tree).toHaveLength(1);
      expect(ids(tree[0].couple)).toEqual(['carine', 'jean', 'rose']);
    });

    it('groups the children under the right partnership', () => {
      const [row] = buildTree(twoPartnerFamily());

      // links[0] sits between carine and jean, links[1] between jean and rose
      expect(row.links).toHaveLength(2);
      expect(row.links[0].children.map((c) => c.couple[0]._id)).toEqual(['david']);
      expect(row.links[1].children.map((c) => c.couple[0]._id)).toEqual(['joel']);
    });

    it('lets an ex-partner bring their new partner into the row', () => {
      const tree = buildTree(remarriedFamily());
      const row = findNode(tree, 'jean');

      expect(ids(row.couple)).toEqual(['marc', 'carine', 'jean', 'rose']);
      expect(row.links[0].children.map((c) => c.couple[0]._id)).toEqual(['ruth']);
    });

    it('shows every person exactly once', () => {
      const tree = buildTree(remarriedFamily());
      const shown = allIds(tree);

      expect(shown).toHaveLength(7);
      expect(new Set(shown).size).toBe(7);
    });
  });

  describe('viewing from one person', () => {
    it('leaves out families that are not related', () => {
      const people = [
        ...familyOfFour(),
        person('x', { spouses: ['y'], children: ['z'] }),
        person('y', { spouses: ['x'], children: ['z'] }),
        person('z', { parents: ['x', 'y'] })
      ];
      const shown = allIds(buildTree(people, 'cleo'));

      expect(shown).toContain('cleo');
      expect(shown).not.toContain('x');
      expect(shown).not.toContain('z');
    });
  });

  describe('with the 40-person test family', () => {
    const people = normalizeRelationships(fakeFamily.people);
    const unlinked = ids(findUnlinkedPeople(people));
    const linked = people.filter((p) => !unlinked.includes(p._id));
    const tree = calculateTraditionalLayout(linked, null);

    it('has exactly one unlinked person', () => {
      expect(unlinked).toHaveLength(1);
    });

    it('shows every linked person exactly once', () => {
      const shown = allIds(tree);

      expect(shown).toHaveLength(linked.length);
      expect(new Set(shown).size).toBe(linked.length);
    });

    it('builds one family tree from the two grandparents', () => {
      // Joseph and Marie, the top of the family
      expect(tree).toHaveLength(1);
    });

    it('shows Jean between his two wives, with the ex-wife\'s second husband', () => {
      const row = findNode(tree, 'p05');

      expect(ids(row.couple)).toEqual(['p12', 'p10', 'p05', 'p11']);
    });

    it('lists Daniel\'s six children oldest first', () => {
      const daniel = findNode(tree, 'p07');

      expect(daniel.children.map((c) => c.couple[0]._id)).toEqual([
        'p26', 'p27', 'p28', 'p29', 'p30', 'p31'
      ]);
    });

    it('puts the single parent\'s child under her', () => {
      const albertine = findNode(tree, 'p06');

      expect(ids(albertine.couple)).toEqual(['p06']);
      expect(albertine.children.map((c) => c.couple[0]._id)).toEqual(['p25']);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateModernLayout (positions for the Modern view and the PDF)
// ---------------------------------------------------------------------------

describe('calculateModernLayout', () => {
  const people = normalizeRelationships(fakeFamily.people);
  const unlinkedPeople = findUnlinkedPeople(people);
  const unlinkedIds = ids(unlinkedPeople);
  const tree = calculateTraditionalLayout(
    people.filter((p) => !unlinkedIds.includes(p._id)),
    null
  );
  const { nodes, edges } = calculateModernLayout(tree, unlinkedPeople);
  const personNodes = nodes.filter((n) => n.type === 'personNode');
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  it('places every person once, including the unlinked ones', () => {
    expect(personNodes).toHaveLength(people.length);
    expect(new Set(personNodes.map((n) => n.id)).size).toBe(people.length);
  });

  it('never lets two cards overlap', () => {
    const { NODE_W, NODE_H } = MODERN_SIZES;
    let overlaps = 0;

    for (let i = 0; i < personNodes.length; i++) {
      for (let j = i + 1; j < personNodes.length; j++) {
        const a = personNodes[i].position;
        const b = personNodes[j].position;
        if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) overlaps++;
      }
    }

    expect(overlaps).toBe(0);
  });

  it('only draws lines between things that exist', () => {
    const broken = edges.filter((e) => !nodeById.has(e.source) || !nodeById.has(e.target));

    expect(broken).toHaveLength(0);
  });

  it('has unique ids for all nodes and lines', () => {
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });

  it('draws every line from a parent down to a child', () => {
    const childEdges = edges.filter((e) => e.id.startsWith('child-'));

    expect(childEdges.length).toBeGreaterThan(0);
    childEdges.forEach((e) => {
      expect(nodeById.get(e.target).position.y).toBeGreaterThan(nodeById.get(e.source).position.y);
    });
  });

  it('creates one union dot per partnership', () => {
    const countLinks = (nodeList) =>
      nodeList.reduce(
        (sum, n) => sum + (n.couple.length - 1) + countLinks(childrenOf(n)),
        0
      );
    const unions = nodes.filter((n) => n.type === 'unionNode');

    expect(unions).toHaveLength(countLinks(tree));
  });

  it('centers the children under their parents', () => {
    const { NODE_W, DOT } = MODERN_SIZES;
    // Daniel and Helene have six children in a row
    const union = nodes.find(
      (n) => n.type === 'unionNode' && n.id.includes('p07') && n.id.includes('p13')
    );
    const kids = ['p26', 'p31'].map((id) => nodeById.get(id).position.x + NODE_W / 2);
    const unionCenter = union.position.x + DOT / 2;

    expect(unionCenter).toBeCloseTo((kids[0] + kids[1]) / 2, 0);
  });

  it('puts unlinked people in their own row below the tree, with a label', () => {
    const label = nodes.find((n) => n.type === 'labelNode');
    const lowestLinked = Math.max(
      ...personNodes.filter((n) => !unlinkedIds.includes(n.id)).map((n) => n.position.y)
    );

    expect(label).toBeTruthy();
    unlinkedIds.forEach((id) => {
      expect(nodeById.get(id).position.y).toBeGreaterThan(lowestLinked);
    });
  });

  it('handles a single person without lines', () => {
    const lone = calculateTraditionalLayout(normalizeRelationships([person('solo')]), null);
    const result = calculateModernLayout(lone);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// A person from one family married to a person from another family
// ---------------------------------------------------------------------------

// David + Rebecca have Ruth and Marthe. Ruth married André (his parents are in the tree too)
// and they have Nsonga. Marthe married Moise, who is also from a family in the tree.
const twoFamiliesMeet = () => [
  person('david', { spouses: ['rebecca'], children: ['ruth', 'marthe'] }),
  person('rebecca', { gender: 'female', spouses: ['david'], children: ['ruth', 'marthe'] }),
  person('ruth', { gender: 'female', parents: ['david', 'rebecca'], spouses: ['andre'], children: ['nsonga'] }),
  person('marthe', { gender: 'female', parents: ['david', 'rebecca'], spouses: ['moise'] }),
  person('andre', { parents: ['papa-daie', 'mama-daie'], spouses: ['ruth'], children: ['nsonga'] }),
  person('papa-daie', { spouses: ['mama-daie'], children: ['andre'] }),
  person('mama-daie', { gender: 'female', spouses: ['papa-daie'], children: ['andre'] }),
  person('moise', { parents: ['papa-m', 'mama-m'], spouses: ['marthe'] }),
  person('papa-m', { spouses: ['mama-m'], children: ['moise'] }),
  person('mama-m', { gender: 'female', spouses: ['papa-m'], children: ['moise'] }),
  person('nsonga', { gender: 'female', parents: ['ruth', 'andre'] })
];

describe('a person who belongs to two families', () => {
  it('shows both sisters under their parents, even though one is married into another family', () => {
    const tree = buildTree(twoFamiliesMeet());
    const davidRow = findNode(tree, 'david');
    const kids = ids(childrenOf(davidRow).flatMap((n) => n.couple));

    expect(kids).toContain('ruth');
    expect(kids).toContain('marthe');
  });

  it('draws the husband\'s parents above him as well', () => {
    const tree = buildTree(twoFamiliesMeet());
    const papaRow = findNode(tree, 'papa-daie');
    expect(ids(childrenOf(papaRow).flatMap((n) => n.couple))).toContain('andre');
  });

  it('draws each person in full exactly once, the rest are references', () => {
    const tree = buildTree(twoFamiliesMeet());
    const real = [];
    const walk = (nodes) =>
      nodes.forEach((n) => {
        if (!n.reference) {
          n.couple.forEach((p) => {
            if (!(n.referenceIds || []).includes(p._id)) real.push(p._id);
          });
        }
        walk(childrenOf(n));
      });
    walk(tree);

    expect([...real].sort()).toEqual(twoFamiliesMeet().map((p) => p._id).sort());
  });

  it('marks the second appearance as a reference that says where the real card is', () => {
    const tree = buildTree(twoFamiliesMeet());
    const refs = [];
    const walk = (nodes) =>
      nodes.forEach((n) => {
        if (n.reference) refs.push(n);
        walk(childrenOf(n));
      });
    walk(tree);

    expect(refs.length).toBeGreaterThan(0);
    refs.forEach((r) => expect(r.couple).toHaveLength(1));
    // Ruth's real card is next to André, so her reference says "with André"
    const ruthRef = refs.find((r) => r.couple[0]._id === 'ruth');
    if (ruthRef) expect(ids(ruthRef.reference.with)).toContain('andre');
  });

  it('keeps the reference out of the modern view\'s duplicate ids', () => {
    const tree = buildTree(twoFamiliesMeet());
    const { nodes } = calculateModernLayout(tree);
    const nodeIds = nodes.map((n) => n.id);

    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    // The real cards keep their person id
    expect(nodeIds).toContain('ruth');
    expect(nodeIds).toContain('marthe');
  });
});

describe('a person with two partners who both come from families in the tree', () => {
  it('still shows the children of every partnership under their two parents', () => {
    const people = [
      person('gp1', { spouses: ['gp2'], children: ['x', 'y'] }),
      person('gp2', { spouses: ['gp1'], children: ['x', 'y'] }),
      person('hp1', { spouses: ['hp2'], children: ['z'] }),
      person('hp2', { spouses: ['hp1'], children: ['z'] }),
      person('x', { parents: ['gp1', 'gp2'], spouses: ['z'], children: ['kid'] }),
      person('y', { parents: ['gp1', 'gp2'] }),
      person('z', { parents: ['hp1', 'hp2'], spouses: ['x'], children: ['kid'] }),
      person('kid', { parents: ['x', 'z'] })
    ];
    const tree = buildTree(people);

    expect(ids(childrenOf(findNode(tree, 'gp1')).flatMap((n) => n.couple))).toContain('x');
    expect(ids(childrenOf(findNode(tree, 'hp1')).flatMap((n) => n.couple))).toContain('z');
    expect(allIds(tree)).toContain('kid');
  });
});

describe('ended relationships (formerSpouses)', () => {
  it('counts for both partners when only one side says it', () => {
    const people = normalizeRelationships([
      person('jean', { spouses: ['carine'], formerSpouses: ['carine'] }),
      person('carine', { spouses: ['jean'] })
    ]);

    expect(people.find((p) => p._id === 'carine').formerSpouses).toEqual(['jean']);
  });

  it('ignores people who are not partners', () => {
    const people = normalizeRelationships([
      person('jean', { formerSpouses: ['carine'] }),
      person('carine')
    ]);

    expect(people.find((p) => p._id === 'jean').formerSpouses).toEqual([]);
    expect(people.find((p) => p._id === 'carine').formerSpouses).toEqual([]);
  });

  it('accepts populated objects and missing lists', () => {
    const people = normalizeRelationships([
      person('jean', { spouses: [{ _id: 'carine' }], formerSpouses: [{ _id: 'carine' }] }),
      { _id: 'carine', firstName: 'c', parents: [], children: [], spouses: ['jean'] }
    ]);

    expect(people.find((p) => p._id === 'jean').formerSpouses).toEqual(['carine']);
    expect(people.find((p) => p._id === 'carine').formerSpouses).toEqual(['jean']);
  });
});

describe('getDescendantsWithPartners', () => {
  const p = (id, extra = {}) => ({ _id: id, parents: [], children: [], spouses: [], ...extra });
  const people = [
    p('gp', { children: ['dad', 'uncle'], spouses: ['gm'] }),
    p('gm', { spouses: ['gp'], children: ['dad', 'uncle'] }),
    p('dad', { parents: ['gp', 'gm'], children: ['kid'], spouses: ['mom'] }),
    p('mom', { parents: ['momdad'], spouses: ['dad'], children: ['kid'] }),
    p('momdad', { children: ['mom'] }),
    p('kid', { parents: ['dad', 'mom'] }),
    p('uncle', { parents: ['gp', 'gm'] })
  ];
  it('takes the person, the descendants and the partners, not the partners\' parents or other branches', () => {
    expect(getDescendantsWithPartners(people, 'dad').map((x) => x._id).sort()).toEqual(['dad', 'kid', 'mom']);
    expect(getDescendantsWithPartners(people, 'gp').map((x) => x._id).sort()).toEqual(['dad', 'gm', 'gp', 'kid', 'mom', 'uncle'].sort());
  });
});
