import * as THREE from 'three';
import type { Flight } from './flight';

const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3();
const _viewAxis = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Spring-arm third-person camera with speed FOV kick and roll lean.
 * The camera's up follows the CROW's up — not the world's — so a loop or an
 * inverted dive feels continuous instead of hitting an invisible ceiling.
 */
export class CameraRig {
  firstPerson = false;
  private smPos = new THREE.Vector3();
  private smUp = new THREE.Vector3(0, 1, 0);
  private smFov = 68;
  private initialized = false;

  update(dt: number, cam: THREE.PerspectiveCamera, flight: Flight,
    collide?: (p: THREE.Vector3, r: number) => void): void {
    flight.forward(_fwd);
    flight.up(_up);

    if (this.firstPerson) {
      _desired.copy(flight.pos).addScaledVector(_fwd, 0.35).addScaledVector(_up, 0.12);
      this.smPos.copy(_desired);
    } else {
      const dist = 4.1 + flight.speed * 0.045;
      _desired.copy(flight.pos).addScaledVector(_fwd, -dist).addScaledVector(_up, 1.15);
      if (!this.initialized) {
        this.smPos.copy(_desired);
        this.initialized = true;
      }
      const f = 1 - Math.exp(-dt * 7.5);
      this.smPos.lerp(_desired, f);
      // don't let the arm stretch too far during sharp moves
      if (this.smPos.distanceTo(flight.pos) > dist * 1.7) {
        this.smPos.sub(flight.pos).setLength(dist * 1.7).add(flight.pos);
      }
      collide?.(this.smPos, 0.4);
    }

    cam.position.copy(this.smPos);

    _look.copy(flight.pos).addScaledVector(_fwd, this.firstPerson ? 10 : 7);
    _look.addScaledVector(flight.vel, 0.04);

    // chase the crow's up smoothly so loops read as one continuous motion
    const uf = 1 - Math.exp(-dt * (this.firstPerson ? 14 : 6.5));
    this.smUp.lerp(_up, uf).normalize();
    // roll lean: rotate the followed up about the view axis
    _viewAxis.copy(_look).sub(cam.position).normalize();
    _q.setFromAxisAngle(_viewAxis, flight.roll * (this.firstPerson ? 0.85 : 0.38));
    cam.up.copy(this.smUp).applyQuaternion(_q);
    cam.lookAt(_look);

    const targetFov = Math.min(64 + flight.speed * 0.65, 86);
    this.smFov += (targetFov - this.smFov) * Math.min(dt * 4, 1);
    if (Math.abs(this.smFov - cam.fov) > 0.1) {
      cam.fov = this.smFov;
      cam.updateProjectionMatrix();
    }
  }
}
