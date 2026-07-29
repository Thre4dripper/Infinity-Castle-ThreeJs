import * as THREE from 'three';
import { buildCell, cellKey, CellData } from './roomBuilder';
import { buildLandmark, LandmarkData } from './landmarks';
import { buildFarDistrict, farMat } from './farfield';
import { fxUniforms } from '../kit/materials';
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
  /** where the crow is heading — cells ahead are built first */
  readonly heading = new THREE.Vector3(0, 0, -1);
  /** cells mid-dissolve: kept alive until their unbuild animation finishes */
  private dying: { cell: CellData; node: DistrictNode; until: number }[] = [];
  /** far proxies mid-retract: removed once their blocks have receded */
  private dyingFar: { mesh: THREE.Mesh; node: DistrictNode; until: number }[] = [];

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
    this.now = timeNow;
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
        // the moment real architecture starts growing in a district, its far
        // proxy hands over — dissolving into the haze as the buildings rise
        if (n.far) this.retractFar(n);
        this.cellsBuilt++;
        this.cellCount++;
      }
    }

    // retire cells whose dissolve has finished
    for (let i = this.dying.length - 1; i >= 0; i--) {
      if (timeNow >= this.dying[i].until) {
        const { cell, node } = this.dying[i];
        node.group.remove(cell.root);
        for (const g of cell.disposables) g.dispose();
        this.dying.splice(i, 1);
        this.cellCount--;
      }
    }
    // retire far proxies whose retraction has finished
    for (let i = this.dyingFar.length - 1; i >= 0; i--) {
      if (timeNow >= this.dyingFar[i].until) {
        const { mesh, node } = this.dyingFar[i];
        node.group.remove(mesh);
        mesh.geometry.dispose();
        this.dyingFar.splice(i, 1);
      }
    }
  }

  private recenterCells(): void {
    const [cx, cy, cz] = this.center;
    this.queue.length = 0;
    const scored: { c: [number, number, number]; s: number }[] = [];
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
      // Cells the crow is flying TOWARD are built first, so the world always
      // thickens ahead of you rather than popping in at the edges.
      const ahead = o.d < 0.001 ? 1 : (o.x * this.heading.x + o.y * this.heading.y + o.z * this.heading.z) / o.d;
      scored.push({ c: [x, y, z], s: o.d - ahead * 2.2 });
    }
    scored.sort((a, b) => a.s - b.s);
    for (const it of scored) this.queue.push(it.c);
    // evict far cells — they unbuild themselves before being released
    const evictSq = (this.radiusCells + 0.9) ** 2;
    for (const node of this.districts.values()) {
      for (const [key, cell] of node.cells) {
        const dx = cell.cell[0] - cx;
        const dy = cell.cell[1] - cy;
        const dz = cell.cell[2] - cz;
        if (dx * dx + dy * dy + dz * dz > evictSq) {
          cell.times.t1 = this.now;
          this.dying.push({ cell, node, until: this.now + 1.6 });
          node.cells.delete(key);
        }
      }
    }
  }

  /** Latest frame time, used to schedule dissolves. */
  now = 0;

  /** Per-mesh assembly window on the shared far material (onBeforeRender trick). */
  private bindFar(mesh: THREE.Mesh, node: DistrictNode,
    times: { t0: number; t1: number; dir: number }): void {
    mesh.userData.times = times;
    mesh.onBeforeRender = () => {
      const u = farMat.uniforms;
      u.uT0.value = times.t0;
      u.uT1.value = times.t1;
      u.uDir.value = times.dir;
      // blocks recede away from the player, in the district's own frame
      (u.uOrigin.value as THREE.Vector3)
        .copy(fxUniforms.uBuildOrigin.value as THREE.Vector3).sub(node.pos);
      farMat.uniformsNeedUpdate = true;
    };
  }

  /** Begin the block-by-block retraction of a district's far proxy. */
  private retractFar(node: DistrictNode): void {
    const mesh = node.far!;
    const times = mesh.userData.times as { t0: number; t1: number; dir: number };
    times.t0 = this.now;
    times.t1 = this.now + 1.5;
    times.dir = -1;
    this.dyingFar.push({ mesh, node, until: this.now + 1.6 });
    node.far = null;
    this.farCount--;
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
      // far-field proxy: created outside the cell-streaming shell, but NOT
      // torn down by distance alone — a proxy holds its ground until the real
      // generator actually reaches its district (see the build loop), so
      // buildings never vanish with nothing to replace them
      const cellShellD = (this.radiusCells * CELL) / DSIZE + 0.9;
      if (o.d > cellShellD && !node.far && node.cells.size === 0) {
        const built = buildFarDistrict(d, this.seed);
        if (built) {
          const mesh = new THREE.Mesh(built.geo, farMat);
          mesh.matrixAutoUpdate = false;
          this.bindFar(mesh, node, { t0: this.now, t1: this.now + 1.3, dir: 1 });
          node.far = mesh;
          node.group.add(mesh);
          this.farCount++;
        }
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
    for (let i = this.dying.length - 1; i >= 0; i--) {
      if (this.dying[i].node === node) {
        for (const g of this.dying[i].cell.disposables) g.dispose();
        this.dying.splice(i, 1);
        this.cellCount--;
      }
    }
    for (let i = this.dyingFar.length - 1; i >= 0; i--) {
      if (this.dyingFar[i].node === node) {
        this.dyingFar[i].mesh.geometry.dispose();
        this.dyingFar.splice(i, 1);
      }
    }
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
    for (const d of this.dying) {
      d.node.group.remove(d.cell.root);
      for (const g of d.cell.disposables) g.dispose();
    }
    this.dying.length = 0;
    for (const f of this.dyingFar) {
      f.node.group.remove(f.mesh);
      f.mesh.geometry.dispose();
    }
    this.dyingFar.length = 0;
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
