import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { Kit, bakeShading, buildGlowPoints } from '../kit/geoUtils';
import { opaqueMat, emissiveMat, glowMat, C } from '../kit/materials';
import {
  pillar, bracketCluster, railing, stairs, torii, lantern, lanternHang,
  lanternTiny, lanternString, floorPlanks, slabBase, pavilion,
} from '../kit/parts';
import { District, DSIZE, LandmarkType, landmarkOf } from './districts';

// ---------------------------------------------------------------------------
// LANDMARKS — monumental structures spanning 70–200 m, streamed at a much
// larger radius than rooms so they loom out of the fog long before you arrive.
// They are what make the scale jump from 10 m to 300 m in a single view, and
// what let a player say "meet me at the red pillar".
// ---------------------------------------------------------------------------

type LandmarkBuilder = (k: Kit, rng: () => number) => void;

/** Colossal red pillar rising far beyond the district in both directions. */
const greatPillar: LandmarkBuilder = (k, rng) => {
  const H = DSIZE * 2.6;
  const r = 3.4;
  // shaft in segments so the vertex-colour banding reads as scale
  const segs = 16;
  for (let i = 0; i < segs; i++) {
    const y = -H / 2 + (H / segs) * (i + 0.5);
    const taper = 1 - Math.abs(y) / (H * 1.6);
    k.box(r * 2 * taper, H / segs + 0.2, r * 2 * taper, 0, y, 0, i % 4 === 0 ? C.LACQ_B : C.LACQ, {
      jit: 0.08, collide: true,
    });
  }
  // iron bands + lantern rings marching up the shaft
  for (let i = 0; i < 14; i++) {
    const y = -H / 2 + (H / 14) * (i + 0.5);
    const taper = 1 - Math.abs(y) / (H * 1.6);
    const rr = r * taper;
    k.box(rr * 2.5, 1.1, rr * 2.5, 0, y, 0, C.TRIM_DARK, { jit: 0.1 });
    const n = 8;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + i * 0.3;
      lanternTiny(k, Math.cos(a) * rr * 1.5, y + 1.2, Math.sin(a) * rr * 1.5, 1.6);
    }
    // brackets and a ring balcony every few bands
    if (i % 3 === 1) {
      for (let j = 0; j < 4; j++) {
        const a = (j / 4) * Math.PI * 2;
        bracketCluster(k, Math.cos(a) * rr * 1.2, y + 1.6, Math.sin(a) * rr * 1.2, 1.6);
      }
      const ring = rr * 2.6;
      for (const s of [-1, 1]) {
        railing(k, 0, y + 2.4, s * ring, ring * 2, true);
        railing(k, s * ring, y + 2.4, 0, ring * 2, false);
      }
      k.box(ring * 2.2, 0.5, ring * 2.2, 0, y + 2.1, 0, C.WOOD_D, { jit: 0.1, collide: true });
    }
  }
  k.glow(0, 0, 0, 26, 0xff7a33);
  void rng;
};

/** A pagoda hanging upside-down from nothing, tiers widening downward. */
const invertedPagoda: LandmarkBuilder = (k, rng) => {
  const tiers = 6;
  let y = DSIZE * 0.55;
  let w = 6;
  for (let i = 0; i < tiers; i++) {
    const h = 7 + i * 1.2;
    // body
    k.box(w, h, w, 0, y - h / 2, 0, i % 2 ? C.WOOD : C.WOOD_D, { jit: 0.12, collide: true });
    // inverted eave: wide slab under each tier
    const ew = w * 1.75;
    k.box(ew, 0.7, ew, 0, y - h - 0.35, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box(ew * 0.34, 0.5, ew * 0.34, sx * ew * 0.46, y - h - 0.9, sz * ew * 0.46, C.TRIM_DARK, {
        rz: sx * 0.4, rx: -sz * 0.4,
      });
      bracketCluster(k, sx * w * 0.42, y - h + 0.3, sz * w * 0.42, 0.9);
    }
    // lit windows around the tier
    const n = 4;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      const px = Math.cos(a) * (w / 2 + 0.05);
      const pz = Math.sin(a) * (w / 2 + 0.05);
      k.box(w * 0.42, h * 0.4, 0.3, px, y - h * 0.5, pz, C.PAPER, { em: true, ry: -a, jit: 0.25 });
      k.glow(px, y - h * 0.5, pz, 5, 0xffa050);
    }
    // lantern fringe along the eave
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      lanternTiny(k, Math.cos(a) * ew * 0.46, y - h - 1.6, Math.sin(a) * ew * 0.46, 1.5);
    }
    y -= h + 1.4;
    w *= 1.32;
  }
  // the spire, pointing down into the abyss
  k.box(1.4, 10, 1.4, 0, y - 5, 0, C.METAL, { jit: 0.1 });
  const g = new THREE.SphereGeometry(1.6, 8, 6);
  g.deleteAttribute('uv');
  k.place(g, 0, y - 11, 0, C.METAL);
  k.glow(0, y - 11, 0, 14, 0xffb060);
  void rng;
};

/** A torii gate the size of a city block, straddling the void. */
const colossalTorii: LandmarkBuilder = (k, rng) => {
  const W = DSIZE * 0.95;
  const H = DSIZE * 0.8;
  const pr = 3.0;
  for (const s of [-1, 1]) {
    // pillar with a slight batter, extended far below so it never "ends"
    k.box(pr * 2, H * 1.9, pr * 2, s * W / 2, -H * 0.25, 0, C.LACQ, { rz: s * 0.02, jit: 0.08, collide: true });
    k.box(pr * 3.2, 3, pr * 3.2, s * W / 2, H * 0.62, 0, C.TRIM_DARK, { jit: 0.1 });
    for (let i = 0; i < 10; i++) {
      lanternTiny(k, s * (W / 2) + (i % 2 ? pr * 1.6 : -pr * 1.6), -H * 0.6 + i * (H * 0.16), pr * 1.6, 1.8);
    }
  }
  // kasagi: double lintel with lifted tips
  k.box(W + 14, 2.6, 4.4, 0, H * 0.72, 0, C.LACQ, { jit: 0.08, collide: true });
  k.box(W + 22, 2.4, 5.6, 0, H * 0.80, 0, C.TRIM_DARK, { jit: 0.08, collide: true });
  for (const s of [-1, 1]) {
    k.box(9, 2.0, 5.2, s * (W / 2 + 13), H * 0.84, 0, C.TRIM_DARK, { rz: s * 0.28 });
  }
  // nuki tie + centre tablet
  k.box(W + 6, 2.2, 3.0, 0, H * 0.5, 0, C.LACQ, { jit: 0.08, collide: true });
  k.box(4.0, 5.0, 2.4, 0, H * 0.61, 0, C.LACQ_B);
  k.box(3.0, 3.6, 0.4, 0, H * 0.61, 1.4, C.PAPER, { em: true });
  k.glow(0, H * 0.61, 1.6, 12, 0xffa050);
  // lantern garland slung across the opening
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    lanternString(k, -W / 2, H * 0.46 - Math.sin(t * Math.PI) * 6, 0, W / 2, H * 0.46, 0, 7);
  }
  k.glow(0, 0, 0, 22, 0xff8035);
  void rng;
};

/** A staircase spiralling up and down past the limits of visibility. */
const endlessStair: LandmarkBuilder = (k, rng) => {
  const turns = 5;
  const stepsPerTurn = 22;
  const R = 13;
  const rise = 1.5;
  const total = turns * stepsPerTurn;
  for (let i = 0; i < total; i++) {
    const a = (i / stepsPerTurn) * Math.PI * 2;
    const y = -total * rise * 0.5 + i * rise;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    k.box(5.0, 0.5, 2.2, x, y, z, i % 5 === 0 ? C.LACQ : C.WOOD_L, { ry: -a, jit: 0.18, collide: true });
    if (i % 3 === 0) {
      k.box(0.34, 4.4, 0.34, Math.cos(a) * (R + 2.3), y + 2.2, Math.sin(a) * (R + 2.3), C.WOOD_D, { jit: 0.15 });
      k.box(2.2, 0.28, 0.28, Math.cos(a) * (R + 2.3), y + 4.3, Math.sin(a) * (R + 2.3), C.LACQ_B, { ry: -a });
    }
    if (i % 6 === 0) lanternTiny(k, Math.cos(a) * (R + 3.4), y + 3.6, Math.sin(a) * (R + 3.4), 1.8);
  }
  // the central column the stair wraps
  k.box(5.5, total * rise * 1.25, 5.5, 0, 0, 0, C.WOOD_D, { jit: 0.1, collide: true });
  for (let i = 0; i < 8; i++) {
    const y = -total * rise * 0.5 + (total * rise / 8) * i;
    k.box(7.0, 1.0, 7.0, 0, y, 0, C.TRIM_DARK, { jit: 0.1 });
  }
  k.glow(0, 0, 0, 18, 0xff9040);
  void rng;
};

/** A shrine hanging in the void on enormous chains. */
const suspendedShrine: LandmarkBuilder = (k, rng) => {
  const S = 22;
  const y = 0;
  slabBase(k, S, S, y, 2.0);
  floorPlanks(k, S - 1, S - 1, y + 0.01, true);
  for (const s of [-1, 1]) {
    railing(k, 0, y, s * (S / 2 - 0.6), S - 1.2, true);
    railing(k, s * (S / 2 - 0.6), y, 0, S - 1.2, false);
  }
  pavilion(k, 0, y, 0, S * 0.5, 9);
  // approach gate + path
  k.begin(0, 0, S * 0.34, 0);
  torii(k, 0, y, 0, 9, 12, C.LACQ);
  k.end();
  k.box(4.0, 0.16, S * 0.7, 0, y + 0.1, S * 0.1, C.STONE, { jit: 0.2 });
  // four titanic chains vanishing upward
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (S / 2 - 1.2);
      const cz = sz * (S / 2 - 1.2);
      for (let i = 0; i < 18; i++) {
        k.box(0.7, 2.6, 0.7, cx, y + 4 + i * 4.4, cz, C.METAL, { ry: i * 0.5, jit: 0.15 });
      }
      lanternPostTall(k, cx * 0.78, y, cz * 0.78);
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lanternHang(k, Math.cos(a) * S * 0.42, y + 8.5, Math.sin(a) * S * 0.42, 1.6, 1.4);
  }
  k.glow(0, y + 3, 0, 20, 0xffa855);
  void rng;
};

function lanternPostTall(k: Kit, x: number, yBase: number, z: number): void {
  k.box(0.4, 5.0, 0.4, x, yBase + 2.5, z, C.WOOD_D, { jit: 0.15 });
  k.box(1.0, 0.3, 1.0, x, yBase + 0.15, z, C.STONE);
  lantern(k, x, yBase + 5.6, z, 1.8);
}

/** A cathedral hall filled with hundreds of hanging lanterns. */
const lanternChamber: LandmarkBuilder = (k, rng) => {
  const S = DSIZE * 0.62;
  const H = DSIZE * 0.55;
  // floor and ceiling slabs
  k.box(S, 2.2, S, 0, -H / 2, 0, C.WOOD_D, { jit: 0.1, collide: true });
  floorPlanks(k, S - 1, S - 1, -H / 2 + 1.1, true);
  k.box(S, 2.0, S, 0, H / 2, 0, C.TRIM_DARK, { jit: 0.1, collide: true });
  // colonnade
  const n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i > 0 && i < n - 1 && j > 0 && j < n - 1) continue;
      const x = -S / 2 + (S / (n - 1)) * i;
      const z = -S / 2 + (S / (n - 1)) * j;
      pillar(k, x, z, -H / 2 + 1, H / 2 - 1, 1.8, (i + j) % 2 ? C.LACQ : C.WOOD_D);
      bracketCluster(k, x, H / 2 - 3.2, z, 1.5);
    }
  }
  // the lantern ocean
  const count = 150;
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * S * 0.92;
    const z = (rng() - 0.5) * S * 0.92;
    const drop = 3 + rng() * (H * 0.72);
    lanternTiny(k, x, H / 2 - drop, z, 1.5 + rng() * 1.6);
  }
  for (let i = 0; i < 10; i++) {
    lanternHang(k, (rng() - 0.5) * S * 0.7, H / 2 - 1.2, (rng() - 0.5) * S * 0.7, 3 + rng() * 8, 2.4);
  }
  k.glow(0, 0, 0, 30, 0xffa050);
};

const BUILDERS: Record<Exclude<LandmarkType, 'none'>, LandmarkBuilder> = {
  greatPillar,
  invertedPagoda,
  colossalTorii,
  endlessStair,
  suspendedShrine,
  lanternChamber,
};

export interface LandmarkData {
  key: string;
  root: THREE.Group;
  type: LandmarkType;
  district: District;
  disposables: THREE.BufferGeometry[];
  triCount: number;
}

/** Build the landmark for a district, or null if it has none. */
export function buildLandmark(d: District): LandmarkData | null {
  const type = landmarkOf(d);
  if (type === 'none') return null;
  const rng = mulberry32((d.seed ^ 0x5eed) | 0);
  const k = new Kit(rng);
  BUILDERS[type](k, rng);

  const glows = k.glows;
  const { opaque, emissive } = k.merge();
  const root = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  let triCount = 0;

  if (opaque) {
    bakeShading(opaque, glows, DSIZE * 0.8);
    opaque.computeBoundingSphere();
    const m = new THREE.Mesh(opaque, opaqueMat);
    m.matrixAutoUpdate = false;
    root.add(m);
    disposables.push(opaque);
    triCount += (opaque.index?.count ?? 0) / 3;
  }
  if (emissive) {
    emissive.computeBoundingSphere();
    const m = new THREE.Mesh(emissive, emissiveMat);
    m.matrixAutoUpdate = false;
    root.add(m);
    disposables.push(emissive);
    triCount += (emissive.index?.count ?? 0) / 3;
  }
  const pts = buildGlowPoints(glows, glowMat);
  if (pts) {
    pts.matrixAutoUpdate = false;
    root.add(pts);
    disposables.push(pts.geometry as THREE.BufferGeometry);
  }
  if (root.children.length === 0) return null;

  root.position.set(0, 0, 0); // district-local: landmarks sit at district centre
  return { key: d.key, root, type, district: d, disposables, triCount };
}
