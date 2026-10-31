import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  experienceState,
  HOKORA_SANCTUARY_Z,
  MAX_LANTERNS,
} from '../state/experienceState';
import { getHokoraTextures } from '../utils/hokoraTextures';
import { HokoraShrine } from './HokoraShrine';

const WISH_EMBER_COUNT = 84;

// Exact wave height helper matching InteractiveOcean.tsx so lanterns bob naturally on real waves
function evalWaveHeight(x: number, z: number, t: number): number {
  let h = 0.0;
  h += Math.sin(z * 0.65 + x * 0.12 + t * 1.05) * 0.040;
  h += Math.sin(z * 1.35 - x * 0.32 + t * 1.45) * 0.018;
  h += Math.cos(x * 0.85 + z * 0.45 - t * 0.90) * 0.015;
  const distFade = Math.exp(-Math.hypot(x, z) * 0.018);
  return h * distFade;
}

function makeWoodPart(geom: THREE.BufferGeometry, uvScale = 2.2): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.computeVertexNormals();

  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));

    let u = 0;
    let v = 0;
    if (ny >= nx && ny >= nz) {
      u = x * uvScale + 0.5;
      v = z * uvScale + 0.5;
    } else if (nx >= nz) {
      u = z * uvScale + 0.5;
      v = y * uvScale;
    } else {
      u = x * uvScale + 0.5;
      v = y * uvScale;
    }
    uvs[i * 2 + 0] = u;
    uvs[i * 2 + 1] = v;
  }

  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

// Builds authentic HD Japanese Tōrō Nagashi (灯籠流し) floating water lantern geometries:
// - Igeta cross-lapped cedar raft base + stepped inner Kiso candle deck
// - 4 corner cedar Hashira posts + delicate Kumiko/Shoji lattice window bars on all 4 faces
// - Overhanging 4-slope flared Kasa roof cap & Roban finial crown
// - Translucent Kōzo Washi paper inner shade
function buildLanternGeometries() {
  const woodParts: THREE.BufferGeometry[] = [];
  const pushBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    woodParts.push(makeWoodPart(b, 2.4));
  };

  // 1. Igeta Floating Cedar Raft Base (Dai)
  pushBox(0.46, 0.034, 0.46, 0, 0.019, 0);
  // Extending Igeta cedar cross-cleats on all 4 edges
  pushBox(0.54, 0.026, 0.036, 0, 0.017, -0.212);
  pushBox(0.54, 0.026, 0.036, 0, 0.017, 0.212);
  pushBox(0.036, 0.026, 0.54, -0.212, 0.017, 0);
  pushBox(0.036, 0.026, 0.54, 0.212, 0.017, 0);

  // Stepped inner candle deck (Kiso) & lower window sill (Kamachi)
  pushBox(0.37, 0.026, 0.37, 0, 0.048, 0);
  pushBox(0.328, 0.020, 0.328, 0, 0.070, 0);

  // 2. Four Corner Cedar Posts (Hashira)
  const postOffsets = [
    [-0.151, -0.151],
    [0.151, -0.151],
    [0.151, 0.151],
    [-0.151, 0.151],
  ];
  for (const [px, pz] of postOffsets) {
    pushBox(0.025, 0.392, 0.025, px, 0.268, pz);
  }

  // 3. Delicate Kumiko / Shoji Window Lattice Bars (Kōshi) on all 4 faces
  // Positioned at ±0.149 so they sit 1.5mm proud of the ±0.143 Washi paper shade (zero z-fighting)
  const horizHeights = [0.188, 0.312, 0.416];
  for (const hy of horizHeights) {
    const barH = hy > 0.40 ? 0.010 : 0.0085;
    pushBox(0.302, barH, 0.008, 0, hy, 0.149);
    pushBox(0.302, barH, 0.008, 0, hy, -0.149);
    pushBox(0.008, barH, 0.302, 0.149, hy, 0);
    pushBox(0.008, barH, 0.302, -0.149, hy, 0);
  }
  // Central vertical mullion (Tategumi) on each face
  pushBox(0.0085, 0.376, 0.008, 0, 0.268, 0.149);
  pushBox(0.0085, 0.376, 0.008, 0, 0.268, -0.149);
  pushBox(0.008, 0.376, 0.0085, 0.149, 0.268, 0);
  pushBox(0.008, 0.376, 0.0085, -0.149, 0.268, 0);

  // 4. Upper Frame Lintel (Kamoi) & Flared 4-Slope Kasa Roof Cap
  pushBox(0.342, 0.022, 0.342, 0, 0.462, 0);

  const kasaRoof = new THREE.CylinderGeometry(0.215, 0.315, 0.040, 4, 1, false);
  kasaRoof.rotateY(Math.PI / 4);
  kasaRoof.translate(0, 0.491, 0);
  woodParts.push(makeWoodPart(kasaRoof, 2.2));

  // Top Roban Finial Cap
  pushBox(0.215, 0.016, 0.215, 0, 0.517, 0);

  const woodGeom = mergeGeometries(woodParts, false)!;

  // Inner Translucent Kōzo Washi Paper Shade (±0.143m, tucked cleanly inside the ±0.149 lattice)
  const shadeGeom = new THREE.BoxGeometry(0.286, 0.376, 0.286);
  shadeGeom.translate(0, 0.268, 0);

  return { woodGeom, shadeGeom };
}

const lanternWoodVertexShader = /* glsl */ `
attribute vec3 aLanternMeta; // x: fade (0..1), y: phase, z: isGoldenWish (0 or 1)
varying vec2 vUv;
varying vec3 vLocalPos;
varying vec3 vLocalNormal;
varying vec3 vWorldNormal;
varying vec3 vMeta;

void main() {
  vUv = uv;
  vLocalPos = position;
  vLocalNormal = normalize(normal);
  vMeta = aLanternMeta;

  mat3 instMat3 = mat3(instanceMatrix);
  vWorldNormal = normalize(mat3(modelMatrix) * instMat3 * normal);

  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const lanternWoodFragmentShader = /* glsl */ `
uniform float uTime;
uniform sampler2D uWoodMap;
varying vec2 vUv;
varying vec3 vLocalPos;
varying vec3 vLocalNormal;
varying vec3 vWorldNormal;
varying vec3 vMeta;

void main() {
  float fade = vMeta.x;
  if (fade <= 0.008) discard;

  float phase = vMeta.y;
  float isWish = vMeta.z;

  // Sample 1024x1024 aged Japanese cedar grain texture
  vec3 woodTex = texture2D(uWoodMap, vUv).rgb;
  // Enrich warm dark cedar tone so grain rings read clearly at night
  vec3 cedarAlbedo = pow(max(woodTex, vec3(0.001)), vec3(0.88)) * vec3(1.55, 1.24, 0.96) + vec3(0.022, 0.014, 0.009);

  // Subtle gilded lacquer trim accent on Kasa roof rim & upper collar for Golden Wish lanterns
  float goldTrimMask = isWish * smoothstep(0.44, 0.48, vLocalPos.y);
  cedarAlbedo = mix(cedarAlbedo, vec3(0.62, 0.44, 0.16), goldTrimMask * 0.55);

  float flicker = 0.90 + 0.10 * sin(uTime * 6.4 + phase * 17.0) * cos(uTime * 3.8 + phase * 9.0);

  // 1. Warm internal candle bounce lighting on Kiso deck, Kumiko lattice bevels, and Kasa underside
  vec3 toCandle = vec3(0.0, 0.22, 0.0) - vLocalPos;
  float candleDist = length(toCandle);
  vec3 candleDir = toCandle / max(0.001, candleDist);
  float innerFacing = max(0.0, dot(vLocalNormal, candleDir));

  // Lattice muntins & corner posts hugging the glowing Washi paper catch warm side-scatter
  float windowBand = smoothstep(0.05, 0.14, vLocalPos.y) * (1.0 - smoothstep(0.43, 0.50, vLocalPos.y));
  float eaveUnderside = smoothstep(0.44, 0.49, vLocalPos.y) * max(0.0, -vLocalNormal.y);
  float deckTop = (1.0 - smoothstep(0.04, 0.10, vLocalPos.y)) * max(0.0, vLocalNormal.y);

  float candleBounce = (
    innerFacing * 0.65 +
    windowBand * 0.52 +
    eaveUnderside * 1.15 +
    deckTop * 0.72
  ) / (1.0 + candleDist * candleDist * 5.5);

  vec3 candleLightCol = mix(vec3(1.45, 0.76, 0.24), vec3(1.95, 1.28, 0.46), isWish) * flicker;

  // 2. Nocturnal Oborozuki moonlight sculpting the flared Kasa roof slopes & Igeta cedar raft
  vec3 moonDir = normalize(vec3(-0.62, 0.70, 0.35));
  float moonDiff = max(0.0, dot(vWorldNormal, moonDir));
  float skyHemi = 0.5 + 0.5 * vWorldNormal.y;
  vec3 moonLight = vec3(0.26, 0.38, 0.62) * (0.35 + 0.65 * skyHemi) + vec3(0.54, 0.70, 1.02) * moonDiff * 0.85;

  // Wet sea-water sheen along the floating cedar raft waterline
  float wetMask = 1.0 - smoothstep(0.012, 0.045, vLocalPos.y);
  cedarAlbedo *= mix(1.0, 0.62, wetMask);
  float wetSpec = wetMask * pow(max(0.0, vWorldNormal.y), 4.0) * 0.10;

  vec3 litWood = cedarAlbedo * (moonLight + candleLightCol * candleBounce * 2.15) + vec3(0.36, 0.50, 0.78) * wetSpec;

  gl_FragColor = vec4(litWood * fade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const lanternShadeVertexShader = /* glsl */ `
attribute vec3 aLanternMeta; // x: fade (0..1), y: phase, z: isGoldenWish (0 or 1)
varying vec2 vUv;
varying vec3 vLocalPos;
varying vec3 vMeta;

void main() {
  vUv = uv;
  vLocalPos = position;
  vMeta = aLanternMeta;

  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const lanternShadeFragmentShader = /* glsl */ `
uniform float uTime;
uniform sampler2D uWashiMap;
varying vec2 vUv;
varying vec3 vLocalPos;
varying vec3 vMeta;

void main() {
  float fade = vMeta.x;
  if (fade <= 0.008) discard;

  float phase = vMeta.y;
  float isWish = vMeta.z;

  // Sample 512x512 handmade Kōzo mulberry Washi paper texture (fibers + Seigaiha wave hem)
  vec3 washiTex = texture2D(uWashiMap, vUv).rgb;
  float paperFiber = dot(washiTex, vec3(0.38, 0.42, 0.20));

  // Natural candle flame sway & organic breath flicker
  float flicker = 0.91 + 0.09 * sin(uTime * 6.4 + phase * 17.0) * cos(uTime * 3.8 + phase * 9.0);
  float swayX = 0.026 * sin(uTime * 3.1 + phase * 11.0);

  // Teardrop candle flame silhouette projected onto the translucent Washi paper from inside
  vec2 flameUv = vec2((vUv.x - (0.5 + swayX)) * 1.45, (vUv.y - 0.27) * (vUv.y > 0.27 ? 1.15 : 1.85));
  float flameDist2 = dot(flameUv, flameUv);
  float wickCore = exp(-flameDist2 * 15.0);
  float radialGlow = exp(-flameDist2 * 2.55);

  // Subtle wood-frame contact shadow around panel perimeter & behind Kumiko lattice muntins
  float edgeX = abs(vUv.x * 2.0 - 1.0);
  float edgeY = abs(vUv.y * 2.0 - 1.0);
  float frameVignette = (1.0 - 0.28 * pow(edgeX, 2.4)) * (1.0 - 0.22 * pow(edgeY, 2.8));

  float muntinShadow =
    1.0 -
    0.10 * exp(-pow((vUv.x - 0.5) * 36.0, 2.0)) -
    0.08 * exp(-pow((vUv.y - 0.31) * 38.0, 2.0)) -
    0.08 * exp(-pow((vUv.y - 0.64) * 38.0, 2.0));

  vec3 deepPaperCol = mix(vec3(0.76, 0.30, 0.07), vec3(1.08, 0.56, 0.14), isWish);
  vec3 midHoneyCol  = mix(vec3(1.42, 0.78, 0.26), vec3(1.82, 1.18, 0.42), isWish);
  vec3 coreIvoryCol = mix(vec3(2.15, 1.56, 0.78), vec3(2.55, 1.98, 1.05), isWish);

  vec3 transCol = mix(deepPaperCol, midHoneyCol, clamp(radialGlow * 1.08, 0.0, 1.0));
  transCol = mix(transCol, coreIvoryCol, clamp(wickCore * 0.88, 0.0, 1.0));

  // Modulate backlit glow by organic Washi paper fibers & Seigaiha wave watermark!
  float fiberTransmittance = mix(0.68, 1.12, clamp(paperFiber, 0.0, 1.0));
  vec3 finalCol = transCol * fiberTransmittance * frameVignette * muntinShadow * flicker * fade;

  gl_FragColor = vec4(finalCol, clamp(fade * 0.98, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Restrained Atmospheric Shrine Halo & Sanctuary Candlelight Veil behind the Hokora
const auraBeamVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const auraBeamFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uVisibility;
varying vec2 vUv;

void main() {
  if (uVisibility <= 0.004) discard;
  vec2 p = vUv * 2.0 - 1.0;

  // Soft warm amber sanctuary haze around the Hokora chamber + subtle moonlit mist behind roof
  float chamberRadial = length(vec2(p.x * 1.35, (p.y + 0.08) * 1.60));
  float warmGlow = exp(-chamberRadial * chamberRadial * 5.0) * (0.40 + 0.05 * sin(uTime * 2.1));

  float moonShaft = exp(-p.x * p.x * 10.0) * smoothstep(-0.85, -0.1, p.y) * (1.0 - smoothstep(0.15, 1.0, p.y)) * 0.12;

  float alpha = (warmGlow * 0.28 + moonShaft) * uVisibility;
  if (alpha <= 0.003) discard;

  vec3 col = mix(vec3(0.24, 0.38, 0.72), vec3(0.92, 0.62, 0.26), clamp(warmGlow * 1.8, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.46));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const wishVertexShader = /* glsl */ `
attribute vec3 aWishSeed;
uniform float uTime;
uniform float uBurstTime;
uniform vec3 uOrigin;
uniform float uPixelRatio;

varying float vLife;

void main() {
  float elapsed = uTime - uBurstTime - aWishSeed.z * 0.85;
  float duration = 5.2;
  if (elapsed <= 0.0 || elapsed >= duration) {
    vLife = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float normT = elapsed / duration;
  vLife = sin(normT * 3.14159265) * (1.0 - normT * 0.35);

  float spiralAng = aWishSeed.x * 6.28318 + elapsed * 1.65;
  float radius = (0.18 + normT * 1.85) * (0.5 + 0.5 * aWishSeed.y);

  vec3 worldPos = uOrigin + vec3(
    cos(spiralAng) * radius,
    elapsed * (1.35 + aWishSeed.y * 0.95),
    sin(spiralAng) * radius - elapsed * 0.35
  );

  vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mvPos;
  gl_PointSize = clamp((3.2 * uPixelRatio * 48.0 * vLife) / max(1.0, -mvPos.z), 1.5, 22.0);
}
`;

const wishFragmentShader = /* glsl */ `
varying float vLife;
void main() {
  if (vLife <= 0.005) discard;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;

  float glow = pow(1.0 - r2, 2.2);
  vec3 goldCol = mix(vec3(1.0, 0.65, 0.20), vec3(1.0, 0.94, 0.72), glow) * 1.6;
  gl_FragColor = vec4(goldCol, glow * vLife);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function KakuriyoSanctuary() {
  const groupRef = useRef<THREE.Group>(null);
  const woodInstRef = useRef<THREE.InstancedMesh>(null);
  const shadeInstRef = useRef<THREE.InstancedMesh>(null);
  const woodMetaAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  const shadeMetaAttrRef = useRef<THREE.InstancedBufferAttribute>(null);

  const woodMatRef = useRef<THREE.ShaderMaterial>(null);
  const shadeMatRef = useRef<THREE.ShaderMaterial>(null);
  const auraMatRef = useRef<THREE.ShaderMaterial>(null);
  const wishMatRef = useRef<THREE.ShaderMaterial>(null);
  const hokoraVisRef = useRef(0);

  const { woodGeom, shadeGeom } = useMemo(() => buildLanternGeometries(), []);
  const textures = useMemo(() => getHokoraTextures(), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lanternMetaArray = useMemo(() => new Float32Array(MAX_LANTERNS * 3), []);

  const woodUniformsRef = useRef({
    uTime: { value: 0 },
    uWoodMap: { value: textures.darkWood.map },
  });

  const shadeUniformsRef = useRef({
    uTime: { value: 0 },
    uWashiMap: { value: textures.lanternWashiMap },
  });

  const auraUniformsRef = useRef({
    uTime: { value: 0 },
    uVisibility: { value: 0 },
  });

  const wishGeom = useMemo(() => {
    const pos = new Float32Array(WISH_EMBER_COUNT * 3);
    const seeds = new Float32Array(WISH_EMBER_COUNT * 3);
    let rng = 77711;
    const rand = () => {
      rng = (rng * 1664525 + 1013904223) % 4294967296;
      return rng / 4294967296;
    };
    for (let i = 0; i < WISH_EMBER_COUNT; i++) {
      seeds[i * 3 + 0] = rand();
      seeds[i * 3 + 1] = 0.5 + rand() * 0.8;
      seeds[i * 3 + 2] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aWishSeed', new THREE.BufferAttribute(seeds, 3));
    return g;
  }, []);

  const wishUniformsRef = useRef({
    uTime: { value: 0 },
    uBurstTime: { value: -100 },
    uOrigin: { value: new THREE.Vector3(0, 0.35, -16.5) },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 1.5) },
  });

  // Enable Layer 1 so Planar Ocean Reflection mirrors the lanterns!
  useEffect(() => {
    if (woodInstRef.current) woodInstRef.current.layers.enable(1);
    if (shadeInstRef.current) shadeInstRef.current.layers.enable(1);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const p = experienceState.portalProgress;
    const travel = experienceState.travelProgress;
    const globalEmergence = experienceState.lanternEmergence;

    const sanctuaryVis = THREE.MathUtils.smoothstep(p, 0.28, 0.88);
    if (groupRef.current) {
      groupRef.current.visible = sanctuaryVis > 0.005;
    }
    if (sanctuaryVis <= 0.005) {
      hokoraVisRef.current = 0;
      return;
    }

    const innerVis = sanctuaryVis * THREE.MathUtils.smoothstep(travel, 0.14, 0.76);
    hokoraVisRef.current = innerVis;

    if (woodMatRef.current) {
      woodMatRef.current.uniforms.uTime.value = t;
    }
    if (shadeMatRef.current) {
      shadeMatRef.current.uniforms.uTime.value = t;
    }
    if (auraMatRef.current) {
      auraMatRef.current.uniforms.uTime.value = t;
      auraMatRef.current.uniforms.uVisibility.value = innerVis;
    }
    if (wishMatRef.current) {
      wishMatRef.current.uniforms.uTime.value = t;
      wishMatRef.current.uniforms.uBurstTime.value = experienceState.wishBurstTime;
      wishMatRef.current.uniforms.uOrigin.value.copy(experienceState.wishBurstOrigin);
    }

    // Update Tōrō Water Lanterns with authentic Water Emergence & Submergence animation!
    if (woodInstRef.current && shadeInstRef.current) {
      const showAnyLantern = globalEmergence > 0.002;
      woodInstRef.current.visible = showAnyLantern;
      shadeInstRef.current.visible = showAnyLantern;

      if (showAnyLantern) {
        for (let i = 0; i < MAX_LANTERNS; i++) {
          const l = experienceState.lanterns[i];
          if (!l.active) {
            dummy.position.set(0, -30, 0);
            dummy.scale.setScalar(0.0001);
            dummy.updateMatrix();
            woodInstRef.current.setMatrixAt(i, dummy.matrix);
            shadeInstRef.current.setMatrixAt(i, dummy.matrix);
            lanternMetaArray[i * 3 + 0] = 0;
            continue;
          }

          // 1. Staggered emergence from water on portal entry, and smooth submergence into water on exit!
          const staggerOffset = l.staggerOrder * 0.44;
          const rawBuoy = THREE.MathUtils.clamp(
            (globalEmergence - staggerOffset) / Math.max(0.01, 1.0 - staggerOffset),
            0.0,
            1.0
          );
          const transitionBuoy = 1.0 - Math.pow(1.0 - rawBuoy, 2.2);

          // 2. Newly clicked or looped lanterns ALSO rise smoothly from beneath the waves!
          const age = Math.max(0, t - l.birthTime);
          const spawnBuoy =
            l.birthTime > -1.0 && (l.isUserSpawned || age < 1.8)
              ? THREE.MathUtils.smoothstep(age, 0.0, 1.25)
              : 1.0;

          // 3. Distant horizon lanterns gently sink beneath the waves before looping!
          const horizonSubmerge = THREE.MathUtils.smoothstep(l.z, -38.3, -34.2);

          const buoy = transitionBuoy * spawnBuoy * horizonSubmerge;

          if (buoy <= 0.008) {
            dummy.position.set(0, -30, 0);
            dummy.scale.setScalar(0.0001);
            dummy.updateMatrix();
            woodInstRef.current.setMatrixAt(i, dummy.matrix);
            shadeInstRef.current.setMatrixAt(i, dummy.matrix);
            lanternMetaArray[i * 3 + 0] = 0;
            continue;
          }

          const waveY = evalWaveHeight(l.x, l.z, t);
          const waveSlopeX = (evalWaveHeight(l.x + 0.25, l.z, t) - waveY) / 0.25;
          const waveSlopeZ = (evalWaveHeight(l.x, l.z + 0.25, t) - waveY) / 0.25;

          // Physical vertical emergence from underwater (waveY - 0.62m -> waveY - 0.01m)
          const breachBob = Math.sin(buoy * Math.PI) * 0.042;
          const submergedDepth = (1.0 - buoy) * 0.62;
          const yPos = waveY - submergedDepth + breachBob - 0.01;

          const scalePop = (l.isGoldenWish ? 1.22 : 1.0) * (0.78 + 0.22 * buoy);
          dummy.position.set(l.x, yPos, l.z);
          dummy.rotation.set(
            waveSlopeZ * 0.65 + (1.0 - buoy) * 0.14,
            l.driftPhase + Math.sin(t * 0.4 + l.driftPhase) * 0.22,
            -waveSlopeX * 0.65
          );
          dummy.scale.setScalar(scalePop);
          dummy.updateMatrix();

          woodInstRef.current.setMatrixAt(i, dummy.matrix);
          shadeInstRef.current.setMatrixAt(i, dummy.matrix);

          lanternMetaArray[i * 3 + 0] = THREE.MathUtils.smoothstep(buoy, 0.12, 0.88);
          lanternMetaArray[i * 3 + 1] = l.driftPhase;
          lanternMetaArray[i * 3 + 2] = l.isGoldenWish ? 1.0 : 0.0;
        }

        woodInstRef.current.instanceMatrix.needsUpdate = true;
        shadeInstRef.current.instanceMatrix.needsUpdate = true;
        if (woodMetaAttrRef.current) woodMetaAttrRef.current.needsUpdate = true;
        if (shadeMetaAttrRef.current) shadeMetaAttrRef.current.needsUpdate = true;
      }
    }
  });

  return (
    <>
    <group ref={groupRef} visible={false} name="KakuriyoSanctuary">
      {/* 1. Instanced HD Cedar-Grained Floating Lantern Frames (Igeta Base + Kumiko Lattice + Kasa Roof) */}
      <instancedMesh
        ref={woodInstRef}
        args={[woodGeom, undefined, MAX_LANTERNS]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={3}
      >
        <instancedBufferAttribute
          ref={woodMetaAttrRef}
          attach="geometry-attributes-aLanternMeta"
          args={[lanternMetaArray, 3]}
          usage={THREE.DynamicDrawUsage}
        />
        <shaderMaterial
          ref={woodMatRef}
          vertexShader={lanternWoodVertexShader}
          fragmentShader={lanternWoodFragmentShader}
          uniforms={woodUniformsRef.current}
        />
      </instancedMesh>

      {/* 2. Instanced HD Kōzo Washi-Paper Lantern Shades with Internal Candle Flame Scattering */}
      <instancedMesh
        ref={shadeInstRef}
        args={[shadeGeom, undefined, MAX_LANTERNS]}
        frustumCulled={false}
        raycast={() => null}
        renderOrder={4}
      >
        <instancedBufferAttribute
          ref={shadeMetaAttrRef}
          attach="geometry-attributes-aLanternMeta"
          args={[lanternMetaArray, 3]}
          usage={THREE.DynamicDrawUsage}
        />
        <shaderMaterial
          ref={shadeMatRef}
          vertexShader={lanternShadeVertexShader}
          fragmentShader={lanternShadeFragmentShader}
          uniforms={shadeUniformsRef.current}
          transparent
        />
      </instancedMesh>

      {/* Subtle Warm Sanctuary Veil & Moonlit Mist Column behind the Hokora */}
      <mesh position={[0, 1.48, HOKORA_SANCTUARY_Z - 1.15]} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[4.8, 4.2]} />
        <shaderMaterial
          ref={auraMatRef}
          vertexShader={auraBeamVertexShader}
          fragmentShader={auraBeamFragmentShader}
          uniforms={auraUniformsRef.current}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 4. Ascending Golden Spirit Embers when a Sacred Wish is Released */}
      <points geometry={wishGeom} frustumCulled={false} renderOrder={7} raycast={() => null}>
        <shaderMaterial
          ref={wishMatRef}
          vertexShader={wishVertexShader}
          fragmentShader={wishFragmentShader}
          uniforms={wishUniformsRef.current}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
    {/* 3. Grounded HD Shinto Hokora Shrine. Lives OUTSIDE the toggled group so its lights stay
        permanently registered (intensity 0 when hidden) => zero shader recompile hitch on portal entry! */}
    <HokoraShrine
      position={[0, 0.03, HOKORA_SANCTUARY_Z]}
      scale={1.54}
      visibilityRef={hokoraVisRef}
    />
    </>
  );
}
