import * as THREE from 'three';
import { C } from './materials';
import { Kit, paint } from './geoUtils';

// Room-local conventions. Content very nearly FILLS the 12 m cell, so
// neighbouring occupied cells physically touch and read as one continuous
// building instead of a cloud of floating boxes.
export const ROOM = {
  H: 5.9,
  FLOOR: -5.15, // floor top surface
  CEIL: 5.15, // ceiling underside
  WALL: 5.78, // wall centre plane distance
  SPAN: 11.4, // typical wall width
};

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();

// ---------------------------------------------------------------------------
// floors
// ---------------------------------------------------------------------------

/** Thick base slab with under-rim, collider included. */
export function slabBase(k: Kit, w: number, d: number, yTop: number, t = 0.5, color = C.WOOD_D): void {
  k.box(w, t, d, 0, yTop - t / 2, 0, color, { jit: 0.12, collide: true });
  // rim beams proud of the slab edge for silhouette
  k.box(w + 0.3, 0.22, 0.34, 0, yTop - t - 0.02, d / 2 - 0.1, C.TRIM_DARK);
  k.box(w + 0.3, 0.22, 0.34, 0, yTop - t - 0.02, -d / 2 + 0.1, C.TRIM_DARK);
  k.box(0.34, 0.22, d + 0.3, w / 2 - 0.1, yTop - t - 0.02, 0, C.TRIM_DARK);
  k.box(0.34, 0.22, d + 0.3, -w / 2 + 0.1, yTop - t - 0.02, 0, C.TRIM_DARK);
}

/** Tatami grid — mats over a dark base so the seams read as edging. */
export function floorTatami(k: Kit, w: number, d: number, yTop: number): void {
  k.box(w, 0.12, d, 0, yTop - 0.13, 0, C.TRIM_DARK);
  const cols = 4;
  const rows = 4;
  const mw = w / cols;
  const md = d / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const worn = k.rng() < 0.12;
      k.box(
        mw - 0.09, 0.1, md - 0.09,
        -w / 2 + mw * (c + 0.5), yTop - 0.05, -d / 2 + md * (r + 0.5),
        worn ? C.TATAMI_D : C.TATAMI,
        { jit: 0.22 }
      );
    }
  }
}

/** Plank floor strips with colour jitter. */
export function floorPlanks(k: Kit, w: number, d: number, yTop: number, alongX = true): void {
  k.box(w, 0.12, d, 0, yTop - 0.13, 0, C.TRIM_DARK);
  const n = 8;
  if (alongX) {
    const pd = d / n;
    for (let i = 0; i < n; i++) {
      k.box(w - 0.1, 0.09, pd - 0.07, 0, yTop - 0.045, -d / 2 + pd * (i + 0.5), C.WOOD, { jit: 0.3 });
    }
  } else {
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      k.box(pw - 0.07, 0.09, d - 0.1, -w / 2 + pw * (i + 0.5), yTop - 0.045, 0, C.WOOD, { jit: 0.3 });
    }
  }
}

// ---------------------------------------------------------------------------
// structure
// ---------------------------------------------------------------------------

export function pillar(k: Kit, x: number, z: number, y0: number, y1: number, s = 0.42, color: number = C.WOOD): void {
  const h = y1 - y0;
  k.box(s, h, s, x, y0 + h / 2, z, color, { jit: 0.14, collide: true });
  k.box(s + 0.22, 0.18, s + 0.22, x, y0 + 0.09, z, C.TRIM_DARK);
  k.box(s + 0.16, 0.14, s + 0.16, x, y1 - 0.07, z, C.TRIM_DARK);
}

/** Stepped bracket cluster (simplified tokyō) under a beam or eave. */
export function bracketCluster(k: Kit, x: number, y: number, z: number, s = 0.5, color: number = C.WOOD_L): void {
  k.box(s * 0.6, 0.14, s * 0.6, x, y + 0.07, z, color, { jit: 0.1 });
  k.box(s * 1.2, 0.13, s * 0.5, x, y + 0.27, z, color, { jit: 0.1 });
  k.box(s * 0.5, 0.13, s * 1.2, x, y + 0.27, z, color, { jit: 0.1 });
  k.box(s * 1.8, 0.12, s * 0.42, x, y + 0.47, z, color, { jit: 0.1 });
  k.box(s * 0.42, 0.12, s * 1.8, x, y + 0.47, z, color, { jit: 0.1 });
}

/** Railing with balusters and gold finials. alongX=false runs it along Z. */
export function railing(k: Kit, cx: number, yBase: number, cz: number, len: number, alongX = true, h = 1.0): void {
  const rail = (w: number, hh: number, d: number, x: number, y: number, z: number, col: number, jit = 0.12) =>
    alongX ? k.box(w, hh, d, x, y, z, col, { jit }) : k.box(d, hh, w, z, y, x, col, { jit });
  rail(len, 0.11, 0.14, cx, yBase + h, cz, C.LACQ_B);
  rail(len, 0.08, 0.1, cx, yBase + h * 0.45, cz, C.WOOD_D);
  const n = Math.max(2, Math.round(len / 0.95));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    rail(0.09, h, 0.09, cx + t, yBase + h / 2, cz, C.WOOD_D, 0.18);
  }
  // finials
  for (const s of [-1, 1]) {
    const g = new THREE.SphereGeometry(0.11, 6, 5);
    g.deleteAttribute('uv');
    if (alongX) k.place(g, cx + (s * len) / 2, yBase + h + 0.14, cz, C.METAL);
    else k.place(g, cz, yBase + h + 0.14, cx + (s * len) / 2, C.METAL);
  }
}

export interface StairOpts {
  x: number;
  y: number;
  z: number;
  /** total rise */
  rise: number;
  /** total run along +Z of the current frame */
  run: number;
  w: number;
  steps?: number;
}

/** Straight stair ascending toward +Z of the current frame. */
export function stairs(k: Kit, o: StairOpts): void {
  const n = o.steps ?? Math.max(5, Math.round(o.rise / 0.55));
  const rs = o.rise / n;
  const zs = o.run / n;
  for (let i = 0; i < n; i++) {
    k.box(o.w, 0.1, zs + 0.06, o.x, o.y + (i + 1) * rs - 0.05, o.z + (i + 0.5) * zs, C.WOOD_L, { jit: 0.2 });
    // riser shadow
    k.box(o.w - 0.2, rs, 0.07, o.x, o.y + (i + 0.5) * rs, o.z + i * zs + 0.05, C.TRIM_DARK);
  }
  const slope = Math.atan2(o.rise, o.run);
  const slopeLen = Math.sqrt(o.rise * o.rise + o.run * o.run);
  for (const s of [-1, 1]) {
    k.box(0.16, 0.3, slopeLen, o.x + (s * o.w) / 2, o.y + o.rise / 2 - 0.12, o.z + o.run / 2, C.WOOD_D, {
      rx: -slope,
      jit: 0.1,
    });
  }
  // three coarse colliders following the slope
  for (let seg = 0; seg < 3; seg++) {
    const z0 = o.z + (o.run * seg) / 3;
    const z1 = o.z + (o.run * (seg + 1)) / 3;
    const yTop = o.y + (o.rise * (seg + 1)) / 3;
    k.collide(o.x, (o.y + yTop) / 2 - 0.15, (z0 + z1) / 2, o.w / 2, (yTop - o.y) / 2 + 0.02, (z1 - z0) / 2);
  }
}

/** Torii gate spanning `w`, opening along the current frame's Z axis. */
export function torii(k: Kit, x: number, y0: number, z: number, w: number, h: number, color: number = C.LACQ): void {
  const ph = h * 0.92;
  for (const s of [-1, 1]) {
    k.box(0.34, ph, 0.34, x + (s * w) / 2, y0 + ph / 2, z, color, { rz: s * 0.035, jit: 0.1, collide: true });
    k.box(0.55, 0.16, 0.55, x + (s * w) / 2, y0 + 0.08, z, C.STONE, { jit: 0.15 });
  }
  // kasagi (double top beam with lifted tips)
  k.box(w + 1.1, 0.2, 0.3, x, y0 + h - 0.28, z, color, { jit: 0.08 });
  k.box(w + 1.5, 0.18, 0.38, x, y0 + h - 0.08, z, C.WOOD_D, { jit: 0.08 });
  for (const s of [-1, 1]) {
    k.box(0.55, 0.15, 0.36, x + s * (w / 2 + 0.85), y0 + h + 0.02, z, C.WOOD_D, { rz: s * 0.3 });
  }
  // nuki tie + centre strut
  k.box(w + 0.45, 0.17, 0.22, x, y0 + h * 0.68, z, color, { jit: 0.08 });
  k.box(0.2, h * 0.2, 0.18, x, y0 + h * 0.81, z, color);
}

// ---------------------------------------------------------------------------
// lanterns
// ---------------------------------------------------------------------------

function lanternBodyGeo(r: number, h: number): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  const shape = [
    [0.3, 0], [0.82, 0.07], [1.0, 0.24], [1.06, 0.5], [1.0, 0.76], [0.8, 0.93], [0.32, 1],
  ];
  for (const [rr, t] of shape) prof.push(new THREE.Vector2(rr * r, (t - 0.5) * h));
  const g = new THREE.LatheGeometry(prof, 12);
  g.deleteAttribute('uv');
  // warm gradient + rib banding painted per-vertex
  _c1.setHex(C.LANT_DEEP);
  _c2.setHex(C.LANT);
  _c3.setHex(C.LANT_TOP);
  const pos = g.getAttribute('position');
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.min(Math.max((pos.getY(i) + h / 2) / h, 0), 1);
    const band = 0.86 + 0.14 * Math.sin(t * Math.PI * 7);
    const c = t < 0.5 ? _c1.clone().lerp(_c2, t * 2) : _c2.clone().lerp(_c3, (t - 0.5) * 2);
    arr[i * 3] = c.r * band;
    arr[i * 3 + 1] = c.g * band;
    arr[i * 3 + 2] = c.b * band;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Chōchin paper lantern: glowing lathe body + dark caps + glow point. */
export function lantern(k: Kit, x: number, y: number, z: number, scale = 1): void {
  const r = 0.42 * scale;
  const h = 0.85 * scale;
  k.place(lanternBodyGeo(r, h), x, y, z, 0, { em: true });
  const cap = (yy: number, rr: number) => {
    const g = new THREE.CylinderGeometry(rr, rr * 1.05, 0.09 * scale, 8);
    g.deleteAttribute('uv');
    k.place(g, x, yy, z, C.TRIM_DARK);
  };
  cap(y + h / 2 + 0.04 * scale, r * 0.4);
  cap(y - h / 2 - 0.04 * scale, r * 0.42);
  k.glow(x, y, z, 2.6 * scale, C.GLOW);
}

/** Lantern hanging from a rope. */
export function lanternHang(k: Kit, x: number, yTop: number, z: number, drop: number, scale = 1): void {
  k.box(0.045, drop, 0.045, x, yTop - drop / 2, z, C.ROPE, { jit: 0.2 });
  lantern(k, x, yTop - drop - 0.45 * scale, z, scale);
}

/** Lantern on a wooden post with an arm. */
export function lanternPost(k: Kit, x: number, yBase: number, z: number, h = 2.7): void {
  k.box(0.16, h, 0.16, x, yBase + h / 2, z, C.WOOD_D, { jit: 0.15 });
  k.box(0.6, 0.09, 0.09, x + 0.22, yBase + h - 0.1, z, C.WOOD_D);
  k.box(0.34, 0.1, 0.34, x, yBase + 0.05, z, C.STONE);
  lanternHang(k, x + 0.48, yBase + h - 0.14, z, 0.28, 0.8);
}

/** Ultra-cheap distant lantern: tiny emissive blob + glow point + rope. */
export function lanternTiny(k: Kit, x: number, y: number, z: number, s = 1): void {
  const g = new THREE.SphereGeometry(0.17 * s, 6, 4);
  g.deleteAttribute('uv');
  paint(g, k.rng() < 0.3 ? C.LANT_DEEP : C.LANT, 0.3, k.rng);
  k.place(g, x, y, z, 0, { em: true });
  k.box(0.045, 0.34 * s, 0.045, x, y + 0.34 * s, z, C.ROPE);
  k.glow(x, y, z, 1.5 * s, C.GLOW);
}

/** A sagging string of tiny lanterns between two points (in frame coords). */
export function lanternString(k: Kit, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, n = 3): void {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const sag = Math.sin(t * Math.PI) * 0.55;
    lanternTiny(k, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - sag, z0 + (z1 - z0) * t, 0.8 + k.rng() * 0.3);
  }
}

// ---------------------------------------------------------------------------
// walls — built in the current frame: plane z≈0, spanning x, y from y0 to y1
// ---------------------------------------------------------------------------

export interface WallOpts {
  /** door gap width in the middle (0 = solid) */
  gap?: number;
}

/** Shoji: glowing paper wall behind a dark lattice. */
export function wallShoji(k: Kit, w: number, y0: number, y1: number, o: WallOpts = {}): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, 0.32, 0.3, 0, y0 + 0.16, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.26, 0.3, 0, y1 - 0.13, 0, C.WOOD_D, { jit: 0.1 });
  for (const s of [-1, 1]) k.box(0.3, h, 0.3, (s * (w - 0.3)) / 2, mid, 0, C.WOOD_D, { jit: 0.1 });

  const paperY0 = y0 + 0.32;
  const paperY1 = y1 - 0.26;
  const ph = paperY1 - paperY0;
  const pmid = (paperY0 + paperY1) / 2;
  const gap = o.gap ?? 0;

  const panel = (cx: number, pw: number) => {
    k.box(pw, ph, 0.06, cx, pmid, 0, k.rng() < 0.15 ? C.PAPER_DIM : C.PAPER, { em: true, jit: 0.3 });
    const bars = Math.max(2, Math.round(pw / 1.15));
    // lattice on BOTH faces — from outside the shoji must read as joinery,
    // not as a blank glowing billboard
    for (const side of [0.06, -0.06]) {
      for (let i = 1; i < bars; i++) {
        k.box(0.06, ph, 0.08, cx - pw / 2 + (pw * i) / bars, pmid, side, C.TRIM_DARK);
      }
      k.box(pw, 0.055, 0.08, cx, pmid + ph * 0.22, side, C.TRIM_DARK);
      k.box(pw, 0.055, 0.08, cx, pmid - ph * 0.24, side, C.TRIM_DARK);
      k.box(pw, 0.05, 0.08, cx, pmid + ph * 0.42, side, C.TRIM_DARK);
    }
  };

  if (gap > 0) {
    const side = (w - 0.6 - gap) / 2;
    if (side > 0.4) {
      panel(-(gap / 2 + side / 2), side);
      panel(gap / 2 + side / 2, side);
      k.collide(-(gap / 2 + side / 2), mid, 0, side / 2 + 0.15, h / 2, 0.2);
      k.collide(gap / 2 + side / 2, mid, 0, side / 2 + 0.15, h / 2, 0.2);
    }
    for (const s of [-1, 1]) k.box(0.18, h, 0.26, (s * gap) / 2, mid, 0, C.WOOD_D);
    // lintel over the gap
    k.box(gap + 0.5, 0.2, 0.28, 0, y1 - 0.4, 0, C.WOOD_D);
  } else {
    panel(0, w - 0.6);
    k.collide(0, mid, 0, w / 2, h / 2, 0.2);
  }
  // soft facade glow so shoji walls read as lit buildings from afar
  k.glow(0, pmid, 0.6, 2.1, 0xcc8845);
}

/** Plaster wall with exposed timber framing; optional dark lattice window. */
export function wallPlaster(k: Kit, w: number, y0: number, y1: number, o: { window?: boolean } = {}): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, h, 0.22, 0, mid, 0, C.PLASTER, { jit: 0.14 });
  k.box(w, 0.3, 0.32, 0, y0 + 0.15, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.24, 0.32, 0, y1 - 0.12, 0, C.WOOD_D, { jit: 0.1 });
  const posts = Math.max(2, Math.round(w / 3));
  for (let i = 0; i <= posts; i++) {
    k.box(0.17, h, 0.3, -w / 2 + (w * i) / posts, mid, 0, C.WOOD_D, { jit: 0.12 });
  }
  k.box(w, 0.14, 0.3, 0, mid + h * 0.12, 0, C.WOOD_D, { jit: 0.12 });
  if (o.window) {
    const ww = Math.min(2.4, w * 0.3);
    const wh = h * 0.34;
    const lit = k.rng() < 0.65;
    k.box(ww, wh, 0.26, 0, mid + h * 0.08, 0, lit ? C.PAPER : 0x0a0604, { em: lit, jit: 0.25 });
    for (let i = 0; i <= 5; i++) {
      k.box(0.07, wh, 0.1, -ww / 2 + (ww * i) / 5, mid + h * 0.08, 0.14, C.WOOD_D);
    }
    k.box(ww + 0.3, 0.12, 0.36, 0, mid + h * 0.08 - wh / 2, 0, C.WOOD_D);
    k.box(ww + 0.3, 0.12, 0.36, 0, mid + h * 0.08 + wh / 2, 0, C.WOOD_D);
    if (lit) k.glow(0, mid + h * 0.08, 0.55, 1.7, C.GLOW);
  }
  k.collide(0, mid, 0, w / 2, h / 2, 0.18);
}

/** Vertical slat lattice — see-through but solid to collision. */
export function wallLattice(k: Kit, w: number, y0: number, y1: number): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  k.box(w, 0.26, 0.3, 0, y0 + 0.13, 0, C.WOOD_D, { jit: 0.1 });
  k.box(w, 0.22, 0.3, 0, y1 - 0.11, 0, C.WOOD_D, { jit: 0.1 });
  const n = Math.max(4, Math.round(w / 0.55));
  for (let i = 0; i <= n; i++) {
    k.box(0.1, h - 0.4, 0.12, -w / 2 + (w * i) / n, mid, 0, C.WOOD, { jit: 0.2 });
  }
  k.box(w, 0.08, 0.1, 0, mid + h * 0.18, 0.05, C.WOOD_D);
  k.box(w, 0.08, 0.1, 0, mid - h * 0.18, 0.05, C.WOOD_D);
  k.collide(0, mid, 0, w / 2, h / 2, 0.16);
}

/** Horizontal plank wall. */
export function wallPlanks(k: Kit, w: number, y0: number, y1: number): void {
  const h = y1 - y0;
  const mid = (y0 + y1) / 2;
  const n = 5;
  for (let i = 0; i < n; i++) {
    k.box(w, h / n + 0.03, 0.16, 0, y0 + (h * (i + 0.5)) / n, 0, C.WOOD, { jit: 0.3 });
  }
  for (const s of [-1, 1]) k.box(0.24, h, 0.26, (s * (w - 0.24)) / 2, mid, 0, C.WOOD_D, { jit: 0.1 });
  k.collide(0, mid, 0, w / 2, h / 2, 0.14);
}

/** Framing around an open face: posts + lintel + ranma slats above. */
export function openingTrim(k: Kit, w: number, y0: number, y1: number, o: { ranma?: boolean; lanterns?: boolean } = {}): void {
  const h = y1 - y0;
  for (const s of [-1, 1]) k.box(0.3, h, 0.3, (s * (w - 0.3)) / 2, (y0 + y1) / 2, 0, C.WOOD_D, { jit: 0.1, collide: true });
  k.box(w, 0.26, 0.3, 0, y1 - 0.7, 0, C.WOOD_D, { jit: 0.1 });
  if (o.ranma !== false) {
    const n = Math.round(w / 0.42);
    for (let i = 1; i < n; i++) {
      k.box(0.06, 0.52, 0.08, -w / 2 + (w * i) / n, y1 - 0.32, 0, C.WOOD_L, { jit: 0.15 });
    }
    k.box(w, 0.09, 0.12, 0, y1 - 0.06, 0, C.WOOD_D);
  }
  if (o.lanterns) {
    lanternHang(k, -w / 2 + 0.75, y1 - 0.75, 0.1, 0.35, 0.85);
    lanternHang(k, w / 2 - 0.75, y1 - 0.75, 0.1, 0.35, 0.85);
  }
}

/** Engawa lip protruding outward (+Z of frame) from an open face. */
export function engawa(k: Kit, w: number, yTop: number): void {
  k.box(w, 0.16, 1.5, 0, yTop - 0.08, 0.78, C.WOOD_L, { jit: 0.25, collide: true });
  for (const s of [-1, 1]) {
    k.box(0.14, 0.5, 0.14, s * (w / 2 - 0.3), yTop - 0.42, 1.15, C.WOOD_D);
  }
  k.box(w, 0.1, 0.14, 0, yTop - 0.7, 1.42, C.WOOD_D, { jit: 0.15 });
}

// ---------------------------------------------------------------------------
// pavilion (small roofed structure used by some archetypes)
// ---------------------------------------------------------------------------

export function pavilion(k: Kit, cx: number, yBase: number, cz: number, size = 4.6, hgt = 3.4): void {
  const s2 = size / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pillar(k, cx + sx * s2, cz + sz * s2, yBase, yBase + hgt, 0.3, k.rng() < 0.3 ? C.LACQ : C.WOOD);
    }
  }
  // ring beams
  k.box(size + 0.7, 0.22, 0.26, cx, yBase + hgt + 0.11, cz - s2, C.WOOD_D, { jit: 0.1 });
  k.box(size + 0.7, 0.22, 0.26, cx, yBase + hgt + 0.11, cz + s2, C.WOOD_D, { jit: 0.1 });
  k.box(0.26, 0.22, size + 0.7, cx - s2, yBase + hgt + 0.11, cz, C.WOOD_D, { jit: 0.1 });
  k.box(0.26, 0.22, size + 0.7, cx + s2, yBase + hgt + 0.11, cz, C.WOOD_D, { jit: 0.1 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bracketCluster(k, cx + sx * s2, yBase + hgt + 0.2, cz + sz * s2, 0.42);
    }
  }
  // pyramid roof: four tilted slope panels + upturned corner tips
  const roofY = yBase + hgt + 0.75;
  const tilt = 0.5;
  const panelW = size * 1.4;
  const panelD = size * 0.78;
  for (let i = 0; i < 4; i++) {
    const yaw = (i * Math.PI) / 2;
    const dx = Math.sin(yaw) * size * 0.33;
    const dz = Math.cos(yaw) * size * 0.33;
    k.box(panelW, 0.1, panelD, cx + dx, roofY + 0.34, cz + dz, C.TRIM_DARK, {
      rx: -tilt * Math.cos(yaw),
      rz: tilt * Math.sin(yaw),
      jit: 0.12,
    });
  }
  k.box(size * 0.34, 0.3, size * 0.34, cx, roofY + 0.78, cz, C.TRIM_DARK);
  const g = new THREE.SphereGeometry(0.16, 6, 5);
  g.deleteAttribute('uv');
  k.place(g, cx, roofY + 1.0, cz, C.METAL);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(0.7, 0.12, 0.3, cx + sx * (s2 + 0.55), roofY + 0.02, cz + sz * (s2 + 0.55), C.TRIM_DARK, {
        rz: sx * 0.35,
        rx: -sz * 0.35,
      });
    }
  }
  lanternHang(k, cx, yBase + hgt - 0.05, cz, 0.5, 1.0);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Lo-fi gold sphere for finials/ornaments (pre-painted). */
export function ornamentSphere(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 6, 5);
  g.deleteAttribute('uv');
  paint(g, C.METAL);
  return g;
}
