import * as THREE from 'three';
import { hash3, rngFor } from '../core/rng';
import { Kit, bakeShading, buildGlowPoints } from '../kit/geoUtils';
import { opaqueMat, emissiveMat, glowMat, bindAssembly, C } from '../kit/materials';
import { pickArchetype, buildRoofCap, Open } from './archetypes';
import { floorPlanks, railing, lanternHang, lanternString, wallLattice, stairs } from '../kit/parts';
import {
  CELL, District, districtAtCell, isOccupied, faceOpen, connectorAt, isRoofCell, isBaseCell,
} from './districts';

export { CELL } from './districts';

const SALT_ROOM = 0x521a9;
const SALT_ORIENT = 0x77e1;

// ---------------------------------------------------------------------------
// Orientation. All 24 axis-aligned rotations exist, but a district shares one
// base orientation and only a minority of its cells break it — so the mass
// stays coherent while still folding into impossible geometry.
// ---------------------------------------------------------------------------
const AXES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

const ORIENTATIONS: THREE.Quaternion[] = [];
{
  const up = new THREE.Vector3(0, 1, 0);
  for (let u = 0; u < 6; u++) {
    const align = new THREE.Quaternion().setFromUnitVectors(up, AXES[u]);
    for (let s = 0; s < 4; s++) {
      const spin = new THREE.Quaternion().setFromAxisAngle(AXES[u], (s * Math.PI) / 2);
      ORIENTATIONS.push(spin.multiply(align.clone()));
    }
  }
}
/** upright yaws only — the coherent majority */
const UPRIGHT = [8, 9, 10, 11];

function faceIndexOf(v: THREE.Vector3): number {
  let best = 0;
  let bestDot = -2;
  for (let i = 0; i < 6; i++) {
    const d = v.dot(AXES[i]);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  }
  return best;
}

export interface CellData {
  cell: [number, number, number];
  key: string;
  root: THREE.Group;
  archetype: string;
  /** packed cell-local AABBs: minX,minY,minZ,maxX,maxY,maxZ */
  colliders: Float32Array;
  /** position relative to the district origin */
  localPos: THREE.Vector3;
  district: District;
  spawnTime: number;
  /** shared with the shader: t0 = assembly start, t1 = dissolve start */
  times: { t0: number; t1: number };
  triCount: number;
  // world transform written by the choreographer, read by collision:
  curPos: THREE.Vector3;
  curQuat: THREE.Quaternion;
  invQuat: THREE.Quaternion;
  curScale: number;
  disposables: THREE.BufferGeometry[];
}

export function cellKey(x: number, y: number, z: number): string {
  return x + ',' + y + ',' + z;
}

const _dir = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _v = new THREE.Vector3();

// ---------------------------------------------------------------------------
// CONNECTORS — the glue. Always span the full cell so they run off into
// unloaded space rather than terminating in mid-air.
// ---------------------------------------------------------------------------

/** axis: 0=+X 1=+Y 2=+Z. Built in cell space (never rotated with the room). */
function buildConnector(k: Kit, axis: 0 | 1 | 2, kind: 1 | 2, rng: () => number): void {
  const half = CELL * 0.62; // overshoot past the cell edge, into the neighbour
  const off = CELL / 2;

  if (axis === 1) {
    // vertical: a stair/ladder shaft climbing out of the ceiling
    const w = 2.6;
    const y0 = 0;
    const y1 = CELL;
    if (kind === 1) {
      for (const s of [-1, 1]) {
        k.box(0.26, y1 - y0, w, s * (w / 2), (y0 + y1) / 2 + off - CELL / 2, 0, C.WOOD_D, { jit: 0.12, collide: true });
      }
      k.begin(0, off, 0, 0);
      stairs(k, { x: 0, y: -CELL / 2, z: -3.0, rise: CELL * 0.55, run: 6.0, w: 2.2 });
      k.end();
    }
    for (let i = 0; i < 3; i++) {
      lanternHang(k, 0, off - CELL / 2 + 1 + i * 4, 0, 0.4, 0.75);
    }
    return;
  }

  const q = axis === 0 ? 1 : 0; // frame rotation so +Z of the frame is the run
  k.begin(0, 0, 0, q);

  if (kind === 1) {
    // enclosed corridor
    const w = 2.9;
    const h = 3.4;
    const yb = -1.9;
    k.box(w + 0.5, 0.34, half * 2, 0, yb - 0.17, off, C.WOOD_D, { jit: 0.12, collide: true });
    floorPlanks(k, w, half * 2 - 0.2, yb, false);
    k.box(w + 0.7, 0.3, half * 2, 0, yb + h, off, C.TRIM_DARK, { jit: 0.1, collide: true });
    for (const s of [-1, 1]) {
      k.begin(s * (w / 2 + 0.1), 0, off, q + (s > 0 ? 1 : 3));
      wallLattice(k, half * 2 - 0.2, yb, yb + h);
      k.end();
      k.begin(0, 0, 0, q);
    }
    for (let i = 0; i < 3; i++) {
      lanternHang(k, 0, yb + h - 0.12, off - half + 1.2 + i * (half * 0.9), 0.4, 0.8);
    }
  } else {
    // open bridge
    const w = 2.4;
    const yb = -2.4 + rng() * 1.6;
    k.box(w + 0.4, 0.28, half * 2, 0, yb - 0.14, off, C.WOOD_D, { jit: 0.12, collide: true });
    floorPlanks(k, w, half * 2 - 0.2, yb, false);
    railing(k, -w / 2, yb, off, half * 2 - 0.3, false);
    railing(k, w / 2, yb, off, half * 2 - 0.3, false);
    // under-truss
    for (const s of [-1, 1]) {
      k.box(0.2, 0.2, half * 1.3, s * (w / 2 - 0.2), yb - 1.1, off, C.WOOD_D, { rx: s * 0.28, jit: 0.1 });
    }
    lanternString(k, -w / 2, yb + 2.4, off - half * 0.5, w / 2, yb + 2.4, off + half * 0.5, 3);
  }
  k.end();
}

// ---------------------------------------------------------------------------

export function buildCell(
  cx: number, cy: number, cz: number, seed: number, timeNow: number
): CellData | null {
  const district = districtAtCell(cx, cy, cz, seed);
  const occupied = isOccupied(cx, cy, cz, seed);

  const conns: [0 | 1 | 2, 1 | 2][] = [];
  for (const axis of [0, 1, 2] as const) {
    const c = connectorAt(cx, cy, cz, axis, seed);
    if (c !== 0) conns.push([axis, c]);
  }
  if (!occupied && conns.length === 0) return null;

  const rng = rngFor(cx, cy, cz, seed, SALT_ROOM);

  // ---- orientation: district-coherent, occasionally broken ----
  const oh = hash3(cx, cy, cz, seed ^ SALT_ORIENT);
  let q: THREE.Quaternion;
  if ((oh / 4294967296) < district.def.flip) {
    q = ORIENTATIONS[oh % ORIENTATIONS.length];
  } else {
    q = ORIENTATIONS[UPRIGHT[(district.quarter + (oh & 1)) % 4]];
  }

  const k = new Kit(rng);
  let archetypeName = 'connector';

  if (occupied) {
    // world-face openness → local-face openness through the inverse rotation
    const worldOpen: boolean[] = [];
    for (let f = 0; f < 6; f++) worldOpen.push(faceOpen(cx, cy, cz, f, seed));
    const localOpen: Open = new Array(6).fill(false);
    for (let f = 0; f < 6; f++) {
      _dir.copy(AXES[f]).applyQuaternion(q);
      localOpen[f] = worldOpen[faceIndexOf(_dir)];
    }
    const arch = pickArchetype(rng, localOpen, district.def.pool);
    archetypeName = arch.name;
    arch.build(k, rng, localOpen);
  }

  // ---- bake the orientation into the vertices ----
  // Every orientation is axis-aligned, so AABB colliders stay exact AABBs and
  // the whole cell can remain a single un-nested mesh.
  const roomGeos = [...k.opaque, ...k.emissive];
  if (roomGeos.length > 0 && !q.equals(new THREE.Quaternion())) {
    _mat.makeRotationFromQuaternion(q);
    for (const g of roomGeos) {
      g.applyMatrix4(_mat);
      // applyMatrix4 only touches position/normal — rotate the assembly
      // centroids too or parts fly in from the wrong direction
      const cent = g.getAttribute('aCent') as THREE.BufferAttribute | undefined;
      if (cent) {
        for (let i = 0; i < cent.count; i++) {
          _v.set(cent.getX(i), cent.getY(i), cent.getZ(i)).applyQuaternion(q);
          cent.setXYZ(i, _v.x, _v.y, _v.z);
        }
        cent.needsUpdate = true;
      }
    }
    for (const gl of k.glows) {
      _v.set(gl.x, gl.y, gl.z).applyQuaternion(q);
      gl.x = _v.x; gl.y = _v.y; gl.z = _v.z;
    }
    const cols = k.colliders;
    for (let i = 0; i < cols.length; i += 6) {
      _v.set(cols[i], cols[i + 1], cols[i + 2]).applyQuaternion(q);
      const ax = _v.x, ay = _v.y, az = _v.z;
      _v.set(cols[i + 3], cols[i + 4], cols[i + 5]).applyQuaternion(q);
      cols[i] = Math.min(ax, _v.x); cols[i + 1] = Math.min(ay, _v.y); cols[i + 2] = Math.min(az, _v.z);
      cols[i + 3] = Math.max(ax, _v.x); cols[i + 4] = Math.max(ay, _v.y); cols[i + 5] = Math.max(az, _v.z);
    }
  }

  // ---- connectors are built AFTER baking, in true cell space ----
  for (const [axis, kind] of conns) buildConnector(k, axis, kind, rng);

  // ---- crown the building: roofs and undercrofts are always world-aligned ----
  if (occupied && isRoofCell(cx, cy, cz, seed)) {
    buildRoofCap(k, rng);
  }
  if (occupied && isBaseCell(cx, cy, cz, seed)) {
    // underbelly: joists and hanging lanterns so buildings never look sawn off
    for (let i = -1; i <= 1; i++) {
      k.box(11.0, 0.4, 0.5, 0, -5.9, i * 3.6, C.WOOD_D, { jit: 0.15 });
      k.box(0.5, 0.4, 11.0, i * 3.6, -6.25, 0, C.WOOD_D, { jit: 0.15 });
    }
    k.box(9.0, 0.5, 9.0, 0, -6.6, 0, C.TRIM_DARK, { jit: 0.12 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.box(0.5, 1.8, 0.5, sx * 4.2, -7.2, sz * 4.2, C.WOOD_D, { rz: sx * 0.16, rx: -sz * 0.16, jit: 0.15 });
    }
    if (rng() < 0.6) lanternHang(k, 0, -6.9, 0, 0.9 + rng(), 1.0);
  }

  const glows = k.glows;
  const { opaque, emissive } = k.merge();
  const root = new THREE.Group();
  const disposables: THREE.BufferGeometry[] = [];
  let triCount = 0;
  // assembly window shared by this cell's meshes; despawn starts at Infinity
  const times = { t0: timeNow, t1: Infinity };

  if (opaque) {
    bakeShading(opaque, glows, 6.4);
    opaque.computeBoundingSphere();
    const m = new THREE.Mesh(opaque, opaqueMat);
    m.matrixAutoUpdate = false;
    bindAssembly(m, times);
    root.add(m);
    disposables.push(opaque);
    triCount += (opaque.index ? opaque.index.count : opaque.getAttribute('position').count) / 3;
  }
  if (emissive) {
    emissive.computeBoundingSphere();
    const m = new THREE.Mesh(emissive, emissiveMat);
    m.matrixAutoUpdate = false;
    bindAssembly(m, times);
    root.add(m);
    disposables.push(emissive);
    triCount += (emissive.index ? emissive.index.count : emissive.getAttribute('position').count) / 3;
  }
  const pts = buildGlowPoints(glows, glowMat);
  if (pts) {
    pts.matrixAutoUpdate = false;
    root.add(pts);
    disposables.push(pts.geometry as THREE.BufferGeometry);
  }
  if (root.children.length === 0) return null;

  const localPos = new THREE.Vector3(
    cx * CELL - district.cx,
    cy * CELL - district.cy,
    cz * CELL - district.cz
  );
  root.position.copy(localPos);

  return {
    cell: [cx, cy, cz],
    key: cellKey(cx, cy, cz),
    root,
    archetype: archetypeName,
    colliders: new Float32Array(k.colliders),
    localPos,
    district,
    spawnTime: timeNow,
    times,
    triCount,
    curPos: new THREE.Vector3(cx * CELL, cy * CELL, cz * CELL),
    curQuat: new THREE.Quaternion(),
    invQuat: new THREE.Quaternion(),
    curScale: 1,
    disposables,
  };
}
