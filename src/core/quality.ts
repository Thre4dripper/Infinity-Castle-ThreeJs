import { IS_TOUCH } from './engine';

export interface TierSettings {
  name: string;
  renderScale: number;
  dprCap: number;
  radiusCells: number;
  motes: number;
  bloom: boolean;
  buildBudgetMs: number;
  /** mist decks — the cheapest way to hide the streaming edge */
  mistLayers: number;
}

export const TIERS: TierSettings[] = [
  { name: 'ember', renderScale: 0.62, dprCap: 1.0, radiusCells: 2.8, motes: 260, bloom: false, buildBudgetMs: 2.0, mistLayers: 5 },
  { name: 'low', renderScale: 0.78, dprCap: 1.5, radiusCells: 3.4, motes: 650, bloom: false, buildBudgetMs: 2.5, mistLayers: 8 },
  { name: 'high', renderScale: 0.9, dprCap: 2.0, radiusCells: 4.0, motes: 1100, bloom: false, buildBudgetMs: 3.0, mistLayers: 13 },
  { name: 'ultra', renderScale: 1.0, dprCap: 2.0, radiusCells: 4.6, motes: 1600, bloom: true, buildBudgetMs: 3.5, mistLayers: 18 },
];

/**
 * One-time probe of the machine before the first frame. The runtime monitor
 * still walks tiers adaptively — this only picks a starting point so weak
 * machines don't stutter through their first seconds at 'high'.
 */
export function detectTier(): number {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (IS_TOUCH) {
    return mem >= 6 && cores >= 6 ? 2 : mem >= 3 ? 1 : 0;
  }
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) {
      gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
    }
  } catch {
    /* probing is best-effort */
  }
  // strong discrete / apple-silicon parts go straight to ultra
  if (/apple m\d|rtx|geforce gtx 1[6-9]|geforce gtx [2-9]|radeon rx|arc a/.test(gpu)) return 3;
  // known-weak integrated parts start low
  if (/intel.*(hd graphics|uhd graphics)|mali|adreno [1-5]|geforce (mx|8|9)\d0/.test(gpu)) return 1;
  if (mem <= 4 || cores <= 4) return 1;
  return 2; // unknown hardware: high, and the auto monitor takes it from there
}

/**
 * Rolling frame-time monitor. In auto mode it walks the tier up/down with
 * hysteresis so it settles instead of oscillating.
 */
export class Quality {
  tier: number;
  auto = true;

  private acc = 0;
  private frames = 0;
  private evalTimer = 0;
  private goodStreak = 0;
  private listeners: ((t: TierSettings, index: number) => void)[] = [];

  constructor() {
    this.tier = detectTier();
  }

  get settings(): TierSettings {
    return TIERS[this.tier];
  }

  onChange(cb: (t: TierSettings, index: number) => void): void {
    this.listeners.push(cb);
  }

  /** Force a tier (or re-enter auto with null). */
  setManual(tier: number | null): void {
    if (tier === null) {
      this.auto = true;
      return;
    }
    this.auto = false;
    this.applyTier(tier);
  }

  private applyTier(t: number): void {
    const cap = IS_TOUCH ? 2 : TIERS.length - 1; // no bloom tier on touch devices
    const clamped = Math.max(0, Math.min(cap, t));
    if (clamped === this.tier) return;
    this.tier = clamped;
    for (const cb of this.listeners) cb(this.settings, this.tier);
  }

  /** Fire listeners with the current tier (used at startup). */
  emit(): void {
    for (const cb of this.listeners) cb(this.settings, this.tier);
  }

  update(dt: number): void {
    if (!this.auto) return;
    this.acc += dt;
    this.frames++;
    this.evalTimer += dt;
    if (this.evalTimer < 2.5 || this.frames < 30) return;

    const avgMs = (this.acc / this.frames) * 1000;
    this.acc = 0;
    this.frames = 0;
    this.evalTimer = 0;

    if (avgMs > 34) {
      this.goodStreak = 0;
      this.applyTier(this.tier - 1);
    } else if (avgMs < 20) {
      this.goodStreak++;
      if (this.goodStreak >= 2) {
        this.goodStreak = 0;
        this.applyTier(this.tier + 1);
      }
    } else {
      this.goodStreak = 0;
    }
  }
}
