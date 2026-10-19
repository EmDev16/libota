import { describe, it, expect, vi } from 'vitest';
import { normalizeRelationships } from '../../src/utils/treeLayout';
import { getPeopleForExport, planFamilyPdf } from '../../src/utils/pdfExport';
import fakeFamily from '../fixtures/fake-family-40.json';

// pdfExport only needs the image URL from the API module, not axios and the network
vi.mock('../../src/api', () => ({ IMAGE_BASE_URL: 'http://localhost:5001' }));

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

const ids = (people) => people.map((p) => p._id).sort();

// Anna + Ben with Cleo and Dan; Cleo has a son, Eli
const smallFamily = () =>
  normalizeRelationships([
    person('anna', { spouses: ['ben'], children: ['cleo', 'dan'] }),
    person('ben', { spouses: ['anna'], children: ['cleo', 'dan'] }),
    person('cleo', { parents: ['anna', 'ben'], children: ['eli'] }),
    person('dan', { parents: ['anna', 'ben'] }),
    person('eli', { parents: ['cleo'] })
  ]);

// The 40-person family (ids from the fixture):
//   p01 Joseph + p02 Marie -> p03..p07 (Pierre, Therese, Jean, Albertine, Daniel)
//   p05 Jean: wives p10 Carine and p11 Rose; p12 Marc is Carine's second husband (child p24 Ruth)
//   p25 Lydia is Albertine's daughter, p33 Noah is a great-grandchild, p40 Victor is unlinked
const people = normalizeRelationships(fakeFamily.people);

const personNodes = (page) => page.layout.nodes.filter((n) => n.type === 'personNode');
const shownIds = (pages) => new Set(pages.flatMap((pg) => personNodes(pg).map((n) => n.id)));

// ---------------------------------------------------------------------------
// getPeopleForExport: who is in the PDF
// ---------------------------------------------------------------------------

describe('getPeopleForExport', () => {
  it('gives the descendants of one person, with their partners', () => {
    const result = getPeopleForExport(people, { rootPersonId: 'p05', up: 0, down: Infinity });

    // Jean, his four children, two grandchildren, and the partners Carine, Rose and Mireille
    expect(ids(result)).toEqual(
      ['p05', 'p20', 'p21', 'p22', 'p23', 'p38', 'p39', 'p10', 'p11', 'p37'].sort()
    );
  });

  it('does not add the partners of partners', () => {
    const result = ids(getPeopleForExport(people, { rootPersonId: 'p05', up: 0, down: Infinity }));

    expect(result).toContain('p10'); // Carine, Jean's ex-wife
    expect(result).not.toContain('p12'); // Marc, Carine's second husband
    expect(result).not.toContain('p24'); // Ruth, Carine and Marc's daughter
  });

  it('counts the generations to show from the chosen person, not from the ancestor', () => {
    // Starting at Cleo's parents: "1 generation down" means Cleo's children (Eli), not just Cleo
    const family = smallFamily();
    const oneDown = ids(getPeopleForExport(family, { rootPersonId: 'cleo', up: 1, down: 1 }));
    const sameLevel = ids(getPeopleForExport(family, { rootPersonId: 'cleo', up: 1, down: 0 }));

    expect(oneDown).toContain('eli');
    expect(sameLevel).not.toContain('eli');
  });

  it('with down 0 stops at the generation of the chosen person', () => {
    const cleo = ids(getPeopleForExport(smallFamily(), { rootPersonId: 'cleo', up: 0, down: 0 }));

    expect(cleo).toEqual(['cleo']);
  });

  it('shows siblings by starting at the parents', () => {
    const result = ids(getPeopleForExport(smallFamily(), { rootPersonId: 'cleo', up: 1, down: 0 }));

    expect(result).toEqual(['anna', 'ben', 'cleo', 'dan']);
  });

  it('shows first cousins by starting at the grandparents', () => {
    const result = ids(getPeopleForExport(people, { rootPersonId: 'p25', up: 2, down: 0 }));

    expect(result).toContain('p01'); // grandparents
    expect(result).toContain('p03'); // aunts and uncles
    expect(result).toContain('p15'); // a cousin
    expect(result).toContain('p25'); // Lydia herself
    expect(result).not.toContain('p33'); // Noah is one generation below Lydia
    expect(result).not.toContain('p24'); // Ruth is not a descendant of the grandparents
  });

  it('starts at the oldest known ancestor when the family line is shorter', () => {
    // Joseph has no known parents, so going 3 generations up still just starts at him
    const result = ids(getPeopleForExport(people, { rootPersonId: 'p01', up: 3, down: Infinity }));

    expect(result).toContain('p01');
    expect(result).toContain('p33');
  });

  it('gives nobody for a person that does not exist', () => {
    expect(getPeopleForExport(people, { rootPersonId: 'nope', up: 0, down: Infinity })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// planFamilyPdf: which pages the PDF gets
// ---------------------------------------------------------------------------

describe('planFamilyPdf', () => {
  const plan = (options) => planFamilyPdf(people, { scope: 'all', ...options });

  describe('unlinked members', () => {
    it('are left out by default', async () => {
      const pages = await plan({ pageMode: 'fit' });

      expect(shownIds(pages).has('p40')).toBe(false);
      expect(shownIds(pages).size).toBe(39);
    });

    it('are added, with a heading, when asked for', async () => {
      const pages = await plan({ pageMode: 'fit', includeUnlinked: true });

      expect(shownIds(pages).has('p40')).toBe(true);
      expect(pages[0].layout.nodes.some((n) => n.type === 'labelNode')).toBe(true);
    });

    it('are ignored for a part of the tree', async () => {
      const pages = await planFamilyPdf(people, {
        scope: 'part',
        rootPersonId: 'p25',
        up: 2,
        down: 0,
        pageMode: 'fit',
        includeUnlinked: true
      });

      expect(shownIds(pages).has('p40')).toBe(false);
    });
  });

  describe('one page (poster)', () => {
    it('makes a single page that fits in a PDF', async () => {
      const pages = await plan({ pageMode: 'fit' });

      expect(pages).toHaveLength(1);
      expect(pages[0].w).toBeLessThan(14401);
      expect(pages[0].h).toBeLessThan(14401);
    });
  });

  describe('split across pages', () => {
    it('uses the chosen paper size and orientation for every page', async () => {
      const pages = await plan({ pageMode: 'tiles', paper: 'a4', orientation: 'landscape' });

      expect(pages.length).toBeGreaterThan(1);
      pages.forEach((pg) => {
        expect(Math.round(pg.w)).toBe(842);
        expect(Math.round(pg.h)).toBe(595);
      });
    });

    it('needs fewer pages on a bigger paper', async () => {
      const a4 = await plan({ pageMode: 'tiles', paper: 'a4', orientation: 'landscape' });
      const a3 = await plan({ pageMode: 'tiles', paper: 'a3', orientation: 'landscape' });

      expect(a3.length).toBeLessThan(a4.length);
    });

    it('shows every person on at least one page', async () => {
      const pages = await plan({ pageMode: 'tiles', includeUnlinked: true });
      const { NODE_W, NODE_H } = { NODE_W: 200, NODE_H: 96 };

      const everyoneCovered = people.every((p) =>
        pages.some((pg) =>
          personNodes(pg).some(
            (n) =>
              n.id === p._id &&
              n.position.x + NODE_W > pg.cull.x0 &&
              n.position.x < pg.cull.x1 &&
              n.position.y + NODE_H > pg.cull.y0 &&
              n.position.y < pg.cull.y1
          )
        )
      );

      expect(everyoneCovered).toBe(true);
    });

    it('labels which part of the tree each page shows', async () => {
      const pages = await plan({ pageMode: 'tiles' });

      pages.forEach((pg) => expect(pg.note).toContain('Strip'));
    });
  });

  describe('one page per branch', () => {
    it('starts with an overview of the top of the tree', async () => {
      const pages = await plan({ pageMode: 'branches' });

      expect(pages[0].title).toBe('Overview');
    });

    it('gives each child of the top couple its own page', async () => {
      const pages = await plan({ pageMode: 'branches' });

      // overview + Pierre, Therese, Jean, Albertine and Daniel
      expect(pages).toHaveLength(6);
      expect(pages[1].title).toContain('Branch of');
    });

    it('adds a page for the unlinked members only when asked', async () => {
      const without = await plan({ pageMode: 'branches' });
      const withUnlinked = await plan({ pageMode: 'branches', includeUnlinked: true });

      expect(withUnlinked).toHaveLength(without.length + 1);
      expect(withUnlinked[withUnlinked.length - 1].title).toBe('Other members');
    });

    it('shows every linked person somewhere', async () => {
      const pages = await plan({ pageMode: 'branches' });

      expect(shownIds(pages).size).toBe(39);
    });
  });

  describe('part of the tree', () => {
    it('only draws the chosen people', async () => {
      const wanted = getPeopleForExport(people, { rootPersonId: 'p25', up: 2, down: 0 });
      const pages = await planFamilyPdf(people, {
        scope: 'part',
        rootPersonId: 'p25',
        up: 2,
        down: 0,
        pageMode: 'fit'
      });

      expect(ids(wanted.filter((p) => shownIds(pages).has(p._id)))).toEqual(ids(wanted));
      expect(shownIds(pages).size).toBe(wanted.length);
      expect(pages[0].subtitle).toContain('Part of the tree');
    });
  });

  describe('when there is nothing to draw', () => {
    it('refuses a person that does not exist', async () => {
      await expect(
        planFamilyPdf(people, { scope: 'part', rootPersonId: 'nope', pageMode: 'fit' })
      ).rejects.toThrow('nobody to export');
    });

    it('refuses a tree where nobody is linked and unlinked members are off', async () => {
      const lonely = normalizeRelationships([person('a'), person('b')]);

      await expect(planFamilyPdf(lonely, { scope: 'all', pageMode: 'fit' })).rejects.toThrow(
        'nobody to export'
      );
    });

    it('still works for unlinked people when they are included', async () => {
      const lonely = normalizeRelationships([person('a'), person('b')]);
      const pages = await planFamilyPdf(lonely, {
        scope: 'all',
        pageMode: 'fit',
        includeUnlinked: true
      });

      expect(shownIds(pages).size).toBe(2);
    });
  });
});