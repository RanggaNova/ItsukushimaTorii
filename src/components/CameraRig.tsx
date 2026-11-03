import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState, HOKORA_SANCTUARY_Z } from '../state/experienceState';
import { SCROLL_STAGES } from '../data/toriiPartsData';
import { soundEngine } from '../audio/SoundEngine';

const SEA_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function CameraRig() {
  const { camera, size } = useThree();
  const mathRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const waterIntersectPt = useMemo(() => new THREE.Vector3(), []);
  const dynamicTarget = useMemo(() => new THREE.Vector3(0, 2.55, 0), []);
  const smoothedCam = useMemo(() => new THREE.Vector3(0.0, 2.65, 19.5), []);
  const smoothedLook = useMemo(() => new THREE.Vector3(0.0, 2.55, 0.0), []);
  const orbitOffset = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    experienceState.cameraRef = camera;
    return () => {
      experienceState.cameraRef = null;
      document.body.style.cursor = 'default';
    };
  }, [camera]);

  // O(1) Zero-Lag Mathematical Water Plane Raycasting for interactive cursor waves & lantern inspection
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = -(e.clientY / window.innerHeight) * 2 + 1;
      experienceState.pointerNDC.set(nx, ny);

      mathRaycaster.setFromCamera(experienceState.pointerNDC, camera);
      const hit = mathRaycaster.ray.intersectPlane(SEA_PLANE, waterIntersectPt);

      if (hit && hit.distanceTo(camera.position) < 65.0) {
        const now = experienceState.elapsedTime;
        if (experienceState.hasWaterHit) {
          const dx = hit.x - experienceState.prevWaterHitPoint.x;
          const dz = hit.z - experienceState.prevWaterHitPoint.z;
          const moveDist = Math.hypot(dx, dz);

          if (moveDist > 0.25 && now - experienceState.lastRippleSpawnTime > 0.048) {
            const strength = THREE.MathUtils.clamp(moveDist * 1.35, 0.22, 1.0);
            experienceState.spawnRipple(hit.x, hit.z, now, strength);
            experienceState.prevWaterHitPoint.copy(hit);
            experienceState.cursorWaterSpeed = moveDist / 0.048;
          }
        } else {
          experienceState.prevWaterHitPoint.copy(hit);
          experienceState.spawnRipple(hit.x, hit.z, now, 0.35);
        }
        experienceState.waterHitPoint.copy(hit);
        experienceState.hasWaterHit = true;
      } else {
        experienceState.hasWaterHit = false;
      }

      if (experienceState.travelProgress > 0.72 && experienceState.isPortalOpenTarget) {
        if (experienceState.draggedLantern) {
          document.body.style.cursor = 'grabbing';
          return;
        }
        const hovered = experienceState.findLanternAtScreen(
          e.clientX,
          e.clientY,
          window.innerWidth,
          window.innerHeight
        );
        if (hovered) {
          document.body.style.cursor = 'grab';
          experienceState.setHoveredLantern(hovered.id);
        } else {
          document.body.style.cursor = 'default';
          experienceState.setHoveredLantern(null);
        }
      } else {
        document.body.style.cursor = 'default';
        experienceState.setHoveredLantern(null);
      }
    };

    const onPointerLeave = () => {
      experienceState.hasWaterHit = false;
      document.body.style.cursor = 'default';
      experienceState.setHoveredLantern(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.body.style.cursor = 'default';
    };
  }, [camera, mathRaycaster, waterIntersectPt]);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = clock.getElapsedTime();

    experienceState.step(dt, t);
    soundEngine.update(
      experienceState.portalProgress,
      experienceState.gateHoverBlend,
      experienceState.cursorWaterSpeed
    );

    const aspect = size.width / Math.max(1, size.height);
    const isPortrait = aspect < 1.15;

    const s = experienceState.scrollProgress;
    const stageIdx = experienceState.activeStageIndex;
    const stage = SCROLL_STAGES[stageIdx] || SCROLL_STAGES[0];

    const span = Math.max(0.0001, stage.range[1] - stage.range[0]);
    const rawLocalU = THREE.MathUtils.clamp((s - stage.range[0]) / span, 0, 1);
    const localU = rawLocalU * rawLocalU * (3.0 - 2.0 * rawLocalU);

    const cStart = isPortrait ? stage.camStartPortrait : stage.camStart;
    const cEnd = isPortrait ? stage.camEndPortrait : stage.camEnd;
    const lStart = isPortrait ? stage.lookStartPortrait : stage.lookStart;
    const lEnd = isPortrait ? stage.lookEndPortrait : stage.lookEnd;

    // For Stage 6 (Sanctuary arrival), compute responsive portrait distance from Hokora
    const portraitFactor = isPortrait ? Math.min(1.85, 0.95 / Math.max(0.38, aspect)) : 1.0;
    const endZOverride =
      stage.id === 'sanctuary' ? HOKORA_SANCTUARY_Z + 9.7 * portraitFactor : cEnd[2];

    const targetCamX = THREE.MathUtils.lerp(cStart[0], cEnd[0], localU);
    const targetCamY = THREE.MathUtils.lerp(cStart[1], cEnd[1], localU);
    const targetCamZ = THREE.MathUtils.lerp(cStart[2], endZOverride, localU);

    const targetLookX = THREE.MathUtils.lerp(lStart[0], lEnd[0], localU);
    const targetLookY = THREE.MathUtils.lerp(lStart[1], lEnd[1], localU);
    const targetLookZ = THREE.MathUtils.lerp(lStart[2], lEnd[2], localU);

    const camLambda = 2.8;
    smoothedCam.x = THREE.MathUtils.damp(smoothedCam.x, targetCamX, camLambda, dt);
    smoothedCam.y = THREE.MathUtils.damp(smoothedCam.y, targetCamY, camLambda, dt);
    smoothedCam.z = THREE.MathUtils.damp(smoothedCam.z, targetCamZ, camLambda, dt);

    smoothedLook.x = THREE.MathUtils.damp(smoothedLook.x, targetLookX, camLambda, dt);
    smoothedLook.y = THREE.MathUtils.damp(smoothedLook.y, targetLookY, camLambda, dt);
    smoothedLook.z = THREE.MathUtils.damp(smoothedLook.z, targetLookZ, camLambda, dt);

    // Subtle user drag orbit when in Utsushiyo (fades out automatically during Sanctuary flight)
    const orbitWeight = 1.0 - experienceState.travelProgress;
    orbitOffset.copy(smoothedCam).sub(smoothedLook);
    const radius = orbitOffset.length();
    const baseAzimuth = Math.atan2(orbitOffset.x, orbitOffset.z);
    const baseElevation = Math.asin(
      THREE.MathUtils.clamp(orbitOffset.y / Math.max(0.001, radius), -0.95, 0.95)
    );

    const finalAzimuth = baseAzimuth + experienceState.orbitAzimuth * orbitWeight;
    const finalElevation = THREE.MathUtils.clamp(
      baseElevation + experienceState.orbitElevation * orbitWeight,
      0.02,
      0.65
    );

    const shock = experienceState.clickShockwave;
    const breatheY = Math.sin(t * 0.42) * 0.02;

    const finalCamX =
      smoothedLook.x + radius * Math.cos(finalElevation) * Math.sin(finalAzimuth);
    const finalCamY =
      Math.max(0.58, smoothedLook.y + radius * Math.sin(finalElevation)) + breatheY;
    const finalCamZ =
      smoothedLook.z +
      radius * Math.cos(finalElevation) * Math.cos(finalAzimuth) -
      shock * 0.35 * orbitWeight;

    // Dimensional threshold warp right as camera crosses the portal plane (z = 0)
    if (experienceState.travelProgress > 0.02 && experienceState.travelProgress < 0.98) {
      experienceState.warpIntensity = Math.exp(-Math.pow(finalCamZ / 2.25, 2.0));
    } else {
      experienceState.warpIntensity *= Math.exp(-10.0 * dt);
    }

    camera.position.set(finalCamX, finalCamY, finalCamZ);

    const persp = camera as THREE.PerspectiveCamera;
    const baseFov = isPortrait ? 46.0 : 42.0;
    const targetFov = baseFov + experienceState.warpIntensity * 6.5 + shock * 2.2;
    if (Math.abs(persp.fov - targetFov) > 0.01) {
      persp.fov = THREE.MathUtils.lerp(persp.fov, targetFov, 0.14);
      persp.updateProjectionMatrix();
    }

    dynamicTarget.copy(smoothedLook);
    camera.up.set(0, 1, 0);
    camera.lookAt(dynamicTarget);
  });

  return null;
}
