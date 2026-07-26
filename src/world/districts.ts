import { hash3, rand3, mulberry32 } from '../core/rng';

// ---------------------------------------------------------------------------
// SPATIAL HIERARCHY
//   World  →  Chapter (288m)  →  District (72m)  →  Cell (12m)  →  Props
// Space is generated top-down: the Director lays out an emotional sequence of
// chapters, chapters deal out districts, districts carve their own negative
// space, and only then is architecture poured into what is left.
// ---------------------------------------------------------------------------

export const CELL = 12;
export const DCELLS = 6;
export const DSIZE = CELL * DCELLS; // 72 m district
export const CHAP_D = 4;

export type DistrictType =
  | 'residential'
  | 'labyrinth'
  | 'canyon'
  | 'shaft'
  | 'bridgeweb'
  | 'temple'
  | 'rotating'
  | 'void';

export type LandmarkType =
  | 'none'
  | 'greatPillar'
  | 'invertedPagoda'
  | 'colossalTorii'
  | 'endlessStair'
  | 'suspendedShrine'
  | 'lanternChamber';

export interface DistrictDef {
  type: DistrictType;
  label: string;
  /** base chance a cell inside this district holds architecture */
  fill: number;
  /** chance a shared face is open (flyable) */
  openness: number;
  /** chance a room breaks the district's orientation (impossible geometry) */
  flip: number;
  /** multiplies fog density — dense districts feel closer */
  fogMul: number;
  /** how the whole district moves as one rigid body */
  motion: 'none' | 'rotate' | 'drift' | 'breathe';
  /** archetype pool (names must exist in archetypes.ts) */
  pool: string[];
  /** landmark table — 'none' entries make landmarks rarer */
  landmarks: LandmarkType[];
}

export const DISTRICTS: Record<DistrictType, DistrictDef> = {
  residential: {
    type: 'residential', label: 'residential ward', fill: 0.66, openness: 0.52, flip: 0.14,
    fogMul: 1.0, motion: 'none',
    pool: ['tatami-hall', 'plank-hall', 'balcony-ring', 'stair-shaft', 'corridor', 'pillar-forest'],
    landmarks: ['none', 'none', 'lanternChamber'],
  },
  labyrinth: {
    type: 'labyrinth', label: 'lantern labyrinth', fill: 0.88, openness: 0.44, flip: 0.28,
    fogMul: 1.45, motion: 'none',
    pool: ['cell-room', 'cell-room', 'corridor', 'tatami-hall'],
    landmarks: ['none', 'none', 'endlessStair'],
  },
  canyon: {
    type: 'canyon', label: 'corridor canyon', fill: 0.78, openness: 0.48, flip: 0.1,
    fogMul: 0.85, motion: 'none',
    pool: ['plank-hall', 'corridor', 'balcony-ring', 'tatami-hall', 'cell-room'],
    landmarks: ['none', 'colossalTorii', 'greatPillar'],
  },
  shaft: {
    type: 'shaft', label: 'the great shaft', fill: 0.82, openness: 0.52, flip: 0.16,
    fogMul: 0.6, motion: 'drift',
    pool: ['balcony-ring', 'stair-shaft', 'plank-hall', 'corridor', 'suspended'],
    landmarks: ['greatPillar', 'endlessStair', 'suspendedShrine'],
  },
  bridgeweb: {
    type: 'bridgeweb', label: 'bridge web', fill: 0.13, openness: 0.85, flip: 0.2,
    fogMul: 0.5, motion: 'drift',
    pool: ['bridge', 'void-lattice', 'gate', 'suspended'],
    landmarks: ['none', 'suspendedShrine', 'colossalTorii'],
  },
  temple: {
    type: 'temple', label: 'hanging temple', fill: 0.5, openness: 0.8, flip: 0.05,
    fogMul: 0.45, motion: 'breathe',
    pool: ['cathedral-bay', 'pavilion-isle', 'gate', 'bridge'],
    landmarks: ['lanternChamber', 'invertedPagoda', 'suspendedShrine'],
  },
  rotating: {
    type: 'rotating', label: 'turning district', fill: 0.44, openness: 0.62, flip: 0.4,
    fogMul: 0.8, motion: 'rotate',
    pool: ['tatami-hall', 'balcony-ring', 'void-lattice', 'bridge', 'pillar-forest'],
    landmarks: ['none', 'invertedPagoda', 'greatPillar'],
  },
  void: {
    type: 'void', label: 'the open void', fill: 0.05, openness: 0.95, flip: 0.5,
    fogMul: 0.32, motion: 'drift',
    pool: ['suspended', 'bridge', 'void-lattice'],
    landmarks: ['none', 'suspendedShrine', 'invertedPagoda', 'endlessStair'],
  },
};

// ---------------------------------------------------------------------------
// THE DIRECTOR
// Chapters are authored sequences, not noise. Each chapter deals its districts
// out along a fixed pattern so the player experiences deliberate rhythm:
// compression → release → awe → descent. Depth biases which chapters appear,
// so flying down really does mean descending into darkness.
// ---------------------------------------------------------------------------

interface ChapterDef {
  name: string;
  /** dealt out by position-derived index → runs and repeats, never confetti */
  seq: DistrictType[];
  density: number;
  /** preferred depth: -1 deep, 0 middle, +1 high */
  depth: number;
  weight: number;
}

const CHAPTERS: ChapterDef[] = [
  {
    name: 'the sleeping wards', depth: 0.2, weight: 12, density: 1.0,
    seq: ['residential', 'residential', 'canyon', 'residential', 'labyrinth', 'residential', 'canyon', 'void'],
  },
  {
    name: 'the descent', depth: -0.7, weight: 11, density: 0.95,
    seq: ['shaft', 'shaft', 'shaft', 'bridgeweb', 'shaft', 'void', 'shaft', 'labyrinth'],
  },
  {
    name: 'the tangled quarter', depth: -0.2, weight: 10, density: 1.05,
    seq: ['labyrinth', 'labyrinth', 'canyon', 'labyrinth', 'void', 'labyrinth', 'residential', 'labyrinth'],
  },
  {
    name: 'the hanging temples', depth: 0.5, weight: 9, density: 0.85,
    seq: ['temple', 'void', 'temple', 'bridgeweb', 'temple', 'void', 'temple', 'bridgeweb'],
  },
  {
    name: 'the web', depth: 0.1, weight: 9, density: 0.85,
    seq: ['bridgeweb', 'bridgeweb', 'void', 'bridgeweb', 'canyon', 'bridgeweb', 'void', 'bridgeweb'],
  },
  {
    name: 'the turning halls', depth: -0.3, weight: 8, density: 0.9,
    seq: ['rotating', 'residential', 'rotating', 'void', 'rotating', 'canyon', 'rotating', 'bridgeweb'],
  },
  {
    name: 'the great canyons', depth: 0.0, weight: 9, density: 1.0,
    seq: ['canyon', 'canyon', 'residential', 'canyon', 'shaft', 'canyon', 'void', 'canyon'],
  },
  {
    name: 'the abyss', depth: -1.0, weight: 8, density: 0.6,
    seq: ['void', 'shaft', 'void', 'void', 'bridgeweb', 'void', 'shaft', 'void'],
  },
];

const CHAP_SALT = 0x3a91c7;
const DIST_SALT = 0x7b2e05;
const OCC_SALT = 0x11ac4f;
const FACE_SALT = 0x515c3;
const LAND_SALT = 0x62d9a1;

function chapterAt(chx: number, chy: number, chz: number, seed: number): ChapterDef {
  // depth bias: each chapter is 288 m tall. Going down favours dark chapters.
  const depthBias = Math.max(-1, Math.min(1, -chy * 0.45));
  let total = 0;
  const w: number[] = [];
  for (const c of CHAPTERS) {
    const affinity = 1.3 - Math.abs(c.depth - depthBias) * 0.9;
    const ww = Math.max(0.05, c.weight * affinity);
    w.push(ww);
    total += ww;
  }
  let r = (hash3(chx, chy, chz, seed ^ CHAP_SALT) / 4294967296) * total;
  for (let i = 0; i < CHAPTERS.length; i++) {
    r -= w[i];
    if (r <= 0) return CHAPTERS[i];
  }
  return CHAPTERS[0];
}

export interface District {
  dx: number;
  dy: number;
  dz: number;
  key: string;
  def: DistrictDef;
  chapter: string;
  density: number;
  landmark: LandmarkType;
  /** world-space centre */
  cx: number;
  cy: number;
  cz: number;
  spinAxis: 0 | 1 | 2;
  spinRate: number;
  driftAmp: number;
  driftFreq: number;
  phase: number;
  /** quarter-turn yaw shared by the whole district (keeps the mass coherent) */
  quarter: number;
  seed: number;
}

const districtCache = new Map<string, District>();
let cacheSeed = NaN;

export function districtKey(dx: number, dy: number, dz: number): string {
  return dx + '|' + dy + '|' + dz;
}

export function districtAtCoords(dx: number, dy: number, dz: number, seed: number): District {
  if (seed !== cacheSeed) {
    districtCache.clear();
    cacheSeed = seed;
  }
  const key = districtKey(dx, dy, dz);
  const hit = districtCache.get(key);
  if (hit) return hit;

  const chx = Math.floor(dx / CHAP_D);
  const chy = Math.floor(dy / CHAP_D);
  const chz = Math.floor(dz / CHAP_D);
  const chap = chapterAt(chx, chy, chz, seed);

  // deal the chapter's sequence out over its districts — ordered, not random
  const lx = ((dx % CHAP_D) + CHAP_D) % CHAP_D;
  const ly = ((dy % CHAP_D) + CHAP_D) % CHAP_D;
  const lz = ((dz % CHAP_D) + CHAP_D) % CHAP_D;
  const idx = (lx + ly * 2 + lz * 3 + (hash3(chx, chy, chz, seed ^ 0x99) & 3)) % chap.seq.length;
  const def = DISTRICTS[chap.seq[idx]];

  const h = hash3(dx, dy, dz, seed ^ DIST_SALT);
  const rng = mulberry32(h | 0);
  const landmark = def.landmarks[Math.floor(rng() * def.landmarks.length)];

  const d: District = {
    dx, dy, dz, key, def,
    chapter: chap.name,
    density: chap.density,
    landmark,
    cx: (dx + 0.5) * DSIZE,
    cy: (dy + 0.5) * DSIZE,
    cz: (dz + 0.5) * DSIZE,
    spinAxis: (h % 3) as 0 | 1 | 2,
    spinRate: def.motion === 'rotate' ? (rng() < 0.5 ? -1 : 1) * (0.005 + rng() * 0.011) : 0,
    driftAmp: def.motion === 'drift' ? 1.0 + rng() * 2.4 : def.motion === 'breathe' ? 0.7 + rng() * 1.3 : 0,
    driftFreq: 0.03 + rng() * 0.045,
    phase: rng() * Math.PI * 2,
    quarter: h % 4,
    seed: h,
  };
  districtCache.set(key, d);
  if (districtCache.size > 4096) districtCache.clear();
  return d;
}

export function districtAtCell(cx: number, cy: number, cz: number, seed: number): District {
  return districtAtCoords(
    Math.floor(cx / DCELLS),
    Math.floor(cy / DCELLS),
    Math.floor(cz / DCELLS),
    seed
  );
}

// ---------------------------------------------------------------------------
// NEGATIVE SPACE — each district carves its own voids first. This is what
// turns a cloud of cubes into streets, shafts, canyons and cathedrals.
// ---------------------------------------------------------------------------

function localCell(c: number): number {
  return ((c % DCELLS) + DCELLS) % DCELLS;
}

/** Structural mask: does the district's *shape* allow architecture here? */
function shapeAllows(d: District, lx: number, ly: number, lz: number): boolean {
  switch (d.def.type) {
    case 'shaft': {
      // hollow tower: thick walls, gaping vertical core
      const r = Math.hypot(lx - (DCELLS - 1) / 2, lz - (DCELLS - 1) / 2);
      return r > 1.7;
    }
    case 'canyon': {
      // a street cut clean through the mass, oriented per district
      const axis = d.seed % 2 === 0 ? lz : lx;
      return axis !== 2 && axis !== 3;
    }
    case 'residential': {
      // carve a horizontal service corridor and a vertical light well
      if (ly === 2 && (d.seed & 3) === 0) return false;
      if (lx === 4 && lz === 1) return false;
      return true;
    }
    case 'temple':
      // huge hollow nave: only the shell builds, the interior is one volume
      return lx === 0 || lx === DCELLS - 1 || lz === 0 || lz === DCELLS - 1 || ly === 0 || ly === DCELLS - 1;
    case 'labyrinth':
    case 'bridgeweb':
    case 'void':
    case 'rotating':
    default:
      return true;
  }
}

/** Final per-cell occupancy: shape mask × district fill × chapter density. */
export function isOccupied(cx: number, cy: number, cz: number, seed: number): boolean {
  const d = districtAtCell(cx, cy, cz, seed);
  if (!shapeAllows(d, localCell(cx), localCell(cy), localCell(cz))) return false;
  const p = Math.min(0.97, d.def.fill * d.density);
  return rand3(cx, cy, cz, seed ^ OCC_SALT) < p;
}

/** Shared-face openness. The lower cell owns the face, so both sides agree. */
export function faceOpen(cx: number, cy: number, cz: number, face: number, seed: number): boolean {
  const axis = face >> 1;
  const positive = (face & 1) === 0;
  let ox = cx, oy = cy, oz = cz;
  if (!positive) {
    if (axis === 0) ox -= 1;
    else if (axis === 1) oy -= 1;
    else oz -= 1;
  }
  const d = districtAtCell(ox, oy, oz, seed);
  return rand3(ox, oy, oz, seed ^ (FACE_SALT + axis * 0x9101)) < d.def.openness;
}

/**
 * Connector across the face between this cell and its +axis neighbour.
 * 0 = none, 1 = enclosed corridor, 2 = open bridge.
 * Owned by the lower cell so it is built exactly once, and it always spans the
 * FULL gap — so it runs off into unloaded space instead of stopping mid-air.
 */
export function connectorAt(cx: number, cy: number, cz: number, axis: 0 | 1 | 2, seed: number): 0 | 1 | 2 {
  const here = isOccupied(cx, cy, cz, seed);
  const there = isOccupied(
    cx + (axis === 0 ? 1 : 0),
    cy + (axis === 1 ? 1 : 0),
    cz + (axis === 2 ? 1 : 0),
    seed
  );
  const d = districtAtCell(cx, cy, cz, seed);
  const r = rand3(cx * 3 + axis, cy * 5 - axis, cz * 7 + axis, seed ^ 0x51ce);
  const t = d.def.type;

  if (here && there) {
    // both solid: thread a corridor between them
    return r < (t === 'labyrinth' ? 0.5 : t === 'residential' || t === 'canyon' ? 0.38 : 0.26) ? 1 : 0;
  }
  if (here !== there) {
    // solid meets void: throw a bridge out into the emptiness
    const p = t === 'bridgeweb' ? 0.72 : t === 'void' ? 0.38 : t === 'shaft' ? 0.4 : 0.24;
    return r < p ? 2 : 0;
  }
  // pure void: long spans crossing the emptiness
  if (t === 'bridgeweb') return r < 0.4 ? 2 : 0;
  if (t === 'void' || t === 'temple') return r < 0.12 ? 2 : 0;
  return 0;
}

/** One landmark per district at most, and only when the hash agrees. */
export function landmarkOf(d: District): LandmarkType {
  if (d.landmark === 'none') return 'none';
  return (hash3(d.dx, d.dy, d.dz, d.seed ^ LAND_SALT) & 255) < 168 ? d.landmark : 'none';
}
