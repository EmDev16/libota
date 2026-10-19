/**
 * PDF export for the family tree.
 *
 * The PDF is drawn straight from the tree layout (not a screenshot), so text stays sharp
 * and it works for big trees. Page modes:
 *   fit       one page, sized to the tree (poster)
 *   tiles     the tree is cut into several pages of a chosen paper size; cuts are placed
 *             between cards where possible
 *   branches  one page per branch (every child of the top families), plus one page for the rest
 */
import { IMAGE_BASE_URL } from '../api';
import {
  calculateTraditionalLayout,
  calculateModernLayout,
  findUnlinkedPeople,
  MODERN_SIZES
} from './treeLayout';

const PAPER = { a4: [595.28, 841.89], a3: [841.89, 1190.55] }; // portrait, in points
const MAX_PAGE = 14400; // largest page size PDF viewers support (200 inches)
const MARGIN = 28;
const HEADER = 58;
const FOOTER = 26;
const BASE_SCALE = 0.55; // a card is 110 pt wide: readable on paper
const MIN_BRANCH_SCALE = 0.3; // below this a branch gets a bigger page instead of tiny text
const MIN_POSTER = [420, 300];
const LABEL_SIZE = { w: 260, h: 30 };
const GENDER_COLORS = { male: '#3498db', female: '#e74c3c', other: '#95a5a6' };

const fullName = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim();
const namesOf = (people) => people.map(fullName).join(' & ');
const todayString = () => new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// Choosing which people go into the PDF
// ---------------------------------------------------------------------------

/**
 * Part of the tree around one person.
 *   up    how many generations above the person to start (0 = the person, 2 = grandparents)
 *   down  how many generations below the PERSON to show (Infinity = all, 0 = same generation)
 * Shows everyone who descends from those ancestors, plus their partners.
 *   descendants of a person:  up 0, down Infinity
 *   siblings:                 up 1, down 0
 *   first cousins:            up 2, down 0
 */
export function getPeopleForExport(people, { rootPersonId, up = 0, down = Infinity }) {
  const map = new Map(people.map((p) => [p._id, p]));
  const root = map.get(rootPersonId);
  if (!root) return [];

  const hasKnownParents = (id) => (map.get(id).parents || []).some((pid) => map.has(pid));

  // Ancestors, up to `up` generations above the person
  const depthAbove = new Map([[root._id, 0]]);
  let frontier = [root._id];
  for (let d = 1; d <= up; d++) {
    const next = [];
    frontier.forEach((id) => {
      (map.get(id).parents || []).forEach((pid) => {
        if (map.has(pid) && !depthAbove.has(pid)) {
          depthAbove.set(pid, d);
          next.push(pid);
        }
      });
    });
    if (next.length === 0) break;
    frontier = next;
  }

  // The starting points: ancestors exactly `up` generations up, or older ones if the line ends sooner
  const tops = [...depthAbove].filter(([id, d]) => d === up || !hasKnownParents(id));

  // Everyone who descends from them, down to the generation limit
  const included = new Set();
  tops.forEach(([topId, topDepth]) => {
    const limit = down === Infinity ? Infinity : topDepth + down;
    const seen = new Set([topId]);
    const queue = [[topId, 0]];
    while (queue.length > 0) {
      const [id, depth] = queue.shift();
      included.add(id);
      if (depth >= limit) continue;
      (map.get(id).children || []).forEach((cid) => {
        if (map.has(cid) && !seen.has(cid)) {
          seen.add(cid);
          queue.push([cid, depth + 1]);
        }
      });
    }
  });

  // Partners are shown next to them
  const withPartners = new Set(included);
  included.forEach((id) => {
    (map.get(id).spouses || []).forEach((sid) => {
      if (map.has(sid)) withPartners.add(sid);
    });
  });

  return people.filter((p) => withPartners.has(p._id));
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const sizeOf = (node) =>
  node.type === 'labelNode'
    ? LABEL_SIZE
    : { w: MODERN_SIZES.NODE_W, h: MODERN_SIZES.NODE_H };

const rectsOf = (layout) =>
  layout.nodes
    .filter((n) => n.type !== 'unionNode')
    .map((n) => ({ x: n.position.x, y: n.position.y, ...{ w: sizeOf(n).w, h: sizeOf(n).h } }));

function boundsOf(layout) {
  const rects = rectsOf(layout);
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxX: Math.max(...rects.map((r) => r.x + r.w)),
    maxY: Math.max(...rects.map((r) => r.y + r.h))
  };
}

// A family with its children but nothing below them (used for the overview page)
const withoutGrandchildren = (root) => {
  const stripBelow = (c) => ({ ...c, links: c.links.map(() => ({ children: [] })), children: [] });
  return {
    ...root,
    links: root.links.map((l) => ({ children: l.children.map(stripBelow) })),
    children: root.children.map(stripBelow)
  };
};

const countPeople = (layout) => layout.nodes.filter((n) => n.type === 'personNode').length;

const paperDims = (paper, orientation) => {
  const [short, long] = PAPER[paper] || PAPER.a4;
  return orientation === 'portrait' ? [short, long] : [long, short];
};

// Where to cut between lowerBound and target: the latest position that cuts through the
// fewest cards (usually none; in a dense page one or two cards get split over two pages)
function findCut(target, lowerBound, intervals) {
  let best = target;
  let bestCount = Infinity;
  for (let v = target; v > lowerBound; v -= 2) {
    let count = 0;
    for (const [a, b] of intervals) if (v > a && v < b) count++;
    if (count < bestCount) {
      best = v;
      bestCount = count;
      if (count === 0) break;
    }
  }
  return best;
}

// Cut [min, max] into spans of at most `size`, cutting between cards where possible
function tileSpans(min, max, size, intervals) {
  const spans = [];
  let start = min;
  while (start < max - 0.5) {
    const end = start + size >= max ? max : findCut(start + size, start + size * 0.4, intervals);
    spans.push([start, end]);
    start = end;
  }
  return spans;
}

// ---------------------------------------------------------------------------
// Page plans: where every page gets its content
// ---------------------------------------------------------------------------

// One page of any size that holds the layout at scale s
function customPage(layout, s, minSize = [0, 0]) {
  const b = boundsOf(layout);
  const cw = b.maxX - b.minX;
  const ch = b.maxY - b.minY;
  const w = Math.max(cw * s + 2 * MARGIN, minSize[0]);
  const h = Math.max(ch * s + 2 * MARGIN + HEADER + FOOTER, minSize[1]);
  return {
    w,
    h,
    layout,
    view: {
      s,
      ox: (w - cw * s) / 2 - b.minX * s,
      oy: MARGIN + HEADER - b.minY * s
    }
  };
}

function posterPage(layout) {
  const b = boundsOf(layout);
  const cw = b.maxX - b.minX;
  const ch = b.maxY - b.minY;
  const s = Math.min(
    BASE_SCALE,
    (MAX_PAGE - 2 * MARGIN) / cw,
    (MAX_PAGE - 2 * MARGIN - HEADER - FOOTER) / ch
  );
  return customPage(layout, s, MIN_POSTER);
}

// One page of the chosen paper: shrink to fit, or use a bigger page if the text would get tiny
function branchPage(layout, paper, orientation) {
  const b = boundsOf(layout);
  const cw = b.maxX - b.minX;
  const ch = b.maxY - b.minY;
  const [w, h] = paperDims(
    paper,
    orientation === 'auto' ? (cw >= ch ? 'landscape' : 'portrait') : orientation
  );
  const uw = w - 2 * MARGIN;
  const uh = h - 2 * MARGIN - HEADER - FOOTER;
  const s = Math.min(BASE_SCALE, uw / cw, uh / ch);

  if (s < MIN_BRANCH_SCALE) {
    return customPage(
      layout,
      Math.min(
        MIN_BRANCH_SCALE,
        (MAX_PAGE - 2 * MARGIN) / cw,
        (MAX_PAGE - 2 * MARGIN - HEADER - FOOTER) / ch
      )
    );
  }

  return {
    w,
    h,
    layout,
    view: {
      s,
      ox: MARGIN + (uw - cw * s) / 2 - b.minX * s,
      oy: MARGIN + HEADER - b.minY * s
    }
  };
}

// Several pages of the chosen paper that together show the whole layout
function tilePages(layout, paper, orientation) {
  const [w, h] = paperDims(paper, orientation === 'portrait' ? 'portrait' : 'landscape');
  const uw = w - 2 * MARGIN;
  const uh = h - 2 * MARGIN - HEADER - FOOTER;
  const s = BASE_SCALE;
  const b = boundsOf(layout);
  const pad = 12;
  const rects = rectsOf(layout);

  const bands = tileSpans(b.minY - pad, b.maxY + pad, uh / s, rects.map((r) => [r.y, r.y + r.h]));
  const pages = [];

  bands.forEach(([y0, y1], bandIndex) => {
    const inBand = rects.filter((r) => r.y + r.h > y0 && r.y < y1);
    if (inBand.length === 0) return;

    const spans = tileSpans(b.minX - pad, b.maxX + pad, uw / s, inBand.map((r) => [r.x, r.x + r.w]));
    spans.forEach(([x0, x1], partIndex) => {
      if (!inBand.some((r) => r.x + r.w > x0 && r.x < x1)) return;
      pages.push({
        w,
        h,
        layout,
        view: { s, ox: MARGIN - x0 * s, oy: MARGIN + HEADER - y0 * s },
        cull: { x0, x1, y0, y1 },
        mask: true,
        note: `Strip ${bandIndex + 1}/${bands.length}, part ${partIndex + 1}/${spans.length}`
      });
    });
  });

  return pages;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function fitText(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

function drawLayout(doc, layout, view, photos, cull) {
  const { NODE_W: W, NODE_H: H, DOT } = MODERN_SIZES;
  const { s, ox, oy } = view;
  const px = (x) => ox + x * s;
  const py = (y) => oy + y * s;
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  const visible = (x0, y0, x1, y1) =>
    !cull || (x1 >= cull.x0 && x0 <= cull.x1 && y1 >= cull.y0 && y0 <= cull.y1);

  // Every line is horizontal or vertical, so cutting it at the edge of a page is simple
  const segment = (x1, y1, x2, y2) => {
    if (cull) {
      if (x1 === x2) {
        if (x1 < cull.x0 || x1 > cull.x1) return;
        const a = Math.max(Math.min(y1, y2), cull.y0);
        const b = Math.min(Math.max(y1, y2), cull.y1);
        if (a >= b) return;
        y1 = a;
        y2 = b;
      } else {
        if (y1 < cull.y0 || y1 > cull.y1) return;
        const a = Math.max(Math.min(x1, x2), cull.x0);
        const b = Math.min(Math.max(x1, x2), cull.x1);
        if (a >= b) return;
        x1 = a;
        x2 = b;
      }
    }
    doc.line(px(x1), py(y1), px(x2), py(y2));
  };

  // Lines first, so the cards cover their ends
  layout.edges.forEach((e) => {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) return;

    doc.setDrawColor(e.style.stroke);
    doc.setLineWidth(Math.max(e.style.strokeWidth * s, 0.7));

    if (e.type === 'straight') {
      // between a person and the union dot of a partnership
      const y = a.position.y + H / 2;
      const startX = e.sourceHandle === 'right-source' ? a.position.x + W : a.position.x;
      const endX = e.targetHandle === 'left' ? b.position.x : b.position.x + DOT;
      segment(startX, y, endX, y);
    } else {
      // from the union dot (or a single parent) down to a child
      const isDot = a.type === 'unionNode';
      const sx = isDot ? a.position.x + DOT / 2 : a.position.x + W / 2;
      const sy = isDot ? a.position.y + DOT : a.position.y + H;
      const tx = b.position.x + W / 2;
      const ty = b.position.y;
      const midY = sy + (ty - sy) / 2;
      segment(sx, sy, sx, midY);
      if (sx !== tx) segment(sx, midY, tx, midY);
      segment(tx, midY, tx, ty);
    }
  });

  layout.nodes.forEach((n) => {
    const { x, y } = n.position;

    if (n.type === 'unionNode') {
      if (!visible(x, y, x + DOT, y + DOT)) return;
      doc.setFillColor(n.data.color);
      doc.setDrawColor('#ffffff');
      doc.setLineWidth(Math.max(1.5 * s, 0.6));
      doc.circle(px(x + DOT / 2), py(y + DOT / 2), Math.max((DOT / 2) * s, 2), 'FD');
      return;
    }

    if (n.type === 'labelNode') {
      if (!visible(x, y, x + LABEL_SIZE.w, y + LABEL_SIZE.h)) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.max(18 * s, 8));
      doc.setTextColor('#2c3e50');
      doc.text(n.data.label, px(x), py(y + 20));
      return;
    }

    // Person card
    if (!visible(x, y, x + W, y + H)) return;
    const p = n.data.person;
    const color = GENDER_COLORS[p.gender] || GENDER_COLORS.other;

    doc.setFillColor(p.deathDate ? '#f1f3f4' : '#ffffff');
    doc.setDrawColor(color);
    doc.setLineWidth(Math.max(2.5 * s, 0.8));
    doc.roundedRect(px(x), py(y), W * s, H * s, 8 * s, 8 * s, 'FD');

    // Optional photo on the left, text then starts after it
    const photo = photos.get(p._id);
    let textX = x + W / 2;
    let textW = W - 16;
    let align = 'center';
    if (photo) {
      const size = H - 24;
      doc.addImage(photo, 'JPEG', px(x + 12), py(y + 12), size * s, size * s, p._id);
      textX = x + 12 + size + 10;
      textW = W - (textX - x) - 10;
      align = 'left';
    }

    const nameSize = Math.max(14 * s, 5);
    const lifeSize = Math.max(11 * s, 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(nameSize);
    const nameLines = doc.splitTextToSize(fullName(p), textW * s).slice(0, 2);
    nameLines[nameLines.length - 1] = fitText(doc, nameLines[nameLines.length - 1], textW * s);

    const birth = p.birthDate ? new Date(p.birthDate).getFullYear() : '?';
    const death = p.deathDate ? new Date(p.deathDate).getFullYear() : '';
    const lifespan = death ? `${birth} - ${death}` : `b. ${birth}`;

    const blockH = nameLines.length * nameSize * 1.2 + lifeSize * 1.4;
    let ty = py(y) + (H * s - blockH) / 2 + nameSize * 0.95;

    doc.setTextColor('#2c3e50');
    nameLines.forEach((line) => {
      doc.text(line, px(textX), ty, { align });
      ty += nameSize * 1.2;
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(lifeSize);
    doc.setTextColor('#7f8c8d');
    doc.text(lifespan, px(textX), ty + lifeSize * 0.2, { align });
  });
}

// Covers anything that spilled over into the margins when a tile cuts through lines or cards
function drawMask(doc, w, h) {
  doc.setFillColor('#ffffff');
  doc.rect(0, 0, w, MARGIN + HEADER, 'F');
  doc.rect(0, h - MARGIN - FOOTER, w, MARGIN + FOOTER, 'F');
  doc.rect(0, 0, MARGIN, h, 'F');
  doc.rect(w - MARGIN, 0, MARGIN, h, 'F');
}

function drawFrame(doc, w, h, { title, subtitle, pageLabel }) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor('#2c3e50');
  doc.text(fitText(doc, title, w - 2 * MARGIN), MARGIN, MARGIN + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#7f8c8d');
  doc.text(fitText(doc, subtitle, w - 2 * MARGIN), MARGIN, MARGIN + 31);

  doc.setDrawColor('#d5dbdb');
  doc.setLineWidth(0.6);
  doc.line(MARGIN, MARGIN + HEADER - 12, w - MARGIN, MARGIN + HEADER - 12);

  doc.text(`Libota family tree - ${todayString()}`, MARGIN, h - MARGIN + 4);
  doc.text(pageLabel, w - MARGIN, h - MARGIN + 4, { align: 'right' });
}

// ---------------------------------------------------------------------------
// Photos (optional)
// ---------------------------------------------------------------------------

const loadPhoto = (url) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(img.width, img.height);
        canvas
          .getContext('2d')
          .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } catch (error) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

async function loadPhotos(people) {
  const photos = new Map();
  const withPhoto = people.filter((p) => p.photo);
  for (let i = 0; i < withPhoto.length; i += 8) {
    await Promise.all(
      withPhoto.slice(i, i + 8).map(async (p) => {
        const data = await loadPhoto(`${IMAGE_BASE_URL}${p.photo}`);
        if (data) photos.set(p._id, data);
      })
    );
  }
  return photos;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * options: {
 *   scope: 'all' | 'part', rootPersonId, up, down (number or Infinity),
 *   pageMode: 'fit' | 'tiles' | 'branches',
 *   paper: 'a4' | 'a3', orientation: 'auto' | 'landscape' | 'portrait',
 *   photos: boolean
 * }
 * `people` must already be normalized (normalizeRelationships).
 */
export async function planFamilyPdf(people, options) {
  const {
    scope = 'all',
    rootPersonId = '',
    up = 0,
    down = Infinity,
    pageMode = 'fit',
    paper = 'a4',
    orientation = 'auto'
  } = options;

  // 1. Who is included
  let subset = people;
  let scopeText = 'Complete family tree';
  if (scope === 'part') {
    subset = getPeopleForExport(people, { rootPersonId, up, down });
    const root = people.find((p) => p._id === rootPersonId);
    scopeText = `Part of the tree around ${root ? fullName(root) : '?'}`;
  }
  if (subset.length === 0) throw new Error('There is nobody to export');

  // 2. The tree. People without any links are only added for the complete tree.
  const unlinked = scope === 'all' ? findUnlinkedPeople(subset) : [];
  const unlinkedIds = new Set(unlinked.map((p) => p._id));
  const linked = subset.filter((p) => !unlinkedIds.has(p._id));
  const familyTree = linked.length > 0 ? calculateTraditionalLayout(linked, null) : [];
  const unlinkedLabel = 'Unlinked members';

  // 3. The pages
  const pages = [];
  const baseTitle = 'Family tree';

  if (pageMode === 'branches') {
    // Page 1 shows the top of the tree (the people the branches start from)
    const tops = familyTree.filter((root) => root.children.length > 0);
    if (tops.length > 0) {
      const layout = calculateModernLayout(tops.map(withoutGrandchildren), [], unlinkedLabel);
      pages.push({
        ...branchPage(layout, paper, orientation),
        title: 'Overview',
        subtitle: `The top of the tree - every branch continues on its own page - ${scopeText}`
      });
    }

    const leftovers = [];
    familyTree.forEach((root) => {
      if (root.children.length === 0) {
        leftovers.push(root);
        return;
      }
      root.children.forEach((child) => {
        const layout = calculateModernLayout([child], [], unlinkedLabel);
        pages.push({
          ...branchPage(layout, paper, orientation),
          title: `Branch of ${namesOf(child.couple)}`,
          subtitle: `Children of ${namesOf(root.couple)} - ${countPeople(layout)} people - ${scopeText}`
        });
      });
    });

    if (leftovers.length > 0 || unlinked.length > 0) {
      const layout = calculateModernLayout(leftovers, unlinked, unlinkedLabel);
      pages.push({
        ...branchPage(layout, paper, orientation),
        title: 'Other members',
        subtitle: `People without descendants or links - ${countPeople(layout)} people - ${scopeText}`
      });
    }
  } else {
    const layout = calculateModernLayout(familyTree, unlinked, unlinkedLabel);
    const subtitle = `${scopeText} - ${countPeople(layout)} people`;

    if (pageMode === 'tiles') {
      tilePages(layout, paper, orientation).forEach((page) =>
        pages.push({ ...page, title: baseTitle, subtitle })
      );
    } else {
      pages.push({ ...posterPage(layout), title: baseTitle, subtitle });
    }
  }

  if (pages.length === 0) throw new Error('There is nothing to draw');
  return pages;
}

export async function generateFamilyPdf(people, options) {
  const pages = await planFamilyPdf(people, options);

  // Photos for everyone who is drawn
  const drawn = new Set();
  pages.forEach((pg) =>
    pg.layout.nodes.forEach((n) => {
      if (n.type === 'personNode') drawn.add(n.data.person._id);
    })
  );
  const photos = options.photos
    ? await loadPhotos(people.filter((p) => drawn.has(p._id)))
    : new Map();

  const { jsPDF } = await import('jspdf');
  const first = pages[0];
  const doc = new jsPDF({
    unit: 'pt',
    format: [first.w, first.h],
    orientation: first.w > first.h ? 'l' : 'p',
    compress: true
  });
  doc.setProperties({ title: 'Libota family tree' });

  pages.forEach((pg, i) => {
    if (i > 0) doc.addPage([pg.w, pg.h], pg.w > pg.h ? 'l' : 'p');

    drawLayout(doc, pg.layout, pg.view, photos, pg.cull);
    if (pg.mask) drawMask(doc, pg.w, pg.h);

    drawFrame(doc, pg.w, pg.h, {
      title: pg.title,
      subtitle: pg.subtitle,
      pageLabel: pg.note ? `${pg.note} - page ${i + 1}/${pages.length}` : `Page ${i + 1}/${pages.length}`
    });
  });

  doc.save(`libota-family-tree-${todayString()}.pdf`);
  return pages.length;
}