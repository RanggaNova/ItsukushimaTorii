import * as THREE from 'three';

// Fast deterministic hash for startup texture generation
function hash2(ix: number, iy: number, seed: number): number {
  const n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  const m = (n ^ (n >>> 13)) * 1274126177;
  return ((m ^ (m >>> 16)) >>> 0) / 4294967296;
}

function tileableValueNoise(
  u: number,
  v: number,
  period: number,
  seed: number,
  periodY: number = period
): number {
  const x = u * period;
  const y = v * periodY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const x0 = ((ix % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((iy % periodY) + periodY) % periodY;
  const y1 = (y0 + 1) % periodY;

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

// Seamless tileable Voronoi / Cellular evaluator returning { f1, f2, cellId }
function tileableVoronoi(
  u: number,
  v: number,
  cells: number,
  seed: number
): { f1: number; f2: number; cellId: number } {
  const gx = u * cells;
  const gy = v * cells;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;

  let d1 = 999.0;
  let d2 = 999.0;
  let bestId = 0.5;

  for (let oy = -1; oy <= 1; oy++) {
    const cy = (((iy + oy) % cells) + cells) % cells;
    for (let ox = -1; ox <= 1; ox++) {
      const cx = (((ix + ox) % cells) + cells) % cells;
      const jx = ox + 0.14 + 0.72 * hash2(cx, cy, seed);
      const jy = oy + 0.14 + 0.72 * hash2(cx, cy, seed + 17);
      const dx = jx - fx;
      const dy = jy - fy;
      const d = Math.hypot(dx, dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        bestId = hash2(cx, cy, seed + 53);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return { f1: d1, f2: d2, cellId: bestId };
}

let cachedNoiseTex: THREE.DataTexture | null = null;
let cachedCloudTex: THREE.DataTexture | null = null;
let cachedMtnDetail: {
  rockDetailTex: THREE.DataTexture;
  forestCanopyTex: THREE.DataTexture;
} | null = null;

/**
 * 256x256 Seamless Tileable RGBA Noise Texture
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
 * 128x128 Pre-baked Soft Volumetric Cloud Sprite Texture
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

function packSobelNormalDetailTex(
  heights: Float32Array,
  albedoVar: Float32Array,
  aoVals: Float32Array,
  size: number,
  slopeStrength: number
): THREE.DataTexture {
  const out = new Uint8Array(size * size * 4);
  const scale = size * 0.055 * slopeStrength;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const idx = y * size + x;

      const tl = heights[yp * size + xm];
      const tc = heights[yp * size + x];
      const tr = heights[yp * size + xp];
      const ml = heights[y * size + xm];
      const mr = heights[y * size + xp];
      const bl = heights[ym * size + xm];
      const bc = heights[ym * size + x];
      const br = heights[ym * size + xp];

      const dX = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) * 0.125 * scale;
      const dY = ((tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br)) * 0.125 * scale;

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len;
      ny /= len;

      const i4 = idx * 4;
      out[i4 + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i4 + 2] = Math.max(0, Math.min(255, Math.round(albedoVar[idx] * 255)));
      out[i4 + 3] = Math.max(0, Math.min(255, Math.round(aoVals[idx] * 255)));
    }
  }

  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates HD 512x512 Analytical Sobel Terrain Detail Maps for Realistic Japanese Mountains:
 * 1. rockDetailTex: Voronoi-fractured granite cliff blocks, stepped strata ledges & deep fissures
 * 2. forestCanopyTex: Individual 3D Sugi/Matsu conifer & maple tree-crown domes + per-tree species ID + gap AO
 */
export function getMountainDetailTextures(): {
  rockDetailTex: THREE.DataTexture;
  forestCanopyTex: THREE.DataTexture;
} {
  if (cachedMtnDetail) return cachedMtnDetail;

  const size = 384;
  const rockH = new Float32Array(size * size);
  const rockAlb = new Float32Array(size * size);
  const rockAO = new Float32Array(size * size);

  const treeH = new Float32Array(size * size);
  const treeSpecies = new Float32Array(size * size);
  const treeAO = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;

      // --- A. FRACTURED GRANITE CLIFF ROCK & STEPPED STRATA ---
      const warp = tileableFBM(u, v, 6, 3, 211);
      const vor1 = tileableVoronoi(u + (warp - 0.5) * 0.06, v * 0.85, 10, 313);
      const vor2 = tileableVoronoi(u * 1.0, v + (warp - 0.5) * 0.05, 22, 419);

      // Sharp rock fracture cracks where (f2 - f1) approaches 0
      const crack1 = THREE.MathUtils.smoothstep(vor1.f2 - vor1.f1, 0.015, 0.14);
      const crack2 = THREE.MathUtils.smoothstep(vor2.f2 - vor2.f1, 0.012, 0.12);
      const fractures = crack1 * (0.65 + 0.35 * crack2);

      // Stepped geological rock strata ledges + vertical rainwater erosion chutes
      const strataPhase = (v * 9.0 + (warp - 0.5) * 1.4) % 1.0;
      const strataStep = THREE.MathUtils.smoothstep(strataPhase, 0.06, 0.82);
      const vertChute = 1.0 - Math.abs(tileableValueNoise(u, v, 18, 521, 4) * 2.0 - 1.0);

      const blockStep = 0.35 + 0.65 * vor1.cellId;
      const rHeight = fractures * (blockStep * 0.48 + strataStep * 0.34 + vertChute * 0.18);

      rockH[idx] = rHeight;
      rockAlb[idx] = THREE.MathUtils.clamp(
        0.35 + 0.38 * vor1.cellId + 0.27 * strataStep,
        0.05,
        0.98
      );
      rockAO[idx] = THREE.MathUtils.clamp(0.32 + 0.68 * fractures * (0.72 + 0.28 * vertChute), 0.18, 1.0);

      // --- B. INDIVIDUAL 3D JAPANESE SUGI / MATSU / MOMIJI TREE CROWNS ---
      const crown1 = tileableVoronoi(u, v, 20, 617);
      const crown2 = tileableVoronoi(u + 0.037, v + 0.023, 38, 733);
      const foliageSprig = tileableFBM(u, v, 48, 3, 829);

      // Hemispherical conifer crown dome per cell!
      const normDist1 = Math.min(1.0, crown1.f1 / 0.64);
      const dome1 = Math.sqrt(Math.max(0.0, 1.0 - normDist1 * normDist1));
      const normDist2 = Math.min(1.0, crown2.f1 / 0.66);
      const dome2 = Math.sqrt(Math.max(0.0, 1.0 - normDist2 * normDist2));

      const crownHeight = dome1 * (0.68 + 0.32 * crown1.cellId) * 0.68 + dome2 * 0.20 + foliageSprig * 0.14;
      const canopyGapAO = THREE.MathUtils.smoothstep(crown1.f2 - crown1.f1, 0.01, 0.18);

      treeH[idx] = crownHeight;
      // Store discrete per-tree species ID so whole tree crowns turn autumn crimson/gold or spring sakura!
      treeSpecies[idx] = crown1.cellId;
      treeAO[idx] = THREE.MathUtils.clamp(
        (0.30 + 0.70 * dome1) * (0.55 + 0.45 * canopyGapAO),
        0.20,
        1.0
      );
    }
  }

  cachedMtnDetail = {
    rockDetailTex: packSobelNormalDetailTex(rockH, rockAlb, rockAO, size, 1.35),
    forestCanopyTex: packSobelNormalDetailTex(treeH, treeSpecies, treeAO, size, 1.45),
  };
  return cachedMtnDetail;
}
