import { C } from '../kit/materials';
import { Kit } from '../kit/geoUtils';
import {
  ROOM, slabBase, floorTatami, floorPlanks, pillar, bracketCluster, railing,
  stairs, torii, lantern, lanternHang, lanternPost, lanternString, wallShoji,
  wallPlaster, wallLattice, wallPlanks, openingTrim, engawa, pavilion,
} from '../kit/parts';

// Local face indices: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
export type Open = boolean[];
type Builder = (k: Kit, rng: () => number, open: Open) => void;

const { FLOOR, CEIL, WALL, SPAN } = ROOM;
const W_INNER = 10.7;
const CORNER = 5.42;

/** Lateral face frames: [faceIndex] -> kit.begin args. */
const FACES: { f: number; x: number; z: number; q: number }[] = [
  { f: 0, x: WALL, z: 0, q: 1 },
  { f: 1, x: -WALL, z: 0, q: 3 },
  { f: 4, x: 0, z: WALL, q: 0 },
  { f: 5, x: 0, z: -WALL, q: 2 },
];

interface ShellOpts {
  floor?: 'tatami' | 'planks' | 'none';
  pillars?: boolean;
  ceiling?: boolean;
  walls?: boolean;
  engawaChance?: number;
  /** simplify for very dense districts */
  lean?: boolean;
}

/**
 * Common scaffolding: floor/ceiling (when those faces are closed), corner
 * pillars, rim beams, and per-face wall or opening treatments.
 */
function shell(k: Kit, rng: () => number, open: Open, o: ShellOpts = {}): void {
  const hasFloor = !open[3] && o.floor !== 'none';
  const hasCeil = !open[2] && o.ceiling !== false;
  const y0 = hasFloor ? FLOOR : -5.7;
  const y1 = hasCeil ? CEIL : 5.7;
  const pillarCol = rng() < 0.14 ? C.LACQ : C.WOOD;

  if (hasFloor) {
    slabBase(k, SPAN + 0.4, SPAN + 0.4, FLOOR - 0.12);
    if ((o.floor ?? (rng() < 0.5 ? 'tatami' : 'planks')) === 'tatami') {
      floorTatami(k, SPAN, SPAN, FLOOR);
    } else {
      floorPlanks(k, SPAN, SPAN, FLOOR, rng() < 0.5);
    }
  }

  if (hasCeil) {
    k.box(SPAN + 0.4, 0.35, SPAN + 0.4, 0, CEIL + 0.4, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
    if (!o.lean) {
      for (let i = 0; i < 3; i++) {
        k.box(SPAN + 0.2, 0.3, 0.34, 0, CEIL + 0.08, -3.6 + i * 3.6, C.WOOD_D, { jit: 0.14 });
      }
    }
  }

  if (o.pillars !== false) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pillar(k, sx * CORNER, sz * CORNER, open[3] ? -5.9 : FLOOR - 0.6, open[2] ? 5.9 : CEIL + 0.4, 0.46, pillarCol);
      }
    }
    const by = open[2] ? 5.6 : CEIL + 0.22;
    k.box(SPAN, 0.3, 0.34, 0, by, CORNER, C.WOOD_D, { jit: 0.1 });
    k.box(SPAN, 0.3, 0.34, 0, by, -CORNER, C.WOOD_D, { jit: 0.1 });
    k.box(0.34, 0.3, SPAN, CORNER, by, 0, C.WOOD_D, { jit: 0.1 });
    k.box(0.34, 0.3, SPAN, -CORNER, by, 0, C.WOOD_D, { jit: 0.1 });
    if (open[3]) {
      k.box(SPAN, 0.3, 0.34, 0, -5.6, CORNER, C.WOOD_D, { jit: 0.1 });
      k.box(SPAN, 0.3, 0.34, 0, -5.6, -CORNER, C.WOOD_D, { jit: 0.1 });
      k.box(0.34, 0.3, SPAN, CORNER, -5.6, 0, C.WOOD_D, { jit: 0.1 });
      k.box(0.34, 0.3, SPAN, -CORNER, -5.6, 0, C.WOOD_D, { jit: 0.1 });
    }
  }

  if (o.walls === false) return;

  for (const face of FACES) {
    k.begin(face.x, 0, face.z, face.q);
    if (!open[face.f]) {
      const roll = rng();
      if (roll < 0.46) wallShoji(k, W_INNER, y0, y1, { gap: rng() < 0.25 ? 3.0 : 0 });
      else if (roll < 0.68) wallPlaster(k, W_INNER, y0, y1, { window: rng() < 0.78 });
      else if (roll < 0.85) wallLattice(k, W_INNER, y0, y1);
      else wallPlanks(k, W_INNER, y0, y1);
    } else {
      const roll = rng();
      if (roll < 0.42) {
        openingTrim(k, W_INNER, y0, y1, { ranma: rng() < 0.7, lanterns: rng() < 0.35 });
      } else if (roll < 0.58 && hasFloor) {
        railing(k, 0, FLOOR, 0.1, W_INNER * 0.9, true);
      }
      if (hasFloor && rng() < (o.engawaChance ?? 0.5)) engawa(k, SPAN * 0.8, FLOOR);
    }
    // strings of small lanterns under the eaves — signature of the castle
    if (rng() < (o.lean ? 0.4 : 0.62)) {
      lanternString(k, -4.4, y1 - 0.15, 0.62, 4.4, y1 - 0.15, 0.62, 3);
    }
    k.end();
  }
}

// ---------------------------------------------------------------------------

const tatamiHall: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'tatami' });
  const layout = rng();
  if (layout < 0.4) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lanternHang(k, sx * 3.2, CEIL - 0.05, sz * 3.2, 1.2 + rng() * 0.9);
  } else if (layout < 0.75) {
    lanternHang(k, 0, CEIL - 0.05, 0, 1.6 + rng(), 1.3);
    lantern(k, -4.3, FLOOR + 0.55, -4.3, 0.9);
    lantern(k, 4.3, FLOOR + 0.55, 4.3, 0.9);
  } else {
    for (let i = 0; i < 3; i++) lanternHang(k, -3.6 + i * 3.6, CEIL - 0.05, 0, 1.1 + rng() * 0.7);
  }
  if (rng() < 0.45) {
    k.box(1.9, 0.12, 1.1, 0, FLOOR + 0.34, 0, C.WOOD_D, { jit: 0.1 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box(0.14, 0.3, 0.14, sx * 0.8, FLOOR + 0.15, sz * 0.4, C.WOOD_D);
    }
    k.box(0.65, 0.09, 0.65, 0, FLOOR + 0.05, 1.6, C.LACQ_B, { jit: 0.2 });
    k.box(0.65, 0.09, 0.65, 0, FLOOR + 0.05, -1.6, C.LACQ_B, { jit: 0.2 });
  }
  if (rng() < 0.3) {
    const sx = rng() < 0.5 ? -1 : 1;
    k.box(1.4, 1.9, 0.07, sx * 3.0, FLOOR + 0.97, -3.8, C.METAL, { ry: 0.3, jit: 0.25 });
    k.box(1.4, 1.9, 0.07, sx * 4.2, FLOOR + 0.97, -3.6, C.METAL, { ry: -0.3, jit: 0.25 });
  }
};

const plankHall: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'planks' });
  const col = rng() < 0.25 ? C.LACQ : C.WOOD;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      pillar(k, sx * 2.8, -3.6 + i * 3.6, FLOOR, open[2] ? 5.6 : CEIL, 0.36, col);
    }
    k.box(0.3, 0.26, SPAN - 0.6, sx * 2.8, (open[2] ? 5.4 : CEIL) - 0.15, 0, C.WOOD_D, { jit: 0.1 });
  }
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    lanternHang(k, 0, (open[2] ? 5.3 : CEIL) - 0.05, -3.6 + (7.2 / Math.max(n - 1, 1)) * i, 1.4 + rng() * 1.3, 1.1);
  }
  if (rng() < 0.4) {
    bracketCluster(k, -2.8, (open[2] ? 5.0 : CEIL) - 0.62, 0);
    bracketCluster(k, 2.8, (open[2] ? 5.0 : CEIL) - 0.62, 0);
  }
};

const stairShaft: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'planks', engawaChance: 0.25 });
  const mezzY = 0.4;
  k.box(SPAN, 0.32, 5.2, 0, mezzY, -3.0, C.WOOD_D, { jit: 0.12, collide: true });
  floorPlanks(k, SPAN - 0.4, 4.8, mezzY + 0.28, true);
  railing(k, 0, mezzY + 0.16, -0.5, SPAN * 0.92, true);
  k.begin(0, 0, 0, rng() < 0.5 ? 0 : 2);
  stairs(k, { x: 3.4, y: FLOOR, z: -0.2, rise: mezzY + 0.28 - FLOOR, run: 5.2, w: 1.9 });
  k.end();
  if (open[2]) {
    stairs(k, { x: -3.4, y: mezzY + 0.28, z: -5.2, rise: 5.6 - mezzY, run: 4.8, w: 1.8 });
  }
  lanternHang(k, 0, mezzY - 0.05, -3.0, 0.9, 1.0);
  lantern(k, -4.5, FLOOR + 0.55, 4.5, 0.85);
  if (rng() < 0.5) lanternPost(k, 4.6, mezzY + 0.28, -4.8);
};

const bridgeSpan: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'none', pillars: false, engawaChance: 0 });
  const alongX = open[0] || open[1] || !(open[4] || open[5]);
  const q = alongX ? 1 : 0;
  const deckY = -3.0 + rng() * 2.0;
  k.begin(0, 0, 0, q);
  // deck spans the whole cell so it meets its neighbours
  k.box(3.4, 0.3, 12.4, 0, deckY - 0.15, 0, C.WOOD_D, { jit: 0.1, collide: true });
  floorPlanks(k, 3.2, 12.0, deckY + 0.11, false);
  railing(k, -1.58, deckY + 0.1, 0, 11.8, false);
  railing(k, 1.58, deckY + 0.1, 0, 11.8, false);
  for (const s of [-1, 1]) {
    k.box(0.22, 0.22, 7.0, s * 1.45, deckY - 1.25, 0, C.WOOD_D, { rx: s * 0.32, jit: 0.1 });
  }
  k.box(0.3, 2.1, 0.3, 0, deckY - 1.25, 0, C.WOOD_D);
  k.end();
  k.begin(0, 0, 0, q);
  torii(k, 0, deckY + 0.1, 0, 3.8, 4.8, rng() < 0.7 ? C.LACQ : C.WOOD_D);
  lanternHang(k, -1.5, deckY + 4.1, 2.2, 0.55, 0.85);
  lanternHang(k, 1.5, deckY + 4.1, -2.2, 0.55, 0.85);
  k.end();
};

const gateChamber: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'planks' });
  const openLateral = FACES.filter((f) => open[f.f]);
  let placed = 0;
  for (const face of openLateral) {
    if (placed >= 2) break;
    k.begin(face.x * 0.8, 0, face.z * 0.8, face.q);
    torii(k, 0, FLOOR, 0, 5.0, 6.8, rng() < 0.8 ? C.LACQ : C.WOOD_D);
    k.end();
    placed++;
  }
  k.box(2.4, 0.08, SPAN, 0, FLOOR + 0.05, 0, C.STONE, {
    jit: 0.2,
    ry: openLateral[0] && openLateral[0].q % 2 === 1 ? Math.PI / 2 : 0,
  });
  lanternPost(k, -4.0, FLOOR, -4.0);
  lanternPost(k, 4.0, FLOOR, 4.0);
  if (rng() < 0.5) lanternHang(k, 0, CEIL - 0.05, 0, 1.3, 1.35);
};

const balconyRing: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'none', engawaChance: 0 });
  const y = FLOOR + (rng() < 0.4 ? 2.6 : 0);
  const wDeck = 2.7;
  const off = SPAN / 2 - wDeck / 2 + 0.3;
  for (const face of FACES) {
    k.begin(face.x !== 0 ? Math.sign(face.x) * off : 0, 0, face.z !== 0 ? Math.sign(face.z) * off : 0, face.q);
    k.box(SPAN + 0.6, 0.28, wDeck, 0, y - 0.14, 0, C.WOOD_D, { jit: 0.12, collide: true });
    k.box(SPAN + 0.4, 0.08, wDeck - 0.3, 0, y + 0.01, 0, C.WOOD, { jit: 0.28 });
    k.end();
  }
  const inner = off - wDeck / 2 + 0.12;
  railing(k, 0, y, -inner, inner * 2 + 0.4, true);
  railing(k, 0, y, inner, inner * 2 + 0.4, true);
  railing(k, -inner, y, 0, inner * 2 + 0.4, false);
  railing(k, inner, y, 0, inner * 2 + 0.4, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (rng() < 0.6) lanternPost(k, sx * 4.6, y, sz * 4.6, 2.6);
  }
  if (rng() < 0.5) lanternHang(k, 0, 5.7, 0, 2.4 + rng() * 2.8, 1.4);
};

const pillarForest: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: rng() < 0.4 ? 'tatami' : 'planks' });
  const col = rng() < 0.3 ? C.LACQ : C.WOOD;
  const topY = open[2] ? 5.6 : CEIL;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      if (ix === 0 && iz === 0 && rng() < 0.6) continue;
      if (rng() < 0.12) continue;
      pillar(k, ix * 3.5, iz * 3.5, FLOOR, topY, 0.4, col);
      if (rng() < 0.35) bracketCluster(k, ix * 3.5, topY - 0.62, iz * 3.5, 0.42);
    }
  }
  for (let i = -1; i <= 1; i++) {
    k.box(SPAN, 0.24, 0.28, 0, topY - 0.28, i * 3.5, C.WOOD_D, { jit: 0.1 });
    k.box(0.28, 0.24, SPAN, i * 3.5, topY - 0.55, 0, C.WOOD_D, { jit: 0.1 });
  }
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    lanternHang(k, (rng() - 0.5) * 6, topY - 0.7, (rng() - 0.5) * 6, 0.8 + rng() * 1.6, 0.95);
  }
};

const voidLattice: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'none', pillars: false, engawaChance: 0 });
  const n = 3;
  for (let i = 0; i < n; i++) {
    const y = -3.8 + i * 3.4 + (rng() - 0.5) * 1.4;
    const zz = (rng() - 0.5) * 7;
    k.box(12.4, 0.34, 0.4, 0, y, zz, C.WOOD_D, { jit: 0.14, collide: true });
    const y2 = -2.6 + i * 3.4 + (rng() - 0.5) * 1.4;
    const xx = (rng() - 0.5) * 7;
    k.box(0.4, 0.34, 12.4, xx, y2, 0, C.WOOD, { jit: 0.14, collide: true });
    if (rng() < 0.7) lanternHang(k, xx, y2 - 0.2, (rng() - 0.5) * 6, 0.5 + rng() * 1.4, 0.9);
  }
  for (let i = 0; i < 2; i++) {
    k.box(0.3, 12.4, 0.3, (rng() - 0.5) * 7, 0, (rng() - 0.5) * 7, C.WOOD_D, { jit: 0.12, collide: true });
  }
  if (rng() < 0.4) k.box(3.0, 0.24, 3.0, 0, -1 + rng() * 2, 0, C.WOOD_L, { jit: 0.2, collide: true });
};

const pavilionIsle: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: 'none', pillars: false, engawaChance: 0 });
  const y = FLOOR + 0.1;
  slabBase(k, 8.6, 8.6, y, 0.6);
  floorPlanks(k, 8.4, 8.4, y + 0.001, rng() < 0.5);
  pavilion(k, 0, y, 0, 5.0, 3.6);
  railing(k, 0, y, -4.1, 8.4, true);
  railing(k, 0, y, 4.1, 8.4, true);
  railing(k, -4.1, y, 0, 8.4, false);
  railing(k, 4.1, y, 0, 8.4, false);
  lanternPost(k, -3.7, y, 3.7, 2.5);
  lanternPost(k, 3.7, y, -3.7, 2.5);
  if (open[2] && rng() < 0.6) {
    k.box(0.05, 4.0, 0.05, -3.0, 3.8, 0, C.ROPE);
    k.box(0.05, 4.0, 0.05, 3.0, 3.8, 0, C.ROPE);
  }
};

// --- new district-specific archetypes ---------------------------------------

/** Long enclosed passage that always runs wall-to-wall — reads as a street. */
const corridor: Builder = (k, rng, open) => {
  const alongX = open[0] || open[1];
  const q = alongX ? 1 : 0;
  const w = 4.2;
  k.begin(0, 0, 0, q);
  // floor + ceiling run the FULL cell so they meet the neighbours
  k.box(w, 0.4, 12.4, 0, FLOOR - 0.2, 0, C.WOOD_D, { jit: 0.12, collide: true });
  floorPlanks(k, w - 0.3, 12.2, FLOOR, false);
  k.box(w + 0.8, 0.36, 12.4, 0, FLOOR + 4.6, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
  // side walls with posts
  for (const s of [-1, 1]) {
    k.begin(s * (w / 2), 0, 0, q + (s > 0 ? 1 : 3));
    const roll = rng();
    if (roll < 0.5) wallShoji(k, 12.0, FLOOR, FLOOR + 4.5, { gap: rng() < 0.4 ? 3.2 : 0 });
    else if (roll < 0.8) wallLattice(k, 12.0, FLOOR, FLOOR + 4.5);
    else wallPlanks(k, 12.0, FLOOR, FLOOR + 4.5);
    k.end();
    k.begin(0, 0, 0, q);
  }
  for (let i = -1; i <= 1; i++) {
    lanternHang(k, 0, FLOOR + 4.4, i * 4.0, 0.5 + rng() * 0.5, 0.95);
    k.box(w + 0.6, 0.26, 0.3, 0, FLOOR + 4.4, i * 4.0, C.WOOD_D, { jit: 0.1 });
  }
  k.end();
};

/** Cramped labyrinth cell — cheap, claustrophobic, stacks densely. */
const cellRoom: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: rng() < 0.6 ? 'tatami' : 'planks', lean: true, engawaChance: 0.2 });
  // a low mezzanine floor splits the volume, making it feel tight
  if (rng() < 0.55) {
    const my = rng() < 0.5 ? -0.6 : 1.2;
    k.box(SPAN, 0.3, SPAN * 0.6, 0, my, rng() < 0.5 ? 2.8 : -2.8, C.WOOD_D, { jit: 0.12, collide: true });
    lanternHang(k, 0, my - 0.2, 0, 0.5, 0.85);
  }
  lanternHang(k, (rng() - 0.5) * 5, CEIL - 0.05, (rng() - 0.5) * 5, 0.7 + rng() * 0.8, 0.9);
  if (rng() < 0.4) lantern(k, 4.2, FLOOR + 0.5, -4.2, 0.8);
};

/** Cathedral-scale bay: colossal columns, no ceiling clutter, huge lanterns. */
const cathedralBay: Builder = (k, rng, open) => {
  shell(k, rng, open, { floor: open[3] ? 'none' : 'planks', pillars: false, engawaChance: 0 });
  const y0 = open[3] ? -6.0 : FLOOR;
  const y1 = open[2] ? 6.0 : CEIL;
  // four monumental columns
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pillar(k, sx * 3.9, sz * 3.9, y0, y1, 1.15, rng() < 0.5 ? C.LACQ : C.WOOD_D);
      bracketCluster(k, sx * 3.9, y1 - 1.5, sz * 3.9, 1.0);
    }
  }
  //架 beams tying the columns
  for (const s of [-1, 1]) {
    k.box(SPAN, 0.55, 0.6, 0, y1 - 0.9, s * 3.9, C.WOOD_D, { jit: 0.1, collide: true });
    k.box(0.6, 0.55, SPAN, s * 3.9, y1 - 1.6, 0, C.WOOD_D, { jit: 0.1, collide: true });
  }
  // one enormous ceremonial lantern
  lanternHang(k, 0, y1 - 0.2, 0, 1.6 + rng() * 1.4, 2.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (rng() < 0.7) lanternHang(k, sx * 3.9, y1 - 1.8, sz * 3.9, 1.0, 1.2);
  }
  if (!open[3]) {
    // a raised dais
    k.box(5.0, 0.5, 5.0, 0, FLOOR + 0.25, 0, C.STONE, { jit: 0.15, collide: true });
    k.box(4.2, 0.16, 4.2, 0, FLOOR + 0.58, 0, C.LACQ, { jit: 0.2 });
  }
};

/** Platform suspended on chains from above — the void's punctuation. */
const suspended: Builder = (k, rng) => {
  const y = -1.5 + rng() * 2;
  const s = 3.6 + rng() * 2.6;
  slabBase(k, s, s, y, 0.5);
  floorPlanks(k, s - 0.3, s - 0.3, y + 0.001, rng() < 0.5);
  railing(k, 0, y, -s / 2 + 0.2, s - 0.4, true);
  railing(k, 0, y, s / 2 - 0.2, s - 0.4, true);
  railing(k, -s / 2 + 0.2, y, 0, s - 0.4, false);
  railing(k, s / 2 - 0.2, y, 0, s - 0.4, false);
  // chains disappearing upward out of the cell — implies more above
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(0.09, 12.0, 0.09, sx * (s / 2 - 0.4), y + 6.4, sz * (s / 2 - 0.4), C.ROPE, { jit: 0.2 });
    }
  }
  if (rng() < 0.6) {
    pavilion(k, 0, y, 0, Math.min(s - 1.2, 3.8), 2.8);
  } else {
    lanternPost(k, 0, y, 0, 2.4);
  }
  lanternTinyRing(k, y, s, rng);
};

function lanternTinyRing(k: Kit, y: number, s: number, rng: () => number): void {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng();
    lanternString(k, Math.cos(a) * s * 0.5, y + 0.3, Math.sin(a) * s * 0.5,
      Math.cos(a + 1.5) * s * 0.5, y + 0.3, Math.sin(a + 1.5) * s * 0.5, 2);
  }
}

// ---------------------------------------------------------------------------

export interface ArchetypeDef {
  name: string;
  build: Builder;
  weight: (open: Open) => number;
}

export const ARCHETYPES: ArchetypeDef[] = [
  { name: 'tatami-hall', build: tatamiHall, weight: () => 16 },
  { name: 'plank-hall', build: plankHall, weight: () => 13 },
  { name: 'stair-shaft', build: stairShaft, weight: (o) => (o[2] ? 16 : 8) },
  { name: 'bridge', build: bridgeSpan, weight: (o) => (o[3] ? 14 : 6) },
  { name: 'gate', build: gateChamber, weight: (o) => (o[0] || o[1] || o[4] || o[5] ? 10 : 2) },
  { name: 'balcony-ring', build: balconyRing, weight: (o) => (o[2] && o[3] ? 16 : 7) },
  { name: 'pillar-forest', build: pillarForest, weight: () => 12 },
  { name: 'void-lattice', build: voidLattice, weight: (o) => (o[2] && o[3] ? 15 : 7) },
  { name: 'pavilion-isle', build: pavilionIsle, weight: () => 9 },
  { name: 'corridor', build: corridor, weight: () => 12 },
  { name: 'cell-room', build: cellRoom, weight: () => 12 },
  { name: 'cathedral-bay', build: cathedralBay, weight: () => 12 },
  { name: 'suspended', build: suspended, weight: () => 10 },
];

const BY_NAME = new Map(ARCHETYPES.map((a) => [a.name, a]));

/** Pick from a district's pool, weighted by how well it fits the open faces. */
export function pickArchetype(rng: () => number, open: Open, pool: string[]): ArchetypeDef {
  let total = 0;
  const cands: ArchetypeDef[] = [];
  const weights: number[] = [];
  for (const name of pool) {
    const a = BY_NAME.get(name);
    if (!a) continue;
    const w = a.weight(open);
    cands.push(a);
    weights.push(w);
    total += w;
  }
  if (cands.length === 0) return ARCHETYPES[0];
  let r = rng() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) return cands[i];
  }
  return cands[0];
}
