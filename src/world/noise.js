/**
 * Tiny, dependency-free, deterministic 2D value noise + fBm.
 *
 * Deterministic hashing matters here: the same seed must produce the same
 * terrain on every machine, because gameplay code (walking, riding) samples
 * the height *function* analytically instead of raycasting the mesh.
 */

/** Returns a 2D value-noise function in [-1, 1] for a given integer seed. */
export function makeNoise2D(seed = 1337) {
  // 32-bit integer hash (xxHash-style avalanche) → [0, 1)
  function hash(ix, iy) {
    let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  return function noise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    // Smoothstep interpolation weights
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    // Bilinear blend of the four corners, remapped to [-1, 1]
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  };
}

/** Fractal Brownian motion: layered octaves of a noise function, in ~[-1, 1]. */
export function fbm(noise, x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged fBm in [0, 1] — sharp crests, used for the mountain ring. */
export function ridged(noise, x, y, octaves = 5) {
  return 1 - Math.abs(fbm(noise, x, y, octaves));
}
