import * as THREE from 'three';
import { buildCell, cellKey, CellData } from './roomBuilder';
import { buildLandmark, LandmarkData } from './landmarks';
import { buildFarDistrict, farMat } from './farfield';
import {
  CELL, DCELLS, DSIZE, District, districtAtCoords, districtKey, isOccupied, landmarkOf,
} from './districts';

interface Offset {
  x: number;
  y: number;
  z: number;
  d: number;
}

function sphereOffsets(maxR: number): Offset[] {
  const out: Offset[] = [];
  const r = Math.ceil(maxR);
  for (let x = -r; x <= r; x++) {
    for (let y = -r; y <= r; y++) {
      for (let z = -r; z <= r; z++) {
        const d = Math.sqrt(x * x + y * y + z * z);
        if (d <= maxR) out.push({ x, y, z, d });
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

const CELL_OFFSETS = sphereOffsets(6.5);
const DIST_OFFSETS = sphereOffsets(5.5);

/** A district group: everything inside moves as one rigid body. */
export interface DistrictNode {
  district: District;
  group: THREE.Group;
  cells: Map<string, CellData>;
  landmark: LandmarkData | null;
  far: THREE.Mesh | null;
  /** current world transform of the group */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  invQuat: THREE.Quaternion;
}

/**
 * Streams three layers of the megastructure:
 *   1. cells      — full architecture, small radius
 *   2. landmarks  — monumental structures, medium radius
 *   3. far field  — cheap district proxies, large radius
 * All three hang off per-district groups so a district can rotate or drift as
 * a single coherent body.
 */
export class World {
  seed: number;
  readonly group = new THREE.Group();
  readonly districts = new Map<string, DistrictNode>();

  radiusCells = 4;
  landmarkRadiusD = 2.6;
  farRadiusD = 5.0;
  buildBudgetMs = 3;
  cellsBuilt = 0;
  cellCount = 0;
  farCount = 0;
  landmarkCount = 0;

  private center: [number, number, number] = [NaN, 0, 0];
  private centerD: [number, number, number] = [NaN, 0, 0];
  private queue: [number, number, number][] = [];

  constructor(seed: number) {
    this.seed = seed;
  }

  cellOf(p: THREE.Vector3): [number, number, number] {
    return [Math.round(p.x / CELL), Math.round(p.y / CELL), Math.round(p.z / CELL)];
  }

  private nodeFor(d: District): DistrictNode {
    let node = this.districts.get(d.key);
    if (!node) {
      const group = new THREE.Group();
      group.position.set(d.cx, d.cy, d.cz);
      group.matrixAutoUpdate = true;
      this.group.add(group);
      node = {
        district: d,
        group,
        cells: new Map(),
        landmark: null,
        far: null,
        pos: new THREE.Vector3(d.cx, d.cy, d.cz),
        quat: new THREE.Quaternion(),
        invQuat: new THREE.Quaternion(),
      };
      this.districts.set(d.key, node);
    }
    return node;
  }

  update(playerPos: THREE.Vector3, timeNow: number): void {
    const cc = this.cellOf(playerPos);
    if (cc[0] !== this.center[0] || cc[1] !== this.center[1] || cc[2] !== this.center[2]) {
      this.center = cc;
      this.recenterCells();
    }
    const dc: [number, number, number] = [
      Math.floor(playerPos.x / DSIZE),
      Math.floor(playerPos.y / DSIZE),
      Math.floor(playerPos.z / DSIZE),
    ];
    if (dc[0] !== this.centerD[0] || dc[1] !== this.centerD[1] || dc[2] !== this.centerD[2]) {
      this.centerD = dc;
      this.recenterDistricts();
    }

    // time-sliced cell building
    const t0 = performance.now();
    while (this.queue.length > 0 && performance.now() - t0 < this.buildBudgetMs) {
      const cell = this.queue.shift()!;
      const key = cellKey(cell[0], cell[1], cell[2]);
      const d = districtAtCoords(
        Math.floor(cell[0] / DCELLS), Math.floor(cell[1] / DCELLS), Math.floor(cell[2] / DCELLS), this.seed
      );
      const node = this.districts.get(d.key);
      if (node?.cells.has(key)) continue;
      const dx = cell[0] - this.center[0];
      const dy = cell[1] - this.center[1];
      const dz = cell[2] - this.center[2];
      if (dx * dx + dy * dy + dz * dz > (this.radiusCells + 0.5) ** 2) continue;
      const built = buildCell(cell[0], cell[1], cell[2], this.seed, timeNow);
      if (built) {
        const n = this.nodeFor(built.district);
        n.cells.set(key, built);
        n.group.add(built.root);
        this.cellsBuilt++;
        this.cellCount++;
      }
    }
  }

  private recenterCells(): void {
    const [cx, cy, cz] = this.center;
    this.queue.length = 0;
    for (const o of CELL_OFFSETS) {
      if (o.d > this.radiusCells) break;
      const x = cx + o.x;
      const y = cy + o.y;
      const z = cz + o.z;
      const key = cellKey(x, y, z);
      const d = districtAtCoords(
        Math.floor(x / DCELLS), Math.floor(y / DCELLS), Math.floor(z / DCELLS), this.seed
      );
      if (this.districts.get(d.key)?.cells.has(key)) continue;
      this.queue.push([x, y, z]);
    }
    // evict far cells
    const evictSq = (this.radiusCells + 0.9) ** 2;
    for (const node of this.districts.values()) {
      for (const [key, cell] of node.cells) {
        const dx = cell.cell[0] - cx;
        const dy = cell.cell[1] - cy;
        const dz = cell.cell[2] - cz;
        if (dx * dx + dy * dy + dz * dz > evictSq) {
          node.group.remove(cell.root);
          for (const g of cell.disposables) g.dispose();
          node.cells.delete(key);
          this.cellCount--;
        }
      }
    }
  }

  private recenterDistricts(): void {
    const [dx, dy, dz] = this.centerD;

    for (const o of DIST_OFFSETS) {
      if (o.d > this.farRadiusD) break;
      const d = districtAtCoords(dx + o.x, dy + o.y, dz + o.z, this.seed);
      const node = this.nodeFor(d);

      // landmarks: medium radius
      if (o.d <= this.landmarkRadiusD && !node.landmark && landmarkOf(d) !== 'none') {
        const lm = buildLandmark(d);
        if (lm) {
          node.landmark = lm;
          node.group.add(lm.root);
          this.landmarkCount++;
        }
      }
      // far-field proxy: only outside the cell-streaming shell, so it never
      // pokes through the real architecture
      const cellShellD = (this.radiusCells * CELL) / DSIZE + 0.9;
      if (o.d > cellShellD && !node.far) {
        const built = buildFarDistrict(d, this.seed);
        if (built) {
          const mesh = new THREE.Mesh(built.geo, farMat);
          mesh.matrixAutoUpdate = false;
          node.far = mesh;
          node.group.add(mesh);
          this.farCount++;
        }
      } else if (o.d <= cellShellD && node.far) {
        node.group.remove(node.far);
        (node.far.geometry as THREE.BufferGeometry).dispose();
        node.far = null;
        this.farCount--;
      }
    }

    // evict whole districts beyond the far radius
    const evict = this.farRadiusD + 1.0;
    for (const [key, node] of this.districts) {
      const ddx = node.district.dx - dx;
      const ddy = node.district.dy - dy;
      const ddz = node.district.dz - dz;
      if (Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) > evict) {
        this.disposeNode(node);
        this.districts.delete(key);
      } else if (node.landmark) {
        const dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (dd > this.landmarkRadiusD + 0.8) {
          node.group.remove(node.landmark.root);
          for (const g of node.landmark.disposables) g.dispose();
          node.landmark = null;
          this.landmarkCount--;
        }
      }
    }
  }

  private disposeNode(node: DistrictNode): void {
    for (const cell of node.cells.values()) {
      for (const g of cell.disposables) g.dispose();
      this.cellCount--;
    }
    node.cells.clear();
    if (node.landmark) {
      for (const g of node.landmark.disposables) g.dispose();
      this.landmarkCount--;
    }
    if (node.far) {
      (node.far.geometry as THREE.BufferGeometry).dispose();
      this.farCount--;
    }
    this.group.remove(node.group);
  }

  reseed(seed: number): void {
    for (const node of this.districts.values()) this.disposeNode(node);
    this.districts.clear();
    this.queue.length = 0;
    this.seed = seed;
    this.center = [NaN, 0, 0];
    this.centerD = [NaN, 0, 0];
    this.cellsBuilt = 0;
    this.cellCount = 0;
    this.farCount = 0;
    this.landmarkCount = 0;
  }

  /** Total live cells (for the HUD). */
  get roomsLive(): number {
    return this.cellCount;
  }

  /** Find an empty cell near the origin with architecture to look at. */
  findSpawn(): { pos: THREE.Vector3; yaw: number } {
    for (const o of CELL_OFFSETS) {
      if (isOccupied(o.x, o.y, o.z, this.seed)) continue;
      let neighbours = 0;
      for (const [ax, ay, az] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        if (isOccupied(o.x + ax, o.y + ay, o.z + az, this.seed)) neighbours++;
      }
      if (neighbours === 0) continue;
      // aim along the most open horizontal direction
      let bestYaw = 0;
      let bestScore = -1;
      for (let i = 0; i < 8; i++) {
        const yaw = (i / 8) * Math.PI * 2;
        const sx = Math.round(-Math.sin(yaw));
        const sz = Math.round(-Math.cos(yaw));
        let score = 0;
        for (let step = 1; step <= 4; step++) {
          if (!isOccupied(o.x + sx * step, o.y, o.z + sz * step, this.seed)) score++;
          else break;
        }
        if (score > bestScore) {
          bestScore = score;
          bestYaw = yaw;
        }
      }
      return { pos: new THREE.Vector3(o.x * CELL, o.y * CELL, o.z * CELL), yaw: bestYaw };
    }
    return { pos: new THREE.Vector3(0, CELL, 0), yaw: 0 };
  }
}
