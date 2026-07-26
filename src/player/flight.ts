import * as THREE from 'three';
import type { Input } from '../input/input';

const _fwd = new THREE.Vector3();
const _target = new THREE.Vector3();

/**
 * Arcade-but-swoopy flight: velocity chases forward·targetSpeed, with a stall
 * sink at low airspeed and banked rolls driven by yaw rate. Feels like a bird,
 * stays stable at any frame rate.
 */
export class Flight {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3(0, 0, -8);
  yaw = 0;
  pitch = 0;
  roll = 0;

  flapping = false;
  braking = false;
  private smYawRate = 0;
  private flapTimer = 0;
  /** fires on each wing-stroke while flapping (audio hook) */
  onFlap: (() => void) | null = null;

  get speed(): number {
    return this.vel.length();
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt: number, input: Input): void {
    const look = input.consumeLook();
    const prevYaw = this.yaw;

    const sens = 0.0021;
    this.yaw -= look.dx * sens;
    this.pitch -= look.dy * sens * (input.invertY ? -1 : 1);
    // analog steer (touch stick, keys, hover fallback)
    const ax = input.axes();
    this.yaw -= ax.x * 1.9 * dt;
    this.pitch -= ax.y * 1.6 * dt * (input.invertY ? -1 : 1);
    this.pitch = Math.max(-1.32, Math.min(1.32, this.pitch));

    const yawRate = dt > 0 ? (this.yaw - prevYaw) / dt : 0;
    this.smYawRate += (yawRate - this.smYawRate) * Math.min(dt * 8, 1);
    const targetRoll = Math.max(-1.05, Math.min(1.05, -this.smYawRate * 0.55));
    this.roll += (targetRoll - this.roll) * Math.min(dt * 5, 1);

    this.flapping = input.flap;
    this.braking = input.brake;

    const targetSpeed = this.braking ? 5.5 : this.flapping ? 26 : 14.5;
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
    obj.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
  }
}
