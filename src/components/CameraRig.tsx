import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState } from '../state/experienceState';
import { soundEngine } from '../audio/SoundEngine';

const SEA_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function CameraRig() {
  const { camera, size } = useThree();
  const mathRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const waterIntersectPt = useMemo(() => new THREE.Vector3(), []);
  const dynamicTarget = useMemo(() => new THREE.Vector3(0, 2.55, 0), []);

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

      // Check hover over floating lanterns in Kakuriyo to provide intuitive pointer cursor
      if (experienceState.travelProgress > 0.78 && experienceState.isPortalOpenTarget) {
        const hovered = experienceState.findLanternAtScreen(
          e.clientX,
          e.clientY,
          window.innerWidth,
          window.innerHeight
        );
        if (hovered) {
          document.body.style.cursor = 'pointer';
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
    const t = clock.getElapsedTime();

    experienceState.step(delta, t);
    soundEngine.update(
      experienceState.portalProgress,
      experienceState.gateHoverBlend,
      experienceState.cursorWaterSpeed
    );

    // Fixed front-centered composition (NO cursor rotation!), with seamless Dolly-Through flight
    const aspect = size.width / Math.max(1, size.height);
    const outerBaseZ = aspect < 1.2 ? 19.5 / Math.max(0.50, aspect * 0.85) : 19.5;
    const innerSanctuaryZ = -10.5;

    const u = experienceState.travelProgress;
    // Cubic smoothstep S-curve for buttery dolly-in & dolly-back
    const ease = u * u * (3.0 - 2.0 * u);

    const shock = experienceState.clickShockwave;
    const breatheY = Math.sin(t * 0.38) * 0.022;

    const camZ = THREE.MathUtils.lerp(outerBaseZ, innerSanctuaryZ, ease) - shock * 0.45 * (1.0 - ease);
    const camY = THREE.MathUtils.lerp(2.65, 1.82, ease) + breatheY;

    // Exact dimensional threshold warp intensity right as camera crosses the portal plane (z = 0)
    if (u > 0.01 && u < 0.99) {
      experienceState.warpIntensity = Math.exp(-Math.pow(camZ / 2.25, 2.0));
    } else {
      experienceState.warpIntensity *= Math.exp(-10.0 * Math.min(delta, 0.05));
    }

    camera.position.set(0, camY, camZ);

    const persp = camera as THREE.PerspectiveCamera;
    const targetFov = 42.0 + experienceState.warpIntensity * 6.5 + shock * 2.4;
    if (Math.abs(persp.fov - targetFov) > 0.01) {
      persp.fov = THREE.MathUtils.lerp(persp.fov, targetFov, 0.14);
      persp.updateProjectionMatrix();
    }

    // Look straight ahead (-Z) throughout the entire flight:
    // At Utsushiyo -> frames Torii (0, 2.55, 0)
    // At Kakuriyo  -> frames grounded Hokora Shrine & Eternal Lantern Sea (0, 1.42, -20.2)
    dynamicTarget.set(
      0,
      THREE.MathUtils.lerp(2.55, 1.42, ease),
      THREE.MathUtils.lerp(0.0, -20.2, ease)
    );

    camera.up.set(0, 1, 0);
    camera.lookAt(dynamicTarget);
  });

  return null;
}
