import * as THREE from 'three';
import { Engine, IS_TOUCH } from './core/engine';
import { Quality, TierSettings } from './core/quality';
import { mulberry32, randomSeed, seedFromString } from './core/rng';
import { glowUniforms, fxUniforms } from './kit/materials';
import { World } from './world/streamer';
import { CELL, districtAtCell, isOccupied } from './world/districts';
import { farUniforms } from './world/farfield';
import { Choreographer } from './world/motion';
import { Crow } from './player/crow';
import { Flight } from './player/flight';
import { CameraRig } from './player/camera';
import { Input } from './input/input';
import { collideSphere, escapeDirection } from './physics/collision';
import { createSky } from './fx/sky';
import { Motes } from './fx/motes';
import { Post } from './fx/post';
import { AudioEngine } from './audio/audio';
import { UI } from './ui/ui';

const params = new URLSearchParams(location.search);
const dev = params.get('dev');

if (dev) {
  void import('./dev/gallery').then((m) => m.runGallery(dev));
} else {
  game();
}

function game(): void {
  let seedStr = params.get('seed') ?? String(randomSeed() >>> 0);
  let seed = seedFromString(seedStr);

  const engine = new Engine(document.getElementById('app')!);
  const quality = new Quality();
  const world = new World(seed);
  engine.scene.add(world.group);
  const choreo = new Choreographer();
  const waveRng = mulberry32(seed ^ 0x7a7a);

  const sky = createSky();
  engine.scene.add(sky.mesh);
  const motes = new Motes();
  engine.scene.add(motes.points);
  const post = new Post(engine);
  const audio = new AudioEngine();

  const crow = new Crow();
  engine.scene.add(crow.root);
  const flight = new Flight();
  const rig = new CameraRig();

  let spawn = world.findSpawn();
  flight.pos.copy(spawn.pos);
  flight.yaw = spawn.yaw;

  let started = false;
  let ghost = false;
  let stuckTimer = 0;
  const escapeVec = new THREE.Vector3();
  const worldOccupied = (x: number, y: number, z: number, s: number) => isOccupied(x, y, z, s);

  // ---- UI ----
  const ui = new UI({
    seed: seedStr,
    onStart: () => {
      audio.init();
      input.enabled = true;
      input.requestLock();
      started = true;
    },
    onSeed: (s) => reseed(s),
    onQuality: (t) => quality.setManual(t),
    onMotion: (v) => (choreo.intensity = v),
    onInvertY: (b) => (input.invertY = b),
    onGhost: (b) => (ghost = b),
    onMute: (b) => audio.setMuted(b),
  });

  const input = new Input(engine.renderer.domElement);
  input.onKey = (code) => {
    if (!started) return;
    switch (code) {
      case 'KeyC':
        rig.firstPerson = !rig.firstPerson;
        crow.setVisible(!rig.firstPerson);
        break;
      case 'KeyR':
        reseed(String(randomSeed() >>> 0));
        break;
      case 'KeyM':
        audio.setMuted(!audio.muted);
        ui.setMuteDisplay(audio.muted);
        break;
    }
  };

  function reseed(s: string): void {
    seedStr = s;
    seed = seedFromString(s);
    world.reseed(seed);
    spawn = world.findSpawn();
    flight.pos.copy(spawn.pos);
    flight.yaw = spawn.yaw;
    flight.vel.set(0, 0, -8);
    menuFocus.copy(spawn.pos);
    ui.setSeedDisplay(s);
    const url = new URL(location.href);
    url.searchParams.set('seed', s);
    history.replaceState(null, '', url.toString());
  }

  // ---- quality wiring ----
  let baseFog = 0.014;
  const applyTier = (s: TierSettings) => {
    engine.setRenderScale(s.renderScale, s.dprCap);
    world.radiusCells = s.radiusCells;
    world.buildBudgetMs = s.buildBudgetMs;
    world.landmarkRadiusD = s.radiusCells * 0.62;
    world.farRadiusD = s.radiusCells * 0.9;
    motes.setCount(s.motes);
    post.setEnabled(s.bloom);
    // fog is thin enough to see landmarks and far-field districts loom
    baseFog = 0.75 / (s.radiusCells * CELL);
  };
  quality.onChange((s) => applyTier(s));
  applyTier(quality.settings);

  // ---- audio hooks ----
  choreo.onBeat = (delay, strength) => audio.beat(delay, strength);
  choreo.onFrontPass = () => ui.beatFlash();
  flight.onFlap = () => audio.flap();

  // ---- HUD bookkeeping ----
  let fpsAcc = 0;
  let fpsFrames = 0;
  let hudTimer = 0;
  let fps = 60;

  const menuFocus = spawn.pos.clone();

  engine.onFrame((dt, t) => {
    quality.update(dt);

    if (started) {
      flight.update(dt, input);
      // integrate in substeps so high speed can't tunnel through walls
      const steps = ghost ? 1 : Math.max(1, Math.ceil((flight.speed * dt) / 0.45));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        flight.pos.addScaledVector(flight.vel, sdt);
        if (!ghost) collideSphere(world, flight.pos, flight.vel, 0.45);
      }

      // unstick: wedged in geometry (or shoved by a moving district)
      if (!ghost) {
        if (flight.speed < 3.2 && (input.flap || stuckTimer > 0)) stuckTimer += dt;
        else stuckTimer = Math.max(0, stuckTimer - dt * 2.5);
        if (stuckTimer > 0.6) {
          if (escapeDirection(world, flight.pos, worldOccupied, escapeVec)) {
            flight.pos.addScaledVector(escapeVec, dt * 14);
            flight.vel.addScaledVector(escapeVec, dt * 22);
          }
          if (stuckTimer > 3) stuckTimer = 0;
        }
      }

      flight.applyTo(crow.root);
      crow.update(dt, flight.speed, input.flap, input.brake);
      rig.update(dt, engine.camera, flight, (p, r) => {
        collideSphere(world, p, null, r);
      });
      audio.wind(flight.speed);
    } else {
      // menu: slow drift around the spawn area
      const a = t * 0.06;
      engine.camera.position.set(
        menuFocus.x + Math.cos(a) * 20,
        menuFocus.y + 5 + Math.sin(t * 0.045) * 4,
        menuFocus.z + Math.sin(a) * 20
      );
      engine.camera.lookAt(menuFocus);
      flight.pos.copy(spawn.pos);
    }

    world.update(started ? flight.pos : menuFocus, t);
    choreo.update(t, dt, world, started ? flight.pos : menuFocus, waveRng);

    // ---- Director drives presentation from the district you are inside ----
    const focus = started ? flight.pos : menuFocus;
    const here = districtAtCell(
      Math.round(focus.x / CELL), Math.round(focus.y / CELL), Math.round(focus.z / CELL), seed
    );
    const targetFog = baseFog * here.def.fogMul;
    engine.fog.density += (targetFog - engine.fog.density) * Math.min(dt * 0.6, 1);
    glowUniforms.uFog.value = engine.fog.density;
    fxUniforms.uFogDensity.value = engine.fog.density;
    fxUniforms.uTime.value = t;
    farUniforms.uFogDensity.value = engine.fog.density;
    farUniforms.uTime.value = t;

    sky.mesh.position.copy(engine.camera.position);
    sky.uniforms.uTime.value = t;
    motes.update(t, engine.camera.position, engine.renderer.getPixelRatio());
    glowUniforms.uPx.value = engine.renderer.getPixelRatio();

    // HUD @ 4 Hz
    fpsAcc += dt;
    fpsFrames++;
    hudTimer += dt;
    if (hudTimer > 0.25) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
      hudTimer = 0;
      if (started) {
        const info = engine.renderer.info.render;
        ui.updateHud({
          fps,
          spd: flight.speed,
          alt: flight.pos.y,
          rooms: world.roomsLive,
          draws: info.calls,
          tris: info.triangles,
          tier: quality.settings.name + (quality.auto ? '·auto' : ''),
          waves: choreo.waveCount,
          district: here.def.label,
          chapter: here.chapter,
        });
      }
    }
  });

  engine.start();

  // debug handle for dev tooling
  (window as unknown as Record<string, unknown>).__ic = { engine, world, choreo, flight, quality };
}
