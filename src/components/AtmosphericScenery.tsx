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
attribute float aRidge; // 0 = valley/gully, 1 = sharp alpine spur/crest
varying float vHeight;
varying float vLayer;
varying float vRidge;
varying vec3 vWorldPos;
varying vec3 vNormalW;

void main() {
  vHeight = position.y;
  vLayer = aLayer;
  vRidge = aRidge;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const mountainFragmentShader = /* glsl */ `
uniform sampler2D uNoiseTex;
uniform float uPortalProgress;
uniform float uTime;
uniform vec4 uSeasonWeights; // x: haru, y: natsu, z: aki, w: fuyu

varying float vHeight;
varying float vLayer;
varying float vRidge;
varying vec3 vWorldPos;
varying vec3 vNormalW;

void main() {
  float atmMix = smoothstep(0.06, 0.96, uPortalProgress);
  vec3 geomN = normalize(vNormalW);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);

  // 1. Multi-Scale Procedural Rock Strata, Vertical Cliff Fissures & Cedar Forest Canopy
  vec2 uvMacro  = vec2(vWorldPos.x * 0.014 + vWorldPos.z * 0.011, vHeight * 0.045);
  vec2 uvStrata = vec2(vWorldPos.x * 0.038 - vWorldPos.z * 0.032, vHeight * 0.195);
  vec2 uvCrag   = vec2(vWorldPos.x * 0.115 + vWorldPos.z * 0.095, vHeight * 0.140);
  vec2 uvCanopy = vWorldPos.xz * 0.085;

  vec4 nMacro  = texture2D(uNoiseTex, uvMacro);
  vec4 nStrata = texture2D(uNoiseTex, uvStrata);
  vec4 nCrag   = texture2D(uNoiseTex, uvCrag);
  vec4 nCanopy = texture2D(uNoiseTex, uvCanopy);

  // Slope factor: steep cliffs expose striated granite rock; gentler slopes hold dense pine/cedar forest!
  float steepness = 1.0 - clamp(geomN.y, 0.0, 1.0);
  float rockMask = smoothstep(0.28, 0.62, steepness + vRidge * 0.24 + (nMacro.r - 0.5) * 0.22);

  // High-frequency normal perturbation: horizontal cliff strata + vertical erosion gullies + forest bumps
  vec3 rockPerturb = vec3(
    (nCrag.r - 0.5) * 0.85 + (nStrata.r - 0.5) * 0.55,
    (nStrata.b - 0.5) * 0.52,
    (nCrag.g - 0.5) * 0.85 + (nStrata.g - 0.5) * 0.55
  );
  vec3 forestPerturb = vec3(
    (nCanopy.r - 0.5) * 0.55,
    (nCanopy.b - 0.5) * 0.35,
    (nCanopy.g - 0.5) * 0.55
  );
  vec3 N = normalize(geomN + mix(forestPerturb, rockPerturb, rockMask));

  // Sedimentary rock bands & fissure crevices (ambient occlusion inside gullies!)
  float strataBands = smoothstep(0.22, 0.82, sin(vHeight * 2.35 + nMacro.g * 5.0) * 0.5 + 0.5);
  float fissureAO = (0.48 + 0.52 * smoothstep(0.08, 0.85, vRidge)) * (0.72 + 0.28 * nCrag.b);
  float rockAlbedoTex = mix(0.62, 1.18, strataBands * 0.55 + nStrata.b * 0.45);
  float canopyTex = 0.68 + 0.45 * nCanopy.g;

  // 2. Utsushiyo (Seasonal Daylight): Forested Sumi-e Slopes + Craggy Exposed Cliff Faces
  vec3 forestTint =
      vec3(0.085, 0.135, 0.145) * uSeasonWeights.x
    + vec3(0.062, 0.148, 0.132) * uSeasonWeights.y
    + vec3(0.155, 0.098, 0.072) * uSeasonWeights.z
    + vec3(0.088, 0.122, 0.152) * uSeasonWeights.w;
  vec3 cliffTint = vec3(0.165, 0.188, 0.225) * rockAlbedoTex;

  vec3 calmSurface = mix(forestTint * canopyTex, cliffTint, rockMask) * fissureAO;
  // Aerial perspective across the 3 island mountain rings in daylight
  vec3 calmHazeTint = vec3(0.34, 0.40, 0.47);
  vec3 calmBase = mix(calmSurface, calmHazeTint, vLayer * 0.28);

  // Crisp snow accumulation on ridges & ledges in Winter (Fuyu)
  float winterSnow = smoothstep(3.8, 12.0, vHeight + nMacro.b * 2.5)
                   * smoothstep(0.28, 0.72, N.y + vRidge * 0.25)
                   * uSeasonWeights.w * (1.0 - atmMix);
  calmBase = mix(calmBase, vec3(0.82, 0.88, 0.95), winterSnow * 0.82);

  // 3. Kakuriyo (Dark Mode): Deep Obsidian-Indigo Shadowed Valleys vs Moonlit Slate-Granite Crags!
  vec3 darkForest = vec3(0.0032, 0.0068, 0.0145) * canopyTex;
  vec3 darkCliff  = vec3(0.0085, 0.0155, 0.0310) * rockAlbedoTex;
  vec3 darkBase   = mix(darkForest, darkCliff, rockMask) * fissureAO;

  vec3 col = mix(calmBase, darkBase, atmMix);

  // 4. DRAMATIC LOW-ANGLE RAKING CHIAROSCURO LIGHTING (Sharp sunlit/moonlit spurs vs deep shadowed gorges!)
  vec3 sunDir = normalize(vec3(-0.82, 0.36, 0.22));
  float sunGrazing = pow(clamp(dot(N, sunDir), 0.0, 1.0), 1.25);
  col += vec3(0.135, 0.132, 0.128) * sunGrazing * fissureAO * (1.0 - atmMix) * (1.0 - vLayer * 0.24);

  // Low-angle raking Oborozuki Moonlight from left-horizon carves stark 3D ridge-vs-ravine contrast!
  vec3 moonDir = normalize(vec3(-0.88, 0.27, 0.18));
  float rawMoonDot = clamp(dot(N, moonDir), 0.0, 1.0);
  // Mask direct moonlight slightly inside deep ravines (vRidge) to simulate mountain self-shadowing!
  float selfShadow = smoothstep(0.12, 0.68, vRidge + rawMoonDot * 0.35);
  float moonRaking = pow(rawMoonDot, 1.35) * selfShadow;

  // Specular mineral glint on steep moonlit rock cliffs
  vec3 halfMoon = normalize(moonDir + viewDir);
  float rockSpec = pow(clamp(dot(N, halfMoon), 0.0, 1.0), 22.0) * rockMask * selfShadow;

  vec3 moonLitCliff = vec3(0.088, 0.148, 0.275) * moonRaking * (0.45 + 0.85 * rockMask * rockAlbedoTex)
                    + vec3(0.075, 0.125, 0.235) * rockSpec;

  // Razor crest rim-backlight along high jagged mountain spines against the night sky
  float skyCrestRim = smoothstep(0.45, 0.98, vRidge)
                    * smoothstep(3.0, 15.0, vHeight)
                    * pow(1.0 - abs(dot(geomN, viewDir)), 1.8);
  moonLitCliff += vec3(0.032, 0.064, 0.135) * skyCrestRim;

  // Subtle sky-dome ambient fill ONLY on upward-facing ridges so shadowed ravines stay ink-dark!
  moonLitCliff += vec3(0.005, 0.011, 0.025) * clamp(N.y, 0.0, 1.0) * fissureAO;

  col += moonLitCliff * atmMix * (1.0 - vLayer * 0.18);

  // Faint warm golden bounce on central near-shore cliffs from the Hokora & Lantern Sea
  float shrineBounce = exp(-abs(vWorldPos.x) * 0.055) * (1.0 - step(0.5, vLayer));
  col += vec3(0.028, 0.016, 0.006) * shrineBounce * (1.0 - smoothstep(0.0, 5.5, vHeight)) * atmMix;

  // 5. Localized Drifting Shoreline & Ravine Mist (Keeps upper craggy peaks crisp & high-contrast!)
  vec3 calmMist =
      vec3(0.640, 0.590, 0.655) * uSeasonWeights.x
    + vec3(0.540, 0.650, 0.715) * uSeasonWeights.y
    + vec3(0.685, 0.545, 0.445) * uSeasonWeights.z
    + vec3(0.585, 0.645, 0.705) * uSeasonWeights.w;

  float driftFog = texture2D(uNoiseTex, vec2(vWorldPos.x * 0.011 + uTime * 0.0028, vLayer * 0.37 + vWorldPos.z * 0.006)).r;
  // Subtle dark nocturnal mist nestled strictly along the water's edge and deep gorges
  vec3 darkValleyMist = mix(vec3(0.006, 0.013, 0.028), vec3(0.014, 0.026, 0.054), vLayer * 0.45) * (0.70 + 0.55 * driftFog);
  vec3 mistCol = mix(calmMist, darkValleyMist, atmMix);

  float gullyMistBoost = (1.0 - vRidge) * 1.4;
  float mistCeiling = mix(3.8 + vLayer * 2.2, 2.1 + vLayer * 1.3 + gullyMistBoost, atmMix);
  float baseMistFactor = (1.0 - smoothstep(0.0, mistCeiling, vHeight)) * (0.78 + 0.22 * driftFog);
  float distHaze = mix(0.18 + vLayer * 0.18, 0.04 + vLayer * 0.09, atmMix);
  col = mix(col, mistCol, clamp(max(baseMistFactor * mix(0.88, 0.76, atmMix), distHaze), 0.0, 0.90));

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
// 2D Value Noise & Ridged Multifractal helper for sharp eroded alpine coastal spurs & gorges!
function mtnHash2(ix: number, iy: number, seed: number): number {
  const h = Math.sin(ix * 127.1 + iy * 311.7 + seed * 53.3) * 43758.5453123;
  return h - Math.floor(h);
}

function mtnNoise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const a = mtnHash2(ix, iy, seed);
  const b = mtnHash2(ix + 1, iy, seed);
  const c = mtnHash2(ix, iy + 1, seed);
  const d = mtnHash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function evalRidgedMultifractal(x: number, y: number, seed: number): number {
  let sum = 0.0;
  let amp = 0.54;
  let freq = 1.0;
  let weight = 1.0;
  for (let o = 0; o < 5; o++) {
    const n = mtnNoise2(x * freq, y * freq, seed + o * 19);
    // Sharp inverted crease -> squared ridge spine!
    let signal = 1.0 - Math.abs(n * 2.0 - 1.0);
    signal = signal * signal * weight;
    weight = THREE.MathUtils.clamp(signal * 1.85, 0.15, 1.0);
    sum += signal * amp;
    freq *= 2.12;
    amp *= 0.48;
  }
  return sum;
}

function buildMountainRangesGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const layers: number[] = [];
  const ridges: number[] = [];
  const indices: number[] = [];

  const ringConfigs = [
    { layer: 0, radius: 72, maxH: 13.5, arcStart: -Math.PI * 0.94, arcEnd: -Math.PI * 0.06, segs: 210, seed: 1.7, thick: 28.0 },
    { layer: 1, radius: 103, maxH: 20.5, arcStart: -Math.PI * 1.10, arcEnd: Math.PI * 0.10, segs: 230, seed: 5.3, thick: 34.0 },
    { layer: 2, radius: 138, maxH: 29.0, arcStart: -Math.PI * 1.18, arcEnd: Math.PI * 0.18, segs: 220, seed: 9.8, thick: 40.0 },
  ];

  let vertOffset = 0;
  for (const cfg of ringConfigs) {
    const radialRows = 18;
    const ringThickness = cfg.thick;

    for (let i = 0; i <= cfg.segs; i++) {
      const u = i / cfg.segs;
      const theta = cfg.arcStart + u * (cfg.arcEnd - cfg.arcStart);
      const arcEnvelope = Math.pow(Math.sin(u * Math.PI), 0.58);

      let centerChannelMask = 1.0;
      if (cfg.layer === 0) {
        // Frame the central Hokora & Torii vista with dramatic flanking island headlands!
        const distFromBackCenter = Math.abs(theta + Math.PI * 0.5);
        centerChannelMask = THREE.MathUtils.smoothstep(distFromBackCenter, 0.11, 0.36);
      } else if (cfg.layer === 1) {
        const distFromBackCenter = Math.abs(theta + Math.PI * 0.5);
        centerChannelMask = 0.34 + 0.66 * THREE.MathUtils.smoothstep(distFromBackCenter, 0.05, 0.28);
      }

      for (let r = 0; r <= radialRows; r++) {
        const rv = r / radialRows; // 0 = inner shoreline, ~0.44 = main spine, 1 = back slope
        const rad = cfg.radius + (rv - 0.22) * ringThickness;
        const wx = Math.cos(theta) * rad;
        const wz = Math.sin(theta) * rad;

        // Sharp tent-like cross-ridge envelope (NOT rounded!)
        const spinePos = 0.44 + (mtnNoise2(theta * 3.5, cfg.seed, 31) - 0.5) * 0.14;
        const distSpine = Math.abs(rv - spinePos) / (rv < spinePos ? spinePos : 1.0 - spinePos);
        const crossEnvelope = Math.pow(Math.max(0.0, 1.0 - distSpine), 1.28);

        // 2D Ridged Multifractal + Radial Lateral Spurs carving V-shaped valleys down to the water!
        const mainRidged = evalRidgedMultifractal(wx * 0.032, wz * 0.032, cfg.seed);
        const spurWave = 1.0 - Math.abs(Math.sin(theta * 19.0 + rv * 2.4 + mtnNoise2(wx * 0.05, wz * 0.05, cfg.seed + 7) * 3.2));
        const lateralSpurs = Math.pow(spurWave, 1.75);
        const fineCrags = evalRidgedMultifractal(wx * 0.088, wz * 0.088, cfg.seed + 41) * 0.28;

        const combinedRelief = THREE.MathUtils.clamp(
          mainRidged * 0.62 + lateralSpurs * 0.38 + fineCrags,
          0.0,
          1.45
        );

        // Carve deep eroded river gorges while pushing ridge crests into sharp alpine peaks!
        const sculptedFactor = Math.pow(combinedRelief, 1.35);
        const y =
          cfg.maxH * arcEnvelope * centerChannelMask * crossEnvelope * (0.18 + 0.95 * sculptedFactor) -
          0.55;

        const ridgeAttr = THREE.MathUtils.clamp(
          (1.0 - distSpine * 0.65) * (0.45 * mainRidged + 0.55 * lateralSpurs),
          0.0,
          1.0
        );

        positions.push(wx, y, wz);
        layers.push(cfg.layer);
        ridges.push(ridgeAttr);
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
  geom.setAttribute('aRidge', new THREE.Float32BufferAttribute(ridges, 1));
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
  const carpetMeshRef = useRef<THREE.Mesh>(null);
  const shaftMeshRef = useRef<THREE.Mesh>(null);
  const windMeshRef = useRef<THREE.Mesh>(null);

  const mountainMatRef = useRef<THREE.ShaderMaterial>(null);
  const carpetMatRef = useRef<THREE.ShaderMaterial>(null);
  const shaftMatRef = useRef<THREE.ShaderMaterial>(null);
  const windMatRef = useRef<THREE.ShaderMaterial>(null);
  const moteMatRef = useRef<THREE.ShaderMaterial>(null);

  const noiseTex = useMemo(() => getSharedNoiseTexture(), []);

  const mountainGeom = useMemo(() => buildMountainRangesGeometry(), []);
  const windGeom = useMemo(() => buildCameraAlignedWindGeometry(), []);
  const shaftGeom = useMemo(() => buildLightShaftsGeometry(), []);
  const moteGeom = useMemo(() => buildSpiritMotesGeometry(), []);

  const mountainUniformsRef = useRef({
    uNoiseTex: { value: noiseTex },
    uTime: { value: 0 },
    uPortalProgress: { value: 0 },
    uSeasonWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
  });
  mountainUniformsRef.current.uNoiseTex.value = noiseTex;

  const windUniformsRef = useRef({
    uTime: { value: 0 },
    uPortalProgress: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
  });

  const shaftUniformsRef = useRef({
    uNoiseTex: { value: noiseTex },
    uTime: { value: 0 },
    uPortalProgress: { value: 0 },
    uShockwave: { value: 0 },
  });
  shaftUniformsRef.current.uNoiseTex.value = noiseTex;

  const carpetUniformsRef = useRef({
    uNoiseTex: { value: noiseTex },
    uTime: { value: 0 },
    uPortalProgress: { value: 0 },
  });
  carpetUniformsRef.current.uNoiseTex.value = noiseTex;

  const moteUniformsRef = useRef({
    uTime: { value: 0 },
    uPortalProgress: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
  });

  useEffect(() => {
    if (mountainMeshRef.current) {
      mountainMeshRef.current.layers.enable(1);
    }
  }, []);

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    const p = experienceState.portalProgress;
    const nearGateZone = experienceState.travelProgress < 0.78;

    const mu = mountainMatRef.current ? mountainMatRef.current.uniforms : mountainUniformsRef.current;
    mu.uTime.value = t;
    mu.uPortalProgress.value = p;
    mu.uSeasonWeights.value.copy(experienceState.seasonWeights);

    if (carpetMeshRef.current) carpetMeshRef.current.visible = nearGateZone;
    if (shaftMeshRef.current) shaftMeshRef.current.visible = nearGateZone;
    if (windMeshRef.current) windMeshRef.current.visible = nearGateZone;

    if (nearGateZone) {
      const wu = windMatRef.current ? windMatRef.current.uniforms : windUniformsRef.current;
      wu.uTime.value = t;
      wu.uPortalProgress.value = p;
      wu.uCameraPos.value.copy(camera.position);

      const su = shaftMatRef.current ? shaftMatRef.current.uniforms : shaftUniformsRef.current;
      su.uTime.value = t;
      su.uPortalProgress.value = p;
      su.uShockwave.value = experienceState.clickShockwave;

      const cu = carpetMatRef.current ? carpetMatRef.current.uniforms : carpetUniformsRef.current;
      cu.uTime.value = t;
      cu.uPortalProgress.value = p;
    }

    const mtu = moteMatRef.current ? moteMatRef.current.uniforms : moteUniformsRef.current;
    mtu.uTime.value = t;
    mtu.uPortalProgress.value = p;
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
          ref={mountainMatRef}
          vertexShader={mountainVertexShader}
          fragmentShader={mountainFragmentShader}
          uniforms={mountainUniformsRef.current}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. Low Rolling Sea-Surface Fog Carpet around Submerged Torii Pillars */}
      <mesh
        ref={carpetMeshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.07, 0]}
        renderOrder={1}
        raycast={() => null}
        name="MysticSeaFogCarpet"
      >
        <planeGeometry args={[52, 52, 1, 1]} />
        <shaderMaterial
          ref={carpetMatRef}
          vertexShader={carpetVertexShader}
          fragmentShader={carpetFragmentShader}
          uniforms={carpetUniformsRef.current}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* 3. Volumetric Mystical God-Rays (Komorebi) & Portal Light Shafts */}
      <mesh
        ref={shaftMeshRef}
        geometry={shaftGeom}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={3}
        name="MysticLightShafts"
      >
        <shaderMaterial
          ref={shaftMatRef}
          vertexShader={rayVertexShader}
          fragmentShader={rayFragmentShader}
          uniforms={shaftUniformsRef.current}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 4. Ghost-of-Tsushima Camera-Aligned Gossamer Wind Filaments */}
      <mesh
        ref={windMeshRef}
        geometry={windGeom}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={4}
        name="GossamerWindFilaments"
      >
        <shaderMaterial
          ref={windMatRef}
          vertexShader={windVertexShader}
          fragmentShader={windFragmentShader}
          uniforms={windUniformsRef.current}
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
          ref={moteMatRef}
          vertexShader={moteVertexShader}
          fragmentShader={moteFragmentShader}
          uniforms={moteUniformsRef.current}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
