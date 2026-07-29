import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mulberry32 } from '../core/rng';
import { Kit, bakeShading, buildGlowPoints } from '../kit/geoUtils';
import { opaqueMat, emissiveMat, glowMat, glowUniforms, fxUniforms } from '../kit/materials';
import {
  floorTatami, floorPlanks, slabBase, pillar, bracketCluster, railing, stairs,
  torii, lantern, lanternHang, lanternPost, wallShoji, wallPlaster, wallLattice,
  wallPlanks, wallKoshi, wallKura, wallFusuma, byobu, tokonoma,
  roofHip, roofGable, roofThatch, roofTiered, openingTrim, engawa, pavilion,
} from '../kit/parts';
import { buildCell } from '../world/roomBuilder';
import { isOccupied } from '../world/districts';

/**
 * Dev routes: ?dev=parts (every kit part on a grid) and ?dev=modules
 * (fully-built rooms straight from the world pipeline). Orbit to inspect.
 */
export function runGallery(mode: string): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1526);
  scene.add(new THREE.HemisphereLight(0x9a8cd8, 0x2a2236, 7.5));
  const dir = new THREE.DirectionalLight(0xccd8ff, 6.0);
  dir.position.set(0.4, 1, 0.3);
  scene.add(dir);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
  camera.position.set(14, 12, 22);
  const controls = new OrbitControls(camera, renderer.domElement);

  const addKit = (k: Kit, x: number, z: number, label: string) => {
    const { opaque, emissive } = k.merge();
    const group = new THREE.Group();
    let tris = 0;
    if (opaque) {
      bakeShading(opaque, k.glows, 6);
      group.add(new THREE.Mesh(opaque, opaqueMat));
      tris += (opaque.index?.count ?? 0) / 3;
    }
    if (emissive) {
      group.add(new THREE.Mesh(emissive, emissiveMat));
      tris += (emissive.index?.count ?? 0) / 3;
    }
    const pts = buildGlowPoints(k.glows, glowMat);
    if (pts) group.add(pts);
    group.position.set(x, 0, z);
    scene.add(group);
    console.log(`[gallery] ${label}: ${tris.toFixed(0)} tris`);
  };

  if (mode === 'parts') {
    const rng = mulberry32(42);
    const demos: [string, (k: Kit) => void][] = [
      ['tatami', (k) => floorTatami(k, 6, 6, 0)],
      ['planks', (k) => floorPlanks(k, 6, 6, 0)],
      ['slab', (k) => slabBase(k, 6, 6, 0)],
      ['pillar', (k) => { pillar(k, 0, 0, 0, 5); bracketCluster(k, 0, 4.4, 0); }],
      ['railing', (k) => railing(k, 0, 0, 0, 6)],
      ['stairs', (k) => stairs(k, { x: 0, y: 0, z: -2.5, rise: 3.4, run: 5, w: 2 })],
      ['torii', (k) => torii(k, 0, 0, 0, 4, 5.5)],
      ['lantern', (k) => { lantern(k, -1.5, 1, 0, 1.2); lanternHang(k, 1.5, 4, 0, 1.4); }],
      ['lantern-post', (k) => lanternPost(k, 0, 0, 0)],
      ['wall-shoji', (k) => wallShoji(k, 8, 0, 7)],
      ['wall-shoji-gap', (k) => wallShoji(k, 8, 0, 7, { gap: 2.6 })],
      ['wall-fusuma', (k) => wallFusuma(k, 8, 0, 7)],
      ['wall-fusuma-gap', (k) => wallFusuma(k, 8, 0, 7, { gap: 2.6 })],
      ['wall-koshi', (k) => wallKoshi(k, 8, 0, 7)],
      ['wall-kura', (k) => wallKura(k, 8, 0, 7)],
      ['wall-plaster', (k) => wallPlaster(k, 8, 0, 7, { window: true })],
      ['wall-lattice', (k) => wallLattice(k, 8, 0, 7)],
      ['wall-planks', (k) => wallPlanks(k, 8, 0, 7)],
      ['byobu', (k) => byobu(k, 0, 0, 0, 0, 4)],
      ['tokonoma', (k) => tokonoma(k, 0, 0, 0, 2.6)],
      ['roof-hip', (k) => roofHip(k, 6, 6, 2)],
      ['roof-gable', (k) => roofGable(k, 6, 6, 2)],
      ['roof-thatch', (k) => roofThatch(k, 6, 6, 2)],
      ['roof-tiered', (k) => roofTiered(k, 6, 6, 0, 3)],
      ['opening-trim', (k) => openingTrim(k, 8, 0, 7, { ranma: true, lanterns: true })],
      ['engawa', (k) => engawa(k, 7, 0.5)],
      ['pavilion', (k) => pavilion(k, 0, 0, 0)],
    ];
    const cols = 6;
    demos.forEach(([label, fn], i) => {
      const k = new Kit(rng);
      fn(k);
      addKit(k, (i % cols) * 14 - 35, Math.floor(i / cols) * 14 - 21, label);
    });
  } else {
    // modules: pull real cells out of the world pipeline
    const seed = 1337;
    let placed = 0;
    outer:
    for (let cx = -6; cx <= 6; cx++) {
      for (let cy = -2; cy <= 2; cy++) {
        for (let cz = -6; cz <= 6; cz++) {
          if (!isOccupied(cx, cy, cz, seed)) continue;
          const room = buildCell(cx, cy, cz, seed, 0);
          if (!room) continue;
          room.root.position.set((placed % 3) * 16 - 16, 0, Math.floor(placed / 3) * 16 - 16);
          scene.add(room.root);
          console.log(`[gallery] cell ${room.archetype} (${room.district.def.label}): ${room.triCount.toFixed(0)} tris, ${room.colliders.length / 6} colliders`);
          placed++;
          if (placed >= 9) break outer;
        }
      }
    }
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    glowUniforms.uTime.value = t;
    glowUniforms.uPx.value = renderer.getPixelRatio();
    // the assembly shader needs a clock or every part stays collapsed
    fxUniforms.uTime.value = t + 10;
    fxUniforms.uFogDensity.value = 0.0015;
    fxUniforms.uBuildOrigin.value.copy(camera.position);
    controls.update();
    renderer.render(scene, camera);
  });

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}
