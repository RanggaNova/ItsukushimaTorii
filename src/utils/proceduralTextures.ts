import * as THREE from 'three';

// Fast deterministic hash for startup texture generation (runs once in ~8ms)
function hash2(ix: number, iy: number, seed: number): number {
  const n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  const m = (n ^ (n >>> 13)) * 1274126177;
  return ((m ^ (m >>> 16)) >>> 0) / 4294967296;
}

function tileableValueNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const x0 = ((ix % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((iy % period) + period) % period;
  const y1 = (y0 + 1) % period;

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function tileableFBM(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileableValueNoise(u, v, p, seed + i * 31);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

let cachedNoiseTex: THREE.DataTexture | null = null;
let cachedCloudTex: THREE.DataTexture | null = null;

/**
 * 256x256 Seamless Tileable RGBA Noise Texture:
 * R = Smooth 5-octave FBM
 * G = Shifted 5-octave FBM (for curl/domain warping & aurora curtains)
 * B = Sharp ridged turbulence (1 - |2n - 1|) for aurora rays & portal filaments
 * A = Fine high-frequency shimmer
 */
export function getSharedNoiseTexture(): THREE.DataTexture {
  if (cachedNoiseTex) return cachedNoiseTex;

  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const f1 = tileableFBM(u, v, 4, 5, 101);
      const f2 = tileableFBM(u, v, 6, 5, 307);
      const rawRidge = tileableFBM(u, v, 8, 4, 509);
      const ridge = 1.0 - Math.abs(rawRidge * 2.0 - 1.0);
      const fine = tileableFBM(u, v, 16, 3, 773);

      const idx = (y * size + x) * 4;
      data[idx + 0] = Math.round(f1 * 255);
      data[idx + 1] = Math.round(f2 * 255);
      data[idx + 2] = Math.round(Math.pow(ridge, 1.5) * 255);
      data[idx + 3] = Math.round(fine * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  cachedNoiseTex = tex;
  return tex;
}

/**
 * 128x128 Pre-baked Soft Volumetric Cloud Sprite Texture (eliminates per-pixel 3D FBM in Mist!)
 */
export function getMistCloudSpriteTexture(): THREE.DataTexture {
  if (cachedCloudTex) return cachedCloudTex;

  const size = 128;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const ny = v * 2.0 - 1.0;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const nx = u * 2.0 - 1.0;
      const r2 = nx * nx + ny * ny;

      let alpha = 0;
      if (r2 < 1.0) {
        const radial = Math.pow(1.0 - r2, 2.1);
        const fbm = tileableFBM(u, v, 3, 4, 919);
        const wispy = THREE.MathUtils.smoothstep(fbm, 0.22, 0.82);
        alpha = radial * (0.35 + 0.65 * wispy);
      }

      const idx = (y * size + x) * 4;
      data[idx + 0] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  cachedCloudTex = tex;
  return tex;
}
