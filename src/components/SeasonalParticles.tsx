import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState } from '../state/experienceState';

const PARTICLE_COUNT = 160;

const seasonalVertexShader = /* glsl */ `
attribute vec4 aSeedA; // x: px, y: py, z: pz, w: randomPhase (0..1)
attribute vec3 aSeedB; // x: sizeScale, y: speedScale, z: colorSeed (0..1)

uniform float uTime;
uniform float uPortalProgress;
uniform float uTravelProgress;
uniform vec4 uSeasonWeights; // x: haru, y: natsu, z: aki, w: fuyu

varying vec2 vUv;
varying float vPhase;
varying float vColSeed;
varying float vVisibility;

void main() {
  vUv = uv;
  vPhase = aSeedA.w;
  vColSeed = aSeedB.z;

  float haru  = uSeasonWeights.x;
  float natsu = uSeasonWeights.y;
  float aki   = uSeasonWeights.z;
  float fuyu  = uSeasonWeights.w;

  // Fade seasonal mortal-world particles smoothly as we cross into eternal Kakuriyo
  float realmFade = 1.0 - smoothstep(0.42, 0.85, uTravelProgress);
  if (realmFade <= 0.002) {
    vVisibility = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float t = uTime * aSeedB.y + vPhase * 37.0;

  // Wrap box around front of Torii: X in [-16..16], Y in [0.08..9.5], Z in [-5..17]
  float fallRate = haru * 0.52 + natsu * 0.06 + aki * 0.48 + fuyu * 0.62;
  float breezeX  = haru * 1.15 + natsu * 0.18 + aki * 1.35 + fuyu * 0.35;

  float rawX = aSeedA.x + uTime * breezeX * aSeedB.y + sin(t * 0.9 + aSeedA.z) * (0.85 - natsu * 0.35);
  float wrappedX = mod(rawX + 16.0, 32.0) - 16.0;

  float rawY = aSeedA.y - uTime * fallRate * aSeedB.y;
  float wrappedY = mod(rawY, 9.2) + 0.12;
  // In Natsu (fireflies), hover closer to the warm sea surface (0.25m .. 3.6m)
  float natsuY = 0.28 + mod(aSeedA.y, 3.2) + sin(t * 1.1) * 0.38;
  float posY = mix(wrappedY, natsuY, natsu);

  float posZ = aSeedA.z + cos(t * 0.75 + aSeedA.x * 0.3) * 0.95;

  vec3 worldPos = vec3(wrappedX, posY, posZ);

  // Portal Vortex Suction: petals, leaves & snow get pulled into the Torii rift as it awakens!
  float suction = smoothstep(0.08, 0.95, uPortalProgress);
  if (suction > 0.005) {
    vec3 portalCenter = vec3(0.0, 2.08, 0.0);
    vec3 toPortal = portalCenter - worldPos;
    float d = length(toPortal) + 0.001;
    float pull = suction * clamp(5.2 / (d + 1.4), 0.0, 0.88);
    float swirlAng = suction * 2.2 / (d * 0.35 + 1.0);
    float cs = cos(swirlAng), sn = sin(swirlAng);
    vec2 rotXY = mat2(cs, -sn, sn, cs) * (worldPos.xy - portalCenter.xy);
    vec3 swirledPos = vec3(portalCenter.x + rotXY.x, max(0.10, portalCenter.y + rotXY.y), worldPos.z);
    worldPos = mix(swirledPos, portalCenter, pull * 0.72);
  }

  // Distance soft fade near box boundaries so wrapping is 100% invisible
  float edgeFadeX = smoothstep(16.0, 12.5, abs(wrappedX));
  float edgeFadeY = smoothstep(0.08, 0.45, posY) * smoothstep(9.35, 7.6, posY);
  vVisibility = realmFade * edgeFadeX * edgeFadeY;

  // 3D tumbling billboard quad in view space
  float baseSize = (haru * 0.115 + natsu * 0.095 + aki * 0.145 + fuyu * 0.082) * aSeedB.x;
  float spin = t * (1.8 * haru + 0.4 * natsu + 1.5 * aki + 0.8 * fuyu);
  float tilt = mix(0.35 + 0.65 * abs(cos(t * 2.1)), 1.0, natsu + fuyu * 0.85);

  float c = cos(spin), s = sin(spin);
  vec2 localP = vec2(position.x * tilt, position.y) * baseSize;
  vec2 rotated = vec2(localP.x * c - localP.y * s, localP.x * s + localP.y * c);

  vec4 mvCenter = viewMatrix * vec4(worldPos, 1.0);
  mvCenter.xy += rotated;
  gl_Position = projectionMatrix * mvCenter;
}
`;

const seasonalFragmentShader = /* glsl */ `
uniform float uTime;
uniform vec4 uSeasonWeights; // x: haru, y: natsu, z: aki, w: fuyu

varying vec2 vUv;
varying float vPhase;
varying float vColSeed;
varying float vVisibility;

void main() {
  if (vVisibility <= 0.003) discard;

  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.05) discard;

  float haru  = uSeasonWeights.x;
  float natsu = uSeasonWeights.y;
  float aki   = uSeasonWeights.z;
  float fuyu  = uSeasonWeights.w;

  float combinedAlpha = 0.0;
  vec3 combinedCol = vec3(0.0);

  // Branch per active season weight so inactive seasons cost ZERO fragment shader math!
  if (haru > 0.01) {
    vec2 sp = p;
    sp.x *= 1.32 + 0.25 * sp.y;
    float notch = max(0.0, sp.y - 0.15) * exp(-abs(sp.x) * 6.5) * 0.52;
    float sakuraDist = length(vec2(sp.x, sp.y + notch));
    float sakuraMask = 1.0 - smoothstep(0.68, 0.92, sakuraDist);
    vec3 sakuraCol = mix(vec3(0.98, 0.72, 0.81), vec3(1.0, 0.91, 0.95), smoothstep(-0.6, 0.7, p.y));
    sakuraCol = mix(sakuraCol, vec3(0.95, 0.56, 0.70), vColSeed * 0.45);
    combinedAlpha += sakuraMask * haru * 0.88;
    combinedCol += sakuraCol * haru;
  }

  if (natsu > 0.01) {
    float twinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 3.1 + vPhase * 31.0));
    float hotaruMask = pow(max(0.0, 1.0 - r), 2.6) * twinkle;
    vec3 hotaruCol = mix(vec3(0.45, 0.95, 0.62), vec3(0.98, 0.88, 0.42), vColSeed) * 1.45;
    combinedAlpha += hotaruMask * natsu * 0.92;
    combinedCol += hotaruCol * natsu;
  }

  if (aki > 0.01) {
    float ang = atan(p.y, p.x) + 1.5707963;
    float lobes = 0.58 + 0.34 * cos(ang * 5.0) * smoothstep(-0.7, 0.2, p.y);
    float momijiMask = (1.0 - smoothstep(lobes - 0.14, lobes + 0.08, r)) * smoothstep(-0.95, -0.55, p.y);
    vec3 crimson = vec3(0.76, 0.13, 0.09);
    vec3 persimmon = vec3(0.88, 0.34, 0.10);
    vec3 goldLeaf = vec3(0.90, 0.58, 0.14);
    vec3 momijiCol = vColSeed < 0.5
      ? mix(crimson, persimmon, vColSeed * 2.0)
      : mix(persimmon, goldLeaf, (vColSeed - 0.5) * 2.0);
    combinedAlpha += momijiMask * aki * 0.92;
    combinedCol += momijiCol * aki;
  }

  if (fuyu > 0.01) {
    float ang = atan(p.y, p.x);
    float snowStar = 0.72 + 0.22 * cos(ang * 6.0);
    float snowMask = pow(max(0.0, 1.0 - r / snowStar), 1.85);
    vec3 snowCol = vec3(0.92, 0.96, 1.0);
    combinedAlpha += snowMask * fuyu * 0.85;
    combinedCol += snowCol * fuyu;
  }

  combinedAlpha *= vVisibility;
  if (combinedAlpha <= 0.004) discard;

  gl_FragColor = vec4(combinedCol, clamp(combinedAlpha, 0.0, 0.95));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function SeasonalParticles() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const baseQuad = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uPortalProgress: { value: 0 },
    uTravelProgress: { value: 0 },
    uSeasonWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
  });

  const { seedA, seedB } = useMemo(() => {
    const a = new Float32Array(PARTICLE_COUNT * 4);
    const b = new Float32Array(PARTICLE_COUNT * 3);

    let rng = 90210;
    const rand = () => {
      rng = (rng * 1664525 + 1013904223) % 4294967296;
      return rng / 4294967296;
    };

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      a[i * 4 + 0] = (rand() - 0.5) * 32.0; // X
      a[i * 4 + 1] = rand() * 9.2;          // Y
      a[i * 4 + 2] = -4.5 + rand() * 21.0;  // Z
      a[i * 4 + 3] = rand();                // phase

      b[i * 3 + 0] = 0.72 + rand() * 0.68;  // sizeScale
      b[i * 3 + 1] = 0.70 + rand() * 0.65;  // speedScale
      b[i * 3 + 2] = rand();                // colorSeed
    }

    return { seedA: a, seedB: b };
  }, []);

  useFrame(({ clock }) => {
    const show = experienceState.travelProgress < 0.82;
    if (meshRef.current) {
      meshRef.current.visible = show;
    }
    if (!show) return;

    const u = matRef.current ? matRef.current.uniforms : uniformsRef.current;
    u.uTime.value = clock.getElapsedTime();
    u.uPortalProgress.value = experienceState.portalProgress;
    u.uTravelProgress.value = experienceState.travelProgress;
    u.uSeasonWeights.value.copy(experienceState.seasonWeights);
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={6} raycast={() => null} name="SeasonalParticles">
      <instancedBufferGeometry
        index={baseQuad.index}
        attributes-position={baseQuad.attributes.position}
        attributes-uv={baseQuad.attributes.uv}
        instanceCount={PARTICLE_COUNT}
      >
        <instancedBufferAttribute attach="attributes-aSeedA" args={[seedA, 4]} />
        <instancedBufferAttribute attach="attributes-aSeedB" args={[seedB, 3]} />
      </instancedBufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={seasonalVertexShader}
        fragmentShader={seasonalFragmentShader}
        uniforms={uniformsRef.current}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
