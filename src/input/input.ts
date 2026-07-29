import { IS_TOUCH } from '../core/engine';

/**
 * Unified input: pointer-lock mouse + keyboard on desktop, virtual stick +
 * buttons + look-drag on touch. Everything reduces to: look deltas, an analog
 * steer vector, flap, brake.
 */
export class Input {
  lookDX = 0;
  lookDY = 0;
  steerX = 0;
  steerY = 0;
  flap = false;
  brake = false;
  invertY = false;
  enabled = false;
  /** fires whenever pointer lock is gained or lost (desktop) */
  onLock: ((locked: boolean) => void) | null = null;
  private relockPending = false;
  private lockEverEngaged = false;
  private keyL = false;
  private keyR = false;
  private keyU = false;
  private keyD = false;
  private keyRollL = false;
  private keyRollR = false;
  private mouseNX = 0; // cursor offset from screen centre, -1..1
  private mouseNY = 0;

  onKey: ((code: string) => void) | null = null;

  private canvas: HTMLElement;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA': this.keyL = true; e.preventDefault(); return;
        case 'ArrowRight':
        case 'KeyD': this.keyR = true; e.preventDefault(); return;
        case 'ArrowUp': this.keyU = true; e.preventDefault(); return;
        case 'ArrowDown': this.keyD = true; e.preventDefault(); return;
        case 'KeyQ': this.keyRollL = true; return;
        case 'KeyE': this.keyRollR = true; return;
      }
      if (e.repeat) return;
      switch (e.code) {
        case 'Space': this.flap = true; e.preventDefault(); break;
        case 'KeyW': this.flap = true; break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyS': this.brake = true; break;
        default: this.onKey?.(e.code);
      }
    });
    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA': this.keyL = false; break;
        case 'ArrowRight':
        case 'KeyD': this.keyR = false; break;
        case 'ArrowUp': this.keyU = false; break;
        case 'ArrowDown': this.keyD = false; break;
        case 'KeyQ': this.keyRollL = false; break;
        case 'KeyE': this.keyRollR = false; break;
        case 'Space':
        case 'KeyW': this.flap = false; break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyS': this.brake = false; break;
      }
    });

    if (!IS_TOUCH) {
      canvas.addEventListener('click', () => {
        if (this.enabled && document.pointerLockElement !== canvas) {
          this.tryLock();
        }
      });
      document.addEventListener('pointerlockchange', () => {
        const locked = document.pointerLockElement === canvas;
        if (locked) this.lockEverEngaged = true;
        this.onLock?.(locked);
      });
      document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === canvas) {
          this.lookDX += e.movementX;
          this.lookDY += e.movementY;
        } else {
          this.mouseNX = (e.clientX / window.innerWidth) * 2 - 1;
          this.mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
        }
      });
      document.addEventListener('mousedown', (e) => {
        if (!this.enabled) return;
        if (e.button === 0) this.flap = true;
        if (e.button === 2) this.brake = true;
      });
      document.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.flap = false;
        if (e.button === 2) this.brake = false;
      });
      document.addEventListener('contextmenu', (e) => {
        if (this.enabled) e.preventDefault();
      });
    } else {
      this.setupTouch();
    }
  }

  /** Combined analog steer: touch stick + keys + cursor-from-centre fallback. */
  axes(): { x: number; y: number } {
    let x = this.steerX + (this.keyR ? 1 : 0) - (this.keyL ? 1 : 0);
    let y = this.steerY + (this.keyD ? 1 : 0) - (this.keyU ? 1 : 0);
    // hover-steer exists ONLY for environments where pointer lock never works
    // (embedded iframes). Once lock has engaged, a freed cursor must be able
    // to reach the settings without dragging the crow around.
    if (!IS_TOUCH && this.enabled && !this.lockEverEngaged
      && document.pointerLockElement !== this.canvas) {
      x += Input.curve(this.mouseNX);
      y += Input.curve(this.mouseNY);
    }
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    };
  }

  /** Q/E roll axis, -1..1 (positive = roll left, flight-sim style). */
  rollAxis(): number {
    return (this.keyRollL ? 1 : 0) - (this.keyRollR ? 1 : 0);
  }

  private static curve(v: number): number {
    const dz = 0.16;
    const a = Math.abs(v);
    if (a < dz) return 0;
    const t = Math.min((a - dz) / (1 - dz), 1);
    return Math.sign(v) * Math.pow(t, 1.5);
  }

  requestLock(): void {
    if (!IS_TOUCH && document.pointerLockElement !== this.canvas) {
      this.tryLock();
    }
  }

  private tryLock(): void {
    try {
      const p = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {
        // Browsers refuse pointer lock for ~1.3s after ESC releases it. A
        // click inside that window used to fail silently — the cursor felt
        // "stuck outside". Retry once after the cooldown.
        if (this.relockPending) return;
        this.relockPending = true;
        window.setTimeout(() => {
          this.relockPending = false;
          if (this.enabled && document.pointerLockElement !== this.canvas) this.tryLock();
        }, 1400);
      });
    } catch {
      /* ignore */
    }
  }

  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  // -------------------------------------------------------------------------
  private setupTouch(): void {
    const ui = document.getElementById('touch-ui')!;
    ui.classList.add('on');
    const zone = document.getElementById('stick-zone')!;
    const base = document.getElementById('stick-base')!;
    const nub = document.getElementById('stick-nub')!;
    const btnFlap = document.getElementById('btn-flap')!;
    const btnBrake = document.getElementById('btn-brake')!;

    let stickId: number | null = null;
    let lookId: number | null = null;
    let sx = 0, sy = 0;
    let lx = 0, ly = 0;
    const RANGE = 48;

    const updateStick = (t: Touch) => {
      let dx = t.clientX - sx;
      let dy = t.clientY - sy;
      const len = Math.hypot(dx, dy);
      if (len > RANGE) {
        dx = (dx / len) * RANGE;
        dy = (dy / len) * RANGE;
      }
      nub.style.left = 50 + (dx / RANGE) * 42 + '%';
      nub.style.top = 50 + (dy / RANGE) * 42 + '%';
      this.steerX = dx / RANGE;
      this.steerY = dy / RANGE;
    };

    zone.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (stickId === null) {
          stickId = t.identifier;
          sx = t.clientX;
          sy = t.clientY;
          base.style.display = 'block';
          base.style.left = sx + 'px';
          base.style.top = sy + 'px';
          updateStick(t);
        }
      }
      e.preventDefault();
    }, { passive: false });

    // right-side look drag (anywhere not on a button / stick zone)
    window.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of Array.from(e.changedTouches)) {
        const el = t.target as HTMLElement;
        if (el.closest('#stick-zone') || el.closest('.tbtn') || el.closest('#settings') || el.closest('#gear')) continue;
        if (t.clientX > window.innerWidth * 0.44 && lookId === null) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickId) updateStick(t);
        else if (t.identifier === lookId) {
          this.lookDX += (t.clientX - lx) * 2.4;
          this.lookDY += (t.clientY - ly) * 2.4;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      if (stickId !== null) e.preventDefault();
    }, { passive: false });

    const endTouch = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickId) {
          stickId = null;
          this.steerX = 0;
          this.steerY = 0;
          base.style.display = 'none';
          nub.style.left = '50%';
          nub.style.top = '50%';
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    const bindBtn = (el: HTMLElement, set: (v: boolean) => void) => {
      el.addEventListener('touchstart', (e) => {
        set(true);
        el.classList.add('pressed');
        e.preventDefault();
      }, { passive: false });
      const off = () => {
        set(false);
        el.classList.remove('pressed');
      };
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
    };
    bindBtn(btnFlap, (v) => (this.flap = v));
    bindBtn(btnBrake, (v) => (this.brake = v));
  }
}
