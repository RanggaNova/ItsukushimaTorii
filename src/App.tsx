import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { SkyAtmosphere } from './components/SkyAtmosphere';
import { AtmosphericScenery } from './components/AtmosphericScenery';
import { ToriiGate } from './components/ToriiGate';
import { SupernaturalPortal } from './components/SupernaturalPortal';
import { VolumetricMist } from './components/VolumetricMist';
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
      <InteractiveOcean />
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement)?.closest('button')) {
      pointerDownRef.current = null;
      return;
    }
    if (e.button !== undefined && e.button !== 0) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!pointerDownRef.current) return;
    if ((e.target as HTMLElement)?.closest('button')) {
      pointerDownRef.current = null;
      return;
    }
    const moveDist = Math.hypot(
      e.clientX - pointerDownRef.current.x,
      e.clientY - pointerDownRef.current.y
    );
    pointerDownRef.current = null;

    // 1x Click Toggle: 1 click enters dark mystical mode, 1 click returns to calm misty daylight
    if (moveDist < 12) {
      experienceState.togglePortalMode();
      soundEngine.triggerDimensionalPulse();
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
        shadows="soft"
        dpr={[1, 1.5]}
        camera={{ position: [0, 2.75, 19.5], fov: 42, near: 0.1, far: 450 }}
        gl={{
          antialias: true,
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
