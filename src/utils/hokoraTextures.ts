import * as THREE from 'three';

export interface PBRTextureTriplet {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

export interface HokoraTextureSet {
  granite: PBRTextureTriplet;
  darkWood: PBRTextureTriplet;
  redWood: PBRTextureTriplet;
  copperTile: PBRTextureTriplet;
  strawRope: PBRTextureTriplet;
  indigoCurtainMap: THREE.CanvasTexture;
  indigoCurtainNormal: THREE.DataTexture;
  lanternWashiMap: THREE.CanvasTexture;
}

let cachedSet: HokoraTextureSet | null = null;

function hash2(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function tileNoise(x: number, y: number, periodX: number, periodY: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);

  const x0 = ((ix % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;
  const y0 = ((iy % periodY) + periodY) % periodY;
  const y1 = (y0 + 1) % periodY;

  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbmTile(u: number, v: number, freqX: number, freqY: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let fx = freqX;
  let fy = freqY;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileNoise(u * fx, v * fy, fx, fy, seed + o * 17);
    fx *= 2;
    fy *= 2;
    amp *= 0.5;
  }
  return sum;
}

function finalizeCanvasTexture(
  canvas: HTMLCanvasElement,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function heightToNormalRoughness(
  heights: Float32Array,
  roughVals: Float32Array,
  size: number,
  strength: number,
  repeatX = 1,
  repeatY = 1
): { normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture } {
  const normData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const idx = y * size + x;

      const dX = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dY = (heights[yp * size + x] - heights[ym * size + x]) * strength;

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len;
      ny /= len;
      nz /= len;

      const i4 = idx * 4;
      normData[i4 + 0] = Math.round((nx * 0.5 + 0.5) * 255);
      normData[i4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normData[i4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normData[i4 + 3] = 255;

      const rv = Math.max(0, Math.min(255, Math.round(roughVals[idx] * 255)));
      roughData[i4 + 0] = rv;
      roughData[i4 + 1] = rv;
      roughData[i4 + 2] = rv;
      roughData[i4 + 3] = 255;
    }
  }

  const normalMap = new THREE.DataTexture(normData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeatX, repeatY);
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatX, repeatY);
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

// ============================================================================
// 1. 1024x1024 HD CARVED JAPANESE GRANITE MASONRY (Smooth mineral mottling, NO TV-static!)
// ============================================================================
function buildGraniteTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base carved warm-cool Mikage-ishi grey stone
  ctx.fillStyle = '#8b9094';
  ctx.fillRect(0, 0, size, size);

  let rng = 104729;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  // Multi-scale soft mineral clouds (feldspar, quartz & dark biotite clusters — smooth & natural!)
  for (let i = 0; i < 2200; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rad = 6 + rand() * 28;
    const isDark = rand() < 0.48;
    const alpha = 0.03 + rand() * 0.05;
    ctx.fillStyle = isDark ? `rgba(38, 42, 46, ${alpha})` : `rgba(215, 220, 224, ${alpha})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine smooth granite crystal flecks (2..5px soft dots instead of harsh 1px noise!)
  for (let i = 0; i < 6500; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rad = 1.4 + rand() * 2.8;
    const roll = rand();
    if (roll < 0.42) {
      ctx.fillStyle = `rgba(34, 38, 42, ${0.14 + rand() * 0.18})`;
    } else if (roll < 0.78) {
      ctx.fillStyle = `rgba(198, 204, 208, ${0.12 + rand() * 0.16})`;
    } else {
      ctx.fillStyle = `rgba(128, 122, 112, ${0.10 + rand() * 0.12})`;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chiseled stone dressing marks (subtle horizontal mason strokes)
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 10 + rand() * 26;
    ctx.strokeStyle =
      rand() < 0.5 ? 'rgba(40, 44, 48, 0.08)' : 'rgba(220, 225, 230, 0.07)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 2.0);
    ctx.stroke();
  }

  // Carved Ashlar Stone Block Courses (3 rows x 3 staggered blocks with beveled chamfers & mortar!)
  const rows = 3;
  const cols = 3;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    const xOff = (r % 2) * (colW * 0.5);

    // Subtle per-block tonal variation + rainwater weathering gradient from mortar joints
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + xOff;
      const shade = (rand() - 0.5) * 22;
      ctx.fillStyle =
        shade > 0
          ? `rgba(230, 234, 238, ${shade / 255})`
          : `rgba(25, 30, 36, ${-shade / 255})`;
      ctx.fillRect(bx + 4, y0 + 4, colW - 8, rowH - 8);

      // Damp rainwater/moss AO along bottom of each stone course
      const dampGrad = ctx.createLinearGradient(0, y0 + rowH - 36, 0, y0 + rowH);
      dampGrad.addColorStop(0, 'rgba(24, 30, 28, 0)');
      dampGrad.addColorStop(1, 'rgba(22, 28, 26, 0.28)');
      ctx.fillStyle = dampGrad;
      ctx.fillRect(bx, y0 + rowH - 36, colW, 36);

      // Crisp bright top bevel chamfer along each block
      const hiGrad = ctx.createLinearGradient(0, y0 + 4, 0, y0 + 18);
      hiGrad.addColorStop(0, 'rgba(235, 240, 245, 0.24)');
      hiGrad.addColorStop(1, 'rgba(235, 240, 245, 0)');
      ctx.fillStyle = hiGrad;
      ctx.fillRect(bx + 5, y0 + 4, colW - 10, 14);

      // Vertical recessed mortar joint
      ctx.fillStyle = 'rgba(24, 27, 31, 0.72)';
      ctx.fillRect(bx - 3, y0, 6, rowH);
    }

    // Horizontal recessed mortar joint
    ctx.fillStyle = 'rgba(20, 23, 27, 0.78)';
    ctx.fillRect(0, y0 - 3, size, 6);
  }

  // Smooth 512x512 Normal & Roughness map matching the exact 3x3 staggered ashlar blocks!
  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const v = y / nSize;
    const rIdx = Math.floor(v * rows);
    const rv = v * rows - rIdx;
    const hJoint = THREE.MathUtils.smoothstep(Math.min(rv, 1.0 - rv), 0.008, 0.036);

    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const stagU = (u + (rIdx % 2) * (0.5 / cols)) % 1.0;
      const cv = stagU * cols - Math.floor(stagU * cols);
      const vJoint = THREE.MathUtils.smoothstep(Math.min(cv, 1.0 - cv), 0.008, 0.032);
      const blockBevel = Math.min(hJoint, vJoint);

      const macroStone = fbmTile(u, v, 10, 10, 19, 4);
      const chisel = fbmTile(u, v, 28, 28, 43, 3);
      const idx = y * nSize + x;
      heights[idx] = blockBevel * (0.55 + 0.30 * macroStone + 0.15 * chisel);
      rough[idx] = 0.76 + 0.16 * (1.0 - macroStone) + (1.0 - blockBevel) * 0.10;
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 4.2, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 2. 1024x1024 HD AGED DARK TIMBER (Yakisugi / Espresso Cedar Planks + Grain Checks)
// ============================================================================
function buildDarkWoodTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#251e1a';
  ctx.fillRect(0, 0, size, size);

  let rng = 223344;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  const planks = 5;
  const plankW = size / planks;

  for (let p = 0; p < planks; p++) {
    const px = p * plankW;
    // Slight warm/cool espresso tone per plank
    const pGrad = ctx.createLinearGradient(px, 0, px + plankW, 0);
    pGrad.addColorStop(0.0, '#181310');
    pGrad.addColorStop(0.12, p % 2 === 0 ? '#2b221c' : '#261e19');
    pGrad.addColorStop(0.50, p % 2 === 0 ? '#332820' : '#2d231d');
    pGrad.addColorStop(0.88, '#261e18');
    pGrad.addColorStop(1.0, '#16110e');
    ctx.fillStyle = pGrad;
    ctx.fillRect(px, 0, plankW, size);

    // Organic flowing vertical wood-grain growth fibers
    for (let g = 0; g < 95; g++) {
      const gx = px + 6 + rand() * (plankW - 12);
      const waveAmp = 2 + rand() * 7;
      const waveFreq = (1 + Math.floor(rand() * 3)) * Math.PI * 2;
      const phase = rand() * Math.PI * 2;
      const isLightGrain = rand() < 0.42;
      ctx.strokeStyle = isLightGrain
        ? `rgba(92, 70, 52, ${0.09 + rand() * 0.12})`
        : `rgba(12, 9, 7, ${0.14 + rand() * 0.18})`;
      ctx.lineWidth = 0.9 + rand() * 2.0;
      ctx.beginPath();
      for (let sy = 0; sy <= size; sy += 16) {
        const wx = gx + Math.sin((sy / size) * waveFreq + phase) * waveAmp;
        if (sy === 0) ctx.moveTo(wx, sy);
        else ctx.lineTo(wx, sy);
      }
      ctx.stroke();
    }

    // Authentic weathered wood-check split lines ("Roof Detail" close-up!)
    for (let c = 0; c < 3; c++) {
      const cx = px + 24 + rand() * (plankW - 48);
      const cy = rand() * (size * 0.7);
      const cLen = 90 + rand() * 180;
      ctx.strokeStyle = 'rgba(8, 6, 5, 0.72)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + (rand() - 0.5) * 10, cy + cLen * 0.5, cx + (rand() - 0.5) * 6, cy + cLen);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(86, 66, 48, 0.22)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy);
      ctx.lineTo(cx + 2, cy + cLen);
      ctx.stroke();
    }

    // Crisp recessed plank seam
    ctx.fillStyle = 'rgba(8, 6, 5, 0.85)';
    ctx.fillRect(px - 2, 0, 4, size);
  }

  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const v = y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const pv = u * planks - Math.floor(u * planks);
      const seam = THREE.MathUtils.smoothstep(Math.min(pv, 1.0 - pv), 0.008, 0.032);
      const fiber = fbmTile(u, v, 40, 5, 61, 4);
      const rings = 0.5 + 0.5 * Math.sin((u * 28.0 + fiber * 3.5) * Math.PI);
      const idx = y * nSize + x;
      heights[idx] = seam * (0.45 + 0.35 * fiber + 0.20 * rings);
      rough[idx] = 0.64 + 0.22 * (1.0 - rings) + (1.0 - seam) * 0.12;
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 3.4, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 3. 1024x1024 HD WEATHERED VERMILION LACQUERED CEDAR (Rich Shinto Shu-iro + Edge Patina)
// ============================================================================
function buildRedWoodTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#9e1f17';
  ctx.fillRect(0, 0, size, size);

  let rng = 556677;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  const planks = 6;
  const plankW = size / planks;

  for (let p = 0; p < planks; p++) {
    const px = p * plankW;
    const pGrad = ctx.createLinearGradient(px, 0, px + plankW, 0);
    pGrad.addColorStop(0.0, '#6e130e');
    pGrad.addColorStop(0.10, '#a62219');
    pGrad.addColorStop(0.50, p % 2 === 0 ? '#b8291e' : '#ad241a');
    pGrad.addColorStop(0.90, '#9c1e16');
    pGrad.addColorStop(1.0, '#68110c');
    ctx.fillStyle = pGrad;
    ctx.fillRect(px, 0, plankW, size);

    // Subtle vertical cedar grain visible beneath traditional vermilion pigment
    for (let g = 0; g < 80; g++) {
      const gx = px + 4 + rand() * (plankW - 8);
      const amp = 1.5 + rand() * 4.5;
      const phase = rand() * Math.PI * 2;
      ctx.strokeStyle =
        rand() < 0.5
          ? `rgba(54, 8, 5, ${0.08 + rand() * 0.12})`
          : `rgba(222, 74, 52, ${0.06 + rand() * 0.09})`;
      ctx.lineWidth = 1.0 + rand() * 1.8;
      ctx.beginPath();
      for (let sy = 0; sy <= size; sy += 20) {
        const wx = gx + Math.sin((sy / size) * Math.PI * 4 + phase) * amp;
        if (sy === 0) ctx.moveTo(wx, sy);
        else ctx.lineTo(wx, sy);
      }
      ctx.stroke();
    }

    // Subtle aged soot/weathering darkening toward top & bottom ends
    const topAge = ctx.createLinearGradient(0, 0, 0, 140);
    topAge.addColorStop(0, 'rgba(24, 6, 4, 0.34)');
    topAge.addColorStop(1, 'rgba(24, 6, 4, 0)');
    ctx.fillStyle = topAge;
    ctx.fillRect(px, 0, plankW, 140);

    ctx.fillStyle = 'rgba(38, 6, 4, 0.72)';
    ctx.fillRect(px - 1.5, 0, 3, size);
  }

  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const v = y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const pv = u * planks - Math.floor(u * planks);
      const seam = THREE.MathUtils.smoothstep(Math.min(pv, 1.0 - pv), 0.006, 0.025);
      const fiber = fbmTile(u, v, 44, 6, 89, 4);
      const patina = fbmTile(u, v, 8, 8, 103, 3);
      const idx = y * nSize + x;
      heights[idx] = seam * (0.58 + 0.42 * fiber);
      rough[idx] = 0.42 + 0.24 * (1.0 - patina) + (1.0 - seam) * 0.16;
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 2.6, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 4. 1024x1024 HD PATINATED VERDIGRIS COPPER-GREEN SHINGLE TILES (Ichimonji-buki)
// ============================================================================
function buildCopperTileTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2d4e48';
  ctx.fillRect(0, 0, size, size);

  let rng = 889911;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  const rows = 10;
  const cols = 6;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    const xOff = (r % 2) * (colW * 0.5);

    for (let c = -1; c <= cols; c++) {
      const x0 = c * colW + xOff;
      // Rich tile-by-tile oxidized copper-patina palette (aged bronze + emerald/turquoise verdigris!)
      const verdigrisShift = (rand() - 0.5) * 26;
      const gBase = Math.round(112 + verdigrisShift);
      const bBase = Math.round(98 + verdigrisShift * 0.85);
      const rBase = Math.round(52 + verdigrisShift * 0.35);

      const tileGrad = ctx.createLinearGradient(0, y0, 0, y0 + rowH);
      tileGrad.addColorStop(0.0, `rgb(${Math.max(24, rBase - 22)}, ${Math.max(42, gBase - 34)}, ${Math.max(38, bBase - 30)})`);
      tileGrad.addColorStop(0.28, `rgb(${rBase}, ${gBase}, ${bBase})`);
      tileGrad.addColorStop(0.86, `rgb(${rBase + 16}, ${gBase + 24}, ${bBase + 18})`);
      tileGrad.addColorStop(1.0, `rgb(30, 44, 40)`);
      ctx.fillStyle = tileGrad;
      ctx.fillRect(x0 + 2, y0 + 2, colW - 4, rowH - 4);

      // Organic verdigris oxidation blotches & rain streaks per copper shingle
      for (let m = 0; m < 16; m++) {
        const mx = x0 + 8 + rand() * (colW - 16);
        const my = y0 + 8 + rand() * (rowH - 16);
        const mr = 6 + rand() * 20;
        const isTurquoise = rand() < 0.62;
        ctx.fillStyle = isTurquoise
          ? `rgba(116, 186, 164, ${0.06 + rand() * 0.10})`
          : `rgba(42, 36, 30, ${0.07 + rand() * 0.10})`;
        ctx.beginPath();
        ctx.ellipse(mx, my, mr * 0.7, mr * 1.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright oxidized copper-edge highlight along shingle lip
      ctx.fillStyle = 'rgba(154, 214, 192, 0.30)';
      ctx.fillRect(x0 + 3, y0 + rowH - 7, colW - 6, 3);

      // Vertical shingle seam
      ctx.fillStyle = 'rgba(16, 24, 22, 0.76)';
      ctx.fillRect(x0 - 1.5, y0, 3, rowH);
    }

    // Crisp horizontal shingle overlap cast shadow!
    const shadowGrad = ctx.createLinearGradient(0, y0, 0, y0 + 18);
    shadowGrad.addColorStop(0, 'rgba(10, 16, 15, 0.72)');
    shadowGrad.addColorStop(1, 'rgba(10, 16, 15, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, y0, size, 18);
  }

  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    // Flip V slightly so Canvas top-to-bottom matches UV coordinates cleanly
    const v = 1.0 - y / nSize;
    const rf = v * rows;
    const rIdx = Math.floor(rf);
    const rv = rf - rIdx;

    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const stagU = (u + (rIdx % 2) * (0.5 / cols)) % 1.0;
      const cv = stagU * cols - Math.floor(stagU * cols);
      const vSeam = THREE.MathUtils.smoothstep(Math.min(cv, 1.0 - cv), 0.008, 0.028);
      const stepProfile = 0.25 + 0.70 * (1.0 - rv);
      const patina = fbmTile(u, v, 14, 14, 151, 4);

      const idx = y * nSize + x;
      heights[idx] = vSeam * stepProfile + patina * 0.08;
      rough[idx] = 0.38 + 0.30 * patina + (rv < 0.12 ? 0.18 : 0.0);
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 4.0, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 5. 512x256 HD GOLDEN RICE-STRAW SHIMENAWA TEXTURE
// ============================================================================
function buildStrawRopeTextures(): PBRTextureTriplet {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#9c7840';
  ctx.fillRect(0, 0, w, h);

  for (let i = -h; i < w + h; i += 4) {
    const lum = 0.65 + 0.35 * Math.sin((i / 36) * Math.PI * 2);
    ctx.strokeStyle = `rgb(${Math.round(208 * lum)}, ${Math.round(164 * lum)}, ${Math.round(92 * lum)})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h * 0.65, h);
    ctx.stroke();
  }

  const nSize = 256;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const v = y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const twist = Math.abs(Math.sin((u * 8.0 + v * 4.0) * Math.PI));
      const straw = fbmTile(u, v, 36, 18, 197, 3);
      const idx = y * nSize + x;
      heights[idx] = twist * 0.72 + straw * 0.28;
      rough[idx] = 0.74 + 0.18 * (1.0 - straw);
    }
  }

  const map = finalizeCanvasTexture(canvas, 3, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 3.0, 3, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 6. 1024x512 HD INDIGO TOBARI CURTAIN + CRISP VECTOR SHINMON CRESTS + DRAPE AO
// ============================================================================
function buildIndigoCurtainTextures(): {
  indigoCurtainMap: THREE.CanvasTexture;
  indigoCurtainNormal: THREE.DataTexture;
} {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Deep natural Ai-zome indigo gradient (darker under the roof eave at top!)
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0.0, '#10132c');
  grad.addColorStop(0.22, '#1d2450');
  grad.addColorStop(0.68, '#263068');
  grad.addColorStop(1.0, '#161b3e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Shaded vertical cloth drape folds for rich 3D fabric depth!
  for (let x = 0; x < width; x++) {
    const u = x / width;
    const pleat = Math.sin(u * Math.PI * 10.0);
    if (pleat > 0) {
      ctx.fillStyle = `rgba(110, 132, 210, ${pleat * 0.08})`;
    } else {
      ctx.fillStyle = `rgba(5, 7, 20, ${-pleat * 0.22})`;
    }
    ctx.fillRect(x, 0, 1, height);
  }

  // Fine woven linen thread micro-grid
  ctx.fillStyle = 'rgba(255, 255, 255, 0.022)';
  for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
  ctx.fillStyle = 'rgba(6, 8, 22, 0.11)';
  for (let x = 0; x < width; x += 3) ctx.fillRect(x, 0, 1, height);

  // Stitched bottom hem
  ctx.strokeStyle = 'rgba(200, 212, 244, 0.20)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(0, height - 18);
  ctx.lineTo(width, height - 18);
  ctx.stroke();
  ctx.setLineDash([]);

  // Left Panel Crest (Cloud-Blossom Kamon)
  const drawLeftCrest = (cx: number, cy: number, r: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#e5ebf6';

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * r * 0.56, Math.sin(ang) * r * 0.56, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#222a5c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = '#e5ebf6';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.54, r * 0.22, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = '#e5ebf6';
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * r * 0.20, Math.sin(ang) * r * 0.20, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#222a5c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Right Panel Crest (Concentric Wave & Shrine Emblem)
  const drawRightCrest = (cx: number, cy: number, r: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#e5ebf6';
    ctx.fillStyle = '#e5ebf6';

    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, -Math.PI * 0.42, Math.PI * 1.42);
    ctx.stroke();

    for (let k = 1; k <= 3; k++) {
      ctx.lineWidth = r * 0.065;
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.34 + k * 0.14), Math.PI * 0.62, Math.PI * 1.38);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.34 + k * 0.14), -Math.PI * 0.38, Math.PI * 0.38);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, -r * 0.06, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.16, r * 0.16, r * 0.32, r * 0.48);

    ctx.fillStyle = '#222a5c';
    ctx.beginPath();
    ctx.arc(0, -r * 0.06, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.06, r * 0.24, r * 0.12, r * 0.36);
    ctx.restore();
  };

  drawLeftCrest(256, 272, 108);
  drawRightCrest(768, 272, 108);

  const indigoCurtainMap = finalizeCanvasTexture(canvas, 1, 1);
  indigoCurtainMap.wrapS = THREE.ClampToEdgeWrapping;
  indigoCurtainMap.wrapT = THREE.ClampToEdgeWrapping;

  const nSize = 256;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    for (let x = 0; x < nSize; x++) {
      const weaveX = Math.sin((x / nSize) * Math.PI * 72.0);
      const weaveY = Math.sin((y / nSize) * Math.PI * 72.0);
      const pleat = Math.sin((x / nSize) * Math.PI * 10.0) * 0.4;
      const idx = y * nSize + x;
      heights[idx] = 0.5 + 0.18 * weaveX + 0.18 * weaveY + pleat;
      rough[idx] = 0.88;
    }
  }
  const { normalMap: indigoCurtainNormal } = heightToNormalRoughness(
    heights,
    rough,
    nSize,
    1.6,
    2,
    2
  );

  return { indigoCurtainMap, indigoCurtainNormal };
}

// ============================================================================
// 7. 512x512 HD HANDMADE KŌZO WASHI PAPER TEXTURE FOR TŌRŌ WATER LANTERNS
// ============================================================================
function buildLanternWashiTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm translucent mulberry paper base with soft aged edge vignette
  const bg = ctx.createRadialGradient(size * 0.5, size * 0.62, 24, size * 0.5, size * 0.5, size * 0.72);
  bg.addColorStop(0.0, '#fff9eb');
  bg.addColorStop(0.58, '#f6e4be');
  bg.addColorStop(1.0, '#d6b47c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  let rng = 314159;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  // Delicate crisscrossing organic Kōzo mulberry fibers
  for (let i = 0; i < 1100; i++) {
    const x0 = rand() * size;
    const y0 = rand() * size;
    const ang = rand() * Math.PI * 2;
    const len = 14 + rand() * 44;
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    ctx.strokeStyle =
      rand() < 0.55
        ? `rgba(255, 252, 242, ${0.14 + rand() * 0.20})`
        : `rgba(168, 122, 64, ${0.07 + rand() * 0.11})`;
    ctx.lineWidth = 0.6 + rand() * 1.3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(
      (x0 + x1) * 0.5 + (rand() - 0.5) * 10,
      (y0 + y1) * 0.5 + (rand() - 0.5) * 10,
      x1,
      y1
    );
    ctx.stroke();
  }

  // Subtle horizontal bamboo-screen sugeta deckle lines characteristic of Japanese Washi
  ctx.fillStyle = 'rgba(155, 112, 56, 0.045)';
  for (let y = 0; y < size; y += 6) {
    ctx.fillRect(0, y, size, 1.2);
  }

  // Delicate traditional Seigaiha (ocean wave) watermark along the lower hem of the paper shade!
  ctx.save();
  ctx.strokeStyle = 'rgba(162, 108, 48, 0.15)';
  ctx.lineWidth = 1.6;
  const waveR = 38;
  for (let row = 0; row < 3; row++) {
    const cy = size - 16 - row * 22;
    const xOffset = (row % 2) * waveR;
    for (let cx = -waveR; cx <= size + waveR; cx += waveR * 2) {
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath();
        ctx.arc(cx + xOffset, cy, (waveR * ring) / 3, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  const tex = finalizeCanvasTexture(canvas, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function getHokoraTextures(): HokoraTextureSet {
  if (cachedSet) return cachedSet;
  const { indigoCurtainMap, indigoCurtainNormal } = buildIndigoCurtainTextures();
  cachedSet = {
    granite: buildGraniteTextures(),
    darkWood: buildDarkWoodTextures(),
    redWood: buildRedWoodTextures(),
    copperTile: buildCopperTileTextures(),
    strawRope: buildStrawRopeTextures(),
    indigoCurtainMap,
    indigoCurtainNormal,
    lanternWashiMap: buildLanternWashiTexture(),
  };
  return cachedSet;
}
