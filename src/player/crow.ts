import * as THREE from 'three';
import { crowMat } from '../kit/materials';

function geoBox(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  m.setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // tiny local merge (all BoxGeometry/Sphere/Cone share attribute layout)
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.getAttribute('position').count;
    iCount += g.index!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx = new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(n.array as Float32Array, vo * 3);
    const gi = g.index!;
    for (let i = 0; i < gi.count; i++) idx[io + i] = gi.getX(i) + vo;
    vo += p.count;
    io += gi.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * Procedural crow. Hierarchical wings (shoulder → elbow), fanned tail —
 * no skinning, just transform animation. Faces -Z.
 */
export class Crow {
  readonly root = new THREE.Group();
  private meshRoot = new THREE.Group();
  private shoulderL = new THREE.Group();
  private shoulderR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private tail = new THREE.Group();
  private flapPhase = 0;
  private flareT = 0;

  constructor() {
    // --- body ---
    const bodyGeos: THREE.BufferGeometry[] = [];
    const torso = new THREE.SphereGeometry(0.3, 10, 8);
    torso.deleteAttribute('uv');
    torso.applyMatrix4(new THREE.Matrix4().makeScale(0.72, 0.66, 1.35));
    torso.applyMatrix4(new THREE.Matrix4().makeRotationX(0.08));
    bodyGeos.push(torso);
    const head = new THREE.SphereGeometry(0.155, 9, 7);
    head.deleteAttribute('uv');
    head.applyMatrix4(new THREE.Matrix4().makeScale(0.85, 0.9, 1.1).setPosition(0, 0.12, -0.36));
    bodyGeos.push(head);
    const beak = new THREE.ConeGeometry(0.05, 0.26, 6);
    beak.deleteAttribute('uv');
    beak.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.09, -0.56));
    bodyGeos.push(beak);
    const body = new THREE.Mesh(mergeAll(bodyGeos), crowMat);
    this.meshRoot.add(body);

    // --- tail fan ---
    const tailGeos: THREE.BufferGeometry[] = [];
    for (let i = -2; i <= 2; i++) {
      tailGeos.push(geoBox(0.09, 0.02, 0.42, i * 0.055, 0, 0.2, 0, i * 0.16, 0));
    }
    const tailMesh = new THREE.Mesh(mergeAll(tailGeos), crowMat);
    this.tail.add(tailMesh);
    this.tail.position.set(0, 0.03, 0.38);
    this.tail.rotation.x = -0.1;
    this.meshRoot.add(this.tail);

    // --- wings ---
    const buildWing = (side: 1 | -1): { shoulder: THREE.Group; elbow: THREE.Group } => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.17, 0.07, -0.04);
      const innerGeos: THREE.BufferGeometry[] = [];
      innerGeos.push(geoBox(0.4, 0.045, 0.24, side * 0.2, 0, 0.0));
      for (let i = 0; i < 3; i++) {
        innerGeos.push(geoBox(0.36, 0.02, 0.16, side * (0.1 + i * 0.12), -0.01, 0.16 + i * 0.02, 0, side * 0.06 * i, 0));
      }
      shoulder.add(new THREE.Mesh(mergeAll(innerGeos), crowMat));

      const elbow = new THREE.Group();
      elbow.position.set(side * 0.4, 0, 0);
      const outerGeos: THREE.BufferGeometry[] = [];
      outerGeos.push(geoBox(0.46, 0.035, 0.18, side * 0.22, 0, 0.0));
      for (let i = 0; i < 4; i++) {
        const len = 0.42 - i * 0.06;
        outerGeos.push(
          geoBox(0.3, 0.018, 0.13, side * (0.16 + i * 0.1), -0.008, 0.1 + i * 0.045, 0, side * (0.1 + 0.1 * i), 0)
        );
        outerGeos.push(geoBox(len, 0.016, 0.09, side * (0.3 + i * 0.08), -0.012, 0.05 + i * 0.03, 0, side * 0.05 * i, 0));
      }
      elbow.add(new THREE.Mesh(mergeAll(outerGeos), crowMat));
      shoulder.add(elbow);
      return { shoulder, elbow };
    };

    const L = buildWing(-1);
    const R = buildWing(1);
    this.shoulderL = L.shoulder;
    this.elbowL = L.elbow;
    this.shoulderR = R.shoulder;
    this.elbowR = R.elbow;
    this.meshRoot.add(this.shoulderL, this.shoulderR);

    this.meshRoot.scale.setScalar(0.85);
    this.root.add(this.meshRoot);
  }

  setVisible(v: boolean): void {
    this.meshRoot.visible = v;
  }

  update(dt: number, speed: number, flapping: boolean, braking: boolean): void {
    const freq = flapping ? 3.1 : braking ? 2.2 : 0.9;
    const targetAmp = flapping ? 0.92 : braking ? 0.55 : 0.1 + Math.min(speed * 0.004, 0.08);
    this.flapPhase += dt * freq * Math.PI * 2;
    const s = Math.sin(this.flapPhase);
    const sLag = Math.sin(this.flapPhase - 0.85);
    const base = flapping ? 0.15 : 0.24; // wings held slightly raised in glide

    this.shoulderL.rotation.z = -(base + s * targetAmp);
    this.shoulderR.rotation.z = base + s * targetAmp;
    this.elbowL.rotation.z = -(sLag * targetAmp * 0.55 - 0.06);
    this.elbowR.rotation.z = sLag * targetAmp * 0.55 - 0.06;

    // brake flare: nose-up body, tail spread down
    this.flareT += ((braking ? 1 : 0) - this.flareT) * Math.min(dt * 6, 1);
    this.meshRoot.rotation.x = this.flareT * 0.5;
    this.tail.rotation.x = -0.1 - this.flareT * 0.75;
    this.tail.scale.x = 1 + this.flareT * 0.5;

    // subtle body bob while flapping
    this.meshRoot.position.y = flapping ? Math.sin(this.flapPhase) * 0.03 : 0;
  }
}
