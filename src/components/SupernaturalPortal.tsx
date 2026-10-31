import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState } from '../state/experienceState';
import { getSharedNoiseTexture } from '../utils/proceduralTextures';

const portalVertexShader = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uShockwave;

varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec3 pos = position;

  vec2 centered = uv * 2.0 - 1.0;
  float radial = length(centered);
  float edgeMask = smoothstep(1.0, 0.15, radial);

  float breathe = sin(uTime * 1.8 - radial * 3.5) * 0.04 * smoothstep(0.35, 1.0, uProgress);
  float pullIn = -uShockwave * 0.68 * exp(-radial * radial * 2.2);
  pos.z += (breathe + pullIn) * edgeMask;

  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const portalFragmentShader = /* glsl */ `
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform float uProgress;
uniform float uShockwave;
uniform vec3 uCameraPos;

varying vec2 vUv;
varying vec3 vWorldPos;

mat2 rot2d(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  if (uProgress <= 0.002) discard;

  vec2 p = vUv * 2.0 - 1.0;

  // View-dependent 3D parallax into the supernatural dimension (works from front, side & rear orbit!)
  vec3 viewDir = normalize(vWorldPos - uCameraPos);
  vec2 parallax = viewDir.xy * 0.30;

  // Ultra-fast texture noise boundary (replaces heavy 3D simplex loops!)
  vec4 edgeTex = texture2D(uNoiseTex, vUv * 1.3 + vec2(0.0, -uTime * 0.04));
  float edgeNoise = (edgeTex.r - 0.5) * 0.28 + (edgeTex.g - 0.5) * 0.14;

  float ovalDist = length(p * vec2(1.05, 0.96));
  float boxDist  = max(abs(p.x) * 0.98, abs(p.y) * 0.97);
  float shapeMix = smoothstep(0.25, 0.88, uProgress);
  float d = mix(ovalDist, boxDist, shapeMix) + edgeNoise * (1.0 - 0.55 * shapeMix);

  float aperture = mix(0.18, 1.06, pow(uProgress, 0.76));
  float feather  = mix(0.44, 0.13, smoothstep(0.2, 0.9, uProgress));
  float portalMask = 1.0 - smoothstep(aperture - feather, aperture + 0.04, d);

  float frameSoftness = smoothstep(1.02, 0.88, abs(p.x)) * smoothstep(1.02, 0.90, abs(p.y));
  float waterFade = smoothstep(-1.0, -0.82, p.y);
  portalMask *= frameSoftness * waterFade;

  if (portalMask <= 0.002) discard;

  // Swirling gravitational vortex distortion
  float r = length(p);
  float distortAmt = smoothstep(0.32, 0.85, uProgress);
  float shockRing = sin(r * 18.0 - (1.0 - uShockwave) * 22.0) * uShockwave * exp(-r * 1.8);

  float swirlAngle = distortAmt * (1.65 * exp(-r * 1.3)) + uShockwave * 2.5 * exp(-r * 1.5);
  vec2 warpedP = rot2d(-swirlAngle + uTime * 0.16) * p;
  warpedP += shockRing * normalize(p + vec2(0.0001)) * 0.15;

  // 3 fast parallax texture layers into the cosmic abyss
  vec2 uv1 = (warpedP * 0.42 + parallax * 0.16) + vec2(uTime * 0.015, -uTime * 0.012);
  vec2 uv2 = (rot2d(uTime * 0.08 + 1.1) * warpedP * 0.78 + parallax * 0.34);
  vec2 uv3 = (rot2d(-uTime * 0.13 - 0.7) * warpedP * 1.35 + parallax * 0.58);

  vec4 t1 = texture2D(uNoiseTex, uv1);
  vec4 t2 = texture2D(uNoiseTex, uv2 + (t1.rg - 0.5) * 0.22);
  vec4 t3 = texture2D(uNoiseTex, uv3 - (t2.gb - 0.5) * 0.18);

  // 5-Stage Evolution (across 5-second opening)
  float s1 = smoothstep(0.0, 0.20, uProgress);
  float s2 = smoothstep(0.16, 0.42, uProgress);
  float s3 = smoothstep(0.36, 0.62, uProgress);
  float s4 = smoothstep(0.56, 0.82, uProgress);
  float s5 = smoothstep(0.76, 1.00, uProgress);

  vec3 calmTint = vec3(0.52, 0.58, 0.65);
  vec3 voidDark = vec3(0.0018, 0.0032, 0.0095);
  vec3 baseCol  = mix(calmTint, voidDark, s2);

  // Deep abyssal midnight-indigo + ghostly slate-cyan & phantom-violet spectral nebula inside the portal!
  vec3 deepIndigo = vec3(0.014, 0.036, 0.145);
  vec3 darkViolet = vec3(0.052, 0.018, 0.165);
  vec3 auroraTeal = vec3(0.020, 0.125, 0.175);
  vec3 eerieCyan  = vec3(0.072, 0.185, 0.420);

  float nebulaFold = smoothstep(0.22, 0.82, t2.r * 0.6 + t3.g * 0.45);
  float filament   = pow(t3.b, 2.2);

  vec3 realmCol = mix(voidDark, deepIndigo, nebulaFold * 0.9);
  realmCol = mix(realmCol, darkViolet, smoothstep(0.3, 0.78, t1.g) * 0.7);
  realmCol += mix(auroraTeal, eerieCyan, t2.g) * filament * (0.30 * s3 + 0.48 * s4 + 0.42 * s5);

  // Deep dimensional stars inside the portal space
  float innerStars = smoothstep(0.86, 0.97, t3.a) * s4;
  realmCol += vec3(0.32, 0.48, 0.78) * innerStars * 0.52;

  // Mysterious pale moonlit-indigo core depth glow
  float coreDist = length(p + parallax * 0.35);
  float distantCore = exp(-coreDist * coreDist * 2.6) * (0.4 + 0.6 * t2.r);
  realmCol += mix(vec3(0.065, 0.155, 0.42), vec3(0.045, 0.165, 0.24), 0.32)
            * distantCore * (s3 * 0.45 + s5 * 0.82);

  // Event-horizon ghostly energy ring where mist dissolves into the rift
  float horizonRing = exp(-pow((d - aperture + 0.15) * 5.2, 2.0));
  realmCol += vec3(0.065, 0.18, 0.38) * horizonRing * (s4 * 0.55 + s5 * 0.48) * (0.65 + 0.5 * t3.b);

  if (uShockwave > 0.001) {
    float waveGlow = exp(-abs(r - (1.0 - uShockwave) * 1.1) * 7.0) * uShockwave;
    realmCol += vec3(0.18, 0.52, 0.88) * waveGlow * 1.5;
    realmCol += vec3(0.08, 0.28, 0.45) * uShockwave * exp(-coreDist * 2.0);
  }

  vec3 finalCol = mix(baseCol, realmCol, s3 * 0.65 + s4 * 0.35);
  float alpha = portalMask * mix(0.08 * s1, 0.97, smoothstep(0.12, 0.75, uProgress));

  gl_FragColor = vec4(finalCol, clamp(alpha, 0.0, 0.985));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function SupernaturalPortal() {
  const portalMeshRef = useRef<THREE.Mesh>(null);
  const noiseTex = useMemo(() => getSharedNoiseTexture(), []);

  const uniforms = useMemo(
    () => ({
      uNoiseTex: { value: noiseTex },
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uShockwave: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    [noiseTex]
  );

  // Enable Layer 1 so Planar Reflection FBO reflects the glowing portal on the swirling sea!
  useEffect(() => {
    if (portalMeshRef.current) {
      portalMeshRef.current.layers.enable(1);
    }
  }, []);

  useFrame(({ clock, camera }) => {
    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uProgress.value = experienceState.portalProgress;
    uniforms.uShockwave.value = experienceState.clickShockwave;
    uniforms.uCameraPos.value.copy(camera.position);
  });

  return (
    <mesh
      ref={portalMeshRef}
      position={[0, 2.06, 0]}
      renderOrder={2}
      raycast={() => null}
      name="SupernaturalPortalMesh"
    >
      <planeGeometry args={[4.68, 4.24, 32, 32]} />
      <shaderMaterial
        vertexShader={portalVertexShader}
        fragmentShader={portalFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
