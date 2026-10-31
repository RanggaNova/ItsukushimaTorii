import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { experienceState } from '../state/experienceState';

export const TORII_BASE_Y = -1.15;

// Builds a traditional Shinto Shimenawa (sacred twisted rope) + 5 hanging zigzag white Shide papers
function buildShimenawaAndShide() {
  // 1. Twisted Shimenawa Rope spanning between the two Hashira main pillars (X = -2.26m .. +2.26m, Y = 4.04m)
  const ropePositions: number[] = [];
  const ropeNormals: number[] = [];
  const ropeIndices: number[] = [];

  const lengthSegs = 72;
  const radialSegs = 12;
  const spanHalf = 2.28;

  for (let i = 0; i <= lengthSegs; i++) {
    const u = i / lengthSegs; // 0..1
    const nx = u * 2.0 - 1.0; // -1..1
    const x = nx * spanHalf;
    // Graceful catenary sag under Nuki crossbeam
    const sag = -0.16 * (1.0 - nx * nx);
    const yCenter = 4.06 + sag;
    const zCenter = 0.21; // Draped along front face of Nuki/Hashira

    // Traditional Shimenawa tapers toward both ends and swells proudly in the middle
    const baseRadius = 0.025 + 0.058 * Math.pow(1.0 - nx * nx, 0.75);

    for (let r = 0; r <= radialSegs; r++) {
      const ang = (r / radialSegs) * Math.PI * 2;
      // 3-strand helical rope twist modulation!
      const twist = Math.sin(ang * 3.0 + u * 52.0) * 0.16 + 1.0;
      const rad = baseRadius * twist;

      const dy = Math.cos(ang) * rad;
      const dz = Math.sin(ang) * rad;
      ropePositions.push(x, yCenter + dy, zCenter + dz);

      const nVec = new THREE.Vector3(0, dy, dz).normalize();
      ropeNormals.push(nVec.x, nVec.y, nVec.z);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < lengthSegs; i++) {
    for (let r = 0; r < radialSegs; r++) {
      const a = i * stride + r;
      const b = (i + 1) * stride + r;
      const c = (i + 1) * stride + (r + 1);
      const d = i * stride + (r + 1);
      ropeIndices.push(a, b, c, a, c, d);
    }
  }

  const ropeGeom = new THREE.BufferGeometry();
  ropeGeom.setAttribute('position', new THREE.Float32BufferAttribute(ropePositions, 3));
  ropeGeom.setAttribute('normal', new THREE.Float32BufferAttribute(ropeNormals, 3));
  ropeGeom.setIndex(ropeIndices);
  ropeGeom.computeVertexNormals();

  // 2. Five Sacred White Zigzag Paper Shide (紙垂) hanging from the Shimenawa!
  const shidePositions: number[] = [];
  const shideMeta: number[] = []; // x: hangRatio (0=top anchor..1=tip), y: phaseOffset
  const shideIndices: number[] = [];
  let vOff = 0;

  const shideXPositions = [-1.52, -0.76, 0.0, 0.76, 1.52];
  shideXPositions.forEach((sx, idx) => {
    const nx = sx / spanHalf;
    const topY = 4.02 - 0.16 * (1.0 - nx * nx);
    const topZ = 0.24;
    const scale = idx === 2 ? 1.15 : idx === 1 || idx === 3 ? 1.0 : 0.88;

    // 4-fold classic Japanese Shide lightning-bolt silhouette (each segment is a crisp quad)
    const folds = [
      // [dxTop, dyTop, dxBot, dyBot, width]
      [0.0, 0.0, -0.035, -0.13, 0.055],
      [-0.025, -0.11, 0.045, -0.25, 0.062],
      [0.035, -0.23, -0.050, -0.38, 0.068],
      [-0.040, -0.36, 0.030, -0.52, 0.058],
    ];

    folds.forEach(([x0, y0, x1, y1, w], fIdx) => {
      const hw = w * 0.5 * scale;
      const zOff = (fIdx % 2 === 0 ? 0.004 : -0.004);
      const rTop = Math.abs(y0) / 0.52;
      const rBot = Math.abs(y1) / 0.52;
      const phase = idx * 1.37;

      shidePositions.push(
        sx + x0 * scale - hw, topY + y0 * scale, topZ + zOff,
        sx + x0 * scale + hw, topY + y0 * scale, topZ + zOff,
        sx + x1 * scale + hw * 0.85, topY + y1 * scale, topZ - zOff,
        sx + x1 * scale - hw * 0.85, topY + y1 * scale, topZ - zOff
      );
      shideMeta.push(rTop, phase, rTop, phase, rBot, phase, rBot, phase);
      shideIndices.push(vOff, vOff + 1, vOff + 2, vOff, vOff + 2, vOff + 3);
      vOff += 4;
    });
  });

  const shideGeom = new THREE.BufferGeometry();
  shideGeom.setAttribute('position', new THREE.Float32BufferAttribute(shidePositions, 3));
  shideGeom.setAttribute('aShideMeta', new THREE.Float32BufferAttribute(shideMeta, 2));
  shideGeom.setIndex(shideIndices);
  shideGeom.computeVertexNormals();

  return { ropeGeom, shideGeom };
}

const shideVertexShader = /* glsl */ `
attribute vec2 aShideMeta; // x: hangRatio 0..1, y: phase
uniform float uTime;
uniform float uPortalProgress;

varying float vHang;

void main() {
  vHang = aShideMeta.x;
  float phase = aShideMeta.y;
  vec3 pos = position;

  // Natural sea-breeze flutter + stronger inward suction tremble when portal opens!
  float windFreq = mix(2.2, 5.8, uPortalProgress);
  float windAmp  = mix(0.038, 0.095, uPortalProgress) * (vHang * vHang);

  pos.x += sin(uTime * windFreq + phase + vHang * 3.0) * windAmp;
  pos.z += cos(uTime * (windFreq * 0.85) + phase * 1.7) * windAmp * 0.85;
  // Pull slightly inward (-Z) toward portal center when suction rises!
  pos.z -= uPortalProgress * 0.14 * (vHang * vHang);
  pos.y += abs(sin(uTime * windFreq + phase)) * windAmp * 0.25;

  vec4 wp = modelMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const shideFragmentShader = /* glsl */ `
uniform float uPortalProgress;
varying float vHang;

void main() {
  // Crisp sacred Washi white paper, catching eerie moonlit silver-indigo spirit light in dark mode!
  vec3 calmPaper = mix(vec3(0.78, 0.80, 0.82), vec3(0.95, 0.96, 0.98), vHang);
  vec3 spiritPaper = mix(vec3(0.14, 0.20, 0.36), vec3(0.32, 0.44, 0.68), vHang);
  vec3 col = mix(calmPaper, spiritPaper, smoothstep(0.25, 0.95, uPortalProgress));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function ToriiGate() {
  const { scene } = useGLTF('/models/itsukushima_torii.glb');
  const assemblyRef = useRef<THREE.Group>(null);
  const shimenawaRef = useRef<THREE.Mesh>(null);
  const shideRef = useRef<THREE.Mesh>(null);

  const sharedShaderUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
      uGateHover: { value: 0 },
      uShockwave: { value: 0 },
      uWinterMix: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
    }),
    []
  );

  const { ropeGeom, shideGeom } = useMemo(() => buildShimenawaAndShide(), []);
  const shideUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
    }),
    []
  );

  const batchedToriiGroup = useMemo(() => {
    scene.updateMatrixWorld(true);

    const groupsByMat = new Map<
      string,
      { origMat: THREE.MeshStandardMaterial; geoms: THREE.BufferGeometry[] }
    >();

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const origMat = mesh.material as THREE.MeshStandardMaterial;
        const key = origMat.name || origMat.uuid;

        const g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);

        if (!g.attributes.uv) {
          const count = g.attributes.position.count;
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        if (g.attributes.tangent) {
          g.deleteAttribute('tangent');
        }

        const bucket = groupsByMat.get(key);
        if (bucket) {
          bucket.geoms.push(g);
        } else {
          groupsByMat.set(key, { origMat, geoms: [g] });
        }
      }
    });

    const container = new THREE.Group();

    groupsByMat.forEach(({ origMat, geoms }, matName) => {
      const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
      if (!merged) return;

      const mat = origMat.clone();
      if (mat.map) mat.map.anisotropy = 8;
      if (mat.normalMap) {
        mat.normalMap.anisotropy = 8;
        mat.normalScale.set(1.35, 1.35); // Deeper tactile wood grain & copper seam relief!
      }

      // Sculptural PBR Calibration (ZERO flat uniform emissive wash!)
      if (matName.includes('Cedar')) {
        // Rich, saturated sacred Japanese Vermilion (Shu-iro) with natural satin-lacquer sheen!
        mat.color.setRGB(1.85, 1.18, 1.05);
        mat.roughness = 0.48;
        mat.envMapIntensity = 1.15;
        mat.emissive = new THREE.Color(0, 0, 0);
      } else if (matName.includes('Copper')) {
        mat.color.setRGB(1.35, 1.65, 1.58);
        mat.roughness = 0.36;
        mat.metalness = 0.55;
        mat.envMapIntensity = 1.4;
      } else if (matName.includes('Dark_Wood')) {
        mat.color.setRGB(1.4, 1.15, 1.05);
        mat.roughness = 0.65;
      } else if (matName.includes('Gold')) {
        mat.color.setRGB(1.35, 1.15, 0.85);
        mat.metalness = 0.95;
        mat.roughness = 0.20;
        mat.envMapIntensity = 2.0;
        mat.emissive = new THREE.Color(0.32, 0.20, 0.03);
        mat.emissiveIntensity = 0.45;
      } else if (matName.includes('Bronze') || matName.includes('Metal')) {
        mat.color.setRGB(1.45, 1.55, 1.48);
        mat.metalness = 0.85;
        mat.roughness = 0.38;
        mat.envMapIntensity = 1.5;
      }

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = sharedShaderUniforms.uTime;
        shader.uniforms.uPortalProgress = sharedShaderUniforms.uPortalProgress;
        shader.uniforms.uGateHover = sharedShaderUniforms.uGateHover;
        shader.uniforms.uShockwave = sharedShaderUniforms.uShockwave;
        shader.uniforms.uWinterMix = sharedShaderUniforms.uWinterMix;
        shader.uniforms.uCameraPos = sharedShaderUniforms.uCameraPos;

        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            /* glsl */ `
            #include <common>
            varying vec3 vToriiWorldPos;
            varying vec3 vToriiWorldNormal;
            `
          )
          .replace(
            '#include <worldpos_vertex>',
            /* glsl */ `
            #include <worldpos_vertex>
            vec4 toriiWp = modelMatrix * vec4(transformed, 1.0);
            vToriiWorldPos = toriiWp.xyz;
            vToriiWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
            `
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            /* glsl */ `
            #include <common>
            uniform float uTime;
            uniform float uPortalProgress;
            uniform float uGateHover;
            uniform float uShockwave;
            uniform float uWinterMix;
            uniform vec3 uCameraPos;
            varying vec3 vToriiWorldPos;
            varying vec3 vToriiWorldNormal;
            `
          )
          .replace(
            '#include <color_fragment>',
            /* glsl */ `
            #include <color_fragment>
            // 1. Live waterline wetness & dark marine algae/barnacle transition
            float waveLap = 0.06 * sin(vToriiWorldPos.x * 1.4 + uTime * 1.25);
            float wetLine = vToriiWorldPos.y - waveLap;
            float marineStain = 1.0 - smoothstep(-0.12, 0.48, wetLine);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.16, 0.17, 0.15), marineStain * 0.82);

            // 2. Procedural Architectural Cavity Ambient Occlusion (eliminates flat look!)
            // Darkens deep crevices under main roof eaves, under Nuki beam, and around pillar joints!
            float underRoofAO = 1.0 - 0.48 * exp(-pow((vToriiWorldPos.y - 5.95) * 2.1, 2.0)) * max(0.0, -vToriiWorldNormal.y * 0.6 + 0.4);
            float underNukiAO = 1.0 - 0.36 * exp(-pow((vToriiWorldPos.y - 4.12) * 3.5, 2.0)) * max(0.0, -vToriiWorldNormal.y);
            float jointDistL  = length(vec2(vToriiWorldPos.x + 2.75, (vToriiWorldPos.y - 4.4) * 0.7));
            float jointDistR  = length(vec2(vToriiWorldPos.x - 2.75, (vToriiWorldPos.y - 4.4) * 0.7));
            float jointAO     = 1.0 - 0.25 * (exp(-jointDistL * 2.5) + exp(-jointDistR * 2.5));
            diffuseColor.rgb *= clamp(underRoofAO * underNukiAO * jointAO, 0.38, 1.0);

            // 3. Winter (Fuyu) Crystalline Snow Accumulation on Curved Copper Roofs & Top Beams!
            if (uWinterMix > 0.005) {
              float snowFacing = smoothstep(0.42, 0.85, vToriiWorldNormal.y);
              float aboveWaves = smoothstep(1.4, 2.2, vToriiWorldPos.y);
              float snowNoise  = 0.82 + 0.18 * sin(vToriiWorldPos.x * 7.5 + vToriiWorldPos.z * 9.0);
              float snowMask   = clamp(snowFacing * aboveWaves * snowNoise * uWinterMix, 0.0, 0.92);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.99), snowMask);
            }
            `
          )
          .replace(
            '#include <roughnessmap_fragment>',
            /* glsl */ `
            #include <roughnessmap_fragment>
            // Glossy wet sea-spray sheen on lower pillars up to 0.75m above waves!
            float wetSpray = 1.0 - smoothstep(-0.05, 0.75, vToriiWorldPos.y);
            roughnessFactor = mix(roughnessFactor, 0.11, wetSpray * 0.82);
            `
          )
          .replace(
            '#include <emissivemap_fragment>',
            /* glsl */ `
            #include <emissivemap_fragment>
            vec3 worldN = normalize(vToriiWorldNormal);
            vec3 viewDirW = normalize(uCameraPos - vToriiWorldPos);

            // 1. MYSTICAL GRAZING FRESNEL SPIRIT RIM-LIGHT (Gives haunting 3D silhouette depth!)
            float fresnelRim = pow(1.0 - abs(dot(worldN, viewDirW)), 3.2);
            vec3 calmMysticRim = vec3(0.14, 0.22, 0.32) * 0.55;
            vec3 darkAuroraRim = mix(vec3(0.08, 0.16, 0.34), vec3(0.16, 0.22, 0.52), 0.55) * 1.15;
            vec3 rimCol = mix(calmMysticRim, darkAuroraRim, smoothstep(0.15, 0.95, uPortalProgress));
            totalEmissiveRadiance += rimCol * fresnelRim * (1.0 + uGateHover * 0.40);

            // 2. ANIMATED OCEAN CAUSTICS BOUNCING UPWARD ONTO BEAMS, RAFTERS & PILLARS!
            float downFacing = max(0.0, -worldN.y * 0.75 + 0.25);
            float heightAtten = exp(-max(0.0, vToriiWorldPos.y) * 0.30);
            float cWave1 = sin(vToriiWorldPos.x * 3.4 + vToriiWorldPos.z * 2.7 + uTime * 2.3);
            float cWave2 = cos(vToriiWorldPos.x * 2.6 - vToriiWorldPos.z * 3.9 - uTime * 1.9);
            float caustic = pow(max(0.0, cWave1 * cWave2), 2.0);
            vec3 causticTint = mix(vec3(0.16, 0.24, 0.30), vec3(0.06, 0.15, 0.34), uPortalProgress);
            totalEmissiveRadiance += diffuseColor.rgb * causticTint * caustic * downFacing * heightAtten * 2.3;

            // 3. SUPERNATURAL INNER SANCTUARY SPILL LIGHT (Stage 2 -> 5)
            vec3 portalCenter = vec3(0.0, 2.06, 0.0);
            vec3 toPortal = portalCenter - vToriiWorldPos;
            float distToPortal = length(toPortal);
            vec3 dirToPortal = toPortal / max(distToPortal, 0.001);
            float facingPortal = max(0.0, dot(worldN, dirToPortal));
            float atten = 1.0 / (1.0 + distToPortal * distToPortal * 0.13);
            float portalLight = smoothstep(0.18, 1.0, uPortalProgress) * atten * (0.26 + 0.74 * facingPortal);

            vec3 supernaturalTint = mix(vec3(0.14, 0.26, 0.65), vec3(0.18, 0.14, 0.48), 0.38);
            totalEmissiveRadiance += (diffuseColor.rgb * 1.15 + vec3(0.015, 0.032, 0.085))
                                   * supernaturalTint * portalLight * (2.05 + uShockwave * 1.8);
            `
          );
      };

      const batchedMesh = new THREE.Mesh(merged, mat);
      // Real 3D Architectural Shadows!
      batchedMesh.castShadow = true;
      batchedMesh.receiveShadow = true;
      batchedMesh.raycast = () => {};
      batchedMesh.layers.enable(1);
      container.add(batchedMesh);
    });

    return container;
  }, [scene, sharedShaderUniforms]);

  useEffect(() => {
    if (shimenawaRef.current) shimenawaRef.current.layers.enable(1);
    if (shideRef.current) shideRef.current.layers.enable(1);

    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        experienceState.isHoveringGate = false;
      }
    };
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, []);

  useFrame(({ clock, camera }) => {
    const isInFrontOfTorii = camera.position.z > -1.2;
    if (assemblyRef.current) {
      assemblyRef.current.visible = isInFrontOfTorii;
    }
    if (!isInFrontOfTorii) return;

    const t = clock.getElapsedTime();
    sharedShaderUniforms.uTime.value = t;
    sharedShaderUniforms.uPortalProgress.value = experienceState.portalProgress;
    sharedShaderUniforms.uGateHover.value = experienceState.gateHoverBlend;
    sharedShaderUniforms.uShockwave.value = experienceState.clickShockwave;
    sharedShaderUniforms.uWinterMix.value =
      experienceState.seasonWeights.w * (1.0 - experienceState.portalProgress * 0.65);
    sharedShaderUniforms.uCameraPos.value.copy(camera.position);

    shideUniforms.uTime.value = t;
    shideUniforms.uPortalProgress.value = experienceState.portalProgress;
  });

  const handleGateOver = () => {
    experienceState.isHoveringGate = true;
  };
  const handleGateOut = () => {
    experienceState.isHoveringGate = false;
  };

  return (
    <group ref={assemblyRef} name="ToriiAssembly">
      {/* Batched 6-Pillar Itsukushima O-Torii with Real Shadows, Cavity AO, Fresnel Rim & Caustics */}
      <primitive object={batchedToriiGroup} position={[0, TORII_BASE_Y, 0]} />

      {/* Sacred Shinto Shimenawa Straw Rope under Nuki Crossbeam */}
      <mesh
        ref={shimenawaRef}
        geometry={ropeGeom}
        castShadow
        receiveShadow
        raycast={() => null}
        name="SacredShimenawa"
      >
        <meshStandardMaterial color="#8f7852" roughness={0.88} metalness={0.0} />
      </mesh>

      {/* 5 Wind-Fluttering Sacred White Shide Paper Talismans */}
      <mesh
        ref={shideRef}
        geometry={shideGeom}
        raycast={() => null}
        name="SacredShidePapers"
      >
        <shaderMaterial
          vertexShader={shideVertexShader}
          fragmentShader={shideFragmentShader}
          uniforms={shideUniforms}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Lightweight 12-Triangle Gate Hover Proxy for subtle spirit rim shimmer */}
      <mesh position={[0, 3.6, 0]} onPointerOver={handleGateOver} onPointerOut={handleGateOut}>
        <boxGeometry args={[10.2, 7.2, 2.8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

useGLTF.preload('/models/itsukushima_torii.glb');
