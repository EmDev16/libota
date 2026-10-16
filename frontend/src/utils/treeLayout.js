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
      spouses: unique(p.spouses)
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
 * }
 */
export function buildFamilyTree(people, levels) {
  const tree = [];
  const peopleMap = new Map(people.map(p => [p._id, p]));
  const processed = new Set();

  const hasParentsInTree = p => (p.parents || []).some(pid => peopleMap.has(pid));
  // A person without parents who is married to someone that does have parents in the tree.
  // They get pulled in next to their partner, so they must not start a family of their own.
  const isMarriedIn = p =>
    !hasParentsInTree(p) &&
    (p.spouses || []).some(sid => {
      const s = peopleMap.get(sid);
      return s && hasParentsInTree(s);
    });

  // Real roots first
  people
    .filter(p => !hasParentsInTree(p) && !isMarriedIn(p))
    .forEach(root => {
      if (processed.has(root._id)) return;
      const familyNode = buildFamilyNode(root, peopleMap, levels, processed);
      if (familyNode) tree.push(familyNode);
    });

  // Anyone left over
  people.forEach(person => {
    if (!processed.has(person._id)) {
      const familyNode = buildFamilyNode(person, peopleMap, levels, processed);
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
 */
function buildFamilyNode(person, peopleMap, levels, processed) {
  if (processed.has(person._id)) return null;

  const hasParentsInTree = p => (p.parents || []).some(pid => peopleMap.has(pid));
  const available = ids =>
    (ids || []).map(id => peopleMap.get(id)).filter(p => p && !processed.has(p._id));

  // 1. Decide who is on the row and in which order
  const partners = available(person.spouses);
  let path = [person];
  if (partners.length === 1) path = [person, partners[0]];
  else if (partners.length >= 2) path = [partners[0], person, partners[1]];

  const inPath = p => path.some(x => x._id === p._id);
  const otherPartnerOf = end =>
    available(end.spouses).find(p => !inPath(p) && !hasParentsInTree(p)) || null;

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

  path.forEach(p => processed.add(p._id));

  // 2. Hand every child to the link between its two parents
  const idxOf = new Map(path.map((p, i) => [p._id, i]));
  const slots = path.length === 1 ? [[]] : path.slice(1).map(() => []);
  const seen = new Set();

  path.forEach(member => {
    (member.children || []).forEach(childId => {
      if (seen.has(childId)) return;
      seen.add(childId);

      const child = peopleMap.get(childId);
      if (!child || processed.has(childId)) return;

      const known = (child.parents || []).filter(pid => peopleMap.has(pid));
      if (known.length === 0 || !known.every(pid => idxOf.has(pid))) return;

      let slot = -1;
      if (path.length === 1) {
        slot = 0;
      } else if (known.length === 1) {
        // only one known parent: put the child under that person's first link
        slot = Math.max(idxOf.get(known[0]) - 1, 0);
      } else if (known.length === 2) {
        const [a, b] = known.map(pid => idxOf.get(pid)).sort((x, y) => x - y);
        if (b - a === 1) slot = a;
      }

      if (slot >= 0) slots[slot].push(child);
    });
  });

  // 3. Build the child nodes (oldest first)
  const groups = slots.map(list =>
    list
      .sort(byBirth)
      .map(child => buildFamilyNode(child, peopleMap, levels, processed))
      .filter(Boolean)
  );

  return {
    couple: path,
    links: path.length === 1 ? [] : groups.map(children => ({ children })),
    children: path.length === 1 ? groups[0] : groups.flat(),
    level: levels.get(person._id) || 0
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
function getAncestorsAndDescendants(people, rootId, levels) {
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