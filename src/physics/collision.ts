import * as THREE from 'three';
import type { World } from '../world/streamer';
import { CELL, DCELLS, DSIZE, districtKey } from '../world/districts';

const _lp = new THREE.Vector3();
const _lv = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Vector3();

/**
 * Sphere vs. cell-collider resolution.
 *
 * Districts are rigidly rotated and drift, so a cell's world position no
 * longer matches its grid coordinate. The broadphase therefore transforms the
 * query point into each nearby district's own frame FIRST, and only then works
 * out which cells to test. (Getting this wrong silently disables collision:
 * lookups miss and the crow sails through walls.)
 *
 * A district is a cube rotated about its own centre, so the district that
 * contains a point is still found by simple division.
 */
export function collideSphere(
  world: World,
  pos: THREE.Vector3,
  vel: THREE.Vector3 | null,
  radius: number
): number {
  let impact = 0;

  // candidate districts: the one containing the point, plus any whose boundary
  // is within a cell of it
  const dx0 = Math.floor((pos.x - CELL) / DSIZE);
  const dx1 = Math.floor((pos.x + CELL) / DSIZE);
  const dy0 = Math.floor((pos.y - CELL) / DSIZE);
  const dy1 = Math.floor((pos.y + CELL) / DSIZE);
  const dz0 = Math.floor((pos.z - CELL) / DSIZE);
  const dz1 = Math.floor((pos.z + CELL) / DSIZE);

  for (let dx = dx0; dx <= dx1; dx++) {
    for (let dy = dy0; dy <= dy1; dy++) {
      for (let dz = dz0; dz <= dz1; dz++) {
        const node = world.districts.get(districtKey(dx, dy, dz));
        if (!node || node.cells.size === 0) continue;

        // into the district's own unrotated frame
        _q.copy(pos).sub(node.pos).applyQuaternion(node.invQuat);
        const baseX = (dx + 0.5) * DCELLS;
        const baseY = (dy + 0.5) * DCELLS;
        const baseZ = (dz + 0.5) * DCELLS;
        const ccx = Math.round(_q.x / CELL + baseX);
        const ccy = Math.round(_q.y / CELL + baseY);
        const ccz = Math.round(_q.z / CELL + baseZ);

        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            for (let oz = -1; oz <= 1; oz++) {
              const room = node.cells.get((ccx + ox) + ',' + (ccy + oy) + ',' + (ccz + oz));
              if (!room || room.colliders.length === 0) continue;

              const s = room.curScale;
              _lp.copy(pos).sub(room.curPos).applyQuaternion(room.invQuat).divideScalar(s);
              if (vel) _lv.copy(vel).applyQuaternion(room.invQuat);
              const r = radius / s;
              const cols = room.colliders;
              let touched = false;

              for (let i = 0; i < cols.length; i += 6) {
                const minX = cols[i], minY = cols[i + 1], minZ = cols[i + 2];
                const maxX = cols[i + 3], maxY = cols[i + 4], maxZ = cols[i + 5];
                _closest.set(
                  Math.max(minX, Math.min(_lp.x, maxX)),
                  Math.max(minY, Math.min(_lp.y, maxY)),
                  Math.max(minZ, Math.min(_lp.z, maxZ))
                );
                const ddx = _lp.x - _closest.x;
                const ddy = _lp.y - _closest.y;
                const ddz = _lp.z - _closest.z;
                const d2 = ddx * ddx + ddy * ddy + ddz * ddz;

                if (d2 > r * r) continue;
                touched = true;

                if (d2 > 1e-10) {
                  // outside the box — push along the separation vector
                  const d = Math.sqrt(d2);
                  _n.set(ddx / d, ddy / d, ddz / d);
                  _lp.addScaledVector(_n, r - d);
                } else {
                  // centre inside the box — exit along the least penetration
                  const px = Math.min(_lp.x - minX, maxX - _lp.x);
                  const py = Math.min(_lp.y - minY, maxY - _lp.y);
                  const pz = Math.min(_lp.z - minZ, maxZ - _lp.z);
                  if (px <= py && px <= pz) {
                    const sgn = _lp.x - minX < maxX - _lp.x ? -1 : 1;
                    _n.set(sgn, 0, 0);
                    _lp.x = sgn < 0 ? minX - r : maxX + r;
                  } else if (py <= pz) {
                    const sgn = _lp.y - minY < maxY - _lp.y ? -1 : 1;
                    _n.set(0, sgn, 0);
                    _lp.y = sgn < 0 ? minY - r : maxY + r;
                  } else {
                    const sgn = _lp.z - minZ < maxZ - _lp.z ? -1 : 1;
                    _n.set(0, 0, sgn);
                    _lp.z = sgn < 0 ? minZ - r : maxZ + r;
                  }
                }

                if (vel) {
                  const into = _lv.dot(_n);
                  if (into < 0) {
                    impact = Math.max(impact, -into);
                    _lv.addScaledVector(_n, -into * 1.12); // slight bounce
                  }
                }
              }

              if (touched) {
                pos.copy(_lp).multiplyScalar(s).applyQuaternion(room.curQuat).add(room.curPos);
                if (vel) vel.copy(_lv).applyQuaternion(room.curQuat);
              }
            }
          }
        }
      }
    }
  }
  return impact;
}

const _esc = new THREE.Vector3();

/**
 * Find a way out when the crow is wedged — either by its own bad flying or
 * because a district slid into it. Picks the nearest genuinely empty cell and
 * returns a unit direction toward its centre.
 */
export function escapeDirection(
  world: World,
  pos: THREE.Vector3,
  isOccupied: (x: number, y: number, z: number, seed: number) => boolean,
  out: THREE.Vector3
): boolean {
  const [cx, cy, cz] = world.cellOf(pos);
  let bestD = Infinity;
  let found = false;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const x = cx + dx, y = cy + dy, z = cz + dz;
        if (isOccupied(x, y, z, world.seed)) continue;
        _esc.set(x * CELL - pos.x, y * CELL - pos.y, z * CELL - pos.z);
        const d = _esc.lengthSq();
        if (d < bestD) {
          bestD = d;
          out.copy(_esc);
          found = true;
        }
      }
    }
  }
  if (found) out.normalize();
  return found;
}
