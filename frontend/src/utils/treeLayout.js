/**
 * Tree Layout Calculator for Family Tree Visualization
 * Computes generational levels and node positions for both modern and traditional views
 */

/**
 * Clean up raw API data so the layout functions can rely on it:
 * - converts populated objects ({ _id, ... }) in parents/children/spouses to plain string ids
 * - makes parent <-> child and spouse <-> spouse links two-way
 * - treats two people who share a child as a couple
 * Call this once, right after loading the people.
 */
export function normalizeRelationships(people) {
  const toId = v => (v && typeof v === 'object' ? String(v._id ?? v.id) : String(v));
  const unique = arr => [...new Set((arr || []).map(toId))];
  const add = (arr, id) => {
    if (!arr.includes(id)) arr.push(id);
  };

  const map = new Map();
  people.forEach(p => {
    const id = String(p._id);
    map.set(id, {
      ...p,
      _id: id,
      parents: unique(p.parents),
      children: unique(p.children),
      spouses: unique(p.spouses),
      formerSpouses: unique(p.formerSpouses)
    });
  });

  // Make links two-way
  map.forEach(person => {
    person.parents.forEach(pid => {
      const parent = map.get(pid);
      if (parent) add(parent.children, person._id);
    });
    person.children.forEach(cid => {
      const child = map.get(cid);
      if (child) add(child.parents, person._id);
    });
    person.spouses.forEach(sid => {
      const spouse = map.get(sid);
      if (spouse) add(spouse.spouses, person._id);
    });
  });

  // An ended relationship counts for both partners, and only for people who are partners
  map.forEach(person => {
    person.formerSpouses.forEach(sid => {
      const spouse = map.get(sid);
      if (spouse && person.spouses.includes(sid)) add(spouse.formerSpouses, person._id);
    });
  });
  map.forEach(person => {
    person.formerSpouses = person.formerSpouses.filter(sid => person.spouses.includes(sid));
  });

  // Two parents of the same child form a couple
  map.forEach(person => {
    const known = person.parents.filter(pid => map.has(pid));
    if (known.length === 2) {
      add(map.get(known[0]).spouses, known[1]);
      add(map.get(known[1]).spouses, known[0]);
    }
  });

  return [...map.values()];
}

/**
 * Calculate generational levels for each person
 * People with no parents in the tree start at Level 0
 * Each child is assigned max(parents' level) + 1
 */
export function calculateGenerationalLevels(people) {
  const levels = new Map();
  const peopleMap = new Map(people.map(p => [p._id, p]));
  const processed = new Set();

  // Initialize all at level 0
  people.forEach(person => {
    levels.set(person._id, 0);
  });

  // BFS to calculate levels
  const queue = people.filter(p => !p.parents || p.parents.length === 0);

  while (queue.length > 0) {
    const person = queue.shift();
    const personId = person._id;

    if (processed.has(personId)) continue;
    processed.add(personId);

    const currentLevel = levels.get(personId);

    // Update children's levels
    if (person.children && person.children.length > 0) {
      person.children.forEach(childId => {
        const childLevel = levels.get(childId) || 0;
        levels.set(childId, Math.max(childLevel, currentLevel + 1));

        const child = peopleMap.get(childId);
        if (child && !processed.has(childId)) {
          queue.push(child);
        }
      });
    }
  }

  return levels;
}

/**
 * Group people by generational level
 */
export function groupByGeneration(people, levels) {
  const generations = new Map();

  people.forEach(person => {
    const level = levels.get(person._id) || 0;
    if (!generations.has(level)) {
      generations.set(level, []);
    }
    generations.get(level).push(person);
  });

  // Sort generations by level
  const sortedGenerations = [];
  generations.forEach((people, level) => {
    sortedGenerations[level] = people;
  });

  return sortedGenerations;
}

/**
 * Group couples together (people who are spouses)
 * Ensures spouses are positioned next to each other
 */
export function groupCouples(people) {
  const couples = [];
  const processed = new Set();

  people.forEach(person => {
    if (processed.has(person._id)) return;

    if (person.spouses && person.spouses.length > 0) {
      const spouseIds = person.spouses;
      const coupleMembers = [person];

      spouseIds.forEach(spouseId => {
        const spouse = people.find(p => p._id === spouseId);
        if (spouse && !processed.has(spouseId)) {
          coupleMembers.push(spouse);
          processed.add(spouseId);
        }
      });

      if (coupleMembers.length > 1) {
        couples.push(coupleMembers);
      } else {
        couples.push([person]);
      }
    } else {
      couples.push([person]);
    }

    processed.add(person._id);
  });

  return couples;
}

/**
 * Build proper family tree structure
 * Returns hierarchical tree. Each node is:
 * {
 *   couple:   people shown on one row, in order, e.g. [exPartner, person, newPartner]
 *   links:    links[i] sits between couple[i] and couple[i + 1] and holds the
 *             children those two have together: { children: [node, ...] }
 *   children: children when the row is a single person, otherwise all children flattened
 *   level
 *   referenceIds:  ids of people in `couple` who are only a reference: their real card is in
 *                  another row (see below). Usually empty.
 *   referenceWith: { [personId]: people } the people next to whom that real card is drawn
 * }
 *
 * A tree can draw a person in one place only. Someone who belongs to two families (for example
 * both partners of a couple have parents in the tree) is drawn in full next to their partner and
 * children, and gets a small reference card in the other family. A reference node looks like
 *   { couple: [person], links: [], children: [], reference: { with: people }, level }
 */
export function buildFamilyTree(people, levels) {
  const tree = [];
  const peopleMap = new Map(people.map(p => [p._id, p]));
  const processed = new Set();
  const rows = new Map(); // person id -> the row (array of people) where their real card is drawn

  const hasParentsInTree = p => (p.parents || []).some(pid => peopleMap.has(pid));
  // People without parents who are connected, through a chain of spouses, to someone who
  // does have parents in the tree (a married-in partner, or that partner's other partner).
  // They get pulled in next to that person, so they must not start a family of their own.
  const attached = new Set();
  const visited = new Set();
  const queue = people.filter(hasParentsInTree);
  queue.forEach(p => visited.add(p._id));
  while (queue.length > 0) {
    const p = queue.shift();
    (p.spouses || []).forEach(sid => {
      const s = peopleMap.get(sid);
      if (!s || visited.has(sid) || hasParentsInTree(s)) return;
      visited.add(sid);
      attached.add(sid);
      queue.push(s);
    });
  }

  // Real roots first
  people
    .filter(p => !hasParentsInTree(p) && !attached.has(p._id))
    .forEach(root => {
      if (processed.has(root._id)) return;
      const familyNode = buildFamilyNode(root, peopleMap, levels, processed, rows);
      if (familyNode) tree.push(familyNode);
    });

  // Anyone left over
  people.forEach(person => {
    if (!processed.has(person._id)) {
      const familyNode = buildFamilyNode(person, peopleMap, levels, processed, rows);
      if (familyNode) tree.push(familyNode);
    }
  });

  return tree;
}

const birthTime = p => (p.birthDate ? new Date(p.birthDate).getTime() : Infinity);
const byBirth = (a, b) => {
  const ta = birthTime(a);
  const tb = birthTime(b);
  return ta === tb ? 0 : ta < tb ? -1 : 1;
};

/**
 * Build a family node: the person, their partner(s) and the children of each partnership.
 * Supports a person with up to two partners (partner - person - partner). Married-in
 * partners at either end can bring one more partner of their own.
 *
 * A partner who is already drawn in another row is shown again here as a reference, so the
 * partnership and its children stay together. A child who is already drawn in another row
 * (because they are the partner of someone from another family) gets a reference node.
 */
function buildFamilyNode(person, peopleMap, levels, processed, rows) {
  if (processed.has(person._id)) return null;

  const hasParentsInTree = p => (p.parents || []).some(pid => peopleMap.has(pid));
  const available = ids =>
    (ids || []).map(id => peopleMap.get(id)).filter(p => p && !processed.has(p._id));

  // 1. Decide who is on the row and in which order
  const partnerList = [];
  (person.spouses || []).forEach(id => {
    const p = peopleMap.get(id);
    if (p && p._id !== person._id && !partnerList.includes(p)) partnerList.push(p);
  });
  const partners = partnerList.slice(0, 2);
  const refIds = new Set(partners.filter(p => processed.has(p._id)).map(p => p._id));

  let path = [person];
  if (partners.length === 1) path = [person, partners[0]];
  else if (partners.length >= 2) path = [partners[0], person, partners[1]];

  const inPath = p => path.some(x => x._id === p._id);
  const sharesChild = (a, b) => (a.children || []).some(id => (b.children || []).includes(id));
  // Next partner at the end of the row: someone without parents in the tree (married in), or,
  // failing that, someone who has children with this end (so those children can sit under both).
  const otherPartnerOf = end => {
    if (refIds.has(end._id)) return null;
    const options = available(end.spouses).filter(p => !inPath(p));
    return (
      options.find(p => !hasParentsInTree(p)) ||
      options.find(p => sharesChild(p, end)) ||
      null
    );
  };

  for (let guard = 0; guard < 4; guard++) {
    let grew = false;
    const first = path[0];
    const last = path[path.length - 1];
    if (first._id !== person._id) {
      const q = otherPartnerOf(first);
      if (q) { path.unshift(q); grew = true; }
    }
    if (last._id !== person._id) {
      const q = otherPartnerOf(last);
      if (q) { path.push(q); grew = true; }
    }
    if (!grew) break;
  }

  // Everyone who is not a reference is drawn for real in this row
  path.forEach(p => {
    if (refIds.has(p._id)) return;
    processed.add(p._id);
    rows.set(p._id, path);
  });
  const referenceWith = {};
  refIds.forEach(id => {
    referenceWith[id] = (rows.get(id) || []).filter(p => p._id !== id);
  });

  // 2. Hand every child to the link between its two parents
  const idxOf = new Map(path.map((p, i) => [p._id, i]));
  const slots = path.length === 1 ? [[]] : path.slice(1).map(() => []);
  const seen = new Set();

  path.forEach(member => {
    (member.children || []).forEach(childId => {
      if (seen.has(childId)) return;
      seen.add(childId);

      const child = peopleMap.get(childId);
      if (!child || idxOf.has(childId)) return;

      const known = (child.parents || []).filter(pid => peopleMap.has(pid));
      if (known.length === 0 || !known.every(pid => idxOf.has(pid))) return;

      let slot = -1;
      if (path.length === 1) {
        slot = 0;
      } else if (known.length === 1) {
        // Only one known parent: put the child under that person's first link.
        // A reference partner's single-parent children belong to their real row.
        if (!refIds.has(known[0])) slot = Math.max(idxOf.get(known[0]) - 1, 0);
      } else if (known.length === 2) {
        const [a, b] = known.map(pid => idxOf.get(pid)).sort((x, y) => x - y);
        // Parents that are not next to each other (rare: three people who are all partners of
        // each other) still show the child, under the first link that touches one of them.
        slot = a;
      }

      if (slot >= 0) slots[slot].push(child);
    });
  });

  // 3. Build the child nodes (oldest first). A child who is already drawn elsewhere is
  //    shown here as a reference to that card.
  const level = levels.get(person._id) || 0;
  const makeReference = child => ({
    couple: [child],
    links: [],
    children: [],
    referenceIds: [],
    referenceWith: {},
    reference: { with: (rows.get(child._id) || []).filter(p => p._id !== child._id) },
    level: levels.get(child._id) || 0
  });

  const groups = slots.map(list =>
    list
      .sort(byBirth)
      .map(child =>
        processed.has(child._id)
          ? makeReference(child)
          : buildFamilyNode(child, peopleMap, levels, processed, rows)
      )
  );

  return {
    couple: path,
    links: path.length === 1 ? [] : groups.map(children => ({ children })),
    children: path.length === 1 ? groups[0] : groups.flat(),
    referenceIds: [...refIds],
    referenceWith,
    level
  };
}

/**
 * Calculate node positions for XYFlow modern view
 * Returns nodes and edges arrays compatible with @xyflow/react
 */
export function calculateXYFlowLayout(people, levels) {
  const nodes = [];
  const edges = [];
  const peopleMap = new Map(people.map(p => [p._id, p]));

  // Group by generation
  const generations = groupByGeneration(people, levels);

  // Calculate positions
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 120;
  const HORIZONTAL_GAP = 50;
  const VERTICAL_GAP = 150;

  generations.forEach((generation, level) => {
    if (!generation) return;

    // Group couples in this generation
    const couples = groupCouples(generation);

    let xOffset = 0;

    couples.forEach(couple => {
      // Calculate couple width
      const coupleWidth = couple.length * NODE_WIDTH + (couple.length - 1) * HORIZONTAL_GAP;

      // Position couple members
      couple.forEach((person, idx) => {
        const personId = person._id;
        const x = xOffset + idx * (NODE_WIDTH + HORIZONTAL_GAP);
        const y = level * (NODE_HEIGHT + VERTICAL_GAP);

        nodes.push({
          id: personId,
          type: 'personNode',
          position: { x, y },
          data: {
            person,
            level
          }
        });
      });

      // Add spouse edge between couple members
      if (couple.length > 1) {
        const firstId = couple[0]._id;
        const secondId = couple[1]._id;
        edges.push({
          id: `spouse-${firstId}-${secondId}`,
          source: firstId,
          target: secondId,
          type: 'spouse',
          animated: false,
          style: { stroke: '#e74c3c', strokeWidth: 2 }
        });
      }

      xOffset += coupleWidth + HORIZONTAL_GAP;
    });
  });

  // Add parent-child edges
  people.forEach(person => {
    if (person.parents && person.parents.length > 0) {
      person.parents.forEach(parentId => {
        if (peopleMap.has(parentId)) {
          edges.push({
            id: `parent-${parentId}-${person._id}`,
            source: parentId,
            target: person._id,
            type: 'parent',
            animated: false,
            style: { stroke: '#3498db', strokeWidth: 2 }
          });
        }
      });
    }
  });

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Modern view: tidy tree layout for @xyflow/react
// ---------------------------------------------------------------------------

// Colors used to tell the partnerships of one person apart (also used by the traditional view)
export const LINK_COLORS = ['#e74c3c', '#8e44ad', '#16a085', '#f39c12'];

const M = {
  NODE_W: 200,       // width of a person card (PersonNode uses the same width)
  NODE_H: 96,        // height of a person card
  PARTNER_GAP: 80,   // free space between two partners; the union dot sits here
  SIBLING_GAP: 40,
  GROUP_GAP: 80,     // space between the children groups of different partnerships
  ROW_GAP: 110,      // vertical space between generations
  ROOT_GAP: 140,     // space between separate families
  DOT: 14            // size of the union dot
};

// Card size and dot size, also used by the PDF export
export const MODERN_SIZES = M;

/**
 * Turn the family tree (from calculateTraditionalLayout) into positioned nodes and edges.
 * - children are centered under their parents
 * - every partnership gets a small "union" dot between the two partners; the children hang from it
 * - people without any links are placed in a row at the bottom
 */
export function calculateModernLayout(familyTree, unlinked = [], unlinkedLabel = 'Unlinked Members') {
  const nodes = [];
  const edges = [];
  const info = new Map();

  // Children of a node, grouped per partnership (linkIndex -1 = children of a single person)
  const groupsOf = node => {
    const raw =
      node.links.length > 0
        ? node.links.map((l, i) => ({ linkIndex: i, kids: l.children }))
        : [{ linkIndex: -1, kids: node.children }];
    return raw.filter(g => g.kids.length > 0);
  };

  // A person can be drawn more than once (a reference card), and every card needs its own id
  const cardId = (node, person) => {
    if (node.reference) return `ref-${person._id}-child`;
    const refs = node.referenceIds || [];
    if (refs.includes(person._id)) {
      const owner = node.couple.find(p => !refs.includes(p._id));
      return `ref-${person._id}-in-${owner._id}`;
    }
    return person._id;
  };

  // What the card needs to know when it is a reference
  const referenceOf = (node, person) => {
    if (node.reference) return node.reference;
    const refs = node.referenceIds || [];
    return refs.includes(person._id) ? { with: (node.referenceWith || {})[person._id] || [] } : undefined;
  };

  const unionId = (node, i) => `union-${cardId(node, node.couple[i])}-${cardId(node, node.couple[i + 1])}`;

  // Pass 1: how wide is every family (its own row, or all of its descendants if wider)
  const measure = node => {
    const groups = groupsOf(node);
    const groupWidths = groups.map(
      g => g.kids.reduce((sum, kid) => sum + measure(kid), 0) + (g.kids.length - 1) * M.SIBLING_GAP
    );
    const childrenWidth =
      groupWidths.reduce((a, b) => a + b, 0) + Math.max(groups.length - 1, 0) * M.GROUP_GAP;
    const rowMin = M.NODE_W + (node.couple.length - 1) * (M.NODE_W + M.PARTNER_GAP);
    info.set(node, { width: Math.max(rowMin, childrenWidth), childrenWidth, groups });
    return info.get(node).width;
  };

  // Pass 2: place the row, then the children under it
  const place = (node, left, top) => {
    const { width, childrenWidth, groups } = info.get(node);
    const n = node.couple.length;

    // Partners sit next to each other; a person with several partnerships is spread out
    const minPitch = M.NODE_W + M.PARTNER_GAP;
    const pitch =
      n > 2 ? Math.min(Math.max((width - M.NODE_W) / (n - 1), minPitch), minPitch * 2.5) : minPitch;
    const rowLeft = left + (width - (M.NODE_W + (n - 1) * pitch)) / 2;

    node.couple.forEach((person, i) => {
      nodes.push({
        id: cardId(node, person),
        type: 'personNode',
        position: { x: rowLeft + i * pitch, y: top },
        data: { person, level: node.level, reference: referenceOf(node, person) }
      });
    });

    const colorOf = i => (node.links.length > 1 ? LINK_COLORS[i % LINK_COLORS.length] : null);

    // One union dot per partnership, joined to both partners
    for (let i = 0; i < n - 1; i++) {
      const color = colorOf(i) || '#e74c3c';
      const id = unionId(node, i);
      nodes.push({
        id,
        type: 'unionNode',
        position: {
          x: rowLeft + i * pitch + M.NODE_W + (pitch - M.NODE_W) / 2 - M.DOT / 2,
          y: top + M.NODE_H / 2 - M.DOT / 2
        },
        data: { color },
        draggable: false,
        selectable: false
      });
      edges.push({
        id: `${id}-left`,
        source: cardId(node, node.couple[i]),
        sourceHandle: 'right-source',
        target: id,
        targetHandle: 'left',
        type: 'straight',
        style: { stroke: color, strokeWidth: 3 }
      });
      edges.push({
        id: `${id}-right`,
        source: cardId(node, node.couple[i + 1]),
        sourceHandle: 'left-source',
        target: id,
        targetHandle: 'right',
        type: 'straight',
        style: { stroke: color, strokeWidth: 3 }
      });
    }

    // Children, centered under the row, oldest first (already sorted by buildFamilyTree)
    const childTop = top + M.NODE_H + M.ROW_GAP;
    let cursor = left + (width - childrenWidth) / 2;

    groups.forEach(({ linkIndex, kids }) => {
      const color = (linkIndex >= 0 && colorOf(linkIndex)) || '#3498db';
      const parentIds =
        linkIndex === -1
          ? [node.couple[0]._id]
          : [node.couple[linkIndex]._id, node.couple[linkIndex + 1]._id];
      const sourceId = linkIndex === -1 ? cardId(node, node.couple[0]) : unionId(node, linkIndex);

      kids.forEach(kid => {
        place(kid, cursor, childTop);
        cursor += info.get(kid).width + M.SIBLING_GAP;

        // The edge goes to the child who is actually a child of these parents,
        // not to the child's partner
        const kidPerson =
          kid.couple.find(p => (p.parents || []).some(pid => parentIds.includes(pid))) ||
          kid.couple[0];

        edges.push({
          id: `child-${sourceId}-${cardId(kid, kidPerson)}`,
          source: sourceId,
          sourceHandle: 'bottom',
          target: cardId(kid, kidPerson),
          targetHandle: 'top',
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2 }
        });
      });

      cursor += M.GROUP_GAP - M.SIBLING_GAP;
    });
  };

  let cursor = 0;
  familyTree.forEach(root => {
    measure(root);
    place(root, cursor, 0);
    cursor += info.get(root).width + M.ROOT_GAP;
  });

  // People without any links: one row below everything else
  if (unlinked.length > 0) {
    const bottom = nodes.reduce((max, n) => Math.max(max, n.position.y + M.NODE_H), 0);
    const top = bottom + M.ROW_GAP * 2;

    nodes.push({
      id: 'unlinked-label',
      type: 'labelNode',
      position: { x: 0, y: top - 44 },
      data: { label: unlinkedLabel },
      draggable: false,
      selectable: false
    });

    unlinked.forEach((person, i) => {
      nodes.push({
        id: person._id,
        type: 'personNode',
        position: { x: i * (M.NODE_W + M.SIBLING_GAP), y: top },
        data: { person, level: 0 }
      });
    });
  }

  return { nodes, edges };
}

/**
 * Get generation label relative to root person
 * rootLevel is the level of the selected root person
 */
export function getGenerationLabel(level, rootLevel = 0) {
  const diff = level - rootLevel;

  switch (diff) {
    case -3:
      return 'Great-Grandparents';
    case -2:
      return 'Grandparents';
    case -1:
      return 'Parents';
    case 0:
      return 'Selected Generation';
    case 1:
      return 'Children';
    case 2:
      return 'Grandchildren';
    case 3:
      return 'Great-Grandchildren';
    case 4:
      return 'Great-Great-Grandchildren';
    default:
      if (diff < -3) {
        return `${Math.abs(diff) - 2} Generations Above`;
      } else if (diff > 3) {
        return `${diff - 2} Generations Below`;
      }
      return `Generation ${diff}`;
  }
}

/**
 * Calculate traditional layout for family tree view
 * Returns hierarchical structure ({ couple, children, level } nodes)
 */
export function calculateTraditionalLayout(people, rootPersonId = null) {
  const levels = calculateGenerationalLevels(people);

  if (rootPersonId) {
    // Get tree from specific root person
    const relevant = getAncestorsAndDescendants(people, rootPersonId, levels);
    return buildFamilyTree(relevant, levels);
  }

  // Get entire tree
  return buildFamilyTree(people, levels);
}

/**
 * Generation-row layout centered on a root person
 * Returns an array of { level, label, couples }
 */
export function calculateTraditionalLayoutFromRoot(people, rootPersonId) {
  const levels = calculateGenerationalLevels(people);
  const rootPerson = people.find(p => p._id === rootPersonId);
  const rootLevel = rootPerson ? levels.get(rootPerson._id) || 0 : 0;

  // Get all ancestors and descendants of root
  const relevantPeople = getAncestorsAndDescendants(people, rootPersonId, levels);

  const generations = groupByGeneration(relevantPeople, levels);

  return generations.map((generation, level) => ({
    level,
    label: getGenerationLabel(level, rootLevel),
    couples: groupCouples(generation || [])
  }));
}

/**
 * Get ancestors and descendants of a person (includes spouses)
 */
export function getAncestorsAndDescendants(people, rootId, levels) {
  const peopleMap = new Map(people.map(p => [p._id, p]));
  const rootLevel = levels.get(rootId) || 0;
  const relevantIds = new Set();

  // Collect all IDs in the chain
  const collectIds = (personId, visited = new Set()) => {
    if (visited.has(personId)) return;
    visited.add(personId);

    const person = peopleMap.get(personId);
    if (!person) return;

    relevantIds.add(personId);

    // Add parents
    if (person.parents) {
      person.parents.forEach(pid => {
        if (levels.get(pid) >= rootLevel - 3) { // Limit to 3 generations above
          collectIds(pid, visited);
        }
      });
    }

    // Add children
    if (person.children) {
      person.children.forEach(cid => {
        if (levels.get(cid) <= rootLevel + 3) { // Limit to 3 generations below
          collectIds(cid, visited);
        }
      });
    }

    // Add spouses
    if (person.spouses) {
      person.spouses.forEach(sid => {
        relevantIds.add(sid);
      });
    }
  };

  collectIds(rootId);

  return people.filter(p => relevantIds.has(p._id));
}

/**
 * Identify unlinked people (no parents, children or spouses in the tree)
 */
export function findUnlinkedPeople(people) {
  const linkedIds = new Set();

  people.forEach(person => {
    // Add to linked if has parents
    if (person.parents && person.parents.length > 0) {
      person.parents.forEach(pid => linkedIds.add(pid));
      linkedIds.add(person._id);
    }

    // Add to linked if has children
    if (person.children && person.children.length > 0) {
      person.children.forEach(cid => linkedIds.add(cid));
      linkedIds.add(person._id);
    }

    // Add to linked if has spouses
    if (person.spouses && person.spouses.length > 0) {
      person.spouses.forEach(sid => linkedIds.add(sid));
      linkedIds.add(person._id);
    }
  });

  return people.filter(p => !linkedIds.has(p._id));
}