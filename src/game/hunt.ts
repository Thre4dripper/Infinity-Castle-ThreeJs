import * as THREE from 'three';
import { CELL, isOccupied } from '../world/districts';
import { hash3 } from '../core/rng';
import { fxUniforms } from '../kit/materials';

// ---------------------------------------------------------------------------
// THE HUNT — the optional scoring layer over the free descent.
//
// Spirit wisps are hashed into empty cells that TOUCH architecture, so the
// prize is always where flying is dangerous: down streets, through interiors,
// along facades — never out in open air. Chaining pickups builds a combo that
// decays in seconds; grazing walls at speed feeds the score; every 100 m of
// new depth pays a milestone. Deterministic per seed, zero servers.
// ---------------------------------------------------------------------------

const WISP_SALT = 0x5157;
const RADIUS = 5;            // cells scanned around the player
const CHANCE = 6;            // % of eligible cells that hold a wisp
const COLLECT_R = 3.2;       // pickup distance (m)
const COMBO_WINDOW = 4.5;    // seconds before the chain breaks
const MAX_COMBO = 9;

const _c = new THREE.Vector3();

/** Deterministic: does this cell hold a wisp? Empty cell touching structure. */
function wispAt(cx: number, cy: number, cz: number, seed: number): boolean {
  if (hash3(cx, cy, cz, seed ^ WISP_SALT) % 100 >= CHANCE) return false;
  if (isOccupied(cx, cy, cz, seed)) return false;
  return (
    isOccupied(cx + 1, cy, cz, seed) || isOccupied(cx - 1, cy, cz, seed) ||
    isOccupied(cx, cy + 1, cz, seed) || isOccupied(cx, cy - 1, cz, seed) ||
    isOccupied(cx, cy, cz + 1, seed) || isOccupied(cx, cy, cz - 1, seed)
  );
}

/** A wisp's resting point inside its cell — jittered off-centre. */
function wispPos(cx: number, cy: number, cz: number, seed: number, out: THREE.Vector3): THREE.Vector3 {
  const h = hash3(cx, cy, cz, seed ^ 0x77e1);
  return out.set(
    cx * CELL + (((h & 255) / 255) - 0.5) * 6,
    cy * CELL + ((((h >> 8) & 255) / 255) - 0.5) * 5,
    cz * CELL + ((((h >> 16) & 255) / 255) - 0.5) * 6
  );
}

const CAP = 1024;

export class Hunt {
  readonly points: THREE.Points;
  active = false;

  score = 0;
  best = 0;
  combo = 1;
  bestCombo = 1;
  wisps = 0;
  /** metres of NEW depth conquered below the spawn */
  maxDepth = 0;

  private comboTimer = 0;
  private startY = 0;
  private paidDepth = 0;
  private seed = 0;
  private seedStr = '';
  private collected = new Set<string>();
  private lastCell = 'x';
  private liveKeys: string[] = [];
  private livePos: Float32Array = new Float32Array(CAP * 3);
  private liveCount = 0;
  private geo: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private phaseAttr: THREE.BufferAttribute;
  /** fired on every pickup (combo step) and depth milestone */
  onScore: ((kind: 'wisp' | 'depth', combo: number) => void) | null = null;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(CAP * 3), 3)
      .setUsage(THREE.DynamicDrawUsage);
    this.phaseAttr = new THREE.BufferAttribute(new Float32Array(CAP), 1)
      .setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('aPhase', this.phaseAttr);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: fxUniforms.uTime, uEncode: fxUniforms.uEncode, uPx: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime, uPx;
        varying float vP;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = max(length(mv.xyz), 0.001);
          float breathe = 0.8 + 0.2 * sin(uTime * 2.1 + aPhase * 39.0);
          vP = breathe;
          gl_PointSize = min(26.0 * uPx * breathe * (250.0 / d), 64.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vP;
        uniform float uEncode;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c) * 2.0;
          float core = pow(max(1.0 - r, 0.0), 3.2);
          float halo = pow(max(1.0 - r, 0.0), 1.3) * 0.35;
          float a = (core + halo) * vP;
          if (a < 0.01) discard;
          // spirit jade with a white-hot heart
          vec3 col = mix(vec3(0.35, 0.95, 0.62), vec3(0.9, 1.0, 0.95), core);
          if (uEncode < 0.5) col = pow(col, vec3(2.2));
          gl_FragColor = vec4(col * a, a);
        }
      `,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.geo.setDrawRange(0, 0);
  }

  setPixelRatio(pr: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uPx.value = pr;
  }

  /** Arm the hunt for a seed (called on begin and on reseed while hunting). */
  start(seed: number, seedStr: string, spawnY: number): void {
    this.active = true;
    this.points.visible = true;
    this.seed = seed;
    this.seedStr = seedStr;
    this.collected.clear();
    this.score = 0;
    this.combo = 1;
    this.bestCombo = 1;
    this.wisps = 0;
    this.maxDepth = 0;
    this.paidDepth = 0;
    this.startY = spawnY;
    this.lastCell = 'x';
    this.best = Number(localStorage.getItem('ic_best_' + seedStr) ?? 0);
  }

  stop(): void {
    this.active = false;
    this.points.visible = false;
  }

  /** Per-frame: refresh the field, collect, decay the combo, pay depth. */
  update(dt: number, pos: THREE.Vector3, speed: number, grazing: boolean): void {
    if (!this.active) return;

    // combo decay
    if (this.combo > 1) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }

    // grazing architecture at speed — the SSX rule: danger pays
    if (grazing && speed > 18) {
      this.score += dt * 30 * (speed / 26) * this.combo;
    }

    // depth milestones: every 100 m of NEW depth
    const depth = Math.max(0, this.startY - pos.y);
    if (depth > this.maxDepth) this.maxDepth = depth;
    while (this.maxDepth - this.paidDepth >= 100) {
      this.paidDepth += 100;
      this.score += 200;
      this.onScore?.('depth', this.combo);
    }

    // rebuild the local wisp field when the player crosses a cell
    const cx = Math.round(pos.x / CELL);
    const cy = Math.round(pos.y / CELL);
    const cz = Math.round(pos.z / CELL);
    const cellKey = cx + '_' + cy + '_' + cz;
    if (cellKey !== this.lastCell) {
      this.lastCell = cellKey;
      this.rebuild(cx, cy, cz);
    }

    // collection
    const r2 = COLLECT_R * COLLECT_R;
    for (let i = 0; i < this.liveCount; i++) {
      const o = i * 3;
      const dx = this.livePos[o] - pos.x;
      const dy = this.livePos[o + 1] - pos.y;
      const dz = this.livePos[o + 2] - pos.z;
      if (dx * dx + dy * dy + dz * dz < r2) {
        this.collected.add(this.liveKeys[i]);
        this.wisps++;
        this.score += 50 * this.combo;
        this.combo = Math.min(this.combo + 1, MAX_COMBO);
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.comboTimer = COMBO_WINDOW;
        this.onScore?.('wisp', this.combo);
        // remove it from the live buffer immediately
        this.rebuildFromCell();
        break;
      }
    }

    if (this.score > this.best) {
      this.best = Math.floor(this.score);
      localStorage.setItem('ic_best_' + this.seedStr, String(this.best));
    }
  }

  /** seconds left on the chain, 0..1 for the HUD bar */
  get comboFraction(): number {
    return this.combo > 1 ? Math.max(this.comboTimer / COMBO_WINDOW, 0) : 0;
  }

  shareText(): string {
    return `無限城 Infinity Castle · seed ${this.seedStr}\n`
      + `score ${Math.floor(this.score).toLocaleString()} · ${this.wisps} wisps 🏮 · `
      + `×${this.bestCombo} best chain · ${Math.floor(this.maxDepth)} m deep\n`
      + `${location.href}`;
  }

  private lastCenter: [number, number, number] = [0, 0, 0];

  private rebuildFromCell(): void {
    this.rebuild(this.lastCenter[0], this.lastCenter[1], this.lastCenter[2]);
  }

  private rebuild(cx: number, cy: number, cz: number): void {
    this.lastCenter = [cx, cy, cz];
    let n = 0;
    this.liveKeys.length = 0;
    const pa = this.posAttr.array as Float32Array;
    const ph = this.phaseAttr.array as Float32Array;
    for (let x = cx - RADIUS; x <= cx + RADIUS; x++) {
      for (let y = cy - RADIUS; y <= cy + RADIUS; y++) {
        for (let z = cz - RADIUS; z <= cz + RADIUS; z++) {
          if (n >= CAP) break;
          if (!wispAt(x, y, z, this.seed)) continue;
          const key = x + '_' + y + '_' + z;
          if (this.collected.has(key)) continue;
          wispPos(x, y, z, this.seed, _c);
          const o = n * 3;
          pa[o] = _c.x; pa[o + 1] = _c.y; pa[o + 2] = _c.z;
          this.livePos[o] = _c.x; this.livePos[o + 1] = _c.y; this.livePos[o + 2] = _c.z;
          ph[n] = (hash3(x, y, z, this.seed ^ 0x9a1) & 1023) / 1023;
          this.liveKeys.push(key);
          n++;
        }
      }
    }
    this.liveCount = n;
    this.posAttr.needsUpdate = true;
    this.phaseAttr.needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }
}
