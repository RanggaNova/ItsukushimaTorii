import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { experienceState } from '../state/experienceState';
import { ToriiPartId } from '../data/toriiPartsData';

export const TORII_BASE_Y = -1.15;

interface SubAssemblySpec {
  key: string;
  partId: ToriiPartId;
  offset: [number, number, number];
  stagger: [number, number];
}

const SUB_ASSEMBLY_SPECS: Record<string, SubAssemblySpec> = {
  // 1. HASHIRA (Main Kusunoki Pillars & Underwater Plinths unified so pillars never detach at waterline)
  hashira_L: { key: 'hashira_L', partId: 'hashira', offset: [-1.15, 0.0, 0.0], stagger: [0.0, 0.85] },
  hashira_R: { key: 'hashira_R', partId: 'hashira', offset: [1.15, 0.0, 0.0], stagger: [0.0, 0.85] },

  // 2. RYOBU (4 Outrigger Pillars grounded in water, Mini Roof Caps, HikaeNuki Tie-Beams & Wedges)
  ryobu_LF: { key: 'ryobu_LF', partId: 'ryobu', offset: [-1.85, 0.0, 1.35], stagger: [0.10, 0.85] },
  ryobu_LR: { key: 'ryobu_LR', partId: 'ryobu', offset: [-1.85, 0.0, -1.35], stagger: [0.10, 0.85] },
  ryobu_RF: { key: 'ryobu_RF', partId: 'ryobu', offset: [1.85, 0.0, 1.35], stagger: [0.10, 0.85] },
  ryobu_RR: { key: 'ryobu_RR', partId: 'ryobu', offset: [1.85, 0.0, -1.35], stagger: [0.10, 0.85] },
  smallcap_LF: { key: 'smallcap_LF', partId: 'ryobu', offset: [-1.85, 0.82, 1.35], stagger: [0.0, 0.65] },
  smallcap_LR: { key: 'smallcap_LR', partId: 'ryobu', offset: [-1.85, 0.82, -1.35], stagger: [0.0, 0.65] },
  smallcap_RF: { key: 'smallcap_RF', partId: 'ryobu', offset: [1.85, 0.82, 1.35], stagger: [0.0, 0.65] },
  smallcap_RR: { key: 'smallcap_RR', partId: 'ryobu', offset: [1.85, 0.82, -1.35], stagger: [0.0, 0.65] },
  hikae_L: { key: 'hikae_L', partId: 'ryobu', offset: [-1.35, 0.22, 0.0], stagger: [0.05, 0.75] },
  hikae_R: { key: 'hikae_R', partId: 'ryobu', offset: [1.35, 0.22, 0.0], stagger: [0.05, 0.75] },
  outrigger_wedges: { key: 'outrigger_wedges', partId: 'ryobu', offset: [0.0, 0.32, 0.75], stagger: [0.0, 0.60] },

  // 3. NUKI (Main Penetrating Tie-Beam & Kusabi Wedges)
  nuki_beam: { key: 'nuki_beam', partId: 'nuki', offset: [0.0, 0.0, 0.35], stagger: [0.15, 0.90] },
  nuki_wedges: { key: 'nuki_wedges', partId: 'nuki', offset: [0.0, 0.28, 0.95], stagger: [0.0, 0.70] },

  // 4. HENGAKU (Imperial Calligraphy Tablets & Gakuzuka Center Post)
  gakuzuka_post: { key: 'gakuzuka_post', partId: 'hengaku', offset: [0.0, 0.35, 0.0], stagger: [0.15, 0.85] },
  hengaku_front: { key: 'hengaku_front', partId: 'hengaku', offset: [0.0, 0.35, 1.35], stagger: [0.0, 0.75] },
  hengaku_rear: { key: 'hengaku_rear', partId: 'hengaku', offset: [0.0, 0.35, -1.35], stagger: [0.0, 0.75] },

  // 5. KASAGI (Shimaki Lower Beam, Hollow Kasagi Box, 7-Ton Ballast Stones, Rafters, Copper Roof & Ridge)
  kasagi_shimaki: { key: 'kasagi_shimaki', partId: 'kasagi', offset: [0.0, -0.45, 0.0], stagger: [0.15, 0.90] },
  kasagi_box: { key: 'kasagi_box', partId: 'kasagi', offset: [0.0, 0.0, 0.0], stagger: [0.10, 0.85] },
  kasagi_ballast: { key: 'kasagi_ballast', partId: 'kasagi', offset: [0.0, 0.62, 0.0], stagger: [0.05, 0.80] },
  kasagi_rafters: { key: 'kasagi_rafters', partId: 'kasagi', offset: [0.0, 1.15, 0.0], stagger: [0.05, 0.75] },
  kasagi_copper: { key: 'kasagi_copper', partId: 'kasagi', offset: [0.0, 1.75, 0.0], stagger: [0.0, 0.68] },
  kasagi_ridge: { key: 'kasagi_ridge', partId: 'kasagi', offset: [0.0, 2.30, 0.0], stagger: [0.0, 0.60] },
};

function classifyMeshToSubGroup(name: string): string {
  if (name === 'MainPillar_Hashira_L' || name.startsWith('MainPillar_L_')) return 'hashira_L';
  if (name === 'MainPillar_Hashira_R' || name.startsWith('MainPillar_R_')) return 'hashira_R';

  if (name.includes('L_Front') && name.startsWith('SmallPillar')) return 'ryobu_LF';
  if (name.includes('L_Rear') && name.startsWith('SmallPillar')) return 'ryobu_LR';
  if (name.includes('R_Front') && name.startsWith('SmallPillar')) return 'ryobu_RF';
  if (name.includes('R_Rear') && name.startsWith('SmallPillar')) return 'ryobu_RR';

  if (name.startsWith('SmallCap_') && name.includes('L_Front')) return 'smallcap_LF';
  if (name.startsWith('SmallCap_') && name.includes('L_Rear')) return 'smallcap_LR';
  if (name.startsWith('SmallCap_') && name.includes('R_Front')) return 'smallcap_RF';
  if (name.startsWith('SmallCap_') && name.includes('R_Rear')) return 'smallcap_RR';

  if (name.startsWith('HikaeNuki_') && name.endsWith('_L')) return 'hikae_L';
  if (name.startsWith('HikaeNuki_') && name.endsWith('_R')) return 'hikae_R';
  if (name.startsWith('Outrigger_')) return 'outrigger_wedges';

  if (name === 'MainBeam_Nuki' || name === 'Nuki_Copper_Flashing') return 'nuki_beam';
  if (name.startsWith('Nuki_')) return 'nuki_wedges';

  if (name.startsWith('Center_Gakuzuka_')) return 'gakuzuka_post';
  if (name.startsWith('Center_Hengaku_') && name.endsWith('_Front')) return 'hengaku_front';
  if (name.startsWith('Center_Hengaku_') && name.endsWith('_Rear')) return 'hengaku_rear';

  if (name === 'MainBeam_Shimaki') return 'kasagi_shimaki';
  if (name === 'MainBeam_Kasagi') return 'kasagi_box';
  if (
    name === 'MainRoof_Taruki_Rafters' ||
    name === 'MainRoof_Taruki_BronzeCaps' ||
    name === 'MainRoof_WoodSubstrate'
  ) {
    return 'kasagi_rafters';
  }
  if (name === 'MainRoof_CopperPatinaSheet' || name === 'MainRoof_Bronze_Kanagu') {
    return 'kasagi_copper';
  }
  if (name === 'MainRoof_Hakomune_Ridge') return 'kasagi_ridge';

  return 'nuki_beam';
}

function smoothStagger(progress: number, start: number, end: number): number {
  const t = THREE.MathUtils.clamp((progress - start) / Math.max(0.0001, end - start), 0, 1);
  return t * t * (3.0 - 2.0 * t);
}

// Builds procedural 7-ton river cobble ballast stones (Omoishi) packed inside the hollow Kasagi box beam
function buildOmoishiBallastGeometry(): THREE.BufferGeometry {
  const baseIco = new THREE.IcosahedronGeometry(1, 1);
  const geoms: THREE.BufferGeometry[] = [];
  const count = 44;

  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const nx = u * 2.0 - 1.0;
    const x = nx * 4.45 + Math.sin(i * 7.3) * 0.08;
    const curveY = 0.24 * nx * nx;
    const y = 7.52 + curveY + (i % 2 === 0 ? -0.04 : 0.05);
    const z = ((i % 3) - 1) * 0.11 + Math.cos(i * 5.1) * 0.03;

    const rx = 0.13 + (i % 5) * 0.018;
    const ry = 0.085 + (i % 4) * 0.014;
    const rz = 0.11 + (i % 3) * 0.016;

    const g = baseIco.clone();
    const mat = new THREE.Matrix4();
    const rot = new THREE.Euler(i * 0.7, i * 1.3, i * 0.4);
    const quat = new THREE.Quaternion().setFromEuler(rot);
    mat.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(rx, ry, rz));
    g.applyMatrix4(mat);
    geoms.push(g);
  }

  const merged = mergeGeometries(geoms, false) || new THREE.BufferGeometry();
  merged.computeVertexNormals();
  baseIco.dispose();
  return merged;
}

function buildShimenawaAndShide() {
  const ropePositions: number[] = [];
  const ropeNormals: number[] = [];
  const ropeIndices: number[] = [];

  const lengthSegs = 72;
  const radialSegs = 12;
  const spanHalf = 2.28;

  for (let i = 0; i <= lengthSegs; i++) {
    const u = i / lengthSegs;
    const nx = u * 2.0 - 1.0;
    const x = nx * spanHalf;
    const sag = -0.16 * (1.0 - nx * nx);
    const yCenter = 4.06 + sag;
    const zCenter = 0.21;

    const baseRadius = 0.025 + 0.058 * Math.pow(1.0 - nx * nx, 0.75);

    for (let r = 0; r <= radialSegs; r++) {
      const ang = (r / radialSegs) * Math.PI * 2;
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

  const shidePositions: number[] = [];
  const shideMeta: number[] = [];
  const shideIndices: number[] = [];
  let vOff = 0;

  const shideXPositions = [-1.52, -0.76, 0.0, 0.76, 1.52];
  shideXPositions.forEach((sx, idx) => {
    const nx = sx / spanHalf;
    const topY = 4.02 - 0.16 * (1.0 - nx * nx);
    const topZ = 0.24;
    const scale = idx === 2 ? 1.15 : idx === 1 || idx === 3 ? 1.0 : 0.88;

    const folds = [
      [0.0, 0.0, -0.035, -0.13, 0.055],
      [-0.025, -0.11, 0.045, -0.25, 0.062],
      [0.035, -0.23, -0.050, -0.38, 0.068],
      [-0.040, -0.36, 0.030, -0.52, 0.058],
    ];

    folds.forEach(([x0, y0, x1, y1, w], fIdx) => {
      const hw = w * 0.5 * scale;
      const zOff = fIdx % 2 === 0 ? 0.004 : -0.004;
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
attribute vec2 aShideMeta;
uniform float uTime;
uniform float uPortalProgress;

varying float vHang;

void main() {
  vHang = aShideMeta.x;
  float phase = aShideMeta.y;
  vec3 pos = position;

  float windFreq = mix(2.2, 5.8, uPortalProgress);
  float windAmp  = mix(0.038, 0.095, uPortalProgress) * (vHang * vHang);

  pos.x += sin(uTime * windFreq + phase + vHang * 3.0) * windAmp;
  pos.z += cos(uTime * (windFreq * 0.85) + phase * 1.7) * windAmp * 0.85;
  pos.z -= uPortalProgress * 0.14 * (vHang * vHang);
  pos.y += abs(sin(uTime * windFreq + phase)) * windAmp * 0.25;

  vec4 wp = modelMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const shideFragmentShader = /* glsl */ `
uniform float uPortalProgress;
uniform float uNukiVis;
varying float vHang;

void main() {
  vec3 calmPaper = mix(vec3(0.78, 0.80, 0.82), vec3(0.95, 0.96, 0.98), vHang);
  vec3 spiritPaper = mix(vec3(0.14, 0.20, 0.36), vec3(0.32, 0.44, 0.68), vHang);
  vec3 col = mix(calmPaper, spiritPaper, smoothstep(0.25, 0.95, uPortalProgress));
  float alpha = clamp(uNukiVis, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const ALL_PART_IDS: ToriiPartId[] = ['hashira', 'ryobu', 'nuki', 'hengaku', 'kasagi'];

export function ToriiGate() {
  const { scene } = useGLTF('/models/itsukushima_torii.glb');
  const assemblyRef = useRef<THREE.Group>(null);
  const shimenawaGroupRef = useRef<THREE.Group>(null);
  const shimenawaRef = useRef<THREE.Mesh>(null);
  const shimenawaMatRef = useRef<THREE.MeshStandardMaterial>(null);
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

  // Per-part visibility uniform for smooth dithered dissolve + golden edge shimmer
  const partShaderUniforms = useMemo(() => {
    const map: Record<ToriiPartId, { uPartVis: { value: number } }> = {
      hashira: { uPartVis: { value: 1.0 } },
      ryobu: { uPartVis: { value: 0.0 } },
      nuki: { uPartVis: { value: 0.0 } },
      hengaku: { uPartVis: { value: 0.0 } },
      kasagi: { uPartVis: { value: 0.0 } },
    };
    return map;
  }, []);

  const { ropeGeom, shideGeom } = useMemo(() => buildShimenawaAndShide(), []);
  const shideUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPortalProgress: { value: 0 },
      uNukiVis: { value: 0 },
    }),
    []
  );

  const { subGroupsRoot, animatedSubGroups } = useMemo(() => {
    scene.updateMatrixWorld(true);

    const subGroupBuckets = new Map<
      string,
      Map<string, { origMat: THREE.MeshStandardMaterial; geoms: THREE.BufferGeometry[] }>
    >();

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const subKey = classifyMeshToSubGroup(mesh.name);
        const origMat = mesh.material as THREE.MeshStandardMaterial;
        const matKey = origMat.name || origMat.uuid;

        const g = mesh.geometry.clone();
        g.applyMatrix4(mesh.matrixWorld);

        if (!g.attributes.uv) {
          const count = g.attributes.position.count;
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        if (g.attributes.tangent) {
          g.deleteAttribute('tangent');
        }

        let matMap = subGroupBuckets.get(subKey);
        if (!matMap) {
          matMap = new Map();
          subGroupBuckets.set(subKey, matMap);
        }
        const bucket = matMap.get(matKey);
        if (bucket) {
          bucket.geoms.push(g);
        } else {
          matMap.set(matKey, { origMat, geoms: [g] });
        }
      }
    });

    const createPartMaterial = (
      origMat: THREE.MeshStandardMaterial,
      matName: string,
      partId: ToriiPartId
    ) => {
      const mat = origMat.clone();
      if (mat.map) mat.map.anisotropy = 8;
      if (mat.normalMap) {
        mat.normalMap.anisotropy = 8;
        mat.normalScale.set(1.35, 1.35);
      }

      if (matName.includes('Cedar')) {
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
        mat.roughness = 0.2;
        mat.envMapIntensity = 2.0;
        mat.emissive = new THREE.Color(0.32, 0.2, 0.03);
        mat.emissiveIntensity = 0.45;
      } else if (matName.includes('Bronze') || matName.includes('Metal')) {
        mat.color.setRGB(1.45, 1.55, 1.48);
        mat.metalness = 0.85;
        mat.roughness = 0.38;
        mat.envMapIntensity = 1.5;
      } else if (matName.includes('BallastStone')) {
        mat.color.setRGB(0.55, 0.53, 0.5);
        mat.roughness = 0.78;
        mat.metalness = 0.05;
        mat.envMapIntensity = 0.85;
      }

      const partUniforms = partShaderUniforms[partId];
      mat.transparent = true;
      mat.depthWrite = true;

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = sharedShaderUniforms.uTime;
        shader.uniforms.uPortalProgress = sharedShaderUniforms.uPortalProgress;
        shader.uniforms.uGateHover = sharedShaderUniforms.uGateHover;
        shader.uniforms.uShockwave = sharedShaderUniforms.uShockwave;
        shader.uniforms.uWinterMix = sharedShaderUniforms.uWinterMix;
        shader.uniforms.uCameraPos = sharedShaderUniforms.uCameraPos;
        shader.uniforms.uPartVis = partUniforms.uPartVis;

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
            uniform float uPartVis;
            varying vec3 vToriiWorldPos;
            varying vec3 vToriiWorldNormal;
            `
          )
          .replace(
            '#include <color_fragment>',
            /* glsl */ `
            #include <color_fragment>
            // 0. Smooth Alpha Opacity Fade-Out / Fade-In for Part Isolation Transitions
            float alphaFade = clamp(uPartVis, 0.0, 1.0);
            diffuseColor.a *= alphaFade;

            // 1. Live waterline wetness & dark marine algae/barnacle transition
            float waveLap = 0.06 * sin(vToriiWorldPos.x * 1.4 + uTime * 1.25);
            float wetLine = vToriiWorldPos.y - waveLap;
            float marineStain = 1.0 - smoothstep(-0.12, 0.48, wetLine);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.16, 0.17, 0.15), marineStain * 0.82);

            // 2. Procedural Architectural Cavity Ambient Occlusion
            float underRoofAO = 1.0 - 0.48 * exp(-pow((vToriiWorldPos.y - 5.95) * 2.1, 2.0)) * max(0.0, -vToriiWorldNormal.y * 0.6 + 0.4);
            float underNukiAO = 1.0 - 0.36 * exp(-pow((vToriiWorldPos.y - 4.12) * 3.5, 2.0)) * max(0.0, -vToriiWorldNormal.y);
            float jointDistL  = length(vec2(vToriiWorldPos.x + 2.75, (vToriiWorldPos.y - 4.4) * 0.7));
            float jointDistR  = length(vec2(vToriiWorldPos.x - 2.75, (vToriiWorldPos.y - 4.4) * 0.7));
            float jointAO     = 1.0 - 0.25 * (exp(-jointDistL * 2.5) + exp(-jointDistR * 2.5));
            diffuseColor.rgb *= clamp(underRoofAO * underNukiAO * jointAO, 0.38, 1.0);

            // 3. Winter (Fuyu) Crystalline Snow Accumulation
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

            // 1. MYSTICAL GRAZING FRESNEL SPIRIT RIM-LIGHT
            float fresnelRim = pow(1.0 - abs(dot(worldN, viewDirW)), 3.0);
            vec3 calmMysticRim = vec3(0.14, 0.22, 0.32) * 0.55;
            vec3 darkAuroraRim = mix(vec3(0.08, 0.16, 0.34), vec3(0.16, 0.22, 0.52), 0.55) * 1.15;
            vec3 rimCol = mix(calmMysticRim, darkAuroraRim, smoothstep(0.15, 0.95, uPortalProgress));
            totalEmissiveRadiance += rimCol * fresnelRim * (1.0 + uGateHover * 0.40);

            // 2. WARM KINTSUGI GOLD SHIMMER DURING PART MATERIALIZATION TRANSITION
            float transitionBand = 4.0 * uPartVis * (1.0 - uPartVis);
            totalEmissiveRadiance += vec3(0.95, 0.72, 0.30) * transitionBand * (0.35 + fresnelRim * 0.85);

            // 3. ANIMATED OCEAN CAUSTICS BOUNCING UPWARD
            float downFacing = max(0.0, -worldN.y * 0.75 + 0.25);
            float heightAtten = exp(-max(0.0, vToriiWorldPos.y) * 0.30);
            float cWave1 = sin(vToriiWorldPos.x * 3.4 + vToriiWorldPos.z * 2.7 + uTime * 2.3);
            float cWave2 = cos(vToriiWorldPos.x * 2.6 - vToriiWorldPos.z * 3.9 - uTime * 1.9);
            float caustic = pow(max(0.0, cWave1 * cWave2), 2.0);
            vec3 causticTint = mix(vec3(0.16, 0.24, 0.30), vec3(0.06, 0.15, 0.34), uPortalProgress);
            totalEmissiveRadiance += diffuseColor.rgb * causticTint * caustic * downFacing * heightAtten * 2.3;

            // 4. SUPERNATURAL INNER SANCTUARY SPILL LIGHT
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
            totalEmissiveRadiance *= clamp(uPartVis, 0.0, 1.0);
            `
          );
      };

      return mat;
    };

    const rootGroup = new THREE.Group();
    const animatedList: { group: THREE.Group; meshes: THREE.Mesh[]; spec: SubAssemblySpec }[] = [];

    subGroupBuckets.forEach((matMap, subKey) => {
      const spec = SUB_ASSEMBLY_SPECS[subKey] || SUB_ASSEMBLY_SPECS.nuki_beam;
      const subGroup = new THREE.Group();
      subGroup.name = `SubAssembly_${subKey}`;
      const meshes: THREE.Mesh[] = [];

      matMap.forEach(({ origMat, geoms }, matName) => {
        const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
        if (!merged) return;

        const mat = createPartMaterial(origMat, matName, spec.partId);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.raycast = () => {};
        mesh.layers.enable(1);
        subGroup.add(mesh);
        meshes.push(mesh);
      });

      rootGroup.add(subGroup);
      animatedList.push({ group: subGroup, meshes, spec });
    });

    // Add the procedural 7-Ton River Cobble Ballast Stones (Omoishi) inside Kasagi
    const ballastSpec = SUB_ASSEMBLY_SPECS.kasagi_ballast;
    const ballastGroup = new THREE.Group();
    ballastGroup.name = 'SubAssembly_kasagi_ballast';
    const ballastGeom = buildOmoishiBallastGeometry();
    const ballastMat = createPartMaterial(
      new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 0.78, metalness: 0.05 }),
      'BallastStone',
      'kasagi'
    );
    const ballastMesh = new THREE.Mesh(ballastGeom, ballastMat);
    ballastMesh.castShadow = true;
    ballastMesh.receiveShadow = true;
    ballastMesh.raycast = () => {};
    ballastMesh.layers.enable(1);
    ballastGroup.add(ballastMesh);
    rootGroup.add(ballastGroup);
    animatedList.push({ group: ballastGroup, meshes: [ballastMesh], spec: ballastSpec });

    return {
      subGroupsRoot: rootGroup,
      animatedSubGroups: animatedList,
    };
  }, [scene, sharedShaderUniforms, partShaderUniforms]);

  useEffect(() => {
    if (shimenawaRef.current) shimenawaRef.current.layers.enable(1);
    if (shideRef.current) shideRef.current.layers.enable(1);
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
    shideUniforms.uNukiVis.value = experienceState.partVisibility.nuki;

    // Update per-part visibility uniforms
    for (let i = 0; i < ALL_PART_IDS.length; i++) {
      const pid = ALL_PART_IDS[i];
      partShaderUniforms[pid].uPartVis.value = experienceState.partVisibility[pid];
    }

    // Animate all mechanical sub-assemblies with smooth fade-out / fade-in and back-to-front renderOrder
    for (let i = 0; i < animatedSubGroups.length; i++) {
      const { group, meshes, spec } = animatedSubGroups[i];
      const vis = experienceState.partVisibility[spec.partId];

      if (vis <= 0.003) {
        group.visible = false;
        continue;
      }

      // Active/opaque parts draw first (renderOrder 0) so fading parts (renderOrder 2..4) blend cleanly over them
      const targetOrder =
        vis >= 0.995
          ? 0
          : spec.offset[2] < -0.1
          ? 2
          : spec.offset[2] > 0.1
          ? 4
          : 3;
      for (let m = 0; m < meshes.length; m++) {
        meshes[m].renderOrder = targetOrder;
      }

      const partExp = experienceState.partExplode[spec.partId];
      const localT = smoothStagger(partExp, spec.stagger[0], spec.stagger[1]);

      const isGroundedPillar =
        spec.key === 'hashira_L' ||
        spec.key === 'hashira_R' ||
        spec.key.startsWith('ryobu_');
      const floatWave =
        !isGroundedPillar && localT > 0.01
          ? Math.sin(t * 1.45 + i * 0.65) * 0.022 * localT
          : 0.0;

      group.position.set(
        spec.offset[0] * localT,
        spec.offset[1] * localT + floatWave,
        spec.offset[2] * localT
      );

      if (spec.key === 'kasagi_ballast') {
        group.visible = vis > 0.005 && localT > 0.03;
      } else {
        group.visible = true;
      }
    }

    // Animate Shimenawa & Shide along with the Nuki crossbeam with matching smooth alpha fade
    if (shimenawaGroupRef.current) {
      const nukiVis = experienceState.partVisibility.nuki;
      shimenawaGroupRef.current.visible = nukiVis > 0.003;
      if (shimenawaMatRef.current) {
        shimenawaMatRef.current.opacity = nukiVis;
      }
      if (shimenawaRef.current) {
        shimenawaRef.current.renderOrder = nukiVis >= 0.995 ? 0 : 4;
      }
      if (shideRef.current) {
        shideRef.current.renderOrder = nukiVis >= 0.995 ? 1 : 5;
      }
      if (nukiVis > 0.003) {
        const nukiExp = experienceState.partExplode.nuki;
        const shimeT = smoothStagger(nukiExp, 0.05, 0.7);
        const floatY = shimeT > 0.01 ? Math.sin(t * 1.45 + 2.1) * 0.018 * shimeT : 0;
        shimenawaGroupRef.current.position.set(0, floatY, 0.65 * shimeT);
      }
    }
  });

  return (
    <group ref={assemblyRef} name="ToriiAssembly">
      <group position={[0, TORII_BASE_Y, 0]}>
        <primitive object={subGroupsRoot} />
      </group>

      <group ref={shimenawaGroupRef}>
        <mesh
          ref={shimenawaRef}
          geometry={ropeGeom}
          castShadow
          receiveShadow
          raycast={() => null}
          name="SacredShimenawa"
        >
          <meshStandardMaterial
            ref={shimenawaMatRef}
            color="#8f7852"
            roughness={0.88}
            metalness={0.0}
            transparent
            opacity={1}
          />
        </mesh>

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
            transparent
          />
        </mesh>
      </group>
    </group>
  );
}

useGLTF.preload('/models/itsukushima_torii.glb');
