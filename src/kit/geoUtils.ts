import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _bb = new THREE.Box3();

export interface BoxOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  /** per-vertex brightness jitter amount (0..1) */
  jit?: number;
  /** push to the emissive (unlit/glowing) bucket */
  em?: boolean;
  /** register an AABB collider from this geometry */
  collide?: boolean;
}

export interface Glow {
  x: number;
  y: number;
  z: number;
  size: number;
  color: number;
}

/** Paint a flat color (with optional per-vertex jitter) into a `color` attribute. */
export function paint(g: THREE.BufferGeometry, color: number, jit = 0, rng?: () => number): void {
  _c.setHex(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const f = jit > 0 && rng ? 1 + (rng() - 0.5) * jit : 1;
    arr[i * 3] = Math.min(_c.r * f, 1);
    arr[i * 3 + 1] = Math.min(_c.g * f, 1);
    arr[i * 3 + 2] = Math.min(_c.b * f, 1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/**
 * Assembly accumulator for one room (or one prop). Parts push painted,
 * pre-transformed geometry into buckets; `merge()` collapses each bucket
 * into a single BufferGeometry. Also records colliders + lantern glow points.
 *
 * A push/pop "frame" (translation + quarter-turn yaw) lets wall parts be
 * written once and stamped on any face.
 */
export class Kit {
  opaque: THREE.BufferGeometry[] = [];
  emissive: THREE.BufferGeometry[] = [];
  /** packed minX,minY,minZ,maxX,maxY,maxZ */
  colliders: number[] = [];
  glows: Glow[] = [];
  rng: () => number;

  private fx = 0;
  private fy = 0;
  private fz = 0;
  private fq = 0; // quarter yaw turns (0..3)

  constructor(rng: () => number) {
    this.rng = rng;
  }

  begin(x: number, y: number, z: number, quarterYaw = 0): void {
    this.fx = x;
    this.fy = y;
    this.fz = z;
    this.fq = ((quarterYaw % 4) + 4) % 4;
  }

  end(): void {
    this.fx = this.fy = this.fz = 0;
    this.fq = 0;
  }

  /** Rotate a point by the frame's quarter yaw, then translate. */
  private fp(x: number, y: number, z: number): [number, number, number] {
    let rx = x;
    let rz = z;
    switch (this.fq) {
      case 1: rx = z; rz = -x; break;
      case 2: rx = -x; rz = -z; break;
      case 3: rx = -z; rz = x; break;
    }
    return [rx + this.fx, y + this.fy, rz + this.fz];
  }

  box(w: number, h: number, d: number, cx: number, cy: number, cz: number, color: number, o: BoxOpts = {}): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv');
    this.place(g, cx, cy, cz, color, o);
  }

  /** Place any geometry (lathe, sphere, cone...) with the frame + local rotation applied. */
  place(g: THREE.BufferGeometry, cx: number, cy: number, cz: number, color: number, o: BoxOpts = {}): void {
    _m1.identity();
    if (o.rx || o.ry || o.rz) {
      _m1.makeRotationFromEuler(_e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    }
    _m1.setPosition(cx, cy, cz);
    if (this.fq !== 0 || this.fx !== 0 || this.fy !== 0 || this.fz !== 0) {
      _m2.makeRotationY((this.fq * Math.PI) / 2).setPosition(this.fx, this.fy, this.fz);
      _m1.premultiply(_m2);
    }
    g.applyMatrix4(_m1);
    if (!g.getAttribute('color')) paint(g, color, o.jit ?? 0, this.rng);
    this.tagAssembly(g);
    if (o.em) this.emissive.push(g);
    else this.opaque.push(g);
    if (o.collide) {
      g.computeBoundingBox();
      const b = g.boundingBox!;
      this.colliders.push(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z);
    }
  }

  /**
   * Stamp every vertex of a finished part with the part's centroid and its
   * place in the assembly order. Buildings then write themselves into
   * existence from the ground up instead of popping in whole.
   */
  private tagAssembly(g: THREE.BufferGeometry): void {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    const ccx = (b.min.x + b.max.x) * 0.5;
    const ccy = (b.min.y + b.max.y) * 0.5;
    const ccz = (b.min.z + b.max.z) * 0.5;
    // bottom-up, with a little scatter so it never looks like a wipe
    const jitter = ((Math.sin(ccx * 12.9898 + ccz * 78.233) * 43758.5453) % 1 + 1) % 1;
    const order = Math.min(Math.max((ccy + 8) / 17, 0), 1) * 0.72 + jitter * 0.28;
    const n = g.getAttribute('position').count;
    const cent = new Float32Array(n * 3);
    const build = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      cent[i * 3] = ccx;
      cent[i * 3 + 1] = ccy;
      cent[i * 3 + 2] = ccz;
      build[i] = order;
    }
    g.setAttribute('aCent', new THREE.BufferAttribute(cent, 3));
    g.setAttribute('aBuild', new THREE.BufferAttribute(build, 1));
  }

  /** Explicit AABB collider in frame coordinates. */
  collide(cx: number, cy: number, cz: number, hw: number, hh: number, hd: number): void {
    const [ax, ay, az] = this.fp(cx - hw, cy - hh, cz - hd);
    const [bx, by, bz] = this.fp(cx + hw, cy + hh, cz + hd);
    this.colliders.push(
      Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz),
      Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)
    );
  }

  glow(x: number, y: number, z: number, size: number, color: number): void {
    const [gx, gy, gz] = this.fp(x, y, z);
    this.glows.push({ x: gx, y: gy, z: gz, size, color });
  }

  merge(): { opaque: THREE.BufferGeometry | null; emissive: THREE.BufferGeometry | null } {
    const mergeBucket = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
      if (list.length === 0) return null;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      return merged;
    };
    return { opaque: mergeBucket(this.opaque), emissive: mergeBucket(this.emissive) };
  }
}

/**
 * Bake fake global illumination into vertex colors:
 *  - ambient occlusion toward the room shell (corners/edges darken)
 *  - a soft vertical gradient
 *  - warm pooled light around every lantern glow point
 * This is the whole lighting story — no shadow maps, no point lights.
 */
export function bakeShading(g: THREE.BufferGeometry, glows: Glow[], half = 5): void {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const n = pos.count;
  const inv2 = 1 / 2.2;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const sx = 0.6 + 0.4 * Math.min(Math.max((half - Math.abs(x)) * inv2, 0), 1);
    const sy = 0.6 + 0.4 * Math.min(Math.max((half - Math.abs(y)) * inv2, 0), 1);
    const sz = 0.6 + 0.4 * Math.min(Math.max((half - Math.abs(z)) * inv2, 0), 1);
    // AO never crushes to black — darkness lives between districts, not inside
    // buildings, so the floor is lifted well off zero
    const ao = 0.55 + 0.45 * (sx * sy * sz) * (0.84 + 0.16 * ((y + half) / (half * 2)));
    let warm = 0;
    for (let j = 0; j < glows.length; j++) {
      const gl = glows[j];
      const dx = x - gl.x;
      const dy = y - gl.y;
      const dz = z - gl.z;
      const s2 = gl.size * gl.size * 4.2;
      warm += s2 / (s2 + dx * dx + dy * dy + dz * dz);
    }
    warm = Math.min(warm, 1.8);
    const r = col.getX(i) * ao * (1 + warm * 1.9);
    const gg = col.getY(i) * ao * (1 + warm * 1.05);
    const b = col.getZ(i) * ao * (1 + warm * 0.4);
    col.setXYZ(i, Math.min(r, 1), Math.min(gg, 1), Math.min(b, 1));
  }
  col.needsUpdate = true;
}

/** Build a Points object for a room's lantern glows (uses the shared glow material). */
export function buildGlowPoints(glows: Glow[], mat: THREE.ShaderMaterial): THREE.Points | null {
  if (glows.length === 0) return null;
  const n = glows.length;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const gl = glows[i];
    pos[i * 3] = gl.x;
    pos[i * 3 + 1] = gl.y;
    pos[i * 3 + 2] = gl.z;
    size[i] = gl.size;
    _c.setHex(gl.color);
    color[i * 3] = _c.r;
    color[i * 3 + 1] = _c.g;
    color[i * 3 + 2] = _c.b;
    phase[i] = (i * 0.618 + gl.x * 0.31 + gl.z * 0.17) % 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.computeBoundingSphere();
  const pts = new THREE.Points(geo, mat);
  return pts;
}
