import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState } from '../state/experienceState';
import { getMistCloudSpriteTexture } from '../utils/proceduralTextures';

// 96 tuned volumetric cloud sprites = buttery smooth 60-120 FPS with identical lush fog density and low overdraw!
const MIST_COUNT = 96;
const PORTAL_CENTER = new THREE.Vector3(0, 2.05, 0);

const mistVertexShader = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aMeta; // x: scale, y: alpha, z: rotation, w: seed

varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vAlpha = aMeta.y;
  vSeed = aMeta.w;

  float scale = aMeta.x;
  float rot = aMeta.z;

  float c = cos(rot);
  float s = sin(rot);
  vec2 rotatedPos = vec2(
    position.x * c - position.y * s,
    position.x * s + position.y * c
  ) * scale;

  vec4 mvCenter = viewMatrix * vec4(aOffset, 1.0);
  mvCenter.xy += rotatedPos;

  vWorldPos = aOffset;
  gl_Position = projectionMatrix * mvCenter;
}
`;

const mistFragmentShader = /* glsl */ `
uniform sampler2D uCloudTex;
uniform float uPortalProgress;
uniform float uShockwave;

varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
varying vec3 vWorldPos;

void main() {
  if (vAlpha <= 0.002) discard;

  // Single ultra-fast pre-baked cloud texture lookup (0 simplex calls per pixel!)
  float spriteAlpha = texture2D(uCloudTex, vUv).a;
  float alpha = spriteAlpha * vAlpha;
  if (alpha <= 0.002) discard;

  float atmMix = smoothstep(0.08, 0.96, uPortalProgress);
  vec3 calmMistCol = vec3(0.74, 0.79, 0.84);
  vec3 darkMistCol = vec3(0.006, 0.012, 0.026);
  vec3 mistCol = mix(calmMistCol, darkMistCol, atmMix);

  // Illuminate spiraling mist wisps with ghostly moonlit-indigo & phantom-violet glow near portal!
  float distToPortal = length(vWorldPos - vec3(0.0, 2.05, 0.0));
  float portalProx = 1.0 / (1.0 + distToPortal * distToPortal * 0.11);
  float glowStrength = smoothstep(0.25, 1.0, uPortalProgress) * portalProx;
  vec3 portalGlowCol = mix(vec3(0.04, 0.16, 0.38), vec3(0.11, 0.07, 0.36), fract(vSeed * 7.7));
  mistCol += portalGlowCol * glowStrength * (1.15 + uShockwave * 1.1);

  gl_FragColor = vec4(mistCol, clamp(alpha, 0.0, 0.62));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface ParticleCPU {
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  baseScale: number;
  baseAlpha: number;
  rot: number;
  rotSpeed: number;
  seed: number;
  lifeFade: number;
}

export function VolumetricMist() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const geomRef = useRef<THREE.InstancedBufferGeometry>(null);
  const cloudTex = useMemo(() => getMistCloudSpriteTexture(), []);
  const uniformsRef = useRef({
    uCloudTex: { value: cloudTex },
    uPortalProgress: { value: 0 },
    uShockwave: { value: 0 },
  });
  uniformsRef.current.uCloudTex.value = cloudTex;

  const { particles, offsetArray, metaArray } = useMemo(() => {
    const list: ParticleCPU[] = [];
    const offsets = new Float32Array(MIST_COUNT * 3);
    const metas = new Float32Array(MIST_COUNT * 4);

    let rngState = 1337;
    const rand = () => {
      rngState = (rngState * 1664525 + 1013904223) % 4294967296;
      return rngState / 4294967296;
    };

    for (let i = 0; i < MIST_COUNT; i++) {
      const zoneRoll = i / MIST_COUNT;
      let hx = 0, hy = 0.5, hz = 0;
      let bScale = 3.0;
      let bAlpha = 0.11;

      if (zoneRoll < 0.30) {
        hx = (rand() - 0.5) * 26.0;
        hy = 0.35 + rand() * 3.8;
        hz = -2.2 - rand() * 12.5;
        bScale = 4.2 + rand() * 3.6;
        bAlpha = 0.11 + rand() * 0.06;
      } else if (zoneRoll < 0.55) {
        const side = rand() < 0.5 ? -1 : 1;
        hx = side * 2.75 + (rand() - 0.5) * 3.2;
        hy = 0.25 + rand() * 3.4;
        hz = (rand() - 0.5) * 4.6;
        bScale = 2.6 + rand() * 2.0;
        bAlpha = 0.10 + rand() * 0.05;
      } else if (zoneRoll < 0.75) {
        hx = (rand() - 0.5) * 8.5;
        hy = 0.12 + rand() * 1.15;
        hz = (rand() - 0.5) * 4.2;
        bScale = 2.7 + rand() * 2.0;
        bAlpha = 0.10 + rand() * 0.05;
      } else {
        hx = (rand() - 0.5) * 30.0;
        hy = 0.10 + rand() * 0.85;
        hz = -10.0 + rand() * 19.0;
        bScale = 4.2 + rand() * 3.5;
        bAlpha = 0.10 + rand() * 0.05;
      }

      const seed = rand();
      const rot = rand() * Math.PI * 2;
      list.push({
        x: hx,
        y: hy,
        z: hz,
        homeX: hx,
        homeY: hy,
        homeZ: hz,
        baseScale: bScale,
        baseAlpha: bAlpha,
        rot,
        rotSpeed: (rand() - 0.5) * 0.18,
        seed,
        lifeFade: 0.6 + rand() * 0.4,
      });

      offsets[i * 3 + 0] = hx;
      offsets[i * 3 + 1] = hy;
      offsets[i * 3 + 2] = hz;

      metas[i * 4 + 0] = bScale;
      metas[i * 4 + 1] = bAlpha;
      metas[i * 4 + 2] = rot;
      metas[i * 4 + 3] = seed;
    }

    return { particles: list, offsetArray: offsets, metaArray: metas };
  }, []);

  const baseQuad = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  useFrame(({ clock }, delta) => {
    const showMist = experienceState.travelProgress < 0.78;
    if (meshRef.current) {
      meshRef.current.visible = showMist;
    }
    if (!showMist) return;

    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();
    const prog = experienceState.portalProgress;
    const vel = experienceState.portalVelocity;

    const u = matRef.current ? matRef.current.uniforms : uniformsRef.current;
    u.uPortalProgress.value = prog;
    u.uShockwave.value = experienceState.clickShockwave;

    const suction = THREE.MathUtils.smoothstep(prog, 0.01, 0.92);
    const isClosing = vel < -0.02 && !experienceState.isPortalOpenTarget;

    for (let i = 0; i < MIST_COUNT; i++) {
      const p = particles[i];

      const driftX =
        Math.sin(t * 0.14 + p.seed * 21.0 + p.z * 0.18) * 0.24 +
        Math.cos(t * 0.09 + p.y * 0.4) * 0.12;
      const driftY = Math.sin(t * 0.19 + p.seed * 13.0 + p.x * 0.2) * 0.06;
      const driftZ = Math.cos(t * 0.12 + p.seed * 17.0 + p.x * 0.15) * 0.18;

      const dx = PORTAL_CENTER.x - p.x;
      const dy = PORTAL_CENTER.y - p.y;
      const dz = PORTAL_CENTER.z - p.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.0001;

      if (suction > 0.005) {
        // Faster spiral vortex suction tuned for the snappy 5-second portal opening!
        const invDist = 1.0 / (dist + 0.6);
        const speedBoost = (0.75 + 6.8 * invDist) * suction * (1.0 + experienceState.clickShockwave * 1.4);

        const rx = dx / dist;
        const ry = dy / dist;
        const rz = dz / dist;

        const xyLen = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const swirlX = -dy / xyLen;
        const swirlY = dx / xyLen;
        const curlWave = Math.sin(dist * 0.9 - t * 2.1 + p.seed * 15.0) * 0.35;

        p.x += (driftX * (1.0 - suction * 0.6) + (rx * 0.76 + swirlX * 0.88 + curlWave * 0.25) * speedBoost) * dt;
        p.y += (driftY * (1.0 - suction * 0.6) + (ry * 0.80 + swirlY * 0.88) * speedBoost) * dt;
        p.z += (driftZ * (1.0 - suction * 0.6) + (rz * 0.95 + Math.cos(t * 1.5 + p.seed * 9.0) * 0.22) * speedBoost) * dt;
        if (p.y < 0.08) p.y = 0.08;

        p.rot += (p.rotSpeed + suction * invDist * 1.8) * dt;
        p.lifeFade = Math.min(1.0, p.lifeFade + dt * 0.75);

        if (dist < 0.55) {
          const spawnAng = (p.seed * 37.0 + t * 0.55) % (Math.PI * 2);
          const spawnRad = 6.2 + ((p.seed * 91.7) % 1.0) * 9.5;
          p.x = Math.cos(spawnAng) * spawnRad;
          p.y = 0.18 + ((p.seed * 43.1) % 1.0) * 3.4;
          p.z = Math.sin(spawnAng) * spawnRad * 0.75 - 1.5;
          p.lifeFade = 0.0;
        }
      } else {
        p.x += (driftX + (p.homeX - p.x) * 0.14) * dt;
        p.y += (driftY + (p.homeY - p.y) * 0.16) * dt;
        p.z += (driftZ + (p.homeZ - p.z) * 0.14) * dt;
        p.rot += p.rotSpeed * dt;
        p.lifeFade = Math.min(1.0, p.lifeFade + dt * 0.5);
      }

      if (isClosing && dist < 8.5) {
        const pushOut = (1.15 / (dist + 0.8)) * dt;
        p.x -= (dx / dist) * pushOut + (p.homeX - p.x) * 0.25 * dt;
        p.y += (p.homeY - p.y) * 0.25 * dt;
        p.z -= (dz / dist) * pushOut + (p.homeZ - p.z) * 0.25 * dt;
      }

      const portalSwallowFade =
        suction > 0.05 ? THREE.MathUtils.smoothstep(dist, 0.48, 2.35) : 1.0;
      const outerDensityBoost = 1.0 + prog * 0.55 * THREE.MathUtils.smoothstep(dist, 2.5, 7.0);
      const inFrontOfUpperGate =
        p.z > -0.5 && Math.abs(p.x) < 3.6 && p.y > 1.65 ? 0.28 : 1.0;
      const calmClarity = THREE.MathUtils.lerp(inFrontOfUpperGate, 1.0, suction);

      offsetArray[i * 3 + 0] = p.x;
      offsetArray[i * 3 + 1] = p.y;
      offsetArray[i * 3 + 2] = p.z;

      metaArray[i * 4 + 0] = p.baseScale * (0.45 + 0.55 * portalSwallowFade);
      metaArray[i * 4 + 1] = p.baseAlpha * p.lifeFade * portalSwallowFade * outerDensityBoost * calmClarity;
      metaArray[i * 4 + 2] = p.rot;
    }

    if (geomRef.current) {
      const offAttr = geomRef.current.getAttribute('aOffset') as THREE.InstancedBufferAttribute;
      const metaAttr = geomRef.current.getAttribute('aMeta') as THREE.InstancedBufferAttribute;
      if (offAttr) offAttr.needsUpdate = true;
      if (metaAttr) metaAttr.needsUpdate = true;
    }
  });

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={3} raycast={() => null} name="VolumetricMistParticles">
      <instancedBufferGeometry
        ref={geomRef}
        index={baseQuad.index}
        attributes-position={baseQuad.attributes.position}
        attributes-uv={baseQuad.attributes.uv}
        instanceCount={MIST_COUNT}
      >
        <instancedBufferAttribute
          attach="attributes-aOffset"
          args={[offsetArray, 3]}
          usage={THREE.DynamicDrawUsage}
        />
        <instancedBufferAttribute
          attach="attributes-aMeta"
          args={[metaArray, 4]}
          usage={THREE.DynamicDrawUsage}
        />
      </instancedBufferGeometry>
      <shaderMaterial
        ref={matRef}
        vertexShader={mistVertexShader}
        fragmentShader={mistFragmentShader}
        uniforms={uniformsRef.current}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </mesh>
  );
}
