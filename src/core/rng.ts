// Deterministic hashing + RNG. All world generation flows through these —
// no Math.random in anything that affects world content.

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Well-mixed 32-bit hash of a 3D integer coordinate + seed. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (z | 0), 0x27d4eb2f);
  h = (h << 13) | (h >>> 19);
  h ^= h >>> 16;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** hash3 mapped to [0, 1). */
export function rand3(x: number, y: number, z: number, seed: number): number {
  return hash3(x, y, z, seed) / 4294967296;
}

/** Seeded RNG stream for a cell (+ salt so different subsystems decorrelate). */
export function rngFor(x: number, y: number, z: number, seed: number, salt: number): () => number {
  return mulberry32(hash3(x, y, z, seed ^ Math.imul(salt, 0x9e3779b1)) | 0);
}

function smoother(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Trilinear value noise in [0,1] over a hashed integer lattice. */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smoother(x - xi), yf = smoother(y - yi), zf = smoother(z - zi);
  const c = (dx: number, dy: number, dz: number) => rand3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * xf;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * xf;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * xf;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

/** Parse seed from string (numeric or text). */
export function seedFromString(s: string): number {
  const n = Number(s);
  if (Number.isFinite(n) && s.trim() !== '') return n | 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) | 0;
}
