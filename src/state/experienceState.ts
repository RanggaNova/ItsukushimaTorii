import * as THREE from 'three';

export interface RippleImpulse {
  x: number;
  z: number;
  birthTime: number;
  strength: number;
}

export const MAX_RIPPLES = 10;

export interface UIStatusSnapshot {
  portalStage: number;
  progress: number;
  isToggledDark: boolean;
  isFullyOpen: boolean;
  hasInteracted: boolean;
  isHoveringGate: boolean;
}

class ExperienceStore {
  // 1x Click Toggle state: false = Calm Misty Sea, true = Dark Supernatural Portal Mode
  isPortalOpenTarget = false;
  isHoveringGate = false;
  isTouchDevice = false;

  // Continuous smoothed progress (0.0 -> 1.0)
  // Opens smoothly in ~5s (+0.20/s), returns to calm in ~3.6s (-0.28/s)
  portalProgress = 0.0;
  portalVelocity = 0.0;
  gateHoverBlend = 0.0;

  // Subtle dimensional pulse on click toggle
  clickShockwave = 0.0;
  clickShockwaveTime = -100.0;

  // Cursor / pointer tracking for water ripples & subtle lens breathing
  pointerNDC = new THREE.Vector2(0, 0);
  smoothedPointerNDC = new THREE.Vector2(0, 0);
  waterHitPoint = new THREE.Vector3(0, 0, 1000);
  prevWaterHitPoint = new THREE.Vector3(0, 0, 1000);
  hasWaterHit = false;
  cursorWaterSpeed = 0.0;

  // Ring buffer of water ripple wavefronts
  ripples: RippleImpulse[] = Array.from({ length: MAX_RIPPLES }, () => ({
    x: 0,
    z: 1000,
    birthTime: -100,
    strength: 0,
  }));
  rippleCursor = 0;
  lastRippleSpawnTime = 0;

  elapsedTime = 0;
  hasInteracted = false;

  private listeners = new Set<(snap: UIStatusSnapshot) => void>();
  private lastEmittedStage = -1;
  private lastEmittedToggled = false;
  private lastEmittedHover = false;
  private lastUIEmitTime = 0;

  spawnRipple(x: number, z: number, time: number, strength: number) {
    this.ripples[this.rippleCursor] = {
      x,
      z,
      birthTime: time,
      strength: THREE.MathUtils.clamp(strength, 0.05, 1.5),
    };
    this.rippleCursor = (this.rippleCursor + 1) % MAX_RIPPLES;
    this.lastRippleSpawnTime = time;
  }

  /**
   * 1x Click Toggle:
   * Click once -> enters dark supernatural portal mode.
   * Click once again -> seals portal and returns to calm misty daylight.
   */
  togglePortalMode(): boolean {
    this.isPortalOpenTarget = !this.isPortalOpenTarget;
    this.hasInteracted = true;

    this.clickShockwave = this.isPortalOpenTarget ? 0.72 : 0.45;
    this.clickShockwaveTime = this.elapsedTime;
    this.spawnRipple(0.0, 0.0, this.elapsedTime, this.isPortalOpenTarget ? 1.25 : 0.85);

    this.emitSnapshot(true);
    return this.isPortalOpenTarget;
  }

  private emitSnapshot(force = false) {
    let stage = 0;
    if (this.portalProgress > 0.005) {
      stage = Math.min(5, Math.floor(this.portalProgress * 5) + 1);
    }
    const isFullyOpen = this.portalProgress >= 0.85;

    if (
      force ||
      stage !== this.lastEmittedStage ||
      this.isPortalOpenTarget !== this.lastEmittedToggled ||
      this.isHoveringGate !== this.lastEmittedHover ||
      this.elapsedTime - this.lastUIEmitTime > 0.10
    ) {
      this.lastEmittedStage = stage;
      this.lastEmittedToggled = this.isPortalOpenTarget;
      this.lastEmittedHover = this.isHoveringGate;
      this.lastUIEmitTime = this.elapsedTime;

      const snap: UIStatusSnapshot = {
        portalStage: stage,
        progress: this.portalProgress,
        isToggledDark: this.isPortalOpenTarget,
        isFullyOpen,
        hasInteracted: this.hasInteracted,
        isHoveringGate: this.isHoveringGate,
      };
      this.listeners.forEach((fn) => fn(snap));
    }
  }

  step(dt: number, elapsed: number) {
    const clampedDt = Math.min(dt, 0.05);
    this.elapsedTime = elapsed;

    this.smoothedPointerNDC.lerp(this.pointerNDC, 1.0 - Math.exp(-3.0 * clampedDt));

    // Smooth 5-second opening (+0.20/s) and ~3.6-second closing (-0.28/s)
    const targetRate = this.isPortalOpenTarget ? 0.20 : -0.28;

    this.portalVelocity = THREE.MathUtils.lerp(
      this.portalVelocity,
      targetRate,
      1.0 - Math.exp(-4.8 * clampedDt)
    );

    this.portalProgress = THREE.MathUtils.clamp(
      this.portalProgress + this.portalVelocity * clampedDt,
      0.0,
      1.0
    );

    if (this.portalProgress <= 0.0001 && !this.isPortalOpenTarget) {
      this.portalProgress = 0.0;
      this.portalVelocity = 0.0;
    } else if (this.portalProgress >= 0.9999 && this.isPortalOpenTarget) {
      this.portalProgress = 1.0;
      this.portalVelocity = 0.0;
    }

    const targetGateHover = this.isHoveringGate ? 1.0 : 0.0;
    this.gateHoverBlend = THREE.MathUtils.lerp(
      this.gateHoverBlend,
      targetGateHover,
      1.0 - Math.exp(-5.0 * clampedDt)
    );

    if (this.clickShockwave > 0.001) {
      this.clickShockwave = Math.exp(-1.75 * (elapsed - this.clickShockwaveTime));
      if (this.clickShockwave < 0.002) this.clickShockwave = 0.0;
    }

    this.cursorWaterSpeed *= Math.exp(-6.0 * clampedDt);

    this.emitSnapshot(false);
  }

  subscribe(fn: (snap: UIStatusSnapshot) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const experienceState = new ExperienceStore();
