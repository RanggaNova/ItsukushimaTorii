import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState } from '../state/experienceState';
import { getSharedNoiseTexture } from '../utils/proceduralTextures';
import { createMysticSeaEnvironment } from '../utils/environmentMap';

const skyVertexShader = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = normalize(position);
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const skyFragmentShader = /* glsl */ `
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform float uPortalProgress;
uniform float uShockwave;

varying vec3 vDir;

void main() {
  vec3 dir = normalize(vDir);
  float h = clamp(dir.y, -0.25, 1.0);
  float upH = clamp(dir.y, 0.0, 1.0);

  // Calm state: Moody, poetic Japanese twilight-silver mist (richer depth, not washed-out white!)
  vec3 calmHorizon = vec3(0.585, 0.645, 0.705);
  vec3 calmMid     = vec3(0.390, 0.465, 0.560);
  vec3 calmZenith  = vec3(0.235, 0.305, 0.410);

  // Supernatural open state: Deep abyssal midnight-indigo & nocturnal ink mist
  vec3 darkHorizon = vec3(0.0020, 0.0042, 0.0105);
  vec3 darkMid     = vec3(0.0009, 0.0020, 0.0062);
  vec3 darkZenith  = vec3(0.0003, 0.0006, 0.0022);

  float atmMix = smoothstep(0.06, 0.96, uPortalProgress);

  vec3 horizonCol = mix(calmHorizon, darkHorizon, atmMix);
  vec3 midCol     = mix(calmMid, darkMid, atmMix);
  vec3 zenithCol  = mix(calmZenith, darkZenith, atmMix);

  vec3 skyCol = mix(horizonCol, midCol, smoothstep(0.0, 0.25, upH));
  skyCol = mix(skyCol, zenithCol, smoothstep(0.20, 0.82, upH));

  float azimuth = atan(dir.x, -dir.z) / 6.2831853 + 0.5;

  // 1. Layered drifting mist clouds in the sky (in dark mode, dark brooding night clouds drift across the sky)
  vec2 cloudUv1 = vec2(azimuth * 2.5 + uTime * 0.0032, upH * 1.5 - uTime * 0.0014);
  vec2 cloudUv2 = vec2(azimuth * 5.0 - uTime * 0.0020, upH * 2.8 + uTime * 0.0009);
  vec4 n1 = texture2D(uNoiseTex, cloudUv1);
  vec4 n2 = texture2D(uNoiseTex, cloudUv2);
  float mistBand = exp(-abs(h) * 8.5);
  float cloudPattern = (n1.r * 0.65 + n2.g * 0.35) - 0.48;
  skyCol += cloudPattern * 0.075 * mix(1.0, 0.08, atmMix) * (1.0 - mistBand * 0.55);

  // 2. Veiled Sun (Calm) -> Haunting Japanese "Oborozuki" (朧月 — Hazy Pale Spirit Moon) in Dark Mode!
  vec3 celestialDir = normalize(vec3(-0.38, 0.35, -0.855));
  float sunAlign = max(0.0, dot(dir, celestialDir));
  float veiledDisc = pow(sunAlign, 160.0) * 0.55 + pow(sunAlign, 16.0) * 0.15;
  float lunarHalo  = exp(-acos(clamp(sunAlign, -1.0, 1.0)) * 9.5) * 0.24
                   + pow(sunAlign, 420.0) * 0.42;
  float cloudShroud = 0.52 + 0.48 * n1.r;

  vec3 calmSunGlow = vec3(0.95, 0.88, 0.78) * veiledDisc * (0.75 + 0.25 * n1.r);
  vec3 darkMoonGlow = vec3(0.11, 0.16, 0.28) * lunarHalo * cloudShroud;
  skyCol += mix(calmSunGlow, darkMoonGlow, atmMix);

  // 3. SUBTLE, VEILED, GHOSTLY SPIRIT AURORA & FAINT STARS IN DARK MODE (Dimmed & Mystical!)
  float auroraVis = smoothstep(0.22, 0.96, uPortalProgress);
  if (auroraVis > 0.002 && upH > 0.01) {
    // Faint, distant pinprick stars partially veiled by night mist
    vec2 starUv = vec2(azimuth * 20.0, upH * 10.0);
    float starVal = texture2D(uNoiseTex, starUv).a;
    float twinkle = 0.45 + 0.55 * sin(uTime * 1.9 + starVal * 45.0);
    float nightCloudMask = smoothstep(0.68, 0.28, n1.r * 0.7 + n2.g * 0.3);
    float stars = smoothstep(0.86, 0.97, starVal) * twinkle * smoothstep(0.10, 0.46, upH) * nightCloudMask;
    skyCol += vec3(0.32, 0.44, 0.68) * stars * auroraVis * 0.42;

    // Ghostly, slow-breathing spectral veil behind dark nocturnal clouds (NOT flashy!)
    float cloudVeil = 0.32 + 0.68 * smoothstep(0.22, 0.78, n1.g);
    float warpA = texture2D(uNoiseTex, vec2(azimuth * 1.8 - uTime * 0.006, uTime * 0.004)).r;
    float foldA = sin(azimuth * 12.566 + warpA * 3.4 + uTime * 0.085) * 0.12
                + cos(azimuth * 25.132 - warpA * 2.0 - uTime * 0.06) * 0.045;
    float dy1 = upH - (0.20 + foldA);
    float env1 = smoothstep(0.30, 0.0, abs(dy1)) * smoothstep(-0.04, 0.05, dy1 + 0.07);

    // Delicate ethereal spirit-curtain wisps
    float rayA = texture2D(uNoiseTex, vec2(azimuth * 14.0 + warpA * 0.5 + uTime * 0.008, upH * 0.55)).b;
    float rayB = texture2D(uNoiseTex, vec2(azimuth * 8.0 - uTime * 0.010, upH * 1.1)).g;
    float curtain1 = env1 * (0.24 + 0.76 * pow(rayA, 1.5)) * (0.45 + 0.55 * rayB) * cloudVeil;

    float hGrad1 = clamp((dy1 + 0.08) / 0.30, 0.0, 1.0);
    // Muted, haunting Kakuriyo palette: ghostly slate-teal -> deep moonlit indigo -> faint phantom violet
    vec3 cGhostTeal   = vec3(0.012, 0.115, 0.142);
    vec3 cSpiritBlue  = vec3(0.018, 0.068, 0.185);
    vec3 cPhantomViol = vec3(0.052, 0.022, 0.135);
    vec3 col1 = mix(cGhostTeal, cSpiritBlue, smoothstep(0.0, 0.48, hGrad1));
    col1 = mix(col1, cPhantomViol, smoothstep(0.42, 0.95, hGrad1));

    // Faint high-altitude secondary phantom mist ribbon
    float warpB = texture2D(uNoiseTex, vec2(azimuth * 2.6 + uTime * 0.007, 0.4 - uTime * 0.004)).g;
    float dy2 = upH - (0.34 + 0.10 * cos(azimuth * 18.85 - warpB * 2.8 - uTime * 0.07));
    float env2 = smoothstep(0.26, 0.0, abs(dy2));
    float ray2 = texture2D(uNoiseTex, vec2(azimuth * 17.0 - warpB * 0.45 - uTime * 0.009, upH * 0.45)).b;
    float curtain2 = env2 * pow(ray2, 1.55) * 0.65 * cloudVeil;
    vec3 col2 = mix(vec3(0.014, 0.085, 0.135), vec3(0.062, 0.024, 0.145), clamp((dy2 + 0.1) / 0.26, 0.0, 1.0));

    float horizonSoft = smoothstep(0.02, 0.15, upH);
    skyCol += (col1 * curtain1 * 0.62 + col2 * curtain2 * 0.45) * horizonSoft * auroraVis * (1.0 + uShockwave * 0.45);
  }

  // Deep brooding horizon mist shroud
  skyCol = mix(skyCol, horizonCol, mistBand * mix(0.88, 0.94, atmMix));

  gl_FragColor = vec4(skyCol, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function SkyAtmosphere() {
  const { gl, scene } = useThree();
  const skyMeshRef = useRef<THREE.Mesh>(null);

  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keySunRef = useRef<THREE.DirectionalLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);
  const seaBounceRef = useRef<THREE.PointLight>(null);
  const portalFrontLightRef = useRef<THREE.PointLight>(null);
  const portalBackLightRef = useRef<THREE.PointLight>(null);
  const portalSeaGlowRef = useRef<THREE.PointLight>(null);

  const noiseTex = useMemo(() => getSharedNoiseTexture(), []);

  // Install PBR HDRI Environment Map once at startup for real 3D metallic/wet reflections!
  useEffect(() => {
    const envTex = createMysticSeaEnvironment(gl);
    scene.environment = envTex;
    return () => {
      scene.environment = null;
      envTex.dispose();
    };
  }, [gl, scene]);

  const uniforms = useMemo(
    () => ({
      uNoiseTex: { value: noiseTex },
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
      uShockwave: { value: 0 },
    }),
    [noiseTex]
  );

  useEffect(() => {
    if (skyMeshRef.current) {
      skyMeshRef.current.layers.enable(1);
    }
  }, []);

  const calmFogCol = useMemo(() => new THREE.Color('#c8d3dd'), []);
  const darkFogCol = useMemo(() => new THREE.Color('#050a14'), []);
  const workFogCol = useMemo(() => new THREE.Color('#c8d3dd'), []);

  const calmSkyLight = useMemo(() => new THREE.Color('#dbe7f4'), []);
  const darkSkyLight = useMemo(() => new THREE.Color('#12223d'), []);
  const calmGroundLight = useMemo(() => new THREE.Color('#3a4a58'), []);
  const darkGroundLight = useMemo(() => new THREE.Color('#040812'), []);

  const calmRimCol = useMemo(() => new THREE.Color('#b8d8ff'), []);
  const auroraRimCol = useMemo(() => new THREE.Color('#5274b8'), []);

  useMemo(() => {
    scene.fog = new THREE.FogExp2('#c8d3dd', 0.0082);
  }, [scene]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const p = experienceState.portalProgress;
    const shock = experienceState.clickShockwave;

    uniforms.uTime.value = t;
    uniforms.uPortalProgress.value = p;
    uniforms.uShockwave.value = shock;

    const atmMix = THREE.MathUtils.smoothstep(p, 0.06, 0.96);

    // Modulate PBR IBL intensity so shadows have deep sculptural contrast in dark mode!
    if ('environmentIntensity' in scene) {
      (scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity =
        THREE.MathUtils.lerp(0.68, 0.19, atmMix);
    }

    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      workFogCol.copy(calmFogCol).lerp(darkFogCol, atmMix);
      scene.fog.color.copy(workFogCol);
      // Thicker nocturnal sea-mist envelops distant silhouettes for eerie depth
      scene.fog.density = THREE.MathUtils.lerp(0.0078, 0.0130, atmMix);
    }

    // CHIAROSCURO LIGHTING: Asymmetric strong angled Key Light + deep moody shadow contrast + mystical Moonlit Rim!
    if (hemiRef.current) {
      hemiRef.current.color.copy(calmSkyLight).lerp(darkSkyLight, atmMix);
      hemiRef.current.groundColor.copy(calmGroundLight).lerp(darkGroundLight, atmMix);
      hemiRef.current.intensity = THREE.MathUtils.lerp(0.85, 0.22, atmMix);
    }

    if (keySunRef.current) {
      keySunRef.current.intensity = THREE.MathUtils.lerp(3.4, 0.34, atmMix);
    }

    if (rimLightRef.current) {
      // Ghostly silver-indigo edge kicker sculpts pillar silhouettes & copper roof in the night!
      rimLightRef.current.color.copy(calmRimCol).lerp(auroraRimCol, atmMix);
      rimLightRef.current.intensity = THREE.MathUtils.lerp(1.85, 1.65, atmMix);
    }

    if (seaBounceRef.current) {
      seaBounceRef.current.intensity =
        THREE.MathUtils.lerp(3.2, 1.35, atmMix) * (0.9 + 0.1 * Math.sin(t * 2.1));
    }

    // Supernatural Portal Core Lights (Ghostly Moonlit Indigo & Spectral Violet-Blue)
    const portalGlow = THREE.MathUtils.smoothstep(p, 0.22, 1.0);
    const pulse = 1.0 + Math.sin(t * 2.0) * 0.07 + shock * 1.15;

    if (portalFrontLightRef.current) {
      portalFrontLightRef.current.intensity = portalGlow * 26.0 * pulse;
    }
    if (portalBackLightRef.current) {
      portalBackLightRef.current.intensity = portalGlow * 22.0 * pulse;
    }
    if (portalSeaGlowRef.current) {
      portalSeaGlowRef.current.intensity = portalGlow * 15.0 * pulse;
    }
  });

  return (
    <>
      <mesh ref={skyMeshRef} scale={[260, 260, 260]} frustumCulled={false} raycast={() => null} name="SkyDome">
        <sphereGeometry args={[1, 40, 28]} />
        <shaderMaterial
          vertexShader={skyVertexShader}
          fragmentShader={skyFragmentShader}
          uniforms={uniforms}
          side={THREE.BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>

      {/* Restrained Atmospheric Hemisphere (preserves deep shadow contrast on cylinders & beams!) */}
      <hemisphereLight ref={hemiRef} args={['#dbe7f4', '#3a4a58', 0.85]} />

      {/* Dramatic Asymmetric Key Light with Real 2048x2048 Soft Architectural Shadows! */}
      <directionalLight
        ref={keySunRef}
        position={[-15, 13, 14]}
        intensity={3.4}
        color="#ffeed8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={4}
        shadow-camera-far={42}
        shadow-camera-left={-8.5}
        shadow-camera-right={8.5}
        shadow-camera-top={9.5}
        shadow-camera-bottom={-2.5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      {/* Mystical Cool-Silver / Aurora-Emerald Kicker Rim Light from Opposite Rear-Right */}
      <directionalLight
        ref={rimLightRef}
        position={[16, 10, -14]}
        intensity={1.85}
        color="#b8d8ff"
      />

      {/* Shimmering Sea-Surface Bounce Light under the Torii Eaves & Plaque */}
      <pointLight
        ref={seaBounceRef}
        position={[0, 0.9, 4.2]}
        color="#9ec8e8"
        distance={14}
        decay={1.7}
        intensity={3.2}
      />

      {/* Supernatural Portal Core Lights (Ghostly Moonlit Indigo, Slate-Blue & Phantom Violet) */}
      <pointLight
        ref={portalFrontLightRef}
        position={[0, 2.15, 1.15]}
        color="#3b66d4"
        distance={24}
        decay={1.6}
        intensity={0}
      />
      <pointLight
        ref={portalBackLightRef}
        position={[0, 2.15, -1.15]}
        color="#31688a"
        distance={24}
        decay={1.6}
        intensity={0}
      />
      <pointLight
        ref={portalSeaGlowRef}
        position={[0, 0.65, 1.9]}
        color="#5242b0"
        distance={18}
        decay={1.7}
        intensity={0}
      />
    </>
  );
}
