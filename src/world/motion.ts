import * as THREE from 'three';
import { World, DistrictNode } from './streamer';
import { hash3 } from '../core/rng';
import { glowUniforms } from '../kit/materials';

interface Wave {
  id: number;
  origin: THREE.Vector3;
  start: number;
  speed: number;
  dur: number;
  dir: THREE.Vector3;
  amp: number;
  arrival: number;
  arrivalFired: boolean;
}

const WAVE_AXES = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _tmp = new THREE.Quaternion();
const _scratch = new THREE.Vector3();

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * The castle's puppeteer. Motion happens at ARCHITECTURAL scale — whole
 * districts turn, drift and breathe as rigid bodies, so buildings never shear
 * apart. On top of that, periodic biwa beats send reconfiguration waves that
 * displace entire districts, and a handful tumble outright.
 *
 * Cell world transforms are recomposed from their district each frame, so
 * collision (which reads curPos/curQuat) simply works while everything moves.
 */
export class Choreographer {
  intensity = 0.85;
  waveCount = 0;
  onBeat: ((delay: number, strength: number) => void) | null = null;
  onFrontPass: (() => void) | null = null;

  private waves: Wave[] = [];
  private nextWaveAt = 8;
  private pulse = 0;
  private now = 0;

  update(t: number, dt: number, world: World, playerPos: THREE.Vector3, rng: () => number): void {
    this.now = t;
    if (this.intensity > 0.03 && t >= this.nextWaveAt) {
      this.spawnWave(t, playerPos, rng);
    }

    this.pulse *= Math.exp(-dt * 2.2);
    for (const w of this.waves) {
      if (!w.arrivalFired && t >= w.arrival) {
        w.arrivalFired = true;
        this.pulse = Math.min(this.pulse + 0.9, 1.2);
        this.onFrontPass?.();
      }
    }
    glowUniforms.uPulse.value = this.pulse;
    glowUniforms.uTime.value = t;

    const inten = this.intensity;
    for (const node of world.districts.values()) {
      this.updateDistrict(node, t, inten);
    }

    this.waves = this.waves.filter((w) => t - w.start < w.dur + 900 / w.speed);
  }

  private updateDistrict(node: DistrictNode, t: number, inten: number): void {
    const d = node.district;
    _off.set(0, 0, 0);
    _q.identity();

    // ---- continuous architectural motion ----
    switch (d.def.motion) {
      case 'rotate':
        // the whole district turns so slowly you doubt it is moving at all
        _axis.set(d.spinAxis === 0 ? 1 : 0, d.spinAxis === 1 ? 1 : 0, d.spinAxis === 2 ? 1 : 0);
        _tmp.setFromAxisAngle(_axis, t * d.spinRate * inten);
        _q.multiply(_tmp);
        break;
      case 'drift':
        _off.set(
          Math.sin(t * d.driftFreq + d.phase) * d.driftAmp,
          Math.sin(t * d.driftFreq * 0.73 + d.phase * 1.7) * d.driftAmp * 0.7,
          Math.cos(t * d.driftFreq * 0.61 + d.phase) * d.driftAmp
        ).multiplyScalar(inten);
        break;
      case 'breathe':
        _off.y = Math.sin(t * d.driftFreq * 0.8 + d.phase) * d.driftAmp * inten;
        _axis.set(0, 1, 0);
        _tmp.setFromAxisAngle(_axis, Math.sin(t * 0.05 + d.phase) * 0.04 * inten);
        _q.multiply(_tmp);
        break;
    }

    // ---- reconfiguration waves displace whole districts ----
    for (const w of this.waves) {
      const dx = d.cx - w.origin.x;
      const dy = d.cy - w.origin.y;
      const dz = d.cz - w.origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lt = t - w.start - dist / w.speed;
      if (lt <= 0 || lt >= w.dur) continue;
      const u = lt / w.dur;
      const p = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);
      const falloff = Math.exp(-dist / 260);
      _off.addScaledVector(w.dir, w.amp * p * falloff * inten);
      // rare: a whole district rolls over as the wave passes
      const th = hash3(d.dx ^ w.id, d.dy + w.id, d.dz - w.id, w.id * 7919);
      if ((th & 1023) < 90) {
        const pick = th % 3;
        _axis.set(pick === 0 ? 1 : 0, pick === 1 ? 1 : 0, pick === 2 ? 1 : 0);
        _tmp.setFromAxisAngle(_axis, Math.PI * 2 * easeInOutCubic(u) * inten);
        _q.multiply(_tmp);
      }
    }

    node.pos.set(d.cx + _off.x, d.cy + _off.y, d.cz + _off.z);
    node.quat.copy(_q);
    node.invQuat.copy(_q).invert();
    node.group.position.copy(node.pos);
    node.group.quaternion.copy(_q);
    node.group.updateMatrixWorld();

    // ---- push the composed world transform down to each cell ----
    for (const cell of node.cells.values()) {
      _scratch.copy(cell.localPos).applyQuaternion(_q).add(node.pos);
      cell.curPos.copy(_scratch);
      cell.curQuat.copy(_q);
      cell.invQuat.copy(node.invQuat);
      cell.curScale = 1;
    }
  }

  private spawnWave(t: number, playerPos: THREE.Vector3, rng: () => number): void {
    const dir = WAVE_AXES[Math.floor(rng() * 6)].clone();
    if (rng() < 0.35) {
      dir.add(WAVE_AXES[Math.floor(rng() * 6)].clone().multiplyScalar(0.5)).normalize();
    }
    const origin = playerPos.clone().add(
      new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(40 + rng() * 140)
    );
    // geological, not mechanical: the front crawls and the shift takes
    // the better part of a minute to complete
    const speed = 14 + rng() * 16;
    const wave: Wave = {
      id: ++this.waveCount,
      origin,
      start: t,
      speed,
      dur: 16 + rng() * 14,
      dir,
      amp: 14 + rng() * 22,
      arrival: t + origin.distanceTo(playerPos) / speed,
      arrivalFired: false,
    };
    this.waves.push(wave);
    this.nextWaveAt = t + (42 + rng() * 38) / Math.max(this.intensity, 0.35);
    this.onBeat?.(wave.arrival - t, Math.min(wave.amp / 26, 1));
  }
}
