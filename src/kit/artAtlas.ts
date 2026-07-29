import * as THREE from 'three';

// ---------------------------------------------------------------------------
// ART ATLAS
// A 4x4 atlas of traditional Japanese motifs, painted with Canvas2D at
// runtime — no image files. Fusuma panels, folding screens, storehouse doors
// and temple walls sample a tile from this, so the castle is decorated with
// waves, cranes, pines and blossoms instead of blank plaster.
// ---------------------------------------------------------------------------

export const ART_TILES = 4; // 4x4 grid
const TILE = 256;

type Ctx = CanvasRenderingContext2D;

/** Aged paper / gold-leaf ground with a little mottling. */
function ground(c: Ctx, x: number, y: number, base: string, mottle: string): void {
  c.fillStyle = base;
  c.fillRect(x, y, TILE, TILE);
  c.fillStyle = mottle;
  for (let i = 0; i < 90; i++) {
    const r = 6 + Math.random() * 26;
    c.globalAlpha = 0.05 + Math.random() * 0.08;
    c.beginPath();
    c.arc(x + Math.random() * TILE, y + Math.random() * TILE, r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

/** Gold leaf squares, the kinpaku ground of a screen painting. */
function goldLeaf(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#8a5f1e', '#a87a2c');
  const n = 6;
  const s = TILE / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      c.globalAlpha = 0.10 + Math.random() * 0.16;
      c.fillStyle = Math.random() < 0.5 ? '#c99a3e' : '#6f4a15';
      c.fillRect(x + i * s + 1, y + j * s + 1, s - 2, s - 2);
    }
  }
  c.globalAlpha = 1;
}

// --- motifs ----------------------------------------------------------------

function seigaiha(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#1d3552', '#26456a');
  c.lineWidth = 3;
  const R = 30;
  for (let row = 0; row < 12; row++) {
    for (let col = -1; col < 7; col++) {
      const cx = x + col * R * 2 + (row % 2 ? R : 0);
      const cy = y + row * R * 0.78;
      for (let k = 3; k >= 1; k--) {
        c.strokeStyle = k === 3 ? '#7fb2d8' : k === 2 ? '#adcfe8' : '#e6f1f8';
        c.beginPath();
        c.arc(cx, cy, (R * k) / 3, Math.PI, 0);
        c.stroke();
      }
    }
  }
}

function asanoha(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#d8c9a4', '#c6b58c');
  c.strokeStyle = '#3d5a7a';
  c.lineWidth = 2;
  const s = 42;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cx = x + col * s + (row % 2 ? s / 2 : 0);
      const cy = y + row * s * 0.72;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5);
        c.stroke();
      }
    }
  }
}

function craneMoon(c: Ctx, x: number, y: number): void {
  goldLeaf(c, x, y);
  // red sun
  c.fillStyle = '#b3321c';
  c.beginPath();
  c.arc(x + TILE * 0.72, y + TILE * 0.24, 34, 0, Math.PI * 2);
  c.fill();
  // two cranes in flight, stylised
  const crane = (px: number, py: number, s: number, flip: number) => {
    c.fillStyle = '#f2ece0';
    c.strokeStyle = '#1a1410';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(px, py, 22 * s, 9 * s, -0.25 * flip, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // wings
    c.beginPath();
    c.moveTo(px, py - 3 * s);
    c.lineTo(px - 26 * s * flip, py - 26 * s);
    c.lineTo(px + 4 * s, py - 6 * s);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(px, py + 1 * s);
    c.lineTo(px - 20 * s * flip, py + 20 * s);
    c.lineTo(px + 5 * s, py + 3 * s);
    c.closePath();
    c.fill();
    c.stroke();
    // neck + beak
    c.beginPath();
    c.moveTo(px + 18 * s * flip, py - 4 * s);
    c.lineTo(px + 40 * s * flip, py - 18 * s);
    c.lineWidth = 4 * s;
    c.strokeStyle = '#f2ece0';
    c.stroke();
    c.fillStyle = '#1a1410';
    c.beginPath();
    c.arc(px + 40 * s * flip, py - 18 * s, 4 * s, 0, Math.PI * 2);
    c.fill();
    // trailing legs
    c.strokeStyle = '#1a1410';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(px - 18 * s * flip, py + 4 * s);
    c.lineTo(px - 40 * s * flip, py + 12 * s);
    c.stroke();
  };
  crane(x + TILE * 0.4, y + TILE * 0.45, 1.0, 1);
  crane(x + TILE * 0.66, y + TILE * 0.72, 0.7, 1);
}

function pineBranch(c: Ctx, x: number, y: number): void {
  goldLeaf(c, x, y);
  c.strokeStyle = '#2a1c0e';
  c.lineCap = 'round';
  const bough = (px: number, py: number, ang: number, len: number, w: number, depth: number) => {
    if (depth === 0) return;
    const ex = px + Math.cos(ang) * len;
    const ey = py + Math.sin(ang) * len;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(ex, ey);
    c.stroke();
    // needle clusters
    c.fillStyle = '#25401f';
    for (let i = 0; i < 3; i++) {
      const t = 0.4 + i * 0.25;
      const nx = px + Math.cos(ang) * len * t;
      const ny = py + Math.sin(ang) * len * t;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        c.beginPath();
        c.ellipse(nx + Math.cos(a) * 9, ny + Math.sin(a) * 9, 8, 3, a, 0, Math.PI * 2);
        c.fill();
      }
    }
    bough(ex, ey, ang - 0.55, len * 0.7, w * 0.65, depth - 1);
    bough(ex, ey, ang + 0.45, len * 0.65, w * 0.65, depth - 1);
  };
  bough(x + 10, y + TILE - 16, -0.55, 74, 11, 4);
  bough(x + TILE - 14, y + TILE * 0.9, -2.4, 60, 9, 3);
}

function plumBlossom(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#e8dcc4', '#d6c7a8');
  c.strokeStyle = '#3a2a1c';
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x - 4, y + TILE * 0.85);
  c.bezierCurveTo(x + TILE * 0.35, y + TILE * 0.7, x + TILE * 0.5, y + TILE * 0.3, x + TILE + 4, y + TILE * 0.16);
  c.stroke();
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(x + TILE * 0.3, y + TILE * 0.72);
  c.lineTo(x + TILE * 0.18, y + TILE * 0.36);
  c.stroke();
  const flower = (px: number, py: number, s: number, col: string) => {
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      c.beginPath();
      c.arc(px + Math.cos(a) * s * 0.62, py + Math.sin(a) * s * 0.62, s * 0.5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#f6e6a8';
    c.beginPath();
    c.arc(px, py, s * 0.28, 0, Math.PI * 2);
    c.fill();
  };
  for (let i = 0; i < 11; i++) {
    const t = Math.random();
    const px = x + 12 + Math.random() * (TILE - 24);
    const py = y + TILE * 0.18 + Math.random() * TILE * 0.7;
    flower(px, py, 11 + Math.random() * 8, t < 0.5 ? '#c9364a' : '#e8a0b0');
  }
}

function bambooGrove(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#cdbf98', '#bcae86');
  for (let i = 0; i < 6; i++) {
    const px = x + 18 + i * 42 + (Math.random() - 0.5) * 14;
    const w = 9 + Math.random() * 7;
    c.fillStyle = i % 2 ? '#4c6b30' : '#3d5726';
    c.fillRect(px, y, w, TILE);
    c.strokeStyle = '#2b3d1a';
    c.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const ny = y + 20 + k * 42 + Math.random() * 8;
      c.beginPath();
      c.moveTo(px, ny);
      c.lineTo(px + w, ny);
      c.stroke();
      if (Math.random() < 0.45) {
        c.fillStyle = '#5c7d3c';
        const dir = Math.random() < 0.5 ? -1 : 1;
        c.beginPath();
        c.ellipse(px + w / 2 + dir * 22, ny - 8, 22, 5, dir * 0.4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = i % 2 ? '#4c6b30' : '#3d5726';
      }
    }
  }
}

function koiWater(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#16324a', '#1e4262');
  c.strokeStyle = '#3f7096';
  c.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    for (let px = 0; px <= TILE; px += 8) {
      const py = y + i * 30 + Math.sin((px + i * 40) * 0.05) * 7;
      px === 0 ? c.moveTo(x + px, py) : c.lineTo(x + px, py);
    }
    c.stroke();
  }
  const koi = (px: number, py: number, s: number, col: string, ang: number) => {
    c.save();
    c.translate(px, py);
    c.rotate(ang);
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(0, 0, 34 * s, 13 * s, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-30 * s, 0);
    c.lineTo(-52 * s, -14 * s);
    c.lineTo(-46 * s, 0);
    c.lineTo(-52 * s, 14 * s);
    c.closePath();
    c.fill();
    c.fillStyle = '#e8e2d4';
    c.beginPath();
    c.ellipse(6 * s, -3 * s, 11 * s, 5 * s, 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0d1620';
    c.beginPath();
    c.arc(24 * s, -3 * s, 3 * s, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
  koi(x + TILE * 0.35, y + TILE * 0.38, 1.0, '#d4552a', 0.3);
  koi(x + TILE * 0.66, y + TILE * 0.7, 0.8, '#e8ddd0', -0.5);
}

function cloudBands(c: Ctx, x: number, y: number): void {
  goldLeaf(c, x, y);
  const band = (py: number, col: string, s: number) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x - 10, py + 26 * s);
    for (let px = -10; px <= TILE + 10; px += 26 * s) {
      c.arc(x + px, py, 15 * s, Math.PI, 0);
    }
    c.lineTo(x + TILE + 10, py + 26 * s);
    c.closePath();
    c.fill();
  };
  band(y + TILE * 0.12, '#e3dccb', 1.1);
  band(y + TILE * 0.34, '#c9bfa6', 0.85);
  band(y + TILE * 0.56, '#e3dccb', 1.2);
  band(y + TILE * 0.78, '#c9bfa6', 0.95);
  band(y + TILE * 0.96, '#e3dccb', 1.05);
}

function mountainSumi(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#ddd4c0', '#cfc4ac');
  // distant ranges, palest first
  const range = (baseY: number, h: number, col: string, seedOff: number) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x, y + baseY);
    for (let px = 0; px <= TILE; px += 16) {
      const t = px / TILE;
      const peak = Math.sin(t * 6 + seedOff) * 0.5 + Math.sin(t * 13 + seedOff * 2) * 0.3;
      c.lineTo(x + px, y + baseY - h * (0.5 + peak * 0.5));
    }
    c.lineTo(x + TILE, y + baseY);
    c.closePath();
    c.fill();
  };
  range(TILE * 0.62, 52, '#9aa4a8', 1.2);
  range(TILE * 0.78, 66, '#68747a', 2.7);
  range(TILE * 1.0, 78, '#39434a', 0.4);
  // mist bands
  c.globalAlpha = 0.55;
  c.fillStyle = '#ece5d5';
  c.fillRect(x, y + TILE * 0.55, TILE, 16);
  c.fillRect(x, y + TILE * 0.73, TILE, 12);
  c.globalAlpha = 1;
  // pale sun
  c.fillStyle = '#b8503a';
  c.beginPath();
  c.arc(x + TILE * 0.3, y + TILE * 0.26, 26, 0, Math.PI * 2);
  c.fill();
}

function mapleLeaves(c: Ctx, x: number, y: number): void {
  goldLeaf(c, x, y);
  const leaf = (px: number, py: number, s: number, col: string, rot: number) => {
    c.save();
    c.translate(px, py);
    c.rotate(rot);
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.6;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a - 0.16) * s, Math.sin(a - 0.16) * s);
      c.lineTo(Math.cos(a) * s * 1.25, Math.sin(a) * s * 1.25);
      c.lineTo(Math.cos(a + 0.16) * s, Math.sin(a + 0.16) * s);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, s * 0.6);
    c.stroke();
    c.restore();
  };
  for (let i = 0; i < 13; i++) {
    const cols = ['#b8321f', '#d4651f', '#e0932a', '#8f2417'];
    leaf(x + Math.random() * TILE, y + Math.random() * TILE,
      12 + Math.random() * 12, cols[(Math.random() * cols.length) | 0], Math.random() * 6.28);
  }
}

function chrysanthemum(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#8f2020', '#a02a2a');
  const mon = (px: number, py: number, s: number) => {
    c.fillStyle = '#e8d9a8';
    for (let ring = 2; ring >= 1; ring--) {
      const n = ring === 2 ? 16 : 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.2;
        c.beginPath();
        c.ellipse(px + Math.cos(a) * s * ring * 0.34, py + Math.sin(a) * s * ring * 0.34,
          s * 0.22, s * 0.1, a, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.fillStyle = '#c9a84e';
    c.beginPath();
    c.arc(px, py, s * 0.2, 0, Math.PI * 2);
    c.fill();
  };
  mon(x + TILE * 0.28, y + TILE * 0.3, 46);
  mon(x + TILE * 0.72, y + TILE * 0.62, 56);
  mon(x + TILE * 0.2, y + TILE * 0.82, 32);
}

function kikko(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#2b3a49', '#35485a');
  c.strokeStyle = '#b9a05a';
  c.lineWidth = 2;
  const r = 22;
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 8; col++) {
      const cx = x + col * r * 1.72 + (row % 2 ? r * 0.86 : 0);
      const cy = y + row * r * 1.5;
      c.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        k === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath();
      c.stroke();
    }
  }
}

function greatWave(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#dcd3bd', '#cbc2ab');
  c.fillStyle = '#1d3f63';
  c.beginPath();
  c.moveTo(x, y + TILE);
  c.bezierCurveTo(x + TILE * 0.1, y + TILE * 0.45, x + TILE * 0.45, y + TILE * 0.2, x + TILE * 0.78, y + TILE * 0.44);
  c.bezierCurveTo(x + TILE * 0.6, y + TILE * 0.3, x + TILE * 0.3, y + TILE * 0.6, x + TILE, y + TILE);
  c.closePath();
  c.fill();
  // foam claws
  c.fillStyle = '#f0ece0';
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    const px = x + TILE * (0.16 + t * 0.6);
    const py = y + TILE * (0.62 - Math.sin(t * 3.1) * 0.28);
    c.beginPath();
    c.arc(px, py, 12 - t * 6, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + 16, py - 20);
    c.lineTo(px + 5, py - 4);
    c.closePath();
    c.fill();
  }
  c.fillStyle = '#2c557e';
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.arc(x + TILE * (0.1 + i * 0.2), y + TILE * 0.92, 16, Math.PI, 0);
    c.fill();
  }
}

function tigerScreen(c: Ctx, x: number, y: number): void {
  goldLeaf(c, x, y);
  // bamboo behind
  c.fillStyle = '#3f5a28';
  for (let i = 0; i < 4; i++) c.fillRect(x + 24 + i * 62, y, 8, TILE);
  // stylised tiger
  c.fillStyle = '#d99a3c';
  c.beginPath();
  c.ellipse(x + TILE * 0.5, y + TILE * 0.64, 74, 40, -0.08, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(x + TILE * 0.76, y + TILE * 0.46, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#241a10';
  for (let i = 0; i < 7; i++) {
    c.save();
    c.translate(x + TILE * 0.3 + i * 20, y + TILE * 0.62);
    c.rotate(0.35);
    c.fillRect(-3, -26, 6, 52);
    c.restore();
  }
  // ears + eyes
  c.fillStyle = '#d99a3c';
  c.beginPath();
  c.arc(x + TILE * 0.68, y + TILE * 0.3, 11, 0, Math.PI * 2);
  c.arc(x + TILE * 0.87, y + TILE * 0.33, 11, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f2ead8';
  c.beginPath();
  c.arc(x + TILE * 0.72, y + TILE * 0.46, 7, 0, Math.PI * 2);
  c.arc(x + TILE * 0.84, y + TILE * 0.47, 7, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1a1208';
  c.beginPath();
  c.arc(x + TILE * 0.72, y + TILE * 0.46, 3.4, 0, Math.PI * 2);
  c.arc(x + TILE * 0.84, y + TILE * 0.47, 3.4, 0, Math.PI * 2);
  c.fill();
  // tail
  c.strokeStyle = '#d99a3c';
  c.lineWidth = 13;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x + TILE * 0.22, y + TILE * 0.68);
  c.quadraticCurveTo(x - 4, y + TILE * 0.5, x + TILE * 0.1, y + TILE * 0.28);
  c.stroke();
}

function dragonCoil(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#161a22', '#1f2530');
  c.strokeStyle = '#c9b06a';
  c.lineWidth = 12;
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const a = t * Math.PI * 3.2;
    const r = 20 + t * 82;
    const px = x + TILE * 0.5 + Math.cos(a) * r * 0.8;
    const py = y + TILE * 0.55 + Math.sin(a) * r * 0.55;
    i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
  }
  c.stroke();
  // scales along the body
  c.strokeStyle = '#8a7434';
  c.lineWidth = 2;
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const a = t * Math.PI * 3.2;
    const r = 20 + t * 82;
    const px = x + TILE * 0.5 + Math.cos(a) * r * 0.8;
    const py = y + TILE * 0.55 + Math.sin(a) * r * 0.55;
    c.beginPath();
    c.arc(px, py, 7, 0, Math.PI);
    c.stroke();
  }
  // head
  c.fillStyle = '#e0c479';
  c.beginPath();
  c.ellipse(x + TILE * 0.5 + Math.cos(0) * 16, y + TILE * 0.55, 22, 15, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#b3321c';
  c.beginPath();
  c.arc(x + TILE * 0.56, y + TILE * 0.52, 4.5, 0, Math.PI * 2);
  c.fill();
  // flame wisps
  c.strokeStyle = '#b3321c';
  c.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.beginPath();
    c.moveTo(x + TILE * 0.5 + Math.cos(a) * 96, y + TILE * 0.55 + Math.sin(a) * 66);
    c.lineTo(x + TILE * 0.5 + Math.cos(a) * 118, y + TILE * 0.55 + Math.sin(a) * 82);
    c.stroke();
  }
}

function calligraphy(c: Ctx, x: number, y: number): void {
  ground(c, x, y, '#e6dcc6', '#d5cab2');
  c.strokeStyle = '#1c1610';
  c.lineCap = 'round';
  // vertical column of abstract brush strokes
  let py = y + 26;
  for (let i = 0; i < 5; i++) {
    const cx = x + TILE * 0.5 + (Math.random() - 0.5) * 14;
    c.lineWidth = 7 + Math.random() * 6;
    c.beginPath();
    c.moveTo(cx - 18, py);
    c.lineTo(cx + 20, py + 4);
    c.stroke();
    c.lineWidth = 5 + Math.random() * 5;
    c.beginPath();
    c.moveTo(cx + 2, py - 8);
    c.quadraticCurveTo(cx + 8, py + 16, cx - 12, py + 34);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - 14, py + 12);
    c.lineTo(cx + 16, py + 30);
    c.stroke();
    py += 46;
  }
  // red seal
  c.fillStyle = '#a52a1e';
  c.fillRect(x + TILE * 0.62, y + TILE * 0.78, 30, 30);
  c.fillStyle = '#e6dcc6';
  c.lineWidth = 3;
  c.strokeStyle = '#e6dcc6';
  c.strokeRect(x + TILE * 0.62 + 6, y + TILE * 0.78 + 6, 18, 18);
}

const PAINTERS: ((c: Ctx, x: number, y: number) => void)[] = [
  seigaiha, asanoha, craneMoon, pineBranch,
  plumBlossom, bambooGrove, koiWater, cloudBands,
  mountainSumi, mapleLeaves, chrysanthemum, kikko,
  greatWave, tigerScreen, dragonCoil, calligraphy,
];

/** Tile indices grouped by where they belong. */
export const ART = {
  /** quiet repeating patterns — good for large wall fields */
  PATTERN: [0, 1, 7, 11],
  /** feature paintings — fusuma panels, screens, shrine walls */
  SCENE: [2, 3, 4, 5, 6, 8, 9, 12, 13, 14],
  /** formal / heraldic */
  FORMAL: [10, 15],
};

let atlas: THREE.CanvasTexture | null = null;

export function getArtAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = TILE * ART_TILES;
  canvas.height = TILE * ART_TILES;
  const c = canvas.getContext('2d')!;
  for (let i = 0; i < PAINTERS.length; i++) {
    const tx = (i % ART_TILES) * TILE;
    const ty = Math.floor(i / ART_TILES) * TILE;
    c.save();
    c.beginPath();
    c.rect(tx, ty, TILE, TILE);
    c.clip();
    PAINTERS[i](c, tx, ty);
    c.restore();
  }
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.needsUpdate = true;
  return atlas;
}
