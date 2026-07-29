import * as THREE from 'three';
import type { Input } from '../input/input';

const _fwd = new THREE.Vector3();
const _target = new THREE.Vector3();
const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);
const _AZ = new THREE.Vector3(0, 0, 1);
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

/**
 * Arcade-but-swoopy flight: velocity chases forward·targetSpeed, with a stall
 * sink at low airspeed and banked rolls driven by yaw rate. Feels like a bird,
 * stays stable at any frame rate.
 *
 * Orientation is a free quaternion — the castle has no up, and neither does
 * the crow. Pitch is unclamped: fly straight up, loop, come out inverted and
 * only the lanterns falling "sideways" will tell you.
 */
export class Flight {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3(0, 0, -8);
  /** full 3D orientation — steering always turns screen-relative */
  readonly ori = new THREE.Quaternion();
  roll = 0;

  flapping = false;
  braking = false;
  /** user pace dial from settings (0.5–2) */
  speedScale = 1;
  private smYawRate = 0;
  private flapTimer = 0;
  /** fires on each wing-stroke while flapping (audio hook) */
  onFlap: (() => void) | null = null;

  get speed(): number {
    return this.vel.length();
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 0, -1).applyQuaternion(this.ori);
  }

  up(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.ori);
  }

  /** Point the crow (used at spawn). */
  setLook(yaw: number, pitch: number): void {
    this.ori.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  }

  update(dt: number, input: Input): void {
    const look = input.consumeLook();
    const ax = input.axes();
    const inv = input.invertY ? -1 : 1;

    const sens = 0.0021;
    const dyaw = -look.dx * sens - ax.x * 1.9 * dt;
    const dpitch = (-look.dy * sens - ax.y * 1.6 * dt) * inv;
    const droll = input.rollAxis() * 2.3 * dt;
    // rotate about the crow's OWN axes — no clamp, no horizon lock.
    _qa.setFromAxisAngle(_AY, dyaw);
    _qb.setFromAxisAngle(_AX, dpitch);
    this.ori.multiply(_qa).multiply(_qb);
    if (droll !== 0) this.ori.multiply(_qa.setFromAxisAngle(_AZ, droll));
    this.ori.normalize();

    const yawRate = dt > 0 ? dyaw / dt : 0;
    this.smYawRate += (yawRate - this.smYawRate) * Math.min(dt * 8, 1);
    const targetRoll = Math.max(-1.05, Math.min(1.05, -this.smYawRate * 0.55));
    this.roll += (targetRoll - this.roll) * Math.min(dt * 5, 1);

    this.flapping = input.flap;
    this.braking = input.brake;

    const targetSpeed = (this.braking ? 5.5 : this.flapping ? 26 : 14.5) * this.speedScale;
    const resp = this.braking ? 3.4 : this.flapping ? 2.4 : 2.0;
    this.forward(_fwd);
    _target.copy(_fwd).multiplyScalar(targetSpeed);
    const f = 1 - Math.exp(-resp * dt);
    this.vel.lerp(_target, f);

    // stall sink at low airspeed
    const sf = Math.max(0, 1 - this.speed / 8);
    this.vel.y -= 20 * sf * sf * dt;
    // gentle glide sag
    if (!this.flapping) this.vel.y -= 1.4 * dt;

    // wing-stroke ticks
    if (this.flapping) {
      this.flapTimer -= dt;
      if (this.flapTimer <= 0) {
        this.flapTimer = 0.46;
        this.vel.y += 0.6;
        this.onFlap?.();
      }
    } else {
      this.flapTimer = 0.1;
    }
  }

  /** Write orientation into an object (the crow root). */
  applyTo(obj: THREE.Object3D): void {
    obj.position.copy(this.pos);
    obj.quaternion.copy(this.ori).multiply(_qa.setFromAxisAngle(_AZ, this.roll));
  }
}
