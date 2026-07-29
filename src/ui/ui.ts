import { IS_TOUCH } from '../core/engine';

export interface UIOptions {
  seed: string;
  onStart: () => void;
  onSeed: (seed: string) => void;
  onQuality: (tier: number | null) => void;
  onMotion: (v: number) => void;
  onInvertY: (b: boolean) => void;
  onGhost: (b: boolean) => void;
  onMute: (b: boolean) => void;
  onWeather: (w: string | null) => void;
  onPace: (v: number) => void;
  onMist: (v: number) => void;
  onDensity: (v: number) => void;
}

export interface HudData {
  fps: number;
  spd: number;
  alt: number;
  rooms: number;
  draws: number;
  tris: number;
  tier: string;
  waves: number;
  district: string;
  chapter: string;
}

const HINTS = [
  IS_TOUCH ? 'hold FLAP to surge forward · BRAKE to hover' : 'hold SPACE to surge · SHIFT to brake',
  'the castle rearranges itself — listen for the biwa',
  IS_TOUCH ? 'drag the right side of the screen to steer' : 'press ESC to free the cursor · ⛩ settings up top',
  IS_TOUCH ? 'drag the right side of the screen to steer' : 'press R to grow a new castle',
  'lanterns mark the inhabited rooms',
  'dive into the dark — it goes down forever',
];

export class UI {
  private hud!: HTMLElement;
  private hudTL!: HTMLElement;
  private hudTR!: HTMLElement;
  private hint!: HTMLElement;
  private flash!: HTMLElement;
  private intro!: HTMLElement;
  private settings!: HTMLElement;
  private hintIdx = 0;
  private hintTimer: number | null = null;
  private started = false;

  /** Everything that actually starts the game — shared by intro and tour. */
  private begin(): void {
    this.started = true;
    this.intro.classList.add('hidden');
    this.hud.classList.add('on');
    this.startHints();
    this.o.onStart();
  }

  constructor(private o: UIOptions) {
    const ui = document.getElementById('ui')!;
    ui.innerHTML = `
      <div id="intro">
        <div class="title-kanji">無限城</div>
        <div class="title-en">Infinity Castle</div>
        <div class="title-sub">an endless procedural descent</div>
        <button id="start-btn">TAKE WING</button>
        <div class="controls-hint">${
          IS_TOUCH
            ? '<span><b>left stick</b> steer</span><span><b>right drag</b> look</span><span><b>FLAP</b> surge</span><span><b>BRAKE</b> hover</span>'
            : '<span><b>mouse / arrows / AD</b> steer</span><span><b>Q / E</b> roll</span><span><b>space / W / click</b> surge</span><span><b>shift / S</b> brake</span><span><b>C</b> camera</span><span><b>R</b> new castle</span><span><b>M</b> mute</span>'
        }</div>
        <div class="seed-line">SEED ${this.esc(o.seed)}</div>
      </div>
      <div id="hud">
        <div class="hud-tl">
          <div>SPD <b id="h-spd">0</b></div>
          <div>ALT <b id="h-alt">0</b></div>
          <div>WAVES <b id="h-waves">0</b></div>
        </div>
        <div class="hud-tr">
          <div><b id="h-fps">0</b> FPS</div>
          <div><b id="h-rooms">0</b> cells · <b id="h-draws">0</b> draws</div>
          <div><b id="h-tris">0</b>k tris · <b id="h-tier"></b></div>
        </div>
        <div id="place">
          <div id="h-district"></div>
          <div id="h-chapter"></div>
        </div>
        <div id="hint"></div>
        <div id="beat-flash"></div>
      </div>
      <div id="touch-ui">
        <div id="stick-zone"><div id="stick-base"><div id="stick-nub"></div></div></div>
        <div class="tbtn" id="btn-flap">FLAP</div>
        <div class="tbtn" id="btn-brake">BRAKE</div>
      </div>
      <div id="gear">⛩<span>settings</span></div>
      <div id="tour">
        <div id="tour-card">
          <h3>BEFORE YOU TAKE WING</h3>
          ${
            IS_TOUCH
              ? `<div class="tour-row"><b>FLY</b>left stick steers · drag the right side to look · FLAP surges · BRAKE hovers</div>
                 <div class="tour-row"><b>NO UP</b>the castle has no gravity — loops and inverted flight are normal here</div>
                 <div class="tour-row"><b>⛩ SETTINGS</b>top centre — quality (auto-tuned to this device), weather, mist, density, flight speed, new seeds</div>
                 <div class="tour-row"><b>THE CASTLE</b>it rebuilds itself in waves — lanterns mark the inhabited rooms</div>`
              : `<div class="tour-row"><b>FLY</b>move the mouse to steer · hold SPACE / W / click to surge · SHIFT to brake</div>
                 <div class="tour-row"><b>AEROBATICS</b>Q / E roll · there is no up here — loop, dive, fly inverted · C changes camera</div>
                 <div class="tour-row"><b>YOUR CURSOR</b>flying captures the mouse — press ESC to free it, click the castle to fly again</div>
                 <div class="tour-row"><b>⛩ SETTINGS</b>top centre when the cursor is free — quality (auto-tuned to your machine), weather, mist, density, flight speed · H hides the HUD · R grows a new castle · M mutes</div>`
          }
          <button id="tour-go">BEGIN THE DESCENT</button>
        </div>
      </div>
      <div id="cursor-hint">cursor freed — click the castle to fly · ⛩ settings above</div>
      <div id="settings">
        <h3>SETTINGS</h3>
        <div class="set-row"><label>quality</label>
          <select id="s-quality">
            <option value="auto" selected>auto</option>
            <option value="0">ember</option>
            <option value="1">low</option>
            <option value="2">high</option>
            <option value="3">ultra</option>
          </select>
        </div>
        <div class="set-row"><label>castle motion</label><input id="s-motion" type="range" min="0" max="200" value="100"/></div>
        <div class="set-row"><label>flight speed</label><input id="s-pace" type="range" min="20" max="180" value="100"/></div>
        <div class="set-row"><label>weather</label>
          <select id="s-weather">
            <option value="auto" selected>let the castle choose</option>
            <option value="clear">still air</option>
            <option value="haze">warm haze</option>
            <option value="mistfall">mist fall</option>
            <option value="emberstorm">ember storm</option>
            <option value="ashfall">ash fall</option>
            <option value="spiritmist">spirit mist</option>
          </select>
        </div>
        <div class="set-row"><label>mist amount</label><input id="s-mist" type="range" min="0" max="200" value="100"/></div>
        <div class="set-row"><label>density (rebuilds)</label><input id="s-density" type="range" min="40" max="160" value="100"/></div>
        <div class="set-row"><label>invert Y</label><input id="s-invert" type="checkbox"/></div>
        <div class="set-row"><label>ghost (no collision)</label><input id="s-ghost" type="checkbox"/></div>
        <div class="set-row"><label>mute</label><input id="s-mute" type="checkbox"/></div>
        <div class="set-row"><label>seed</label><input id="s-seed" type="text" value="${this.esc(o.seed)}"/></div>
        <div class="set-row"><button class="set-btn" id="s-apply">REBUILD</button><button class="set-btn" id="s-random">RANDOM</button><button class="set-btn" id="s-tour">TOUR</button></div>
      </div>
    `;

    this.intro = document.getElementById('intro')!;
    this.hud = document.getElementById('hud')!;
    this.hudTL = ui.querySelector('.hud-tl')!;
    this.hudTR = ui.querySelector('.hud-tr')!;
    this.hint = document.getElementById('hint')!;
    this.flash = document.getElementById('beat-flash')!;
    this.settings = document.getElementById('settings')!;
    // settings belong to the player — the gear is there from the menu onward
    document.getElementById('gear')!.classList.add('on');
    // portrait phones learn to rotate BEFORE they take wing, not after
    if (IS_TOUCH) document.getElementById('rotate-hint')!.classList.add('armed');

    document.getElementById('start-btn')!.addEventListener('click', () => {
      // every flight begins with the field guide — BEGIN is the real launch
      this.intro.classList.add('hidden');
      document.getElementById('tour')!.classList.add('open');
    });
    document.getElementById('tour-go')!.addEventListener('click', () => {
      document.getElementById('tour')!.classList.remove('open');
      if (!this.started) this.begin();
    });
    document.getElementById('s-tour')!.addEventListener('click', () => {
      this.settings.classList.remove('open');
      document.getElementById('tour')!.classList.add('open');
    });

    const gear = document.getElementById('gear')!;
    gear.addEventListener('click', () => {
      this.settings.classList.toggle('open');
      if (this.settings.classList.contains('open') && document.pointerLockElement) {
        document.exitPointerLock();
      }
    });

    (document.getElementById('s-quality') as HTMLSelectElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      o.onQuality(v === 'auto' ? null : Number(v));
    });
    (document.getElementById('s-motion') as HTMLInputElement).addEventListener('input', (e) => {
      o.onMotion(Number((e.target as HTMLInputElement).value) / 100);
    });
    (document.getElementById('s-pace') as HTMLInputElement).addEventListener('input', (e) => {
      o.onPace(Number((e.target as HTMLInputElement).value) / 100);
    });
    (document.getElementById('s-weather') as HTMLSelectElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      o.onWeather(v === 'auto' ? null : v);
    });
    (document.getElementById('s-mist') as HTMLInputElement).addEventListener('input', (e) => {
      o.onMist(Number((e.target as HTMLInputElement).value) / 100);
    });
    // density regenerates the world — apply when the user releases the slider
    (document.getElementById('s-density') as HTMLInputElement).addEventListener('change', (e) => {
      o.onDensity(Number((e.target as HTMLInputElement).value) / 100);
    });
    (document.getElementById('s-invert') as HTMLInputElement).addEventListener('change', (e) => {
      o.onInvertY((e.target as HTMLInputElement).checked);
    });
    (document.getElementById('s-ghost') as HTMLInputElement).addEventListener('change', (e) => {
      o.onGhost((e.target as HTMLInputElement).checked);
    });
    (document.getElementById('s-mute') as HTMLInputElement).addEventListener('change', (e) => {
      o.onMute((e.target as HTMLInputElement).checked);
    });
    document.getElementById('s-apply')!.addEventListener('click', () => {
      o.onSeed((document.getElementById('s-seed') as HTMLInputElement).value);
      this.settings.classList.remove('open');
    });
    document.getElementById('s-random')!.addEventListener('click', () => {
      const s = String((Math.random() * 0xffffffff) >>> 0);
      (document.getElementById('s-seed') as HTMLInputElement).value = s;
      o.onSeed(s);
      this.settings.classList.remove('open');
    });
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  setSeedDisplay(seed: string): void {
    (document.getElementById('s-seed') as HTMLInputElement).value = seed;
  }

  setMuteDisplay(m: boolean): void {
    (document.getElementById('s-mute') as HTMLInputElement).checked = m;
  }

  /** Show/hide the "cursor freed" banner when pointer lock changes. */
  setCursorFree(free: boolean): void {
    if (!this.started) return;
    document.getElementById('cursor-hint')!.classList.toggle('show', free);
    // once the mouse is captured the panel is unreachable — fold it away
    if (!free) this.settings.classList.remove('open');
  }

  private startHints(): void {
    const show = () => {
      this.hint.textContent = HINTS[this.hintIdx % HINTS.length];
      this.hintIdx++;
      this.hint.classList.add('show');
      window.setTimeout(() => this.hint.classList.remove('show'), 6000);
    };
    window.setTimeout(show, 2500);
    this.hintTimer = window.setInterval(show, 18000);
  }

  beatFlash(): void {
    this.flash.style.opacity = '1';
    window.setTimeout(() => (this.flash.style.opacity = '0'), 250);
  }

  updateHud(d: HudData): void {
    (document.getElementById('h-spd')!).textContent = d.spd.toFixed(0);
    (document.getElementById('h-alt')!).textContent = d.alt.toFixed(0);
    (document.getElementById('h-waves')!).textContent = String(d.waves);
    (document.getElementById('h-fps')!).textContent = d.fps.toFixed(0);
    (document.getElementById('h-rooms')!).textContent = String(d.rooms);
    (document.getElementById('h-draws')!).textContent = String(d.draws);
    (document.getElementById('h-tris')!).textContent = (d.tris / 1000).toFixed(0);
    (document.getElementById('h-tier')!).textContent = d.tier;
    const dEl = document.getElementById('h-district')!;
    if (dEl.textContent !== d.district) {
      dEl.textContent = d.district;
      document.getElementById('h-chapter')!.textContent = d.chapter;
      const p = document.getElementById('place')!;
      p.classList.remove('show');
      void p.offsetWidth; // restart the fade
      p.classList.add('show');
    }
  }
}
