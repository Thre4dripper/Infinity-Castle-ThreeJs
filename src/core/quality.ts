import { IS_TOUCH } from './engine';

export interface TierSettings {
  name: string;
  renderScale: number;
  dprCap: number;
  radiusCells: number;
  motes: number;
  bloom: boolean;
  buildBudgetMs: number;
}

export const TIERS: TierSettings[] = [
  { name: 'ember', renderScale: 0.62, dprCap: 1.0, radiusCells: 2.8, motes: 260, bloom: false, buildBudgetMs: 2.0 },
  { name: 'low', renderScale: 0.78, dprCap: 1.5, radiusCells: 3.4, motes: 650, bloom: false, buildBudgetMs: 2.5 },
  { name: 'high', renderScale: 0.9, dprCap: 2.0, radiusCells: 4.0, motes: 1100, bloom: false, buildBudgetMs: 3.0 },
  { name: 'ultra', renderScale: 1.0, dprCap: 2.0, radiusCells: 4.6, motes: 1600, bloom: true, buildBudgetMs: 3.5 },
];

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
    this.tier = IS_TOUCH ? 1 : 2;
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
