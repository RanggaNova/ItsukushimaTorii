import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { experienceState } from '../state/experienceState';
import { soundEngine } from '../audio/SoundEngine';

export const CAMERA_TARGET = new THREE.Vector3(0, 2.55, 0);
const SEA_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function CameraRig() {
  const { camera, size } = useThree();
  const mathRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const waterIntersectPt = useMemo(() => new THREE.Vector3(), []);

  // O(1) Zero-Lag Mathematical Water Plane Raycasting for interactive cursor waves
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
    };

    const onPointerLeave = () => {
      experienceState.hasWaterHit = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
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

    // Completely fixed front-centered framing (NO cursor rotation or panning!),
    // with only imperceptible organic breathing & subtle portal depth pull
    const aspect = size.width / Math.max(1, size.height);
    const baseZ = aspect < 1.2 ? 19.5 / Math.max(0.50, aspect * 0.85) : 19.5;

    const p = experienceState.portalProgress;
    const shock = experienceState.clickShockwave;

    const breatheY = Math.sin(t * 0.38) * 0.022;
    const portalPullZ = -p * 0.85 - shock * 0.65;

    camera.position.set(
      0,
      2.65 + breatheY,
      baseZ + portalPullZ
    );

    const persp = camera as THREE.PerspectiveCamera;
    const targetFov = 42.0 + shock * 3.2;
    if (Math.abs(persp.fov - targetFov) > 0.01) {
      persp.fov = THREE.MathUtils.lerp(persp.fov, targetFov, 0.12);
      persp.updateProjectionMatrix();
    }

    camera.up.set(0, 1, 0);
    camera.lookAt(CAMERA_TARGET);
  });

  return null;
}
