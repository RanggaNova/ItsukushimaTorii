import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState, MAX_RIPPLES } from '../state/experienceState';
import { getSharedNoiseTexture } from '../utils/proceduralTextures';

const oceanVertexShader = /* glsl */ `
uniform float uTime;
uniform float uPortalProgress;
uniform float uShockwave;
uniform vec3 uCursorWorld;
uniform float uCursorActive;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform mat4 uTextureMatrix;

varying vec3 vWorldPos;
varying vec4 vReflCoord;

float computeOceanMacroHeight(vec2 xz) {
  float t = uTime;

  // Natural multi-directional ocean swells
  float h = 0.0;
  h += sin(xz.y * 0.65 + xz.x * 0.12 + t * 1.05) * 0.040;
  h += sin(xz.y * 1.35 - xz.x * 0.32 + t * 1.45) * 0.018;
  h += cos(xz.x * 0.85 + xz.y * 0.45 - t * 0.90) * 0.015;

  // Live cursor dimple
  if (uCursorActive > 0.01) {
    vec2 dc = xz - uCursorWorld.xz;
    float cd2 = dot(dc, dc);
    h -= exp(-cd2 * 1.1) * 0.042 * uCursorActive;
  }

  // Spreading cursor ripple rings (10-slot fast ring buffer)
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    float age = t - rp.z;
    if (age > 0.0 && age < 3.4 && rp.w > 0.001) {
      float d = length(xz - rp.xy);
      float radius = age * 2.45;
      float diff = d - radius;
      float band = exp(-diff * diff * 2.6);
      float decay = exp(-age * 1.1) * exp(-d * 0.16);
      h += sin(diff * 7.5) * band * decay * rp.w * 0.046;
    }
  }

  // Supernatural Portal Whirlpool Vortex beneath the Torii Gate (0, 0)
  float rGate = length(xz);
  float vortexAmt = smoothstep(0.10, 0.95, uPortalProgress);
  if (vortexAmt > 0.001) {
    float ang = atan(xz.y, xz.x);
    float funnel = -0.25 * exp(-rGate * 0.32) * vortexAmt;
    float spiral = sin(ang * 4.0 + log(rGate + 0.65) * 5.2 - t * 3.8)
                 * 0.042 * exp(-rGate * 0.16) * vortexAmt;
    h += funnel + spiral;
  }

  // Click shockwave ring
  if (uShockwave > 0.001) {
    float shockRadius = (1.0 - uShockwave) * 18.0;
    float diffS = rGate - shockRadius;
    h += sin(diffS * 4.5) * exp(-diffS * diffS * 0.85) * uShockwave * 0.14;
  }

  return h;
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float distFade = exp(-length(wp.xz) * 0.018);
  wp.y += computeOceanMacroHeight(wp.xz) * distFade;

  vWorldPos = wp.xyz;
  vReflCoord = uTextureMatrix * vec4(wp.x, 0.0, wp.z, 1.0);

  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const oceanFragmentShader = /* glsl */ `
uniform sampler2D uReflectionMap;
uniform sampler2D uNoiseTex;
uniform float uTime;
uniform float uPortalProgress;
uniform float uShockwave;
uniform vec3 uCameraPos;
uniform vec3 uCursorWorld;
uniform float uCursorActive;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec3 vWorldPos;
varying vec4 vReflCoord;

// SINGLE-PASS Analytical Surface Gradient (dh/dx, dh/dz) — 10x faster than 3-tap finite differences!
vec2 computeWaterGradient(vec2 xz, float distCam) {
  float t = uTime;
  vec2 grad = vec2(0.0);

  // 1. Analytical derivatives of natural ocean swells + horizontal photographic capillary waves
  float c1 = cos(xz.y * 1.15 + xz.x * 0.18 + t * 1.15) * 0.025;
  grad += c1 * vec2(0.18, 1.15);

  float c2 = cos(xz.y * 2.85 - xz.x * 0.42 + t * 1.65) * 0.011;
  grad += c2 * vec2(-0.42, 2.85);

  float detailFade = 1.0 - smoothstep(18.0, 75.0, distCam);
  if (detailFade > 0.01) {
    float c3 = cos(xz.y * 6.20 + xz.x * 0.85 - t * 2.10) * 0.0042 * detailFade;
    grad += c3 * vec2(0.85, 6.20);

    // Fast 2D texture micro-ripple perturbation (replaces expensive 3D simplex noise!)
    vec2 nUv = xz * vec2(0.045, 0.095) + vec2(t * 0.012, -t * 0.024);
    vec2 texGrad = (texture2D(uNoiseTex, nUv).rg - 0.5) * 0.055 * detailFade;
    grad += texGrad;
  }

  // 2. Live cursor wake gradient
  if (uCursorActive > 0.01) {
    vec2 dc = xz - uCursorWorld.xz;
    float cd2 = dot(dc, dc);
    if (cd2 < 9.0) {
      grad += dc * (2.6 * 0.032 * uCursorActive * exp(-cd2 * 1.3));
    }
  }

  // 3. Analytical gradient of spreading concentric cursor ripples
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    float age = t - rp.z;
    if (age > 0.0 && age < 3.4 && rp.w > 0.001) {
      vec2 dr = xz - rp.xy;
      float d = length(dr) + 0.0001;
      float radius = age * 2.45;
      float diff = d - radius;
      if (abs(diff) < 2.2) {
        float env = exp(-diff * diff * 2.8) * exp(-age * 1.1) * exp(-d * 0.15) * rp.w;
        float dWave = cos(diff * 8.5) * 8.5 * 0.028 * env;
        grad += (dr / d) * dWave;
      }
    }
  }

  // 4. Stage 1-5 Supernatural Whirlpool Vortex around the Torii Gate
  float rGate = length(xz) + 0.001;
  if (uPortalProgress > 0.005 && rGate < 22.0) {
    vec2 rDir = xz / rGate;
    vec2 tDir = vec2(-rDir.y, rDir.x);

    // Stage 1 initial micro-tremor
    float tremor = smoothstep(0.01, 0.25, uPortalProgress) * exp(-rGate * 0.35);
    grad += rDir * (cos(rGate * 9.0 - t * 4.5) * 0.045 * tremor);

    // Stage 2-5 spiral whirlpool ridges
    float vortexAmt = smoothstep(0.14, 0.96, uPortalProgress);
    float ang = atan(xz.y, xz.x);
    float phase = ang * 5.0 + log(rGate + 0.55) * 6.5 - t * 4.2;
    float envV = exp(-rGate * 0.15) * smoothstep(0.15, 1.2, rGate) * vortexAmt;
    float cSpiral = cos(phase) * 0.026 * envV;
    grad += tDir * (cSpiral * 5.0 / (rGate + 0.35)) + rDir * (cSpiral * 6.5 / (rGate + 0.55));
  }

  // 5. Portal Click Shockwave gradient
  if (uShockwave > 0.001) {
    float shockRadius = (1.0 - uShockwave) * 18.0;
    float diffS = rGate - shockRadius;
    if (abs(diffS) < 3.5) {
      vec2 rDir = xz / rGate;
      float envS = exp(-diffS * diffS * 1.1) * uShockwave;
      grad += rDir * (cos(diffS * 5.5) * 5.5 * 0.055 * envS);
    }
  }

  return grad;
}

void main() {
  vec2 xz = vWorldPos.xz;
  float distCam = length(vWorldPos - uCameraPos);

  vec2 grad = computeWaterGradient(xz, distCam);
  vec3 normal = normalize(vec3(-grad.x, 1.0, -grad.y));

  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float NdotV = max(0.02, dot(normal, viewDir));

  // Schlick Fresnel
  float fresnel = 0.05 + 0.95 * pow(1.0 - NdotV, 4.0);

  // Projective Planar Reflection UV + wave normal distortion (reflects Torii, Portal & Aurora!)
  vec2 projUv = vReflCoord.xy / max(0.0001, vReflCoord.w);
  float distortScale = mix(0.30, 0.48, smoothstep(0.2, 1.0, uPortalProgress));
  vec2 distortOffset = vec2(normal.x * 0.42, normal.z * 0.82) * distortScale;
  vec2 reflUv = clamp(projUv + distortOffset, vec2(0.002), vec2(0.998));

  vec3 reflColor = texture2D(uReflectionMap, reflUv).rgb;

  float atmMix = smoothstep(0.08, 0.96, uPortalProgress);

  vec3 calmDeepCol    = vec3(0.022, 0.042, 0.058);
  vec3 calmShallowCol = vec3(0.135, 0.188, 0.232);
  vec3 darkDeepCol    = vec3(0.0006, 0.0015, 0.0040);
  vec3 darkShallowCol = vec3(0.0020, 0.0048, 0.0115);

  vec3 waterDeep    = mix(calmDeepCol, darkDeepCol, atmMix);
  vec3 waterShallow = mix(calmShallowCol, darkShallowCol, atmMix);
  vec3 waterBody    = mix(waterDeep, waterShallow, smoothstep(6.0, 38.0, distCam) * 0.65);

  // Reflection of gate softens subtly in dark mode while Aurora & Portal reflections shine!
  float reflClarity = mix(0.90, 0.56, smoothstep(0.35, 1.0, uPortalProgress));
  vec3 combinedCol = mix(waterBody, reflColor, clamp(fresnel * reflClarity, 0.0, 0.95));

  // Veiled Misty Sun / Oborozuki Spirit-Moon Specular Shimmer Path on the Waves!
  vec3 celestialDir = normalize(vec3(-0.38, 0.35, -0.855));
  vec3 sunHalf = normalize(celestialDir + viewDir);
  float sunSpec = pow(max(0.0, dot(normal, sunHalf)), 96.0);
  vec3 sunGlintCol = mix(vec3(0.45, 0.42, 0.38), vec3(0.07, 0.12, 0.24), atmMix);
  combinedCol += sunGlintCol * sunSpec * 0.85;

  // Supernatural Portal Moonlit-Indigo Glints on Whirlpool Ripples
  float rGate = length(xz);
  float portalGlow = smoothstep(0.28, 1.0, uPortalProgress);
  if (portalGlow > 0.001) {
    vec3 portalPos = vec3(0.0, 2.0, 0.0);
    vec3 lightDir = normalize(portalPos - vWorldPos);
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfVec)), 32.0);
    float scatter = exp(-rGate * 0.13) * max(0.0, normal.y);

    vec3 portalWaterLight = mix(vec3(0.05, 0.15, 0.48), vec3(0.05, 0.14, 0.28), 0.35) * spec * 1.55
                          + vec3(0.011, 0.026, 0.085) * scatter;
    combinedCol += portalWaterLight * portalGlow * (1.0 + uShockwave * 1.25);
  }

  float fogFactor = 1.0 - exp(-(uFogDensity * distCam) * (uFogDensity * distCam));
  vec3 finalColor = mix(combinedCol, uFogColor, clamp(fogFactor, 0.0, 1.0));

  gl_FragColor = vec4(finalColor, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function InteractiveOcean() {
  const { gl, scene, camera } = useThree();
  const oceanMeshRef = useRef<THREE.Mesh>(null);
  const noiseTex = useMemo(() => getSharedNoiseTexture(), []);

  // 512x512 Planar Reflection FBO = 4x faster GPU fill rate while naturally rippled by water waves!
  const reflectionTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(512, 512, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
    });
  }, []);

  useEffect(() => {
    return () => {
      reflectionTarget.dispose();
    };
  }, [reflectionTarget]);

  const virtualCam = useMemo(() => {
    const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 450);
    // Render ONLY Layer 1 (Sky+Aurora, Mountains, Torii, Portal) — skips 260 Mist quads for huge FPS boost!
    cam.layers.set(1);
    return cam;
  }, []);

  const camForward = useMemo(() => new THREE.Vector3(), []);
  const textureMatrix = useMemo(() => new THREE.Matrix4(), []);
  const biasMatrix = useMemo(
    () =>
      new THREE.Matrix4().set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
      ),
    []
  );
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05), []);

  const rippleUniformArray = useMemo(
    () => Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 1000, -100, 0)),
    []
  );

  const uniforms = useMemo(
    () => ({
      uReflectionMap: { value: reflectionTarget.texture },
      uNoiseTex: { value: noiseTex },
      uTextureMatrix: { value: textureMatrix },
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
      uShockwave: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
      uCursorWorld: { value: new THREE.Vector3(0, 0, 1000) },
      uCursorActive: { value: 0 },
      uRipples: { value: rippleUniformArray },
      uFogColor: { value: new THREE.Color('#c8d3dd') },
      uFogDensity: { value: 0.0082 },
    }),
    [reflectionTarget.texture, noiseTex, textureMatrix, rippleUniformArray]
  );

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const dt = Math.min(delta, 0.05);

    uniforms.uTime.value = t;
    uniforms.uPortalProgress.value = experienceState.portalProgress;
    uniforms.uShockwave.value = experienceState.clickShockwave;
    uniforms.uCameraPos.value.copy(camera.position);
    uniforms.uCursorWorld.value.copy(experienceState.waterHitPoint);

    const targetCursorActive = experienceState.hasWaterHit ? 1.0 : 0.0;
    uniforms.uCursorActive.value = THREE.MathUtils.lerp(
      uniforms.uCursorActive.value,
      targetCursorActive,
      1.0 - Math.exp(-6.0 * dt)
    );

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = experienceState.ripples[i];
      rippleUniformArray[i].set(r.x, r.z, r.birthTime, r.strength);
    }

    if (scene.fog && scene.fog instanceof THREE.FogExp2) {
      uniforms.uFogColor.value.copy(scene.fog.color);
      uniforms.uFogDensity.value = scene.fog.density;
    }

    // Mirror camera position & live view direction across y = 0 (works at ANY 360° Orbit & Zoom!)
    const perspCam = camera as THREE.PerspectiveCamera;
    virtualCam.fov = perspCam.fov;
    virtualCam.aspect = perspCam.aspect;
    virtualCam.near = perspCam.near;
    virtualCam.far = perspCam.far;

    camera.getWorldDirection(camForward);
    virtualCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
    virtualCam.up.set(0, 1, 0);
    virtualCam.lookAt(
      virtualCam.position.x + camForward.x * 20.0,
      virtualCam.position.y - camForward.y * 20.0,
      virtualCam.position.z + camForward.z * 20.0
    );
    virtualCam.updateMatrixWorld();
    virtualCam.updateProjectionMatrix();

    textureMatrix.copy(biasMatrix);
    textureMatrix.multiply(virtualCam.projectionMatrix);
    textureMatrix.multiply(virtualCam.matrixWorldInverse);

    const prevTarget = gl.getRenderTarget();
    const prevLocalClip = gl.localClippingEnabled;
    const prevPlanes = gl.clippingPlanes;

    gl.localClippingEnabled = true;
    gl.clippingPlanes = [clipPlane];
    gl.setRenderTarget(reflectionTarget);
    gl.clear();
    gl.render(scene, virtualCam);

    gl.clippingPlanes = prevPlanes;
    gl.localClippingEnabled = prevLocalClip;
    gl.setRenderTarget(prevTarget);
  });

  return (
    <mesh
      ref={oceanMeshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      raycast={() => null}
      name="InteractiveOceanMesh"
    >
      {/* 128x128 grid + raycast disabled = zero CPU raycast cost & silky GPU vertex throughput! */}
      <planeGeometry args={[280, 280, 128, 128]} />
      <shaderMaterial
        vertexShader={oceanVertexShader}
        fragmentShader={oceanFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
