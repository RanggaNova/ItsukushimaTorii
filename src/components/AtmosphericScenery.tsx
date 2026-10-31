import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState } from '../state/experienceState';
import { getSharedNoiseTexture } from '../utils/proceduralTextures';

// ============================================================================
// 1. MULTI-LAYER JAPANESE ISLAND MOUNTAIN RANGES (MOUNT MISEN / MIYAJIMA STYLE)
// ============================================================================
const mountainVertexShader = /* glsl */ `
attribute float aLayer;
varying float vHeight;
varying float vLayer;
varying vec3 vWorldPos;
varying vec3 vNormalW;

void main() {
  vHeight = position.y;
  vLayer = aLayer;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const mountainFragmentShader = /* glsl */ `
uniform float uPortalProgress;
uniform float uTime;

varying float vHeight;
varying float vLayer;
varying vec3 vWorldPos;
varying vec3 vNormalW;

void main() {
  float atmMix = smoothstep(0.06, 0.96, uPortalProgress);

  // Sumi-e ink-wash coastal mountain layers matched to moody twilight-silver mist
  vec3 calmNear = vec3(0.095, 0.135, 0.175);
  vec3 calmMid  = vec3(0.205, 0.265, 0.325);
  vec3 calmFar  = vec3(0.355, 0.425, 0.495);

  vec3 darkNear = vec3(0.0014, 0.0030, 0.0072);
  vec3 darkMid  = vec3(0.0020, 0.0044, 0.0105);
  vec3 darkFar  = vec3(0.0026, 0.0058, 0.0135);

  vec3 calmBase = vLayer < 0.5 ? calmNear : (vLayer < 1.5 ? calmMid : calmFar);
  vec3 darkBase = vLayer < 0.5 ? darkNear : (vLayer < 1.5 ? darkMid : darkFar);
  vec3 col = mix(calmBase, darkBase, atmMix);

  // Directional mist-sun highlight on left mountain slopes + Aurora Borealis rim in dark mode
  float ridgeUp = clamp(vNormalW.y, 0.0, 1.0);
  float sunSlope = clamp(dot(vNormalW, normalize(vec3(-0.6, 0.5, 0.4))), 0.0, 1.0);
  col += vec3(0.065, 0.068, 0.072) * sunSlope * (1.0 - atmMix) * (1.0 - vLayer * 0.3);

  float auroraRim = smoothstep(2.5, 16.0, vHeight) * pow(ridgeUp, 0.7) * smoothstep(0.22, 1.0, uPortalProgress);
  float auroraWave = 0.65 + 0.35 * sin(vWorldPos.x * 0.05 + uTime * 0.25);
  col += mix(vec3(0.005, 0.022, 0.036), vec3(0.012, 0.010, 0.038), vLayer * 0.45) * auroraRim * auroraWave;

  // Valley mist hugging island bases so mountains float seamlessly in sea fog
  vec3 calmMist = vec3(0.585, 0.645, 0.705);
  vec3 darkMist = vec3(0.0020, 0.0042, 0.0105);
  vec3 mistCol  = mix(calmMist, darkMist, atmMix);

  float baseMistFactor = 1.0 - smoothstep(0.0, 3.8 + vLayer * 1.9, vHeight);
  float distHaze = mix(0.26, 0.76, vLayer * 0.5);
  col = mix(col, mistCol, clamp(max(baseMistFactor * 0.94, distHaze * (1.0 - atmMix * 0.35)), 0.0, 0.96));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ============================================================================
// 2. GHOST-OF-TSUSHIMA CAMERA-ALIGNED GOSSAMER WIND FILAMENTS (ZERO TWISTING!)
// ============================================================================
const windVertexShader = /* glsl */ `
attribute vec4 aWindMeta; // x: uAlong (0..1), y: side (-1 or +1), z: phase, w: maxHalfWidth
uniform float uTime;
uniform float uPortalProgress;
uniform vec3 uCameraPos;

varying vec2 vWindUv;
varying float vPhase;
varying float vPacketMask;

// Parametric 3D wind curve evaluated analytically so tangent T is 100% smooth & exact!
vec3 evalWindCurve(vec3 seedAnchor, float u, float phase, float t, float portalProg) {
  // Graceful sweeping breeze across X & Z, skimming low over the water (y = 0.35m .. 2.8m)
  float span = 22.0;
  float x = seedAnchor.x + (u - 0.5) * span;
  float sWave = sin(u * 5.2 - t * 0.85 + phase * 6.283) * 1.15;
  float yWave = sin(u * 4.4 - t * 0.70 + phase * 9.1) * 0.22;
  float z = seedAnchor.z + sWave + (u - 0.5) * seedAnchor.y * 4.5;
  float y = abs(seedAnchor.y) * 2.4 + 0.35 + yWave;

  vec3 p = vec3(x, y, z);

  // Natural parting flow around the Torii pillars in calm mode
  float distCenter = length(p.xz);
  if (distCenter < 4.5) {
    p.z += sign(p.z + 0.01) * (4.5 - distCenter) * 0.25 * (1.0 - portalProg);
  }

  // Smooth helical curl inward toward the inner Torii portal (0, 2.05, 0) when portal opens!
  float pull = smoothstep(0.12, 1.0, portalProg) * smoothstep(0.15, 0.95, u);
  if (pull > 0.001) {
    vec3 portalTarget = vec3(
      cos(u * 6.0 + phase * 6.283 - t * 1.8) * (1.8 * (1.0 - u)),
      2.05 + sin(u * 5.0 + phase * 6.283 - t * 1.8) * (1.2 * (1.0 - u)),
      0.0
    );
    p = mix(p, portalTarget, pull * 0.82);
  }

  return p;
}

void main() {
  float u = aWindMeta.x;
  float side = aWindMeta.y;
  float phase = aWindMeta.z;
  float maxHalfW = aWindMeta.w;

  // Compute traveling wind wisp envelope right here so only active tapered portion has thickness!
  float speed = mix(0.19, 0.44, uPortalProgress);
  float head = fract(uTime * speed + phase) * 1.50 - 0.25;
  float localU = (u - (head - 0.32)) / 0.32; // 0 = tail, 1 = nose of gust
  float gustTaper = (localU > 0.0 && localU < 1.0) ? sin(localU * 3.14159265) : 0.0;
  float pathFade  = sin(u * 3.14159265);
  vPacketMask = gustTaper * pathFade;

  // Evaluate 3D curve center & exact forward tangent
  vec3 p0 = evalWindCurve(position, u, phase, uTime, uPortalProgress);
  vec3 p1 = evalWindCurve(position, min(1.0, u + 0.015), phase, uTime, uPortalProgress);
  vec3 tangent = normalize(p1 - p0 + vec3(0.0001, 0.0, 0.0));

  // Camera-aligned billboard normal: ALWAYS faces camera cleanly from ANY 360-degree orbit angle!
  vec3 toCam = normalize(uCameraPos - p0);
  vec3 sideVec = normalize(cross(tangent, toCam));

  float halfW = maxHalfW * pow(gustTaper, 0.7);
  vec3 finalWorldPos = p0 + sideVec * (side * halfW);

  vWindUv = vec2(localU, side * 0.5 + 0.5);
  vPhase = phase;

  gl_Position = projectionMatrix * viewMatrix * vec4(finalWorldPos, 1.0);
}
`;

const windFragmentShader = /* glsl */ `
uniform float uPortalProgress;

varying vec2 vWindUv;
varying float vPhase;
varying float vPacketMask;

void main() {
  if (vPacketMask <= 0.002) discard;

  // Gossamer calligraphy-hair cross-section (soft Gaussian core, invisible edges!)
  float across = abs(vWindUv.y * 2.0 - 1.0);
  float coreProfile = pow(max(0.0, 1.0 - across), 2.2);

  float alpha = coreProfile * pow(vPacketMask, 1.35) * mix(0.14, 0.30, uPortalProgress);
  if (alpha <= 0.002) discard;

  // Calm state: Subtle misty pearl breeze; Dark mode: Ghostly moonlit silver-indigo spirit wind!
  vec3 calmCol = vec3(0.76, 0.82, 0.88);
  vec3 spiritCol = mix(vec3(0.08, 0.22, 0.34), vec3(0.16, 0.26, 0.62), fract(vPhase * 5.7 + vWindUv.x * 0.4));
  vec3 col = mix(calmCol, spiritCol, smoothstep(0.18, 0.88, uPortalProgress));

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ============================================================================
// 3. VOLUMETRIC MYSTICAL GOD-RAYS & PORTAL LIGHT SHAFTS (KOMOREBI / TYNDALL RAYS)
// ============================================================================
const rayVertexShader = /* glsl */ `
attribute vec2 aRayMeta; // x: rayType (0 = sky mist sunbeam, 1 = portal shaft), y: intensitySeed
varying vec2 vUv;
varying float vRayType;
varying float vSeed;
varying float vEdgeFade;

void main() {
  vUv = uv;
  vRayType = aRayMeta.x;
  vSeed = aRayMeta.y;

  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 worldN = normalize(mat3(modelMatrix) * normal);
  vec3 viewDir = normalize(cameraPosition - wp.xyz);

  // Softly fade out whenever camera orbits edge-on to a ray sheet so zero flat planes ever show!
  vEdgeFade = pow(abs(dot(worldN, viewDir)), 1.35);

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const rayFragmentShader = /* glsl */ `
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform float uPortalProgress;
uniform float uShockwave;

varying vec2 vUv;
varying float vRayType;
varying float vSeed;
varying float vEdgeFade;

void main() {
  // Smooth lateral & longitudinal beam falloff
  float across = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);
  across = pow(across, 2.2);
  float along = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));

  // Subtle slow-drifting dust/mist modulation inside the beam
  float n = texture2D(uNoiseTex, vec2(vUv.x * 1.5 + vSeed, vUv.y * 0.8 - uTime * 0.025)).r;
  float shimmer = 0.65 + 0.55 * n;

  if (vRayType < 0.5) {
    // Calm Misty Tyndall Sunbeams slanting behind & across the Torii Gate!
    float calmVis = 1.0 - smoothstep(0.15, 0.78, uPortalProgress);
    float alpha = across * along * vEdgeFade * shimmer * calmVis * 0.075;
    if (alpha <= 0.001) discard;
    vec3 sunRayCol = vec3(0.82, 0.86, 0.92);
    gl_FragColor = vec4(sunRayCol, alpha);
  } else {
    // Supernatural Volumetric Portal Light Beams streaming out from between the Hashira pillars!
    float portalVis = smoothstep(0.28, 1.0, uPortalProgress);
    float alpha = across * along * vEdgeFade * shimmer * portalVis * (0.11 + uShockwave * 0.11);
    if (alpha <= 0.001) discard;
    vec3 portalRayCol = mix(vec3(0.05, 0.20, 0.52), vec3(0.06, 0.22, 0.36), vSeed);
    gl_FragColor = vec4(portalRayCol, alpha);
  }

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ============================================================================
// 4. LOW ROLLING MYSTIC SEA-SURFACE FOG CARPET AROUND THE SUBMERGED PILLARS
// ============================================================================
const carpetVertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const carpetFragmentShader = /* glsl */ `
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform float uPortalProgress;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // Swirl coordinates inward around the Torii base when portal opens!
  float swirl = smoothstep(0.1, 1.0, uPortalProgress) * (1.8 / (r + 0.35));
  float ang = atan(p.y, p.x) - swirl + uTime * 0.03 * uPortalProgress;
  vec2 swirledP = vec2(cos(ang), sin(ang)) * r;

  vec2 uvA = swirledP * 1.35 + vec2(uTime * 0.014, -uTime * 0.009);
  vec2 uvB = swirledP * 2.60 - vec2(uTime * 0.011, uTime * 0.016);
  float nA = texture2D(uNoiseTex, uvA).r;
  float nB = texture2D(uNoiseTex, uvB + nA * 0.25).g;

  float vapor = smoothstep(0.32, 0.84, nA * 0.55 + nB * 0.55);
  float radialEnvelope = smoothstep(1.0, 0.22, r) * smoothstep(0.02, 0.16, r);
  // Denser eerie low sea-fog rolling over dark water when entering supernatural night mode!
  float alpha = vapor * radialEnvelope * mix(0.22, 0.44, uPortalProgress);
  if (alpha <= 0.002) discard;

  float atmMix = smoothstep(0.08, 0.95, uPortalProgress);
  vec3 calmVapor = vec3(0.66, 0.72, 0.78);
  vec3 darkVapor = mix(vec3(0.009, 0.020, 0.046), vec3(0.032, 0.095, 0.215), exp(-r * 3.0));
  vec3 col = mix(calmVapor, darkVapor, atmMix);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ============================================================================
// 5. FLOATING HITODAMA / SPIRIT MOTES
// ============================================================================
const moteVertexShader = /* glsl */ `
attribute vec3 aMoteMeta;
uniform float uTime;
uniform float uPortalProgress;
uniform float uPixelRatio;

varying float vTwinkle;
varying float vPhase;

void main() {
  vPhase = aMoteMeta.x;
  float t = uTime * aMoteMeta.y + aMoteMeta.x * 20.0;

  vec3 pos = position;
  pos.x += sin(t * 0.7) * 0.85;
  pos.y += sin(t * 0.9 + 1.3) * 0.45 + uPortalProgress * 0.4;
  pos.z += cos(t * 0.65) * 0.85;

  if (uPortalProgress > 0.05) {
    vec3 toCenter = vec3(0.0, 2.1, 0.0) - pos;
    float d = length(toCenter);
    float pull = smoothstep(0.1, 1.0, uPortalProgress) * clamp(3.5 / (d + 1.5), 0.0, 0.68);
    pos += toCenter * pull * (0.5 + 0.5 * sin(t * 0.8));
  }

  vTwinkle = 0.40 + 0.60 * sin(t * 2.2);

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;
  gl_PointSize = clamp((aMoteMeta.z * uPixelRatio * 44.0) / max(1.0, -mvPos.z), 1.5, 20.0);
}
`;

const moteFragmentShader = /* glsl */ `
uniform float uPortalProgress;
varying float vTwinkle;
varying float vPhase;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;

  float glow = pow(1.0 - r2, 2.5);
  float alpha = glow * vTwinkle * mix(0.28, 0.78, uPortalProgress);

  vec3 calmMote = vec3(0.88, 0.92, 0.96);
  // Ghostly pale blue-silver & spectral indigo Hitodama spirit wisps!
  vec3 spiritMote = mix(vec3(0.24, 0.46, 0.78), vec3(0.38, 0.34, 0.85), fract(vPhase * 7.3));
  vec3 col = mix(calmMote, spiritMote, smoothstep(0.15, 0.85, uPortalProgress));

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ============================================================================
// GEOMETRY BUILDERS
// ============================================================================
function buildMountainRangesGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const layers: number[] = [];
  const indices: number[] = [];

  const ringConfigs = [
    { layer: 0, radius: 74, maxH: 10.5, arcStart: -Math.PI * 0.92, arcEnd: -Math.PI * 0.08, segs: 110, seed: 1.3 },
    { layer: 1, radius: 104, maxH: 16.5, arcStart: -Math.PI * 1.08, arcEnd: Math.PI * 0.08, segs: 130, seed: 4.7 },
    { layer: 2, radius: 138, maxH: 24.5, arcStart: -Math.PI * 1.18, arcEnd: Math.PI * 0.18, segs: 140, seed: 9.2 },
  ];

  let vertOffset = 0;
  for (const cfg of ringConfigs) {
    const radialRows = 6;
    const ringThickness = 22.0;

    for (let i = 0; i <= cfg.segs; i++) {
      const u = i / cfg.segs;
      const theta = cfg.arcStart + u * (cfg.arcEnd - cfg.arcStart);
      const arcEnvelope = Math.sin(u * Math.PI);

      let centerChannelMask = 1.0;
      if (cfg.layer === 0) {
        const distFromBackCenter = Math.abs(theta + Math.PI * 0.5);
        centerChannelMask = THREE.MathUtils.smoothstep(distFromBackCenter, 0.10, 0.34);
      } else if (cfg.layer === 1) {
        const distFromBackCenter = Math.abs(theta + Math.PI * 0.5);
        centerChannelMask = 0.42 + 0.58 * THREE.MathUtils.smoothstep(distFromBackCenter, 0.04, 0.28);
      }

      const n1 = Math.abs(Math.sin(theta * 5.0 + cfg.seed));
      const n2 = Math.abs(Math.cos(theta * 11.0 - cfg.seed * 1.7)) * 0.5;
      const n3 = Math.abs(Math.sin(theta * 23.0 + cfg.seed * 2.3)) * 0.22;
      const ridgeH =
        cfg.maxH *
        Math.pow(arcEnvelope, 0.65) *
        centerChannelMask *
        (0.32 + 0.68 * (1.0 - n1 * 0.55 + n2 * 0.45 + n3 * 0.3));

      for (let r = 0; r <= radialRows; r++) {
        const rv = r / radialRows;
        const crossProfile =
          rv < 0.45 ? Math.pow(rv / 0.45, 1.35) : Math.pow(1.0 - (rv - 0.45) / 0.55, 1.2);
        const rad = cfg.radius + (rv - 0.2) * ringThickness;
        positions.push(Math.cos(theta) * rad, ridgeH * crossProfile - 0.35, Math.sin(theta) * rad);
        layers.push(cfg.layer);
        normals.push(0, 1, 0);
      }
    }

    const stride = radialRows + 1;
    for (let i = 0; i < cfg.segs; i++) {
      for (let r = 0; r < radialRows; r++) {
        const a = vertOffset + i * stride + r;
        const b = vertOffset + (i + 1) * stride + r;
        const c = vertOffset + (i + 1) * stride + (r + 1);
        const d = vertOffset + i * stride + (r + 1);
        indices.push(a, b, c, a, c, d);
      }
    }
    vertOffset += (cfg.segs + 1) * stride;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('aLayer', new THREE.Float32BufferAttribute(layers, 1));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function buildCameraAlignedWindGeometry(): THREE.BufferGeometry {
  const filamentCount = 14;
  const segsAlong = 48;
  const positions: number[] = []; // stores seedAnchor (anchorX, heightFactor, anchorZ)
  const metas: number[] = [];     // (u, side, phase, maxHalfWidth)
  const indices: number[] = [];

  let rng = 5151;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  let vOffset = 0;
  for (let f = 0; f < filamentCount; f++) {
    const anchorX = (rand() - 0.5) * 10.0;
    const heightFactor = (rand() - 0.5) * 1.4; // encodes gentle Z-slant & low height (0.35m..2.1m)
    const anchorZ = -7.5 + rand() * 15.0;
    const phase = f / filamentCount + rand() * 0.06;
    const maxHalfW = 0.018 + rand() * 0.018; // Ultra-delicate calligraphy stroke width!

    for (let i = 0; i <= segsAlong; i++) {
      const u = i / segsAlong;

      positions.push(anchorX, heightFactor, anchorZ);
      metas.push(u, -1.0, phase, maxHalfW);

      positions.push(anchorX, heightFactor, anchorZ);
      metas.push(u, 1.0, phase, maxHalfW);
    }

    for (let i = 0; i < segsAlong; i++) {
      const a = vOffset + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
    vOffset += (segsAlong + 1) * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('aWindMeta', new THREE.Float32BufferAttribute(metas, 4));
  geom.setIndex(indices);
  return geom;
}

function buildLightShaftsGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const metas: number[] = [];
  const indices: number[] = [];
  let vOff = 0;

  const addBeamQuad = (
    topCenter: THREE.Vector3,
    botCenter: THREE.Vector3,
    normalDir: THREE.Vector3,
    topWidth: number,
    botWidth: number,
    rayType: number,
    seed: number
  ) => {
    const axis = new THREE.Vector3().subVectors(topCenter, botCenter).normalize();
    const nrm = normalDir.clone().normalize();
    const right = new THREE.Vector3().crossVectors(axis, nrm).normalize();

    const pBL = botCenter.clone().addScaledVector(right, -botWidth * 0.5);
    const pBR = botCenter.clone().addScaledVector(right, botWidth * 0.5);
    const pTR = topCenter.clone().addScaledVector(right, topWidth * 0.5);
    const pTL = topCenter.clone().addScaledVector(right, -topWidth * 0.5);

    positions.push(
      pBL.x, pBL.y, pBL.z,
      pBR.x, pBR.y, pBR.z,
      pTR.x, pTR.y, pTR.z,
      pTL.x, pTL.y, pTL.z
    );
    for (let k = 0; k < 4; k++) normals.push(nrm.x, nrm.y, nrm.z);
    uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    for (let k = 0; k < 4; k++) metas.push(rayType, seed);
    indices.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3);
    vOff += 4;
  };

  // A. 5 Crossed Diagonal Misty Sunbeams (Komorebi) slanting gently behind & through the Torii!
  const sunShaftConfigs = [
    { x: -3.2, z: -2.5, wTop: 2.8, wBot: 5.2, seed: 0.12 },
    { x:  0.2, z: -1.8, wTop: 3.4, wBot: 6.4, seed: 0.37 },
    { x:  3.5, z: -3.2, wTop: 2.6, wBot: 4.8, seed: 0.64 },
  ];
  sunShaftConfigs.forEach((cfg) => {
    const top = new THREE.Vector3(cfg.x - 6.5, 16.5, cfg.z - 3.0);
    const bot = new THREE.Vector3(cfg.x + 4.2, -0.2, cfg.z + 2.2);
    // Crossed pair of orthogonal planes so volumetric shaft is visible from front & angled orbits!
    addBeamQuad(top, bot, new THREE.Vector3(0, 0, 1), cfg.wTop, cfg.wBot, 0.0, cfg.seed);
    addBeamQuad(top, bot, new THREE.Vector3(0.85, 0, 0.52), cfg.wTop, cfg.wBot, 0.0, cfg.seed + 0.19);
  });

  // B. Volumetric Portal Sanctuary Light Shafts radiating front (+Z) and back (-Z) out of the inner gate!
  for (const dirZ of [1, -1]) {
    const origin = new THREE.Vector3(0, 2.15, dirZ * 0.15);
    const target = new THREE.Vector3(0, 0.05, dirZ * 11.5);
    addBeamQuad(origin, target, new THREE.Vector3(0, 1, 0), 4.2, 9.2, 1.0, dirZ > 0 ? 0.25 : 0.75);
    addBeamQuad(origin, target, new THREE.Vector3(1, 0.35, 0), 3.6, 6.8, 1.0, dirZ > 0 ? 0.45 : 0.85);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute('aRayMeta', new THREE.Float32BufferAttribute(metas, 2));
  geom.setIndex(indices);
  return geom;
}

function buildSpiritMotesGeometry(): THREE.BufferGeometry {
  const count = 120;
  const positions = new Float32Array(count * 3);
  const metas = new Float32Array(count * 3);

  let rng = 8888;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 1.8 + rand() * 17.5;
    positions[i * 3 + 0] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.28 + rand() * 5.6;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.85;

    metas[i * 3 + 0] = rand();
    metas[i * 3 + 1] = 0.38 + rand() * 0.65;
    metas[i * 3 + 2] = 1.6 + rand() * 2.6;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aMoteMeta', new THREE.BufferAttribute(metas, 3));
  return geom;
}

export function AtmosphericScenery() {
  const mountainMeshRef = useRef<THREE.Mesh>(null);
  const noiseTex = useMemo(() => getSharedNoiseTexture(), []);

  const mountainGeom = useMemo(() => buildMountainRangesGeometry(), []);
  const windGeom = useMemo(() => buildCameraAlignedWindGeometry(), []);
  const shaftGeom = useMemo(() => buildLightShaftsGeometry(), []);
  const moteGeom = useMemo(() => buildSpiritMotesGeometry(), []);

  const mountainUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
    }),
    []
  );

  const windUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    []
  );

  const shaftUniforms = useMemo(
    () => ({
      uNoiseTex: { value: noiseTex },
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
      uShockwave: { value: 0 },
    }),
    [noiseTex]
  );

  const carpetUniforms = useMemo(
    () => ({
      uNoiseTex: { value: noiseTex },
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
    }),
    [noiseTex]
  );

  const moteUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
    }),
    []
  );

  useEffect(() => {
    if (mountainMeshRef.current) {
      mountainMeshRef.current.layers.enable(1);
    }
  }, []);

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    const p = experienceState.portalProgress;

    mountainUniforms.uTime.value = t;
    mountainUniforms.uPortalProgress.value = p;

    windUniforms.uTime.value = t;
    windUniforms.uPortalProgress.value = p;
    windUniforms.uCameraPos.value.copy(camera.position);

    shaftUniforms.uTime.value = t;
    shaftUniforms.uPortalProgress.value = p;
    shaftUniforms.uShockwave.value = experienceState.clickShockwave;

    carpetUniforms.uTime.value = t;
    carpetUniforms.uPortalProgress.value = p;

    moteUniforms.uTime.value = t;
    moteUniforms.uPortalProgress.value = p;
  });

  return (
    <group name="AtmosphericScenery">
      {/* 1. Layered Japanese Island Mountain Silhouettes */}
      <mesh
        ref={mountainMeshRef}
        geometry={mountainGeom}
        frustumCulled={false}
        raycast={() => null}
        name="MistyMountainIslands"
      >
        <shaderMaterial
          vertexShader={mountainVertexShader}
          fragmentShader={mountainFragmentShader}
          uniforms={mountainUniforms}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. Low Rolling Sea-Surface Fog Carpet around Submerged Torii Pillars */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.07, 0]}
        renderOrder={1}
        raycast={() => null}
        name="MysticSeaFogCarpet"
      >
        <planeGeometry args={[52, 52, 1, 1]} />
        <shaderMaterial
          vertexShader={carpetVertexShader}
          fragmentShader={carpetFragmentShader}
          uniforms={carpetUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* 3. Volumetric Mystical God-Rays (Komorebi) & Portal Light Shafts */}
      <mesh
        geometry={shaftGeom}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={3}
        name="MysticLightShafts"
      >
        <shaderMaterial
          vertexShader={rayVertexShader}
          fragmentShader={rayFragmentShader}
          uniforms={shaftUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 4. Ghost-of-Tsushima Camera-Aligned Gossamer Wind Filaments */}
      <mesh
        geometry={windGeom}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={4}
        name="GossamerWindFilaments"
      >
        <shaderMaterial
          vertexShader={windVertexShader}
          fragmentShader={windFragmentShader}
          uniforms={windUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 5. Ethereal Floating Hitodama / Spirit Motes */}
      <points
        geometry={moteGeom}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={5}
        name="SpiritMotes"
      >
        <shaderMaterial
          vertexShader={moteVertexShader}
          fragmentShader={moteFragmentShader}
          uniforms={moteUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
