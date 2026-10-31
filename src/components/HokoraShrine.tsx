import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getHokoraTextures } from '../utils/hokoraTextures';

interface HokoraShrineProps {
  position?: [number, number, number];
  scale?: number;
  visibilityRef: React.MutableRefObject<number>;
}

type UVMappingMode = 'metric-stone' | 'metric-wood' | 'preserve';

// Normalizes geometry + applies aspect-correct metric 3D UVs (eliminates texture stretching!)
// + bakes realistic 3D Architectural Cavity Ambient Occlusion!
function prepGeom(
  geom: THREE.BufferGeometry,
  r = 1.0,
  g = 1.0,
  b = 1.0,
  uvScale = 1.0,
  applyArchAO = true,
  uvMode: UVMappingMode = 'metric-wood'
): THREE.BufferGeometry {
  const gNonIdx = geom.index ? geom.toNonIndexed() : geom.clone();

  for (const key of Object.keys(gNonIdx.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv') {
      gNonIdx.deleteAttribute(key);
    }
  }

  gNonIdx.computeVertexNormals();
  gNonIdx.computeBoundingBox();
  const bbox = gNonIdx.boundingBox!;
  const spanX = bbox.max.x - bbox.min.x;
  const spanY = bbox.max.y - bbox.min.y;
  const spanZ = bbox.max.z - bbox.min.z;

  const pos = gNonIdx.attributes.position as THREE.BufferAttribute;
  const nrm = gNonIdx.attributes.normal as THREE.BufferAttribute;
  const count = pos.count;

  if (uvMode !== 'preserve' || !gNonIdx.attributes.uv) {
    const uvs = new Float32Array(count * 2);
    // Align wood grain along the longest axis of beams/rails vs vertical posts!
    const horizBeamX = uvMode === 'metric-wood' && spanX > spanY * 1.35 && spanX >= spanZ;
    const horizBeamZ = uvMode === 'metric-wood' && spanZ > spanY * 1.35 && spanZ > spanX;
    const baseDensity = uvMode === 'metric-stone' ? 1.75 * uvScale : 2.15 * uvScale;

    for (let i = 0; i < count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const nx = Math.abs(nrm.getX(i));
      const ny = Math.abs(nrm.getY(i));
      const nz = Math.abs(nrm.getZ(i));

      let u = 0;
      let v = 0;
      if (ny >= nx && ny >= nz) {
        // Top / bottom faces
        if (horizBeamZ) {
          u = px * baseDensity + 0.5;
          v = pz * baseDensity + 0.5;
        } else {
          u = pz * baseDensity + 0.5;
          v = px * baseDensity + 0.5;
        }
      } else if (nx >= nz) {
        // Left / right faces
        if (horizBeamZ) {
          u = py * baseDensity;
          v = pz * baseDensity + 0.5;
        } else {
          u = pz * baseDensity + 0.5;
          v = py * baseDensity;
        }
      } else {
        // Front / back faces
        if (horizBeamX) {
          u = py * baseDensity;
          v = px * baseDensity + 0.5;
        } else {
          u = px * baseDensity + 0.5;
          v = py * baseDensity;
        }
      }
      uvs[i * 2 + 0] = u;
      uvs[i * 2 + 1] = v;
    }
    gNonIdx.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  } else if (uvScale !== 1.0) {
    const uvAttr = gNonIdx.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * uvScale, uvAttr.getY(i) * uvScale);
    }
  }

  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let ao = 1.0;
    if (applyArchAO) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const ny = nrm.getY(i);

      // 1. Directional hemisphere self-occlusion (downward overhangs naturally shaded)
      ao *= 0.72 + 0.28 * THREE.MathUtils.clamp(ny * 0.5 + 0.5, 0.0, 1.0);

      // 2. Deep Noki-shita (Under-Eave) cavity AO tucked beneath the wide copper roof (y = 0.98..1.25)
      if (py > 0.96 && py < 1.25 && Math.abs(pz) < 0.46) {
        const eaveFactor = Math.sin(((py - 0.96) / 0.29) * Math.PI);
        ao *= 1.0 - 0.42 * eaveFactor;
      }

      // 3. Contact AO tucked directly under the overhanging upper sanctuary deck (y = 0.53..0.595)
      if (py > 0.52 && py < 0.595 && Math.abs(px) < 0.37 && Math.abs(pz) < 0.32) {
        const underDeck = THREE.MathUtils.smoothstep(py, 0.52, 0.59);
        ao *= 1.0 - 0.32 * underDeck;
      }

      // 4. Contact AO right underneath the overhanging granite coping slab (y = 0.19..0.268)
      if (py > 0.185 && py < 0.268) {
        const underCoping = THREE.MathUtils.smoothstep(py, 0.185, 0.262);
        ao *= 1.0 - 0.30 * underCoping;
      }

      // 5. Contact shadow behind the Saisen-bako coin box on the front granite face
      if (pz > 0.42 && Math.abs(px) < 0.16 && py > 0.18 && py < 0.35) {
        ao *= 0.80;
      }

      // 6. Waterline dampness darkening near the sea surface (y <= 0.06)
      if (py < 0.07) {
        ao *= THREE.MathUtils.lerp(0.48, 1.0, THREE.MathUtils.clamp((py + 0.08) / 0.15, 0.0, 1.0));
      }
    }

    colors[i * 3 + 0] = r * ao;
    colors[i * 3 + 1] = g * ao;
    colors[i * 3 + 2] = b * ao;
  }
  gNonIdx.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return gNonIdx;
}

function createTaperedBox(
  botW: number,
  botD: number,
  topW: number,
  topD: number,
  height: number
): THREE.BufferGeometry {
  const hw0 = botW * 0.5;
  const hd0 = botD * 0.5;
  const hw1 = topW * 0.5;
  const hd1 = topD * 0.5;

  const p = [
    [-hw0, 0, hd0],
    [hw0, 0, hd0],
    [hw0, 0, -hd0],
    [-hw0, 0, -hd0],
    [-hw1, height, hd1],
    [hw1, height, hd1],
    [hw1, height, -hd1],
    [-hw1, height, -hd1],
  ];

  const quads = [
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
    [4, 5, 6, 7],
    [3, 2, 1, 0],
  ];

  const positions: number[] = [];
  const uvs: number[] = [];
  for (const [a, b, c, d] of quads) {
    positions.push(...p[a], ...p[b], ...p[c], ...p[a], ...p[c], ...p[d]);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// Grounded, compact Nagare-zukuri (流造) curved roof height profile (wide 1.30m eaves, compact 1.56m ridge!)
function evalNagareRoofY(x: number, z: number): number {
  const zRidge = -0.08;
  const yRidge = 1.545;
  const uX = Math.min(1.0, Math.abs(x) / 0.65);
  const sori = 0.034 * Math.pow(uX, 2.2);

  if (z >= zRidge) {
    const s = THREE.MathUtils.clamp((z - zRidge) / (0.54 - zRidge), 0.0, 1.0);
    const linear = THREE.MathUtils.lerp(yRidge, 1.185, s);
    const concaveSag = -0.088 * Math.sin(s * Math.PI) * (1.0 - 0.18 * s);
    return linear + concaveSag + sori * (0.45 + 0.55 * s);
  } else {
    const s = THREE.MathUtils.clamp((zRidge - z) / (zRidge - -0.49), 0.0, 1.0);
    const linear = THREE.MathUtils.lerp(yRidge, 1.230, s);
    const concaveSag = -0.056 * Math.sin(s * Math.PI);
    return linear + concaveSag + sori * (0.45 + 0.55 * s);
  }
}

function createChrysanthemumCrest(radius: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const centerBoss = new THREE.SphereGeometry(radius * 0.24, 10, 8);
  centerBoss.scale(1.0, 1.0, 0.45);
  parts.push(prepGeom(centerBoss, 1.08, 0.96, 0.76, 3.0, false));

  const petals = 16;
  for (let i = 0; i < petals; i++) {
    const ang = (i / petals) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(radius * 0.36, 7, 6);
    petal.scale(0.32, 1.0, 0.26);
    petal.translate(0, radius * 0.54, 0);
    petal.rotateZ(ang);
    parts.push(prepGeom(petal, 1.0, 0.90, 0.68, 3.0, false));
  }
  return mergeGeometries(parts, false)!;
}

function createScallopedCornerKanagu(cornerX: -1 | 1, cornerZ: -1 | 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const armLen = 0.092;
  const h = 0.048;
  const thick = 0.008;

  const armX = new THREE.BoxGeometry(armLen, h, thick);
  armX.translate(-cornerX * (armLen * 0.5 - thick * 0.5), 0, cornerZ * (thick * 0.5));
  parts.push(prepGeom(armX, 1.0, 0.92, 0.70, 3.0, false));

  const cuspX = new THREE.CylinderGeometry(h * 0.36, h * 0.36, thick, 10);
  cuspX.rotateX(Math.PI / 2);
  cuspX.translate(-cornerX * (armLen - 0.006), 0, cornerZ * (thick * 0.5));
  parts.push(prepGeom(cuspX, 1.02, 0.94, 0.72, 3.0, false));

  const armZ = new THREE.BoxGeometry(thick, h, armLen);
  armZ.translate(cornerX * (thick * 0.5), 0, -cornerZ * (armLen * 0.5 - thick * 0.5));
  parts.push(prepGeom(armZ, 1.0, 0.92, 0.70, 3.0, false));

  const cuspZ = new THREE.CylinderGeometry(h * 0.36, h * 0.36, thick, 10);
  cuspZ.rotateZ(Math.PI / 2);
  cuspZ.translate(cornerX * (thick * 0.5), 0, -cornerZ * (armLen - 0.006));
  parts.push(prepGeom(cuspZ, 1.02, 0.94, 0.72, 3.0, false));

  const rivetOffsets = [0.022, 0.054, 0.080];
  for (let idx = 0; idx < rivetOffsets.length; idx++) {
    const off = rivetOffsets[idx];
    const ySpread = idx === 1 ? [0.010, -0.010] : [0.0];
    for (const ry of ySpread) {
      const rvx = new THREE.SphereGeometry(0.0058, 7, 6);
      rvx.translate(-cornerX * off, ry, cornerZ * (thick + 0.002));
      parts.push(prepGeom(rvx, 1.15, 1.02, 0.80, 3.0, false));

      const rvz = new THREE.SphereGeometry(0.0058, 7, 6);
      rvz.translate(cornerX * (thick + 0.002), ry, -cornerZ * off);
      parts.push(prepGeom(rvz, 1.15, 1.02, 0.80, 3.0, false));
    }
  }

  return mergeGeometries(parts, false)!;
}

function createZigzagShideGeometry(scale = 1.0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const segs = [
    { dx: 0.0, dy: -0.022, rotZ: 0.24, w: 0.028, h: 0.050 },
    { dx: -0.015, dy: -0.062, rotZ: -0.32, w: 0.034, h: 0.056 },
    { dx: 0.014, dy: -0.104, rotZ: 0.30, w: 0.038, h: 0.060 },
    { dx: -0.012, dy: -0.148, rotZ: -0.26, w: 0.042, h: 0.064 },
  ];
  segs.forEach((s, idx) => {
    const fold = new THREE.BoxGeometry(s.w * scale, s.h * scale, 0.004 * scale);
    fold.rotateY(idx % 2 === 0 ? 0.14 : -0.14);
    fold.rotateZ(s.rotZ);
    fold.translate(s.dx * scale, s.dy * scale, (idx % 2 === 0 ? 0.003 : -0.003) * scale);
    parts.push(prepGeom(fold, 0.96, 0.96, 0.98, 1.0, false));
  });
  return mergeGeometries(parts, false)!;
}

function buildCompleteHokoraMeshes() {
  const graniteParts: THREE.BufferGeometry[] = [];
  const darkWoodParts: THREE.BufferGeometry[] = [];
  const redWoodParts: THREE.BufferGeometry[] = [];
  const copperParts: THREE.BufferGeometry[] = [];
  const goldParts: THREE.BufferGeometry[] = [];
  const strawParts: THREE.BufferGeometry[] = [];
  const whiteAndLeafParts: THREE.BufferGeometry[] = [];

  // ==========================================================================
  // 0. SLEEK SUBMERGED WET BASALT FOOTING (Grounded directly on the sea!)
  // ==========================================================================
  const seaFooting = createTaperedBox(1.42, 1.24, 1.16, 1.02, 0.16);
  seaFooting.translate(0, -0.15, 0);
  graniteParts.push(prepGeom(seaFooting, 0.42, 0.46, 0.50, 1.0, true, 'metric-stone'));

  // ==========================================================================
  // 1. BLUEPRINT 3-COURSE CUT GRANITE BASE (Metric 1:1 square ashlar stone blocks!)
  // ==========================================================================
  const gFootLip = new THREE.BoxGeometry(1.11, 0.024, 0.97);
  gFootLip.translate(0, 0.012, 0);
  graniteParts.push(prepGeom(gFootLip, 0.72, 0.75, 0.78, 1.0, true, 'metric-stone'));

  const gCourse1 = new THREE.BoxGeometry(1.08, 0.086, 0.94);
  gCourse1.translate(0, 0.065, 0);
  graniteParts.push(prepGeom(gCourse1, 0.90, 0.92, 0.94, 1.0, true, 'metric-stone'));

  const gCourse2 = createTaperedBox(1.03, 0.90, 0.92, 0.80, 0.154);
  gCourse2.translate(0, 0.108, 0);
  graniteParts.push(prepGeom(gCourse2, 0.96, 0.98, 1.00, 1.0, true, 'metric-stone'));

  const gUnderBevel = createTaperedBox(0.93, 0.81, 1.05, 0.92, 0.016);
  gUnderBevel.translate(0, 0.262, 0);
  graniteParts.push(prepGeom(gUnderBevel, 0.58, 0.60, 0.64, 1.0, true, 'metric-stone'));

  const gCourse3 = new THREE.BoxGeometry(1.05, 0.082, 0.92);
  gCourse3.translate(0, 0.311, 0);
  graniteParts.push(prepGeom(gCourse3, 1.02, 1.03, 1.05, 1.0, true, 'metric-stone'));

  const gTopBevel = createTaperedBox(1.05, 0.92, 1.00, 0.87, 0.018);
  gTopBevel.translate(0, 0.352, 0);
  graniteParts.push(prepGeom(gTopBevel, 1.06, 1.07, 1.08, 1.0, true, 'metric-stone'));

  // ==========================================================================
  // 2. FRONT WOODEN SAISEN-BAKO (COIN OFFERING BOX)
  // ==========================================================================
  const sbZ = 0.502;
  const sbY = 0.282;
  const sbBody = new THREE.BoxGeometry(0.265, 0.106, 0.095);
  sbBody.translate(0, sbY, sbZ);
  darkWoodParts.push(prepGeom(sbBody, 1.55, 1.25, 0.98, 1.6));

  const sbSlotRecess = new THREE.BoxGeometry(0.095, 0.025, 0.018);
  sbSlotRecess.translate(0, sbY + 0.010, sbZ + 0.043);
  darkWoodParts.push(prepGeom(sbSlotRecess, 0.14, 0.11, 0.09, 1.6, false));

  for (const sx of [-0.124, 0.124]) {
    const batten = new THREE.BoxGeometry(0.020, 0.108, 0.102);
    batten.translate(sx, sbY, sbZ);
    darkWoodParts.push(prepGeom(batten, 1.28, 1.04, 0.84, 1.6));
  }

  for (const slopeSide of [-1, 1]) {
    const miniSlope = new THREE.BoxGeometry(0.310, 0.014, 0.070);
    miniSlope.rotateX(slopeSide * 0.32);
    miniSlope.translate(0, sbY + 0.064, sbZ + slopeSide * 0.028);
    darkWoodParts.push(prepGeom(miniSlope, 1.48, 1.18, 0.94, 1.6));
  }
  const sbRidge = new THREE.BoxGeometry(0.314, 0.016, 0.022);
  sbRidge.translate(0, sbY + 0.076, sbZ);
  darkWoodParts.push(prepGeom(sbRidge, 1.24, 1.00, 0.80, 1.6));

  // ==========================================================================
  // 3. COMPACT DARK TIMBER WAIST PLINTH & GOLDEN KANAGU ORNAMENTS
  // ==========================================================================
  const dodaiCore = new THREE.BoxGeometry(0.86, 0.052, 0.75);
  dodaiCore.translate(0, 0.396, 0);
  darkWoodParts.push(prepGeom(dodaiCore, 0.94, 0.94, 0.96, 1.1));

  for (const cx of [-0.375, 0.375]) {
    for (const cz of [-0.325, 0.325]) {
      const footBlk = new THREE.BoxGeometry(0.145, 0.056, 0.145);
      footBlk.translate(cx, 0.398, cz);
      darkWoodParts.push(prepGeom(footBlk, 1.10, 1.08, 1.10, 1.1));
    }
  }

  const frontStep1 = new THREE.BoxGeometry(0.40, 0.038, 0.09);
  frontStep1.translate(0, 0.389, 0.415);
  darkWoodParts.push(prepGeom(frontStep1, 1.04, 1.04, 1.06, 1.1));

  const frontStep2 = new THREE.BoxGeometry(0.36, 0.038, 0.07);
  frontStep2.translate(0, 0.427, 0.385);
  darkWoodParts.push(prepGeom(frontStep2, 1.10, 1.10, 1.12, 1.1));

  const waistCore = new THREE.BoxGeometry(0.68, 0.172, 0.58);
  waistCore.translate(0, 0.508, 0);
  darkWoodParts.push(prepGeom(waistCore, 0.68, 0.68, 0.72, 1.1));

  const waistMidRail = new THREE.BoxGeometry(0.72, 0.022, 0.62);
  waistMidRail.translate(0, 0.506, 0);
  darkWoodParts.push(prepGeom(waistMidRail, 1.04, 1.02, 1.05, 1.1));

  for (const cx of [-0.348, 0.348]) {
    for (const cz of [-0.298, 0.298]) {
      const stile = new THREE.BoxGeometry(0.076, 0.174, 0.076);
      stile.translate(cx, 0.508, cz);
      darkWoodParts.push(prepGeom(stile, 1.14, 1.12, 1.14, 1.1));
    }
  }

  const upperDeck = new THREE.BoxGeometry(0.80, 0.048, 0.70);
  upperDeck.translate(0, 0.618, 0);
  darkWoodParts.push(prepGeom(upperDeck, 1.16, 1.14, 1.16, 1.1));

  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const kanagu = createScallopedCornerKanagu(sx, sz);
      kanagu.translate(sx * 0.40, 0.618, sz * 0.35);
      goldParts.push(kanagu);
    }
  }

  // ==========================================================================
  // 4. COMPACT VERMILION SANCTUARY BODY, BALUSTRADES & OFFERINGS
  // ==========================================================================
  const pillarPositions: [number, number, number][] = [
    [-0.335, 0.275, 0.535],
    [0.335, 0.275, 0.535],
    [-0.335, -0.265, 0.585],
    [0.335, -0.265, 0.585],
    [-0.335, 0.015, 0.560],
    [0.335, 0.015, 0.560],
  ];

  for (const [px, pz, ph] of pillarPositions) {
    const shoe = new THREE.BoxGeometry(0.084, 0.024, 0.084);
    shoe.translate(px, 0.654, pz);
    darkWoodParts.push(prepGeom(shoe, 0.75, 0.75, 0.80, 1.2));

    const col = new THREE.BoxGeometry(0.070, ph, 0.070);
    col.translate(px, 0.642 + ph * 0.5, pz);
    redWoodParts.push(prepGeom(col, 1.04, 1.0, 1.0, 1.1));
  }

  const moyaWalls = new THREE.BoxGeometry(0.64, 0.565, 0.275);
  moyaWalls.translate(0, 0.924, -0.125);
  redWoodParts.push(prepGeom(moyaWalls, 0.80, 0.78, 0.78, 1.1));

  for (const side of [-1, 1]) {
    const doorPanel = new THREE.BoxGeometry(0.195, 0.39, 0.022);
    doorPanel.translate(side * 0.102, 0.86, 0.016);
    darkWoodParts.push(prepGeom(doorPanel, 1.62, 1.28, 0.96, 1.4));

    for (const hy of [0.74, 0.96]) {
      const strap = new THREE.BoxGeometry(0.078, 0.015, 0.008);
      strap.translate(side * 0.152, hy, 0.029);
      goldParts.push(prepGeom(strap, 1.05, 0.94, 0.72, 3.0, false));
    }
  }
  const doorClasp = new THREE.CylinderGeometry(0.018, 0.018, 0.010, 10);
  doorClasp.rotateX(Math.PI / 2);
  doorClasp.translate(0, 0.85, 0.029);
  goldParts.push(prepGeom(doorClasp, 1.12, 0.98, 0.76, 3.0, false));

  for (const side of [-1, 1]) {
    const rx = side * 0.335;
    const lowRail = new THREE.BoxGeometry(0.028, 0.020, 0.26);
    lowRail.translate(rx, 0.702, 0.145);
    redWoodParts.push(prepGeom(lowRail, 1.0, 0.98, 0.98, 1.2));

    const topRail = new THREE.BoxGeometry(0.032, 0.024, 0.29);
    topRail.translate(rx, 0.764, 0.155);
    redWoodParts.push(prepGeom(topRail, 1.06, 1.02, 1.02, 1.2));

    const midPost = new THREE.BoxGeometry(0.026, 0.122, 0.026);
    midPost.translate(rx, 0.703, 0.145);
    redWoodParts.push(prepGeom(midPost, 0.96, 0.94, 0.94, 1.2));

    const giboshi = new THREE.SphereGeometry(0.020, 8, 8);
    giboshi.scale(1.0, 1.35, 1.0);
    giboshi.translate(rx, 0.794, 0.215);
    goldParts.push(prepGeom(giboshi, 1.10, 0.98, 0.76, 3.0, false));
  }

  const frontBeam = new THREE.BoxGeometry(0.77, 0.052, 0.058);
  frontBeam.translate(0, 1.152, 0.275);
  redWoodParts.push(prepGeom(frontBeam, 1.02, 1.0, 1.0, 1.1));

  const rearBeam = new THREE.BoxGeometry(0.77, 0.054, 0.058);
  rearBeam.translate(0, 1.192, -0.265);
  redWoodParts.push(prepGeom(rearBeam, 0.94, 0.92, 0.92, 1.1));

  for (const side of [-1, 1]) {
    const sideTie = new THREE.BoxGeometry(0.056, 0.052, 0.65);
    sideTie.translate(side * 0.335, 1.172, 0.005);
    redWoodParts.push(prepGeom(sideTie, 1.0, 0.98, 0.98, 1.1));

    for (const bz of [0.275, -0.265]) {
      const daito = new THREE.BoxGeometry(0.098, 0.032, 0.098);
      daito.translate(side * 0.335, bz > 0 ? 1.186 : 1.228, bz);
      redWoodParts.push(prepGeom(daito, 0.90, 0.88, 0.88, 1.2));

      const hijiki = new THREE.BoxGeometry(0.148, 0.028, 0.090);
      hijiki.translate(side * 0.335, bz > 0 ? 1.212 : 1.254, bz);
      redWoodParts.push(prepGeom(hijiki, 1.02, 1.0, 1.0, 1.2));
    }

    const kingPost = new THREE.BoxGeometry(0.052, 0.25, 0.052);
    kingPost.translate(side * 0.335, 1.33, -0.08);
    redWoodParts.push(prepGeom(kingPost, 0.92, 0.90, 0.90, 1.1));
  }

  // ==========================================================================
  // 5. SACRED PORCH ALTAR OFFERINGS
  // ==========================================================================
  for (const ox of [-0.10, 0.015]) {
    const trayStand = new THREE.BoxGeometry(0.068, 0.048, 0.068);
    trayStand.translate(ox, 0.666, 0.195);
    darkWoodParts.push(prepGeom(trayStand, 1.75, 1.40, 1.04, 1.8));

    const trayTop = new THREE.BoxGeometry(0.094, 0.014, 0.094);
    trayTop.translate(ox, 0.696, 0.195);
    darkWoodParts.push(prepGeom(trayTop, 1.88, 1.50, 1.10, 1.8));

    const vessel = new THREE.CylinderGeometry(0.018, 0.024, 0.038, 10);
    vessel.translate(ox, 0.722, 0.195);
    whiteAndLeafParts.push(prepGeom(vessel, 0.96, 0.96, 0.98, 1.0, false));
  }

  const goheiRod = new THREE.CylinderGeometry(0.008, 0.010, 0.24, 8);
  goheiRod.translate(-0.02, 0.78, 0.10);
  darkWoodParts.push(prepGeom(goheiRod, 1.85, 1.48, 1.08, 1.8));

  for (const gSide of [-1, 1]) {
    const goheiStream = createZigzagShideGeometry(0.62);
    goheiStream.scale(gSide, 1, 1);
    goheiStream.translate(-0.02 + gSide * 0.018, 0.90, 0.11);
    whiteAndLeafParts.push(goheiStream);
  }

  const cord = new THREE.CylinderGeometry(0.017, 0.026, 0.25, 10);
  cord.rotateZ(0.06);
  cord.translate(0.092, 0.80, 0.15);
  whiteAndLeafParts.push(prepGeom(cord, 0.94, 0.88, 0.76, 1.0, false));

  const suzuBell = new THREE.SphereGeometry(0.024, 10, 8);
  suzuBell.translate(0.082, 0.94, 0.15);
  goldParts.push(prepGeom(suzuBell, 1.12, 0.98, 0.70, 3.0, false));

  for (const vx of [-0.225, 0.225]) {
    const vz = 0.205;
    const vasePts = [
      new THREE.Vector2(0.001, 0.0),
      new THREE.Vector2(0.028, 0.0),
      new THREE.Vector2(0.024, 0.016),
      new THREE.Vector2(0.036, 0.050),
      new THREE.Vector2(0.018, 0.086),
      new THREE.Vector2(0.026, 0.110),
      new THREE.Vector2(0.016, 0.110),
    ];
    const vase = new THREE.LatheGeometry(vasePts, 14);
    vase.translate(vx, 0.642, vz);
    whiteAndLeafParts.push(prepGeom(vase, 0.97, 0.98, 1.00, 1.0, false));

    for (let lf = 0; lf < 7; lf++) {
      const ang = ((lf - 3) / 3.0) * 0.75;
      const leaf = new THREE.SphereGeometry(0.034, 7, 6);
      leaf.scale(0.55, 1.25, 0.24);
      leaf.rotateZ(-ang * 0.65);
      leaf.rotateX((lf % 2 === 0 ? 1 : -1) * 0.25);
      leaf.translate(
        vx + Math.sin(ang) * 0.032,
        0.782 + Math.cos(ang) * 0.035 + (lf % 2) * 0.014,
        vz + ((lf % 3) - 1) * 0.014
      );
      whiteAndLeafParts.push(prepGeom(leaf, 0.11, 0.26, 0.13, 1.0, false));
    }
  }

  // ==========================================================================
  // 6. SPLIT INDIGO TOBARI CURTAIN + 3D HELICAL SHIMENAWA + 3 WHITE SHIDE
  // ==========================================================================
  const curtainParts: THREE.BufferGeometry[] = [];
  const panelConfigs = [
    { x0: -0.312, x1: -0.008, u0: 0.0, u1: 0.49 },
    { x0: 0.008, x1: 0.312, u0: 0.51, u1: 1.0 },
  ];
  for (const pCfg of panelConfigs) {
    const nx = 18;
    const ny = 10;
    const cPos: number[] = [];
    const cUv: number[] = [];
    const cIdx: number[] = [];

    for (let iy = 0; iy <= ny; iy++) {
      const v = iy / ny;
      const y = THREE.MathUtils.lerp(0.875, 1.142, v);
      const drapeAmp = (1.0 - v) * 0.016;
      for (let ix = 0; ix <= nx; ix++) {
        const t = ix / nx;
        const x = THREE.MathUtils.lerp(pCfg.x0, pCfg.x1, t);
        const pleat = Math.sin(t * Math.PI * 5.0) * drapeAmp;
        const gentleBow = Math.sin(t * Math.PI) * (1.0 - v) * 0.010;
        const z = 0.272 + pleat + gentleBow;

        cPos.push(x, y, z);
        cUv.push(THREE.MathUtils.lerp(pCfg.u0, pCfg.u1, t), v);
      }
    }
    const stride = nx + 1;
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const a = iy * stride + ix;
        const b = a + 1;
        const c = a + stride + 1;
        const d = a + stride;
        cIdx.push(a, b, c, a, c, d);
        cIdx.push(a, c, b, a, d, c);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cUv, 2));
    cg.setIndex(cIdx);
    curtainParts.push(prepGeom(cg, 1.0, 1.0, 1.0, 1.0, true, 'preserve'));
  }
  const indigoCurtainGeom = mergeGeometries(curtainParts, false)!;

  const ropeSegs = 40;
  for (let strand = 0; strand < 2; strand++) {
    const curvePts: THREE.Vector3[] = [];
    for (let i = 0; i <= ropeSegs; i++) {
      const u = i / ropeSegs;
      const x = THREE.MathUtils.lerp(-0.375, 0.375, u);
      const catenary = 1.168 - 0.048 * Math.sin(u * Math.PI);
      const taper = 0.42 + 0.58 * Math.sin(u * Math.PI);
      const twistAng = u * Math.PI * 14.0 + strand * Math.PI;
      const helixR = 0.010 * taper;
      curvePts.push(
        new THREE.Vector3(
          x,
          catenary + Math.sin(twistAng) * helixR,
          0.302 + Math.cos(twistAng) * helixR
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const tube = new THREE.TubeGeometry(curve, 44, 0.018, 8, false);
    const tPos = tube.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < tPos.count; k++) {
      const vx = tPos.getX(k);
      const uApprox = THREE.MathUtils.clamp((vx + 0.375) / 0.75, 0.0, 1.0);
      const env = 0.45 + 0.55 * Math.sin(uApprox * Math.PI);
      const cy = 1.168 - 0.048 * Math.sin(uApprox * Math.PI);
      tPos.setY(k, cy + (tPos.getY(k) - cy) * env);
      tPos.setZ(k, 0.302 + (tPos.getZ(k) - 0.302) * env);
    }
    strawParts.push(prepGeom(tube, 1.04, 0.98, 0.88, 1.0, false, 'preserve'));
  }

  for (const sx of [-0.278, 0.0, 0.278]) {
    const shide = createZigzagShideGeometry(0.90);
    const yHang = 1.168 - 0.048 * Math.sin(((sx + 0.375) / 0.75) * Math.PI);
    shide.translate(sx, yHang - 0.004, 0.318);
    whiteAndLeafParts.push(shide);
  }

  // ==========================================================================
  // 7. ASYMMETRIC NAGARE-ZUKURI PATINATED COPPER ROOF (Fine 2x1.8 tiled shingles!)
  // ==========================================================================
  const nxRoof = 32;
  const nzRoof = 28;
  const roofThickness = 0.036;
  const topPos: number[] = [];
  const topUv: number[] = [];
  const topIdx: number[] = [];
  const underPos: number[] = [];
  const underUv: number[] = [];
  const underIdx: number[] = [];

  for (let iz = 0; iz <= nzRoof; iz++) {
    const vz = iz / nzRoof;
    const z = THREE.MathUtils.lerp(-0.49, 0.54, vz);
    for (let ix = 0; ix <= nxRoof; ix++) {
      const ux = ix / nxRoof;
      const x = THREE.MathUtils.lerp(-0.65, 0.65, ux);
      const y = evalNagareRoofY(x, z);

      topPos.push(x, y, z);
      // Scale roof UV so ~12 staggered copper plates span X and ~16 courses span Z!
      topUv.push(ux * 2.0, (1.0 - vz) * 1.6);

      underPos.push(x, y - roofThickness, z);
      underUv.push(ux * 2.0, vz * 2.0);
    }
  }

  const rStride = nxRoof + 1;
  for (let iz = 0; iz < nzRoof; iz++) {
    for (let ix = 0; ix < nxRoof; ix++) {
      const a = iz * rStride + ix;
      const b = a + 1;
      const c = a + rStride + 1;
      const d = a + rStride;
      topIdx.push(a, c, b, a, d, c);
      underIdx.push(a, b, c, a, c, d);
    }
  }

  const topRoofGeom = new THREE.BufferGeometry();
  topRoofGeom.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  topRoofGeom.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topRoofGeom.setIndex(topIdx);
  copperParts.push(prepGeom(topRoofGeom, 1.02, 1.04, 1.02, 1.0, false, 'preserve'));

  const underRoofGeom = new THREE.BufferGeometry();
  underRoofGeom.setAttribute('position', new THREE.Float32BufferAttribute(underPos, 3));
  underRoofGeom.setAttribute('uv', new THREE.Float32BufferAttribute(underUv, 2));
  underRoofGeom.setIndex(underIdx);
  redWoodParts.push(prepGeom(underRoofGeom, 0.56, 0.52, 0.52, 1.0, false, 'preserve'));

  for (const ez of [0.54, -0.49]) {
    const fPos: number[] = [];
    const fUv: number[] = [];
    const fIdx: number[] = [];
    for (let ix = 0; ix <= nxRoof; ix++) {
      const ux = ix / nxRoof;
      const x = THREE.MathUtils.lerp(-0.65, 0.65, ux);
      const yTop = evalNagareRoofY(x, ez);
      fPos.push(x, yTop, ez, x, yTop - 0.044, ez);
      fUv.push(ux * 2.0, 0.12, ux * 2.0, 0.02);
    }
    for (let ix = 0; ix < nxRoof; ix++) {
      const a = ix * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (ez > 0) fIdx.push(a, b, d, a, d, c);
      else fIdx.push(a, d, b, a, c, d);
    }
    const fGeom = new THREE.BufferGeometry();
    fGeom.setAttribute('position', new THREE.Float32BufferAttribute(fPos, 3));
    fGeom.setAttribute('uv', new THREE.Float32BufferAttribute(fUv, 2));
    fGeom.setIndex(fIdx);
    copperParts.push(prepGeom(fGeom, 0.80, 0.88, 0.85, 1.0, false, 'preserve'));
  }

  for (const rx of [-0.47, -0.235, 0.0, 0.235, 0.47]) {
    const ribPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 18; k++) {
      const z = THREE.MathUtils.lerp(-0.485, 0.535, k / 18);
      ribPts.push(new THREE.Vector3(rx, evalNagareRoofY(rx, z) + 0.010, z));
    }
    const ribCurve = new THREE.CatmullRomCurve3(ribPts);
    const ribTube = new THREE.TubeGeometry(ribCurve, 22, 0.011, 6, false);
    copperParts.push(prepGeom(ribTube, 0.72, 0.84, 0.80, 1.0, false, 'preserve'));
  }

  const numRafters = 9;
  for (let r = 0; r < numRafters; r++) {
    const rx = THREE.MathUtils.lerp(-0.49, 0.49, r / (numRafters - 1));

    const yStartF = evalNagareRoofY(rx, 0.27) - 0.048;
    const yEndF = evalNagareRoofY(rx, 0.51) - 0.046;
    const dzF = 0.51 - 0.27;
    const dyF = yEndF - yStartF;
    const lenF = Math.hypot(dzF, dyF);
    const pitchF = -Math.atan2(dyF, dzF);

    const rafterF = new THREE.BoxGeometry(0.026, 0.026, lenF);
    rafterF.rotateX(pitchF);
    rafterF.translate(rx, (yStartF + yEndF) * 0.5, (0.27 + 0.51) * 0.5);
    redWoodParts.push(prepGeom(rafterF, 0.90, 0.86, 0.86, 1.2, false));

    const whiteCapF = new THREE.BoxGeometry(0.027, 0.027, 0.008);
    whiteCapF.rotateX(pitchF);
    whiteCapF.translate(rx, yEndF, 0.512);
    whiteAndLeafParts.push(prepGeom(whiteCapF, 0.96, 0.96, 0.98, 1.0, false));
  }

  for (const side of [-1, 1] as const) {
    const gx = side * 0.626;
    for (let k = 0; k < 18; k++) {
      const z0 = THREE.MathUtils.lerp(-0.49, 0.54, k / 18);
      const z1 = THREE.MathUtils.lerp(-0.49, 0.54, (k + 1) / 18);
      const y0 = evalNagareRoofY(gx, z0) - 0.035;
      const y1 = evalNagareRoofY(gx, z1) - 0.035;
      const segLen = Math.hypot(z1 - z0, y1 - y0) + 0.008;
      const ang = -Math.atan2(y1 - y0, z1 - z0);
      const segBox = new THREE.BoxGeometry(0.030, 0.076, segLen);
      segBox.rotateX(ang);
      segBox.translate(gx, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
      darkWoodParts.push(prepGeom(segBox, 1.08, 1.05, 1.02, 1.2, false));
    }

    const sideKiku = createChrysanthemumCrest(0.034);
    sideKiku.rotateY(side * (Math.PI / 2));
    sideKiku.translate(gx + side * 0.018, evalNagareRoofY(gx, 0.08) - 0.035, 0.08);
    goldParts.push(sideKiku);

    const gegyo = new THREE.BoxGeometry(0.020, 0.125, 0.085);
    gegyo.translate(gx - side * 0.016, 1.44, -0.08);
    redWoodParts.push(prepGeom(gegyo, 1.04, 1.0, 1.0, 1.2, false));

    const gegyoGold = new THREE.SphereGeometry(0.022, 8, 6);
    gegyoGold.scale(0.35, 0.85, 1.1);
    gegyoGold.translate(gx - side * 0.006, 1.46, -0.08);
    goldParts.push(prepGeom(gegyoGold, 1.10, 0.98, 0.74, 3.0, false));
  }

  const ridgeBase = new THREE.BoxGeometry(1.28, 0.040, 0.088);
  ridgeBase.translate(0, 1.555, -0.08);
  copperParts.push(prepGeom(ridgeBase, 0.50, 0.58, 0.58, 1.0, false));

  const ridgeTopBar = new THREE.CylinderGeometry(0.026, 0.030, 1.30, 10);
  ridgeTopBar.rotateZ(Math.PI / 2);
  ridgeTopBar.translate(0, 1.590, -0.08);
  copperParts.push(prepGeom(ridgeTopBar, 0.64, 0.74, 0.72, 1.0, false));

  const centerRidgeKiku = createChrysanthemumCrest(0.026);
  centerRidgeKiku.translate(0, 1.572, -0.032);
  goldParts.push(centerRidgeKiku);

  for (const side of [-1, 1]) {
    const endCollar = new THREE.BoxGeometry(0.070, 0.092, 0.118);
    endCollar.rotateZ(side * -0.08);
    endCollar.translate(side * 0.595, 1.586, -0.08);
    copperParts.push(prepGeom(endCollar, 0.46, 0.54, 0.54, 1.0, false));

    const endGoldBoss = new THREE.SphereGeometry(0.016, 8, 8);
    endGoldBoss.translate(side * 0.595, 1.596, -0.018);
    goldParts.push(prepGeom(endGoldBoss, 1.15, 1.0, 0.76, 3.0, false));
  }

  return {
    graniteGeom: mergeGeometries(graniteParts, false)!,
    darkWoodGeom: mergeGeometries(darkWoodParts, false)!,
    redWoodGeom: mergeGeometries(redWoodParts, false)!,
    copperGeom: mergeGeometries(copperParts, false)!,
    goldGeom: mergeGeometries(goldParts, false)!,
    strawGeom: mergeGeometries(strawParts, false)!,
    whiteAndLeafGeom: mergeGeometries(whiteAndLeafParts, false)!,
    indigoCurtainGeom,
  };
}

// Physically Grounded PBR Material Hook (100% Opaque for Real 3D Shadow Maps + Wet Waterline Gloss + Ocean Caustics!)
function enhanceHokoraPBRMaterial(
  mat: THREE.MeshStandardMaterial,
  sharedUniforms: {
    uTime: { value: number };
    uHokoraVis: { value: number };
  }
) {
  mat.transparent = false;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHokoraTime = sharedUniforms.uTime;
    shader.uniforms.uHokoraVis = sharedUniforms.uHokoraVis;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vHokoraWorldPos;
        varying vec3 vHokoraWorldNormal;
        `
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vec4 hokoraWp = modelMatrix * vec4(transformed, 1.0);
        vHokoraWorldPos = hokoraWp.xyz;
        vHokoraWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uHokoraTime;
        uniform float uHokoraVis;
        varying vec3 vHokoraWorldPos;
        varying vec3 vHokoraWorldNormal;
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        // Smooth stochastic screen-space dither fade during portal flight while keeping 100% Opaque Shadow-Map PBR!
        if (uHokoraVis <= 0.005) discard;
        if (uHokoraVis < 0.992) {
          float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          if (uHokoraVis < dither) discard;
        }
        #include <color_fragment>

        // Live sea-spray dampness & dark coastal algae stain right near the lapping waterline
        float waveLap = 0.035 * sin(vHokoraWorldPos.x * 2.2 + uHokoraTime * 1.3);
        float wetH = vHokoraWorldPos.y - waveLap;
        float wetStain = 1.0 - smoothstep(-0.04, 0.28, wetH);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.30, 0.34, 0.32), wetStain * 0.85);
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        // Specular wet stone sheen where waves lap against the lower granite courses!
        float wetGloss = 1.0 - smoothstep(-0.02, 0.32, vHokoraWorldPos.y);
        roughnessFactor = mix(roughnessFactor, 0.11, wetGloss * 0.86);
        `
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        vec3 wN = normalize(vHokoraWorldNormal);
        vec3 viewV = normalize(cameraPosition - vHokoraWorldPos);

        // 1. Subtle animated ocean & golden lantern caustics bouncing upward onto stone coping & eaves!
        float downFace = max(0.0, -wN.y * 0.72 + 0.28);
        float causticAtten = exp(-max(0.0, vHokoraWorldPos.y) * 0.75);
        float cw1 = sin(vHokoraWorldPos.x * 4.6 + vHokoraWorldPos.z * 3.8 + uHokoraTime * 2.1);
        float cw2 = cos(vHokoraWorldPos.x * 3.5 - vHokoraWorldPos.z * 4.9 - uHokoraTime * 1.7);
        float caustic = pow(max(0.0, cw1 * cw2), 2.2);
        vec3 causticCol = vec3(0.24, 0.22, 0.18);
        totalEmissiveRadiance += diffuseColor.rgb * causticCol * caustic * downFace * causticAtten * 1.45;

        // 2. Delicate nocturnal silver-indigo grazing Fresnel rim on curved eaves & corners
        float fresnel = pow(1.0 - abs(dot(wN, viewV)), 3.6);
        totalEmissiveRadiance += vec3(0.055, 0.095, 0.175) * fresnel;
        `
      );
  };
  return mat;
}

export function HokoraShrine({
  position = [0, 0.03, -20.2],
  scale = 1.54,
  visibilityRef,
}: HokoraShrineProps) {
  const wrapperRef = useRef<THREE.Group>(null);
  const meshGroupRef = useRef<THREE.Group>(null);
  const moonKeyRef = useRef<THREE.DirectionalLight>(null);
  const moonTargetObj = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 1.15, 0);
    return o;
  }, []);
  const altarCandleRef = useRef<THREE.PointLight>(null);
  const frontLanternBounceRef = useRef<THREE.PointLight>(null);
  const shadowBakedRef = useRef(false);

  const sharedUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHokoraVis: { value: 0 },
    }),
    []
  );

  const meshes = useMemo(() => buildCompleteHokoraMeshes(), []);

  const materials = useMemo(() => {
    const tex = getHokoraTextures();

    const graniteMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        map: tex.granite.map,
        normalMap: tex.granite.normalMap,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughnessMap: tex.granite.roughnessMap,
        roughness: 0.84,
        metalness: 0.05,
        envMapIntensity: 1.25,
        vertexColors: true,
      }),
      sharedUniforms
    );

    const darkWoodMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        map: tex.darkWood.map,
        normalMap: tex.darkWood.normalMap,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughnessMap: tex.darkWood.roughnessMap,
        roughness: 0.68,
        metalness: 0.06,
        envMapIntensity: 1.35,
        vertexColors: true,
      }),
      sharedUniforms
    );

    const redWoodMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        map: tex.redWood.map,
        normalMap: tex.redWood.normalMap,
        normalScale: new THREE.Vector2(1.05, 1.05),
        roughnessMap: tex.redWood.roughnessMap,
        roughness: 0.42,
        metalness: 0.08,
        envMapIntensity: 1.55,
        vertexColors: true,
      }),
      sharedUniforms
    );

    const copperRoofMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        map: tex.copperTile.map,
        normalMap: tex.copperTile.normalMap,
        normalScale: new THREE.Vector2(1.45, 1.45),
        roughnessMap: tex.copperTile.roughnessMap,
        roughness: 0.48,
        metalness: 0.56,
        envMapIntensity: 2.10,
        vertexColors: true,
      }),
      sharedUniforms
    );

    const goldMetalMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        map: tex.goldMetal.map,
        normalMap: tex.goldMetal.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: tex.goldMetal.roughnessMap,
        color: '#f2c45a',
        roughness: 0.24,
        metalness: 0.92,
        envMapIntensity: 2.60,
        vertexColors: true,
      }),
      sharedUniforms
    );

    const strawRopeMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        map: tex.strawRope.map,
        normalMap: tex.strawRope.normalMap,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughnessMap: tex.strawRope.roughnessMap,
        roughness: 0.82,
        metalness: 0.02,
        envMapIntensity: 1.15,
        vertexColors: true,
      }),
      sharedUniforms
    );

    const indigoCurtainMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        map: tex.indigoCurtainMap,
        normalMap: tex.indigoCurtainNormal,
        normalScale: new THREE.Vector2(1.10, 1.10),
        roughness: 0.86,
        metalness: 0.02,
        envMapIntensity: 1.10,
        vertexColors: true,
      }),
      sharedUniforms
    );

    const whiteAndLeafMat = enhanceHokoraPBRMaterial(
      new THREE.MeshStandardMaterial({
        roughness: 0.28,
        metalness: 0.04,
        envMapIntensity: 1.40,
        vertexColors: true,
      }),
      sharedUniforms
    );

    return {
      graniteMat,
      darkWoodMat,
      redWoodMat,
      copperRoofMat,
      goldMetalMat,
      strawRopeMat,
      indigoCurtainMat,
      whiteAndLeafMat,
    };
  }, [sharedUniforms]);

  useEffect(() => {
    if (meshGroupRef.current) {
      meshGroupRef.current.traverse((obj) => obj.layers.enable(1));
    }
    if (moonKeyRef.current) {
      moonKeyRef.current.shadow.autoUpdate = false;
      moonKeyRef.current.shadow.needsUpdate = true;
    }
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const vis = visibilityRef.current;

    sharedUniforms.uTime.value = t;
    sharedUniforms.uHokoraVis.value = vis;

    const show = vis > 0.005;
    if (wrapperRef.current) {
      wrapperRef.current.visible = show;
    }
    if (!show) {
      if (moonKeyRef.current) moonKeyRef.current.intensity = 0;
      if (altarCandleRef.current) altarCandleRef.current.intensity = 0;
      if (frontLanternBounceRef.current) frontLanternBounceRef.current.intensity = 0;
      return;
    }

    // Trigger static 1024x1024 shadow-map bake once the Hokora enters full view (0.00ms per-frame cost thereafter!)
    if (!shadowBakedRef.current && vis > 0.992 && moonKeyRef.current) {
      moonKeyRef.current.shadow.needsUpdate = true;
      shadowBakedRef.current = true;
    } else if (vis < 0.5) {
      shadowBakedRef.current = false;
    }

    const flicker = 0.92 + 0.08 * Math.sin(t * 5.4) * Math.cos(t * 3.1 + 1.2);

    if (moonKeyRef.current) {
      moonKeyRef.current.intensity = 3.4 * vis;
    }
    if (altarCandleRef.current) {
      altarCandleRef.current.intensity = 8.5 * flicker * vis;
    }
    if (frontLanternBounceRef.current) {
      frontLanternBounceRef.current.intensity = 3.2 * flicker * vis;
    }
  });

  return (
    <group position={position} name="HokoraSanctuaryLightingAndMesh">
      <primitive object={moonTargetObj} />

      {/* 1. Dedicated Static-Baked 1024x1024 Oborozuki Moonlight Key Light (4.3mm Razor-Sharp Real 3D Shadows!) */}
      <directionalLight
        ref={moonKeyRef}
        position={[-5.2, 4.35, 5.4]}
        target={moonTargetObj}
        color="#c6dcff"
        intensity={0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1.5}
        shadow-camera-far={15.0}
        shadow-camera-left={-2.1}
        shadow-camera-right={2.1}
        shadow-camera-top={2.85}
        shadow-camera-bottom={-0.35}
        shadow-bias={-0.0005}
        shadow-normalBias={0.015}
      />

      {/* 2. Real Physical GGX Sanctuary Altar Candle PointLight inside the Hokora Chamber */}
      <pointLight
        ref={altarCandleRef}
        position={[0, 1.36, 0.14]}
        color="#ff9638"
        distance={3.9}
        decay={2.0}
        intensity={0}
      />

      {/* 3. Subtle Warm Floating-Lantern Sea Bounce onto Saisen-bako Coin Box & Lower Granite Courses */}
      <pointLight
        ref={frontLanternBounceRef}
        position={[0, 0.45, 1.38]}
        color="#ffb45c"
        distance={4.2}
        decay={2.0}
        intensity={0}
      />

      {/* 8 Batched Opaque PBR Architectural Meshes Casting & Receiving Real 3D Shadows */}
      <group ref={wrapperRef} visible={false} name="HokoraMeshVisibilityGate">
      <group ref={meshGroupRef} scale={scale} name="HokoraShrine">
        <mesh
          geometry={meshes.graniteGeom}
          material={materials.graniteMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        <mesh
          geometry={meshes.darkWoodGeom}
          material={materials.darkWoodMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        <mesh
          geometry={meshes.redWoodGeom}
          material={materials.redWoodMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        <mesh
          geometry={meshes.copperGeom}
          material={materials.copperRoofMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        <mesh
          geometry={meshes.goldGeom}
          material={materials.goldMetalMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        <mesh
          geometry={meshes.strawGeom}
          material={materials.strawRopeMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        <mesh
          geometry={meshes.indigoCurtainGeom}
          material={materials.indigoCurtainMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        <mesh
          geometry={meshes.whiteAndLeafGeom}
          material={materials.whiteAndLeafMat}
          castShadow
          receiveShadow
          raycast={() => null}
        />
      </group>
      </group>
    </group>
  );
}
