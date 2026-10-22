/**
 * Graph layout: every person is drawn exactly once.
 *
 * - A person with parents is always placed below their parents.
 * - Partners sit next to each other on the same row, even when both come from families in the tree
 *   (then the lines of the two families reach the couple from both sides).
 * - A person can have any number of partners: the row simply gets longer.
 *
 * Input: the people to show (already cleaned up by normalizeRelationships).
 * Output: { nodes, edges } for @xyflow/react (same node and edge types as calculateModernLayout),
 * plus `geometry` (the same lines as plain coordinates, for the traditional view) and `size`.
 */
import {
  LINK_COLORS,
  MODERN_SIZES,
  calculateGenerationalLevels,
  findUnlinkedPeople,
  getAncestorsAndDescendants
} from './treeLayout';

const M = MODERN_SIZES;
const PITCH = M.NODE_W + M.PARTNER_GAP; // distance between two partners' left sides
const UNIT_GAP = 60; // free space between two rows-of-partners on one generation
const PASSES = 24;
const ORDER_SWEEPS = 12;
const UNION_COLOR = '#e74c3c';
const CHILD_COLOR = '#3498db';

const birthTime = p => (p.birthDate ? new Date(p.birthDate).getTime() : Infinity);
const mean = list => list.reduce((a, b) => a + b, 0) / list.length;

export function calculateGraphLayout(people, unlinked = [], unlinkedLabel = 'Unlinked Members') {
  const byId = new Map(people.map(p => [p._id, p]));
  const inputIndex = new Map(people.map((p, i) => [p._id, i]));
  const known = ids => [...new Set(ids || [])].filter(id => byId.has(id));
  const partnersOf = id => known(byId.get(id).spouses).filter(other => other !== id);
  const parentsOf = id => known(byId.get(id).parents).filter(other => other !== id);
  const kidsOf = id => known(byId.get(id).children).filter(other => other !== id);

  // -------------------------------------------------------------------------
  // 1. Units: partners that belong on one row (everybody connected through marriages)
  // -------------------------------------------------------------------------
  const units = [];
  const unitOf = new Map(); // person id -> unit
  const indexIn = new Map(); // person id -> position in the row of the unit

  people.forEach(start => {
    if (unitOf.has(start._id)) return;

    // Everyone connected to `start` through partners
    const component = [];
    const queue = [start._id];
    const inComponent = new Set([start._id]);
    while (queue.length > 0) {
      const id = queue.shift();
      component.push(id);
      partnersOf(id).forEach(other => {
        if (!inComponent.has(other)) {
          inComponent.add(other);
          queue.push(other);
        }
      });
    }

    // Row order: walk along the marriages, starting at one end, so that someone with two
    // partners ends up in the middle: first partner - person - second partner
    const degree = id => partnersOf(id).length;
    let first = start._id;
    if (component.length > 2) {
      const center = component.reduce((best, id) => (degree(id) > degree(best) ? id : best), component[0]);
      const leafPartner = partnersOf(center).find(id => degree(id) === 1);
      const anyLeaf = component.find(id => degree(id) === 1);
      first = leafPartner || anyLeaf || center;
    } else {
      first = [...component].sort((a, b) => inputIndex.get(a) - inputIndex.get(b))[0];
    }

    const members = [];
    const seen = new Set();
    const walk = id => {
      seen.add(id);
      members.push(id);
      partnersOf(id).forEach(other => {
        if (!seen.has(other)) walk(other);
      });
    };
    walk(first);

    const unit = {
      members,
      level: 0,
      left: 0,
      order: units.length,
      width: members.length * M.NODE_W + (members.length - 1) * M.PARTNER_GAP
    };
    units.push(unit);
    members.forEach((id, i) => {
      unitOf.set(id, unit);
      indexIn.set(id, i);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Partnerships ("unions") and who hangs from which line
  // -------------------------------------------------------------------------
  const unions = new Map(); // key -> { id, a, b, ia, ib, unit, adjacent, color, kids: [] }
  const pairKey = (x, y) => (indexIn.get(x) <= indexIn.get(y) ? `${x}|${y}` : `${y}|${x}`);

  units.forEach(unit => {
    const pairs = [];
    unit.members.forEach(id => {
      partnersOf(id).forEach(other => {
        if (unitOf.get(other) !== unit || indexIn.get(other) <= indexIn.get(id)) return;
        pairs.push([id, other]);
      });
    });
    pairs.sort((p, q) => indexIn.get(p[0]) - indexIn.get(q[0]) || indexIn.get(p[1]) - indexIn.get(q[1]));
    pairs.forEach(([a, b], i) => {
      unions.set(pairKey(a, b), {
        id: `union-${a}-${b}`,
        a,
        b,
        ia: indexIn.get(a),
        ib: indexIn.get(b),
        unit,
        adjacent: indexIn.get(b) - indexIn.get(a) === 1,
        color: unit.members.length > 2 ? LINK_COLORS[i % LINK_COLORS.length] : UNION_COLOR,
        kids: []
      });
    });
  });

  // For every person with parents: which lines do they hang from?
  const sourcesOf = new Map(); // child id -> [{ union } | { person }]
  people.forEach(child => {
    const ps = parentsOf(child._id);
    if (ps.length === 0) return;

    let sources;
    const union = ps.length === 2 ? unions.get(pairKey(ps[0], ps[1])) : null;
    if (union) {
      sources = [{ union }];
      union.kids.push(child._id);
    } else {
      sources = ps.map(pid => ({ person: pid }));
    }
    sourcesOf.set(child._id, sources);
  });

  // -------------------------------------------------------------------------
  // 3. Generations: partners share a row, children are below all of their parents
  // -------------------------------------------------------------------------
  const unitParents = unit =>
    unit.members.flatMap(id => parentsOf(id)).map(pid => unitOf.get(pid)).filter(u => u && u !== unit);
  const hasParents = unit => unit.members.some(id => parentsOf(id).length > 0);

  for (let round = 0, changed = true; changed && round < people.length + 5; round++) {
    changed = false;
    units.forEach(unit => {
      unitParents(unit).forEach(parentUnit => {
        if (parentUnit.level + 1 > unit.level) {
          unit.level = parentUnit.level + 1;
          changed = true;
        }
      });
    });
  }

  // A family with no parents above it sits right above its children, not at the very top
  units.forEach(unit => {
    if (hasParents(unit)) return;
    const childLevels = unit.members
      .flatMap(id => kidsOf(id))
      .map(cid => unitOf.get(cid))
      .filter(u => u && u !== unit)
      .map(u => u.level);
    if (childLevels.length > 0) unit.level = Math.max(unit.level, Math.min(...childLevels) - 1);
  });

  // -------------------------------------------------------------------------
  // 4. Left-to-right order on every row: families stay together
  // -------------------------------------------------------------------------
  const levelCount = units.reduce((max, u) => Math.max(max, u.level), 0) + 1;
  const rows = Array.from({ length: levelCount }, () => []);
  const visited = new Set();

  const visit = unit => {
    if (visited.has(unit)) return;
    visited.add(unit);
    rows[unit.level].push(unit);

    const children = unit.members
      .flatMap(id => kidsOf(id))
      .filter((cid, i, all) => all.indexOf(cid) === i)
      .sort((x, y) => birthTime(byId.get(x)) - birthTime(byId.get(y)));
    children.forEach(cid => visit(unitOf.get(cid)));
  };

  [...units]
    .sort((a, b) => a.level - b.level || a.order - b.order)
    .filter(unit => !hasParents(unit))
    .forEach(visit);
  units.forEach(visit); // anything left (only odd data, e.g. a loop of parents)

  // -------------------------------------------------------------------------
  // 5. Horizontal positions: pull every row toward the families above and below it
  // -------------------------------------------------------------------------
  const centerOf = id => unitOf.get(id).left + indexIn.get(id) * PITCH + M.NODE_W / 2;
  const unionX = u => u.unit.left + (u.ia * PITCH + u.ib * PITCH + M.NODE_W) / 2;
  const unionOffset = u => (u.ia * PITCH + u.ib * PITCH + M.NODE_W) / 2;

  // x of the point the lines to this child start from
  const anchorOf = childId => {
    const sources = sourcesOf.get(childId);
    if (!sources) return null;
    return mean(sources.map(s => (s.union ? unionX(s.union) : centerOf(s.person))));
  };

  const desiredLeft = unit => {
    const wishes = [];

    // under the parents
    unit.members.forEach((id, i) => {
      const anchor = anchorOf(id);
      if (anchor !== null) wishes.push(anchor - (i * PITCH + M.NODE_W / 2));
    });

    // above the children
    unions.forEach(u => {
      if (u.unit !== unit || u.kids.length === 0) return;
      wishes.push(mean(u.kids.map(centerOf)) - unionOffset(u));
    });
    unit.members.forEach((id, i) => {
      const lone = kidsOf(id).filter(cid => {
        const sources = sourcesOf.get(cid) || [];
        return sources.some(s => s.person === id);
      });
      if (lone.length > 0) wishes.push(mean(lone.map(centerOf)) - (i * PITCH + M.NODE_W / 2));
    });

    return wishes.length > 0 ? mean(wishes) : unit.left;
  };

  // Turn a row around when that puts its people closer to their own parents
  // (the order of partners in a row carries no meaning). Example: of two partners,
  // the one whose parents are on the left should be on the left too.
  const flipUnit = unit => {
    const n = unit.members.length;
    unit.members.reverse();
    unit.members.forEach((id, i) => indexIn.set(id, i));
    unions.forEach(u => {
      if (u.unit !== unit) return;
      [u.a, u.b] = [u.b, u.a];
      [u.ia, u.ib] = [n - 1 - u.ib, n - 1 - u.ia];
    });
  };

  const flipIfBetter = unit => {
    const n = unit.members.length;
    if (n < 2) return;
    let now = 0;
    let flipped = 0;
    unit.members.forEach((id, i) => {
      const anchor = anchorOf(id);
      if (anchor === null) return;
      now += Math.abs(anchor - (unit.left + i * PITCH + M.NODE_W / 2));
      flipped += Math.abs(anchor - (unit.left + (n - 1 - i) * PITCH + M.NODE_W / 2));
    });
    if (flipped >= now - 1) return;

    flipUnit(unit);
  };

  // Place the units of one row as close as possible to what they want, without overlapping
  const settleRow = (row, wishes) => {
    const offsets = [];
    let used = 0;
    row.forEach(unit => {
      offsets.push(used);
      used += unit.width + UNIT_GAP;
    });

    // Blocks of units that have to move together (pool adjacent violators)
    const blocks = [];
    row.forEach((unit, i) => {
      blocks.push({ sum: wishes[i] - offsets[i], count: 1 });
      while (blocks.length > 1) {
        const last = blocks[blocks.length - 1];
        const before = blocks[blocks.length - 2];
        if (before.sum / before.count <= last.sum / last.count) break;
        before.sum += last.sum;
        before.count += last.count;
        blocks.pop();
      }
    });

    let i = 0;
    blocks.forEach(block => {
      const base = block.sum / block.count;
      for (let k = 0; k < block.count; k++, i++) row[i].left = base + offsets[i];
    });
  };

  const pack = row => {
    let x = 0;
    row.forEach(unit => {
      unit.left = x;
      x += unit.width + UNIT_GAP;
    });
  };
  const levelsInOrder = down => {
    const order = rows.map((_, i) => i);
    return down ? order : order.reverse();
  };

  // Step A - order: every row is sorted by where the rows above and below want it,
  // and packed, a few times up and down (this keeps lines from crossing needlessly)
  rows.forEach(pack);
  for (let sweep = 0; sweep < ORDER_SWEEPS; sweep++) {
    levelsInOrder(sweep % 2 === 0).forEach(level => {
      const row = rows[level];
      row.forEach(flipIfBetter);
      const wishes = new Map(row.map(unit => [unit, desiredLeft(unit)]));
      row.sort((a, b) => wishes.get(a) - wishes.get(b));
      pack(row);
    });
  }

  // Step A2 - try turning a row around, or swapping two neighbours, whenever that
  // removes crossing lines (only the lines going into and out of that row are counted)
  const levelOf = id => unitOf.get(id).level;
  const linesIntoLevel = Array.from({ length: levelCount + 1 }, () => []);
  sourcesOf.forEach((sources, childId) => {
    sources.forEach(source => linesIntoLevel[levelOf(childId)].push({ source, childId }));
  });

  const crossingsInto = level => {
    const lines = linesIntoLevel[level].map(({ source, childId }) => [
      source.union ? unionX(source.union) : centerOf(source.person),
      centerOf(childId)
    ]);
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if ((lines[i][0] - lines[j][0]) * (lines[i][1] - lines[j][1]) < 0) count++;
      }
    }
    return count;
  };
  const crossingsAround = level => crossingsInto(level) + (level + 1 < levelCount ? crossingsInto(level + 1) : 0);

  const MAX_LINES_FOR_CROSSING_SEARCH = 400;
  if (sourcesOf.size <= MAX_LINES_FOR_CROSSING_SEARCH) {
    for (let round = 0; round < 6; round++) {
      let improved = false;
      rows.forEach((row, level) => {
        // turn a unit around
        row.forEach(unit => {
          if (unit.members.length < 2) return;
          const before = crossingsAround(level);
          flipUnit(unit);
          if (crossingsAround(level) < before) improved = true;
          else flipUnit(unit);
        });
        // swap neighbours
        for (let i = 0; i + 1 < row.length; i++) {
          const before = crossingsAround(level);
          [row[i], row[i + 1]] = [row[i + 1], row[i]];
          pack(row);
          if (crossingsAround(level) < before) improved = true;
          else {
            [row[i], row[i + 1]] = [row[i + 1], row[i]];
            pack(row);
          }
        }
      });
      if (!improved) break;
    }
  }

  // Step A3 - a couple whose two families are both in the tree: turning the couple around may
  // only pay off together with re-ordering the families above (neither step alone removes a
  // crossing). So try the turn, let the rows re-sort, and keep it only if the total gets better.
  if (sourcesOf.size <= MAX_LINES_FOR_CROSSING_SEARCH) {
    const totalCrossings = () => {
      let sum = 0;
      for (let level = 1; level < levelCount; level++) sum += crossingsInto(level);
      return sum;
    };
    const snapshot = () => ({
      rows: rows.map(row => [...row]),
      members: units.map(unit => [...unit.members]),
      unions: [...unions.values()].map(u => [u.a, u.b, u.ia, u.ib]),
      lefts: units.map(unit => unit.left)
    });
    const restore = saved => {
      saved.rows.forEach((row, i) => (rows[i] = row));
      units.forEach((unit, i) => {
        unit.members = saved.members[i];
        unit.members.forEach((id, k) => indexIn.set(id, k));
        unit.left = saved.lefts[i];
      });
      [...unions.values()].forEach((u, i) => ([u.a, u.b, u.ia, u.ib] = saved.unions[i]));
    };
    const resort = () => {
      for (let sweep = 0; sweep < 4; sweep++) {
        levelsInOrder(sweep % 2 === 0).forEach(level => {
          const row = rows[level];
          const wishes = new Map(row.map(unit => [unit, desiredLeft(unit)]));
          row.sort((a, b) => wishes.get(a) - wishes.get(b));
          pack(row);
        });
      }
    };

    units
      .filter(unit => unit.members.filter(id => parentsOf(id).length > 0).length >= 2)
      .forEach(unit => {
        const before = totalCrossings();
        if (before === 0) return;
        const saved = snapshot();
        flipUnit(unit);
        resort();
        if (totalCrossings() >= before) restore(saved);
      });
  }

  // Step B - positions: the order is fixed now; move rows toward their families without overlapping
  for (let pass = 0; pass < PASSES; pass++) {
    levelsInOrder(pass % 2 === 0).forEach(level => {
      const row = rows[level];
      if (row.length === 0) return;
      const wishes = row.map(desiredLeft);
      settleRow(row, wishes);
    });
  }

  const minLeft = units.reduce((min, u) => Math.min(min, u.left), Infinity);
  // Whole pixels: no blurry lines, and the same numbers every time
  if (Number.isFinite(minLeft)) units.forEach(u => (u.left = Math.round(u.left - minLeft)));

  // -------------------------------------------------------------------------
  // 6. Output
  // -------------------------------------------------------------------------
  const nodes = [];
  const edges = [];
  const geometry = { unions: [], children: [] };
  const rowTop = level => level * (M.NODE_H + M.ROW_GAP);

  units.forEach(unit => {
    const top = rowTop(unit.level);
    unit.members.forEach((id, i) => {
      nodes.push({
        id,
        type: 'personNode',
        position: { x: unit.left + i * PITCH, y: top },
        data: { person: byId.get(id), level: unit.level }
      });
    });
  });

  // Where a line coming down to / leaving a person's card is attached
  const topOf = id => ({ x: centerOf(id), y: rowTop(unitOf.get(id).level) });
  const bottomOf = id => ({ x: centerOf(id), y: rowTop(unitOf.get(id).level) + M.NODE_H });

  const unionPoint = new Map();
  unions.forEach(u => {
    const top = rowTop(u.unit.level);
    const x = unionX(u);
    // next to each other: the dot sits between the cards; otherwise just below the row
    const y = u.adjacent ? top + M.NODE_H / 2 : top + M.NODE_H + 28;
    unionPoint.set(u, { x, y });

    nodes.push({
      id: u.id,
      type: 'unionNode',
      position: { x: x - M.DOT / 2, y: y - M.DOT / 2 },
      data: { color: u.color },
      draggable: false,
      selectable: false
    });

    const lineStyle = { stroke: u.color, strokeWidth: 3 };
    if (u.adjacent) {
      edges.push({
        id: `${u.id}-left`,
        source: u.a,
        sourceHandle: 'right-source',
        target: u.id,
        targetHandle: 'left',
        type: 'straight',
        style: lineStyle
      });
      edges.push({
        id: `${u.id}-right`,
        source: u.b,
        sourceHandle: 'left-source',
        target: u.id,
        targetHandle: 'right',
        type: 'straight',
        style: lineStyle
      });
      geometry.unions.push({
        id: u.id,
        color: u.color,
        dot: { x, y },
        from: { x: centerOf(u.a) + M.NODE_W / 2, y },
        to: { x: centerOf(u.b) - M.NODE_W / 2, y }
      });
    } else {
      edges.push({
        id: `${u.id}-left`,
        source: u.a,
        sourceHandle: 'bottom',
        target: u.id,
        targetHandle: 'left',
        type: 'smoothstep',
        style: lineStyle
      });
      edges.push({
        id: `${u.id}-right`,
        source: u.b,
        sourceHandle: 'bottom',
        target: u.id,
        targetHandle: 'right',
        type: 'smoothstep',
        style: lineStyle
      });
      geometry.unions.push({
        id: u.id,
        color: u.color,
        dot: { x, y },
        around: [bottomOf(u.a), bottomOf(u.b)]
      });
    }
  });

  sourcesOf.forEach((sources, childId) => {
    sources.forEach(source => {
      const sourceId = source.union ? source.union.id : source.person;
      const color = source.union ? source.union.color : CHILD_COLOR;
      const from = source.union ? unionPoint.get(source.union) : bottomOf(source.person);
      const to = topOf(childId);
      // Lines leave a union dot from its bottom
      const start = source.union ? { x: from.x, y: from.y + M.DOT / 2 } : from;

      edges.push({
        id: `child-${sourceId}-${childId}`,
        source: sourceId,
        sourceHandle: 'bottom',
        target: childId,
        targetHandle: 'top',
        type: 'smoothstep',
        style: { stroke: color, strokeWidth: 2 }
      });
      geometry.children.push({ from: start, to, color });
    });
  });

  const bottomOfTree = nodes.reduce(
    (max, n) => (n.type === 'personNode' ? Math.max(max, n.position.y + M.NODE_H) : max),
    0
  );
  const rightOfTree = nodes.reduce(
    (max, n) => (n.type === 'personNode' ? Math.max(max, n.position.x + M.NODE_W) : max),
    0
  );

  // People without any links: one row below everything else
  let height = bottomOfTree;
  let width = rightOfTree;
  if (unlinked.length > 0) {
    const top = bottomOfTree + M.ROW_GAP * 2;
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
    height = top + M.NODE_H;
    width = Math.max(width, unlinked.length * (M.NODE_W + M.SIBLING_GAP) - M.SIBLING_GAP);
  }

  return { nodes, edges, geometry, size: { width, height } };
}

/**
 * What the tree screens need: the layout for everybody, or for the family around one person.
 * People without any link are not part of the tree itself; they get their own row at the bottom
 * (only when the whole tree is shown).
 */
export function calculateGraphLayoutFor(people, rootPersonId = '', unlinkedLabel = 'Unlinked Members') {
  const unlinked = findUnlinkedPeople(people);
  const unlinkedIds = new Set(unlinked.map(p => p._id));
  const linked = people.filter(p => !unlinkedIds.has(p._id));

  if (rootPersonId) {
    const levels = calculateGenerationalLevels(linked);
    const around = getAncestorsAndDescendants(linked, rootPersonId, levels);
    return calculateGraphLayout(around, [], unlinkedLabel);
  }
  return calculateGraphLayout(linked, unlinked, unlinkedLabel);
}
