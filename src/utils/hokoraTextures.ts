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
  goldMetal: PBRTextureTriplet;
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
  let norm = 0;
  let fx = freqX;
  let fy = freqY;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileNoise(u * fx, v * fy, fx, fy, seed + o * 17);
    norm += amp;
    fx *= 2;
    fy *= 2;
    amp *= 0.5;
  }
  return sum / norm;
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

// Resolution-independent Sobel normal & roughness generator!
// Scales UV-space finite differences by (size * 0.052) so 512x512 normals have crisp 30°–60° micro-relief.
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
  const derivScale = size * 0.052 * strength;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const idx = y * size + x;

      // 3x3 Sobel filter for ultra-clean, alias-free tangent-space surface slopes
      const tl = heights[yp * size + xm];
      const tc = heights[yp * size + x];
      const tr = heights[yp * size + xp];
      const ml = heights[y * size + xm];
      const mr = heights[y * size + xp];
      const bl = heights[ym * size + xm];
      const bc = heights[ym * size + x];
      const br = heights[ym * size + xp];

      const dX = ((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl)) * 0.125 * derivScale;
      const dY = ((tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br)) * 0.125 * derivScale;

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
  normalMap.anisotropy = 8;
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatX, repeatY);
  roughnessMap.anisotropy = 8;
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

// ============================================================================
// 1. 1024x1024 HD WEATHERED JAPANESE MIKAGE-ISHI GRANITE MASONRY
//    (Hand-dressed ashlar blocks, beveled joints, coastal damp moss & mica glints)
// ============================================================================
function buildGraniteTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#7e8387';
  ctx.fillRect(0, 0, size, size);

  let rng = 104729;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  // Multi-scale mineral clouds (warm feldspar, cool slate-quartz & dark biotite veins)
  for (let i = 0; i < 2400; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rad = 8 + rand() * 34;
    const roll = rand();
    const alpha = 0.035 + rand() * 0.055;
    if (roll < 0.42) {
      ctx.fillStyle = `rgba(34, 38, 43, ${alpha})`;
    } else if (roll < 0.76) {
      ctx.fillStyle = `rgba(208, 214, 218, ${alpha})`;
    } else {
      ctx.fillStyle = `rgba(148, 138, 122, ${alpha})`;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Natural granite crystal flecks (feldspar, quartz & black mica — soft 1.5..4px crystals)
  for (let i = 0; i < 7500; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rad = 1.3 + rand() * 2.6;
    const roll = rand();
    if (roll < 0.44) {
      ctx.fillStyle = `rgba(26, 30, 34, ${0.18 + rand() * 0.22})`;
    } else if (roll < 0.80) {
      ctx.fillStyle = `rgba(214, 220, 226, ${0.14 + rand() * 0.18})`;
    } else {
      ctx.fillStyle = `rgba(150, 138, 120, ${0.12 + rand() * 0.15})`;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hand-chiseled mason dressing strokes (nomi-ato)
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 1100; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 12 + rand() * 28;
    const ang = (rand() - 0.5) * 0.22;
    ctx.strokeStyle =
      rand() < 0.52 ? 'rgba(28, 32, 36, 0.11)' : 'rgba(226, 232, 236, 0.09)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Carved Ashlar Stone Courses (4 rows x 3 staggered blocks for authentic 1:10 scale blocks!)
  const rows = 4;
  const cols = 3;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    const xOff = (r % 2) * (colW * 0.5);

    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + xOff;
      // Distinct per-block stone hue variation (warm buff vs cool blue-grey granite)
      const warmCool = rand();
      if (warmCool < 0.34) {
        ctx.fillStyle = `rgba(176, 162, 140, ${0.08 + rand() * 0.08})`;
      } else if (warmCool < 0.68) {
        ctx.fillStyle = `rgba(98, 112, 126, ${0.08 + rand() * 0.08})`;
      } else {
        ctx.fillStyle = `rgba(28, 32, 36, ${0.06 + rand() * 0.08})`;
      }
      ctx.fillRect(bx + 5, y0 + 5, colW - 10, rowH - 10);

      // Inner block edge dirt/weathering vignette
      const topWeather = ctx.createLinearGradient(0, y0, 0, y0 + 34);
      topWeather.addColorStop(0, 'rgba(22, 26, 28, 0.30)');
      topWeather.addColorStop(1, 'rgba(22, 26, 28, 0)');
      ctx.fillStyle = topWeather;
      ctx.fillRect(bx, y0, colW, 34);

      const botWeather = ctx.createLinearGradient(0, y0 + rowH - 44, 0, y0 + rowH);
      botWeather.addColorStop(0, 'rgba(24, 34, 24, 0)');
      botWeather.addColorStop(1, 'rgba(22, 34, 22, 0.38)');
      ctx.fillStyle = botWeather;
      ctx.fillRect(bx, y0 + rowH - 44, colW, 44);

      // Subtle damp coastal moss & lichen clusters along mortar crevices
      for (let m = 0; m < 9; m++) {
        const mx = bx + 10 + rand() * (colW - 20);
        const my = y0 + rowH - 4 - rand() * 16;
        const mr = 5 + rand() * 14;
        ctx.fillStyle = `rgba(46, 66, 38, ${0.14 + rand() * 0.16})`;
        ctx.beginPath();
        ctx.ellipse(mx, my, mr * 1.3, mr * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Chiseled top chamfer highlight
      ctx.fillStyle = 'rgba(228, 234, 240, 0.24)';
      ctx.fillRect(bx + 6, y0 + 5, colW - 12, 4);

      // Deep vertical recessed mortar joint + shadow lip
      ctx.fillStyle = 'rgba(14, 17, 20, 0.86)';
      ctx.fillRect(bx - 3.5, y0, 7, rowH);
      ctx.fillStyle = 'rgba(220, 226, 232, 0.14)';
      ctx.fillRect(bx + 4, y0 + 5, 3, rowH - 10);
    }

    // Deep horizontal recessed mortar joint
    ctx.fillStyle = 'rgba(12, 15, 18, 0.90)';
    ctx.fillRect(0, y0 - 3.5, size, 7);
  }

  // 512x512 Normal & Roughness map registered 1:1 with CanvasTexture (vCanvas = 1 - y/nSize)
  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const uvy = y / nSize;
    const vCanvas = 1.0 - uvy; // Exact match with CanvasTexture flipY=true!
    const rIdx = Math.min(rows - 1, Math.floor(vCanvas * rows));
    const rv = vCanvas * rows - rIdx;
    const hJoint = THREE.MathUtils.smoothstep(Math.min(rv, 1.0 - rv), 0.010, 0.048);

    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const stagU = (u - (rIdx % 2) * (0.5 / cols) + 1.0) % 1.0;
      const cv = stagU * cols - Math.floor(stagU * cols);
      const vJoint = THREE.MathUtils.smoothstep(Math.min(cv, 1.0 - cv), 0.008, 0.038);
      const blockBevel = Math.min(hJoint, vJoint);

      const macroRock = fbmTile(u, vCanvas, 12, 12, 19, 4);
      const chisel = fbmTile(u, vCanvas, 36, 18, 43, 3);
      const micaSparkle = tileNoise(u * 64, vCanvas * 64, 64, 64, 91);

      const idx = y * nSize + x;
      heights[idx] = blockBevel * (0.62 + 0.24 * macroRock + 0.14 * chisel);
      // Quartz/mica crystal flecks have lower roughness (0.38) so stone glints naturally in moonlight!
      const baseRough = micaSparkle > 0.82 ? 0.38 : 0.78 + 0.16 * (1.0 - macroRock);
      rough[idx] = THREE.MathUtils.clamp(baseRough + (1.0 - blockBevel) * 0.18, 0.25, 0.98);
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 1.35, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 2. 1024x1024 HD AGED YAKISUGI DARK TIMBER (Charred Espresso Cedar + Raised Grain)
// ============================================================================
function buildDarkWoodTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#261e19';
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
    const pGrad = ctx.createLinearGradient(px, 0, px + plankW, 0);
    pGrad.addColorStop(0.0, '#140f0c');
    pGrad.addColorStop(0.10, p % 2 === 0 ? '#30251e' : '#2a201a');
    pGrad.addColorStop(0.50, p % 2 === 0 ? '#3d2f25' : '#352920');
    pGrad.addColorStop(0.90, '#291f19');
    pGrad.addColorStop(1.0, '#120d0a');
    ctx.fillStyle = pGrad;
    ctx.fillRect(px, 0, plankW, size);

    // Rich warm amber-umber raised wood grain fibers
    for (let g = 0; g < 120; g++) {
      const gx = px + 5 + rand() * (plankW - 10);
      const waveAmp = 2 + rand() * 8;
      const waveFreq = (1 + Math.floor(rand() * 3)) * Math.PI * 2;
      const phase = rand() * Math.PI * 2;
      const isWarmRidge = rand() < 0.46;
      ctx.strokeStyle = isWarmRidge
        ? `rgba(116, 86, 62, ${0.11 + rand() * 0.16})`
        : `rgba(10, 7, 5, ${0.18 + rand() * 0.22})`;
      ctx.lineWidth = 0.9 + rand() * 2.1;
      ctx.beginPath();
      for (let sy = 0; sy <= size; sy += 14) {
        const wx = gx + Math.sin((sy / size) * waveFreq + phase) * waveAmp;
        if (sy === 0) ctx.moveTo(wx, sy);
        else ctx.lineTo(wx, sy);
      }
      ctx.stroke();
    }

    // Weathered check splits
    for (let c = 0; c < 3; c++) {
      const cx = px + 22 + rand() * (plankW - 44);
      const cy = rand() * (size * 0.72);
      const cLen = 90 + rand() * 190;
      ctx.strokeStyle = 'rgba(6, 4, 3, 0.82)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + (rand() - 0.5) * 10, cy + cLen * 0.5, cx + (rand() - 0.5) * 6, cy + cLen);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(112, 84, 60, 0.28)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy);
      ctx.lineTo(cx + 2, cy + cLen);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(6, 4, 3, 0.90)';
    ctx.fillRect(px - 2.5, 0, 5, size);
  }

  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const vCanvas = 1.0 - y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const pv = u * planks - Math.floor(u * planks);
      const seam = THREE.MathUtils.smoothstep(Math.min(pv, 1.0 - pv), 0.008, 0.036);
      const fiber = fbmTile(u, vCanvas, 48, 6, 61, 4);
      const rings = 0.5 + 0.5 * Math.sin((u * 32.0 + fiber * 3.8) * Math.PI);
      const idx = y * nSize + x;
      heights[idx] = seam * (0.48 + 0.30 * fiber + 0.22 * rings);
      // Raised latewood ridges are burnished smoother (0.40) while charred grooves are matte (0.86)!
      rough[idx] = THREE.MathUtils.clamp(0.42 + 0.38 * (1.0 - rings) + (1.0 - seam) * 0.16, 0.32, 0.94);
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 1.15, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 3. 1024x1024 HD URUSHI-LACQUERED SHU-IRO VERMILION TIMBER (Gloss-Aged Patina)
// ============================================================================
function buildRedWoodTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#9a1e16';
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
    pGrad.addColorStop(0.0, '#5c0e09');
    pGrad.addColorStop(0.10, '#a42118');
    pGrad.addColorStop(0.50, p % 2 === 0 ? '#be2c20' : '#b0251b');
    pGrad.addColorStop(0.90, '#9a1d15');
    pGrad.addColorStop(1.0, '#560d08');
    ctx.fillStyle = pGrad;
    ctx.fillRect(px, 0, plankW, size);

    // Subtle Hinoki wood grain telegraphing through cinnabar lacquer
    for (let g = 0; g < 95; g++) {
      const gx = px + 4 + rand() * (plankW - 8);
      const amp = 1.5 + rand() * 4.5;
      const phase = rand() * Math.PI * 2;
      ctx.strokeStyle =
        rand() < 0.52
          ? `rgba(48, 6, 4, ${0.10 + rand() * 0.14})`
          : `rgba(232, 82, 56, ${0.07 + rand() * 0.10})`;
      ctx.lineWidth = 1.0 + rand() * 1.8;
      ctx.beginPath();
      for (let sy = 0; sy <= size; sy += 18) {
        const wx = gx + Math.sin((sy / size) * Math.PI * 4 + phase) * amp;
        if (sy === 0) ctx.moveTo(wx, sy);
        else ctx.lineTo(wx, sy);
      }
      ctx.stroke();
    }

    // Authentic soot/weathering patina at upper & lower joinery ends
    const topAge = ctx.createLinearGradient(0, 0, 0, 150);
    topAge.addColorStop(0, 'rgba(22, 5, 3, 0.42)');
    topAge.addColorStop(1, 'rgba(22, 5, 3, 0)');
    ctx.fillStyle = topAge;
    ctx.fillRect(px, 0, plankW, 150);

    const botAge = ctx.createLinearGradient(0, size - 130, 0, size);
    botAge.addColorStop(0, 'rgba(22, 5, 3, 0)');
    botAge.addColorStop(1, 'rgba(22, 5, 3, 0.36)');
    ctx.fillStyle = botAge;
    ctx.fillRect(px, size - 130, plankW, 130);

    ctx.fillStyle = 'rgba(32, 5, 3, 0.80)';
    ctx.fillRect(px - 2, 0, 4, size);
  }

  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const vCanvas = 1.0 - y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const pv = u * planks - Math.floor(u * planks);
      const seam = THREE.MathUtils.smoothstep(Math.min(pv, 1.0 - pv), 0.006, 0.028);
      const fiber = fbmTile(u, vCanvas, 48, 6, 89, 4);
      const lacquerWear = fbmTile(u, vCanvas, 8, 8, 103, 3);
      const idx = y * nSize + x;
      heights[idx] = seam * (0.62 + 0.38 * fiber);
      // Polished Urushi lacquer patches (0.26) vs weathered chalky cinnabar (0.64)
      rough[idx] = THREE.MathUtils.clamp(0.26 + 0.36 * (1.0 - lacquerWear) + (1.0 - seam) * 0.22, 0.22, 0.88);
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 0.90, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 4. 1024x1024 HD OXIDIZED DOUBUKI COPPER ROOF SHINGLES
//    (Burnished dark bronze lips + emerald/turquoise verdigris patina + 3D overlaps)
// ============================================================================
function buildCopperTileTextures(): PBRTextureTriplet {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2b4a44';
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
      // Tile-by-tile natural copper oxidation variation (some tiles greener, some darker bronze-teal)
      const shift = (rand() - 0.5) * 32;
      const bronzeMix = rand();
      const rCol = Math.round(bronzeMix > 0.72 ? 68 + shift * 0.4 : 46 + shift * 0.35);
      const gCol = Math.round(bronzeMix > 0.72 ? 96 + shift * 0.6 : 114 + shift);
      const bCol = Math.round(bronzeMix > 0.72 ? 84 + shift * 0.5 : 100 + shift * 0.85);

      const tileGrad = ctx.createLinearGradient(0, y0, 0, y0 + rowH);
      tileGrad.addColorStop(0.0, 'rgb(20, 32, 30)');
      tileGrad.addColorStop(0.22, `rgb(${Math.max(24, rCol - 12)}, ${Math.max(44, gCol - 18)}, ${Math.max(40, bCol - 16)})`);
      tileGrad.addColorStop(0.76, `rgb(${rCol + 10}, ${gCol + 18}, ${bCol + 14})`);
      // Burnished dark bronze-copper wear right near the exposed lower shingle lip!
      tileGrad.addColorStop(0.93, 'rgb(76, 62, 48)');
      tileGrad.addColorStop(1.0, 'rgb(22, 30, 28)');
      ctx.fillStyle = tileGrad;
      ctx.fillRect(x0 + 2, y0 + 2, colW - 4, rowH - 4);

      // Verdigris mineral blooms & dark rainwater runoff streaks
      for (let m = 0; m < 18; m++) {
        const mx = x0 + 6 + rand() * (colW - 12);
        const my = y0 + 6 + rand() * (rowH - 12);
        const mr = 5 + rand() * 18;
        const roll = rand();
        if (roll < 0.52) {
          ctx.fillStyle = `rgba(124, 198, 174, ${0.07 + rand() * 0.11})`;
        } else if (roll < 0.82) {
          ctx.fillStyle = `rgba(68, 48, 34, ${0.08 + rand() * 0.12})`;
        } else {
          ctx.fillStyle = `rgba(18, 28, 26, ${0.10 + rand() * 0.14})`;
        }
        ctx.beginPath();
        ctx.ellipse(mx, my, mr * 0.6, mr * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Crisp metallic copper-verdigris lip highlight
      ctx.fillStyle = 'rgba(164, 218, 196, 0.34)';
      ctx.fillRect(x0 + 3, y0 + rowH - 6, colW - 6, 2.5);

      // Standing vertical seam + raised copper batten shadow
      ctx.fillStyle = 'rgba(12, 18, 17, 0.84)';
      ctx.fillRect(x0 - 2, y0, 4, rowH);
      ctx.fillStyle = 'rgba(138, 188, 170, 0.18)';
      ctx.fillRect(x0 + 2, y0 + 4, 2.5, rowH - 8);
    }

    // Deep horizontal shingle overlap cast shadow
    const shadowGrad = ctx.createLinearGradient(0, y0, 0, y0 + 22);
    shadowGrad.addColorStop(0, 'rgba(8, 13, 12, 0.82)');
    shadowGrad.addColorStop(1, 'rgba(8, 13, 12, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(0, y0, size, 22);
  }

  const nSize = 512;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const vCanvas = 1.0 - y / nSize;
    const rf = vCanvas * rows;
    const rIdx = Math.min(rows - 1, Math.floor(rf));
    const rv = rf - rIdx; // 0 = top tucked under upper row, 1 = raised lower lip

    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const stagU = (u - (rIdx % 2) * (0.5 / cols) + 1.0) % 1.0;
      const cv = stagU * cols - Math.floor(stagU * cols);
      const vSeam = THREE.MathUtils.smoothstep(Math.min(cv, 1.0 - cv), 0.008, 0.032);
      // Stepped overlap profile: rises toward rv=0.94 then drops sharply at the shingle lip!
      const lipDrop = 1.0 - THREE.MathUtils.smoothstep(rv, 0.92, 0.99);
      const stepProfile = (0.20 + 0.75 * rv) * lipDrop;
      const patina = fbmTile(u, vCanvas, 16, 16, 151, 4);

      const idx = y * nSize + x;
      heights[idx] = vSeam * stepProfile + patina * 0.10;
      // Burnished metallic bronze lip (rv > 0.82) is smooth & specular (0.24), mossy top overlap is matte (0.80)!
      const lipPolish = THREE.MathUtils.smoothstep(rv, 0.78, 0.95) * lipDrop;
      rough[idx] = THREE.MathUtils.clamp(
        0.48 + 0.30 * patina - lipPolish * 0.26 + (rv < 0.16 ? 0.20 : 0.0),
        0.20,
        0.92
      );
    }
  }

  const map = finalizeCanvasTexture(canvas, 1, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 1.45, 1, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 5. 512x512 HD HAMMERED NANAKO GILT-BRONZE (Kanagu Metal Ornaments & Kiku Crest)
// ============================================================================
function buildGoldMetalTextures(): PBRTextureTriplet {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#d4a238';
  ctx.fillRect(0, 0, size, size);

  let rng = 774411;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  // Subtle antique gilt bronze mottling & tarnish clouds
  for (let i = 0; i < 650; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rad = 8 + rand() * 26;
    ctx.fillStyle =
      rand() < 0.5
        ? `rgba(255, 224, 132, ${0.05 + rand() * 0.07})`
        : `rgba(112, 74, 18, ${0.06 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine artisan brushed metal hairlines
  ctx.lineWidth = 1.0;
  for (let i = 0; i < 500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 18 + rand() * 42;
    ctx.strokeStyle =
      rand() < 0.5 ? 'rgba(255, 236, 168, 0.10)' : 'rgba(92, 60, 14, 0.10)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }

  const nSize = 256;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const vCanvas = 1.0 - y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      // Subtle artisan hammered planishing + fine Nanako stipple
      const hammer = fbmTile(u, vCanvas, 14, 14, 211, 3);
      const stipple = Math.sin(u * Math.PI * 64.0) * Math.sin(vCanvas * Math.PI * 64.0) * 0.5 + 0.5;
      const idx = y * nSize + x;
      heights[idx] = hammer * 0.72 + stipple * 0.28;
      rough[idx] = 0.20 + 0.18 * (1.0 - hammer);
    }
  }

  const map = finalizeCanvasTexture(canvas, 2, 2);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 0.65, 2, 2);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 6. 512x256 HD GOLDEN RICE-STRAW SHIMENAWA TEXTURE
// ============================================================================
function buildStrawRopeTextures(): PBRTextureTriplet {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#926e36';
  ctx.fillRect(0, 0, w, h);

  for (let i = -h; i < w + h; i += 3.5) {
    const lum = 0.58 + 0.42 * Math.sin((i / 32) * Math.PI * 2);
    ctx.strokeStyle = `rgb(${Math.round(212 * lum)}, ${Math.round(168 * lum)}, ${Math.round(92 * lum)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h * 0.65, h);
    ctx.stroke();
  }

  const nSize = 256;
  const heights = new Float32Array(nSize * nSize);
  const rough = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const vCanvas = 1.0 - y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const twist = Math.abs(Math.sin((u * 8.0 + vCanvas * 4.0) * Math.PI));
      const straw = fbmTile(u, vCanvas, 36, 18, 197, 3);
      const idx = y * nSize + x;
      heights[idx] = twist * 0.72 + straw * 0.28;
      rough[idx] = 0.72 + 0.20 * (1.0 - straw);
    }
  }

  const map = finalizeCanvasTexture(canvas, 3, 1);
  const { normalMap, roughnessMap } = heightToNormalRoughness(heights, rough, nSize, 1.15, 3, 1);
  return { map, normalMap, roughnessMap };
}

// ============================================================================
// 7. 1024x512 HD INDIGO TOBARI CURTAIN + CRISP VECTOR SHINMON CRESTS + DRAPE AO
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

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0.0, '#0d1026');
  grad.addColorStop(0.22, '#1b224c');
  grad.addColorStop(0.68, '#26316b');
  grad.addColorStop(1.0, '#141a3c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Shaded vertical cloth drape folds
  for (let x = 0; x < width; x++) {
    const u = x / width;
    const pleat = Math.sin(u * Math.PI * 10.0);
    if (pleat > 0) {
      ctx.fillStyle = `rgba(116, 140, 220, ${pleat * 0.10})`;
    } else {
      ctx.fillStyle = `rgba(4, 6, 18, ${-pleat * 0.28})`;
    }
    ctx.fillRect(x, 0, 1, height);
  }

  // Fine woven linen thread micro-grid
  ctx.fillStyle = 'rgba(255, 255, 255, 0.026)';
  for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
  ctx.fillStyle = 'rgba(6, 8, 22, 0.13)';
  for (let x = 0; x < width; x += 3) ctx.fillRect(x, 0, 1, height);

  ctx.strokeStyle = 'rgba(200, 212, 244, 0.22)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(0, height - 18);
  ctx.lineTo(width, height - 18);
  ctx.stroke();
  ctx.setLineDash([]);

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
    const vCanvas = 1.0 - y / nSize;
    for (let x = 0; x < nSize; x++) {
      const weaveX = Math.sin((x / nSize) * Math.PI * 72.0);
      const weaveY = Math.sin(vCanvas * Math.PI * 72.0);
      const pleat = Math.sin((x / nSize) * Math.PI * 10.0) * 0.45;
      const idx = y * nSize + x;
      heights[idx] = 0.5 + 0.16 * weaveX + 0.16 * weaveY + pleat;
      rough[idx] = 0.88;
    }
  }
  const { normalMap: indigoCurtainNormal } = heightToNormalRoughness(
    heights,
    rough,
    nSize,
    0.85,
    1,
    1
  );

  return { indigoCurtainMap, indigoCurtainNormal };
}

// ============================================================================
// 8. 512x512 HD HANDMADE KŌZO WASHI PAPER TEXTURE FOR TŌRŌ WATER LANTERNS
// ============================================================================
function buildLanternWashiTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

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

  ctx.fillStyle = 'rgba(155, 112, 56, 0.045)';
  for (let y = 0; y < size; y += 6) {
    ctx.fillRect(0, y, size, 1.2);
  }

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
    goldMetal: buildGoldMetalTextures(),
    strawRope: buildStrawRopeTextures(),
    indigoCurtainMap,
    indigoCurtainNormal,
    lanternWashiMap: buildLanternWashiTexture(),
  };
  return cachedSet;
}
