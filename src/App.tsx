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
import { experienceState } from './state/experienceState';
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

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement)?.closest('[data-ui-interactive="true"], button, input, textarea, form')) {
      pointerDownRef.current = null;
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
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
      // Inside Kakuriyo: clicking a floating lantern reveals the sacred prayer/wish carried within it!
      const hitLantern = experienceState.findLanternAtScreen(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight
      );

      if (hitLantern) {
        experienceState.selectLantern(hitLantern);
        soundEngine.triggerLanternBell(true);
      } else {
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
