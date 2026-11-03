import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { SkyAtmosphere } from './components/SkyAtmosphere';
import { AtmosphericScenery } from './components/AtmosphericScenery';
import { ToriiGate } from './components/ToriiGate';
import { SupernaturalPortal } from './components/SupernaturalPortal';
import { VolumetricMist } from './components/VolumetricMist';
import { SeasonalParticles } from './components/SeasonalParticles';
import { KakuriyoSanctuary } from './components/KakuriyoSanctuary';
import { InteractiveOcean } from './components/InteractiveOcean';
import { CameraRig } from './components/CameraRig';
import { MinimalUI } from './components/MinimalUI';
import { experienceState, LanternInstance } from './state/experienceState';
import { soundEngine } from './audio/SoundEngine';

function SceneContent({ onLoaded }: { onLoaded: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(() => onLoaded(), 150);
    return () => window.clearTimeout(id);
  }, [onLoaded]);

  return (
    <>
      <CameraRig />
      <SkyAtmosphere />
      <AtmosphericScenery />
      <ToriiGate />
      <SupernaturalPortal />
      <VolumetricMist />
      <SeasonalParticles />
      <KakuriyoSanctuary />
      <InteractiveOcean />
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const lastGesturePosRef = useRef<{ x: number; y: number } | null>(null);
  const isGestureActiveRef = useRef(false);
  const dragTargetRef = useRef<LanternInstance | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingLanternRef = useRef(false);

  // Smooth Wheel & Keyboard Scrollytelling
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement)?.closest('[data-ui-modal="true"], input, textarea')) {
        return;
      }
      e.preventDefault();
      // Normalize trackpad vs notched mouse wheel with gentle, unhurried pacing
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
      const clampedDelta = THREE.MathUtils.clamp(rawDelta, -90, 90);
      experienceState.addScrollDelta(clampedDelta * 0.00018);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape' && experienceState.activeStageIndex >= 7) {
        experienceState.returnToUtsushiyo();
        soundEngine.triggerDimensionalPulse();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        experienceState.scrollToStage(experienceState.activeStageIndex + 1);
        soundEngine.triggerPartFocusSound();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        experienceState.scrollToStage(experienceState.activeStageIndex - 1);
        soundEngine.triggerPartFocusSound();
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Global window pointer tracking for touch swipe scrollytelling, subtle 3D orbit, and lantern dragging
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      // 1. Lantern dragging on the water in Kakuriyo
      if (dragTargetRef.current && dragStartPosRef.current) {
        const dx = e.clientX - dragStartPosRef.current.x;
        const dy = e.clientY - dragStartPosRef.current.y;
        if (Math.hypot(dx, dy) >= 6) {
          isDraggingLanternRef.current = true;
        }
        if (isDraggingLanternRef.current) {
          const pt = experienceState.getWaterPlanePointAtScreen(
            e.clientX,
            e.clientY,
            window.innerWidth,
            window.innerHeight
          );
          if (pt) {
            experienceState.dragCurrentLantern(pt.x, pt.z);
          }
        }
        return;
      }

      // 2. Vertical swipe scrollytelling + horizontal gentle look-around
      if (isGestureActiveRef.current && lastGesturePosRef.current) {
        const dx = e.clientX - lastGesturePosRef.current.x;
        const dy = e.clientY - lastGesturePosRef.current.y;
        lastGesturePosRef.current = { x: e.clientX, y: e.clientY };

        if (e.pointerType === 'touch') {
          // On touch devices, vertical swipe drives the scrollytelling journey smoothly
          if (Math.abs(dy) >= Math.abs(dx) * 0.75) {
            experienceState.addScrollDelta(-dy * 0.00068);
          } else {
            experienceState.addOrbitDelta(-dx * 0.0042, 0);
          }
        } else {
          // On desktop mouse drag, allow subtle 3D look-around
          experienceState.addOrbitDelta(-dx * 0.0042, dy * 0.0028);
        }
      }
    };

    const onWindowPointerUp = () => {
      isGestureActiveRef.current = false;
      lastGesturePosRef.current = null;

      if (!dragTargetRef.current) return;
      const wasDragging = isDraggingLanternRef.current;
      const targetLantern = dragTargetRef.current;

      experienceState.stopDraggingLantern();
      dragTargetRef.current = null;
      dragStartPosRef.current = null;
      isDraggingLanternRef.current = false;
      pointerDownRef.current = null;

      if (!wasDragging) {
        experienceState.spawnRipple(
          targetLantern.x,
          targetLantern.z,
          experienceState.elapsedTime,
          0.65
        );
        soundEngine.triggerLanternBell(false);
      }
    };

    window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (
      (e.target as HTMLElement)?.closest(
        '[data-ui-interactive="true"], button, input, textarea, form'
      )
    ) {
      pointerDownRef.current = null;
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };

    // In Kakuriyo Sanctuary, test if user tapped or grabbed a floating lantern
    if (experienceState.travelProgress > 0.72 && experienceState.isPortalOpenTarget) {
      const hitLantern = experienceState.findLanternAtScreen(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight
      );
      if (hitLantern) {
        dragTargetRef.current = hitLantern;
        dragStartPosRef.current = { x: e.clientX, y: e.clientY };
        isDraggingLanternRef.current = false;
        experienceState.startDraggingLantern(hitLantern);
        return;
      }
    }

    isGestureActiveRef.current = true;
    lastGesturePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (dragTargetRef.current) return;
    if (!pointerDownRef.current) return;
    if (
      (e.target as HTMLElement)?.closest(
        '[data-ui-interactive="true"], button, input, textarea, form'
      )
    ) {
      pointerDownRef.current = null;
      return;
    }
    const moveDist = Math.hypot(
      e.clientX - pointerDownRef.current.x,
      e.clientY - pointerDownRef.current.y
    );
    pointerDownRef.current = null;

    if (moveDist >= 10) return;

    if (experienceState.hasWaterHit) {
      experienceState.spawnRipple(
        experienceState.waterHitPoint.x,
        experienceState.waterHitPoint.z,
        experienceState.elapsedTime,
        0.52
      );
    }
  };

  return (
    <main
      className="experience-root"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="cinema-vignette" />

      <div className={`loading-veil ${ready ? 'veil-fade-out' : ''}`}>
        <span className="loading-mark">厳島</span>
      </div>

      <MinimalUI ready={ready} />

      <Canvas
        shadows
        dpr={[1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1.25)]}
        camera={{ position: [0.0, 2.65, 19.5], fov: 42, near: 0.1, far: 450 }}
        gl={{
          antialias: true,
          stencil: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.12,
        }}
      >
        <Suspense fallback={null}>
          <SceneContent onLoaded={() => setReady(true)} />
        </Suspense>
      </Canvas>
    </main>
  );
}
