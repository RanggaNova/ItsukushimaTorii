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
  const dragTargetRef = useRef<LanternInstance | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && experienceState.isPortalOpenTarget) {
        experienceState.returnToUtsushiyo();
        soundEngine.triggerDimensionalPulse();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Global window tracking for buttery-smooth mouse and touch dragging across the entire screen
  useEffect(() => {
    const onWindowPointerMove = (e: PointerEvent) => {
      if (!dragTargetRef.current || !dragStartPosRef.current) return;
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      if (Math.hypot(dx, dy) >= 6) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
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
    };

    const onWindowPointerUp = (e: PointerEvent) => {
      if (!dragTargetRef.current) return;
      const wasDragging = isDraggingRef.current;
      const targetLantern = dragTargetRef.current;

      experienceState.stopDraggingLantern();
      dragTargetRef.current = null;
      dragStartPosRef.current = null;
      isDraggingRef.current = false;
      pointerDownRef.current = null;

      if (!wasDragging) {
        // Quick tap without movement -> reveal sacred prayer carried within!
        experienceState.selectLantern(targetLantern);
        soundEngine.triggerLanternBell(true);
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
    if ((e.target as HTMLElement)?.closest('[data-ui-interactive="true"], button, input, textarea, form')) {
      pointerDownRef.current = null;
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };

    // In Kakuriyo, test if user tapped or grabbed a floating lantern
    if (experienceState.travelProgress > 0.75 && experienceState.isPortalOpenTarget) {
      const hitLantern = experienceState.findLanternAtScreen(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight
      );
      if (hitLantern) {
        dragTargetRef.current = hitLantern;
        dragStartPosRef.current = { x: e.clientX, y: e.clientY };
        isDraggingRef.current = false;
        experienceState.startDraggingLantern(hitLantern);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (dragTargetRef.current) {
      // Handled by window pointerup listener
      return;
    }

    if (!pointerDownRef.current) return;
    if ((e.target as HTMLElement)?.closest('[data-ui-interactive="true"], button, input, textarea, form')) {
      pointerDownRef.current = null;
      return;
    }
    const moveDist = Math.hypot(
      e.clientX - pointerDownRef.current.x,
      e.clientY - pointerDownRef.current.y
    );
    pointerDownRef.current = null;

    if (moveDist >= 12) return;

    if (!experienceState.isPortalOpenTarget) {
      // In Utsushiyo: 1x click awakens the portal & glides camera through the Torii Gate!
      experienceState.enterKakuriyo();
      soundEngine.triggerDimensionalPulse();
    } else if (experienceState.travelProgress > 0.78) {
      // Water clicks only create serene ripples — lanterns are ONLY released via Make a Wish!
      if (experienceState.hasWaterHit) {
        experienceState.spawnRipple(
          experienceState.waterHitPoint.x,
          experienceState.waterHitPoint.z,
          experienceState.elapsedTime,
          0.55
        );
      }
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
        camera={{ position: [0, 2.75, 19.5], fov: 42, near: 0.1, far: 450 }}
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
