import * as THREE from 'three';

export type SeasonId = 'haru' | 'natsu' | 'aki' | 'fuyu';

export interface RippleImpulse {
  x: number;
  z: number;
  birthTime: number;
  strength: number;
}

export interface LanternInstance {
  active: boolean;
  x: number;
  z: number;
  baseX: number;
  driftPhase: number;
  driftSpeed: number;
  birthTime: number;
  staggerOrder: number; // 0..1 order for rising from / sinking into water
  isUserSpawned: boolean;
  isGoldenWish: boolean;
}

export const MAX_RIPPLES = 10;
export const MAX_LANTERNS = 40;
export const AMBIENT_LANTERN_COUNT = 20;
export const HOKORA_SANCTUARY_Z = -20.2;

export interface UIStatusSnapshot {
  portalStage: number;
  isToggledDark: boolean;
  isInsideKakuriyo: boolean;
  isTransitioning: boolean;
  hasInteracted: boolean;
  isHoveringGate: boolean;
  season: SeasonId;
  userLanternCount: number;
}

class ExperienceStore {
  // Active season in Utsushiyo (Outer Mortal World)
  season: SeasonId = 'haru';
  seasonWeights = new THREE.Vector4(1, 0, 0, 0); // x: haru, y: natsu, z: aki, w: fuyu

  // Journey state: false = Utsushiyo (Front of Gate), true = Kakuriyo (Through the Portal)
  isPortalOpenTarget = false;
  isHoveringGate = false;
  isTouchDevice = false;

  // portalProgress: 0.0 (calm season) -> 1.0 (supernatural dark portal open)
  portalProgress = 0.0;
  portalVelocity = 0.0;

  // travelProgress: 0.0 (front of gate z=+19.5) -> 1.0 (inside Kakuriyo z=-10.5)
  travelProgress = 0.0;
  warpIntensity = 0.0;

  // lanternEmergence: 0.0 (submerged under water) -> 1.0 (floating on sea surface)
  lanternEmergence = 0.0;

  gateHoverBlend = 0.0;

  // Dimensional shockwave on portal activation / wish release
  clickShockwave = 0.0;
  clickShockwaveTime = -100.0;

  // Golden wish ascension burst in Kakuriyo
  wishBurstTime = -100.0;
  wishBurstOrigin = new THREE.Vector3(0, 0.35, -16.5);

  // Cursor / pointer tracking for O(1) water ripples & lantern spawning
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

  // Pool of Floating Water Lanterns (Tōrō Nagashi) in Kakuriyo
  lanterns: LanternInstance[] = [];
  nextUserLanternSlot = AMBIENT_LANTERN_COUNT;
  userLanternCount = 0;

  elapsedTime = 0;
  hasInteracted = false;

  private listeners = new Set<(snap: UIStatusSnapshot) => void>();
  private lastEmittedStage = -1;
  private lastEmittedToggled = false;
  private lastEmittedInside = false;
  private lastEmittedTransition = false;
  private lastEmittedHover = false;
  private lastEmittedSeason: SeasonId = 'haru';
  private lastEmittedLanterns = 0;

  constructor() {
    let rng = 20261031;
    const rand = () => {
      rng = (rng * 1664525 + 1013904223) % 4294967296;
      return rng / 4294967296;
    };

    for (let i = 0; i < MAX_LANTERNS; i++) {
      if (i < AMBIENT_LANTERN_COUNT) {
        // Arrange ambient lanterns along a sacred perspective avenue flanking the Hokora Shrine
        const side = i % 2 === 0 ? -1 : 1;
        const depthT = i / AMBIENT_LANTERN_COUNT;
        const z = -13.8 - depthT * 19.5 - rand() * 1.8;
        const laneSpread = 3.35 + rand() * 7.4 + depthT * 2.4;
        const x = side * laneSpread + (rand() - 0.5) * 0.9;
        this.lanterns.push({
          active: true,
          x,
          z,
          baseX: x,
          driftPhase: rand() * Math.PI * 2,
          driftSpeed: 0.065 + rand() * 0.065,
          birthTime: 0,
          staggerOrder: depthT * 0.75 + rand() * 0.25,
          isUserSpawned: false,
          isGoldenWish: false,
        });
      } else {
        this.lanterns.push({
          active: false,
          x: 0,
          z: -100,
          baseX: 0,
          driftPhase: rand() * Math.PI * 2,
          driftSpeed: 0.08 + rand() * 0.05,
          birthTime: -100,
          staggerOrder: rand() * 0.3,
          isUserSpawned: true,
          isGoldenWish: false,
        });
      }
    }
  }

  setSeason(next: SeasonId) {
    if (this.season === next) return;
    this.season = next;
    this.hasInteracted = true;
    this.spawnRipple(0, 2.0, this.elapsedTime, 0.55);
    this.emitSnapshot(true);
  }

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

  enterKakuriyo() {
    if (this.isPortalOpenTarget) return;
    this.isPortalOpenTarget = true;
    this.hasInteracted = true;
    this.clickShockwave = 0.78;
    this.clickShockwaveTime = this.elapsedTime;
    this.spawnRipple(0.0, 0.0, this.elapsedTime, 1.3);
    this.emitSnapshot(true);
  }

  returnToUtsushiyo() {
    if (!this.isPortalOpenTarget) return;
    this.isPortalOpenTarget = false;
    this.hasInteracted = true;
    this.clickShockwave = 0.52;
    this.clickShockwaveTime = this.elapsedTime;
    this.spawnRipple(0.0, -15.0, this.elapsedTime, 0.85);
    this.emitSnapshot(true);
  }

  togglePortalMode(): boolean {
    if (this.isPortalOpenTarget) {
      this.returnToUtsushiyo();
    } else {
      this.enterKakuriyo();
    }
    return this.isPortalOpenTarget;
  }

  /**
   * Keeps floating water lanterns gently outside the granite Hokora shrine island perimeter.
   */
  private sanitizeLanternCoords(x: number, z: number): { x: number; z: number } {
    let cx = THREE.MathUtils.clamp(x, -15.0, 15.0);
    let cz = THREE.MathUtils.clamp(z, -29.5, -12.6);
    const dx = cx;
    const dz = cz - HOKORA_SANCTUARY_Z;
    const dist = Math.hypot(dx, dz);
    const minIslandClearance = 2.15;
    if (dist < minIslandClearance) {
      if (dist < 0.05) {
        cz = HOKORA_SANCTUARY_Z + minIslandClearance;
      } else {
        const scale = minIslandClearance / dist;
        cx = dx * scale;
        cz = HOKORA_SANCTUARY_Z + dz * scale;
      }
    }
    return {
      x: THREE.MathUtils.clamp(cx, -15.0, 15.0),
      z: THREE.MathUtils.clamp(cz, -29.5, -12.6),
    };
  }

  /**
   * Hydrates persisted golden wish lanterns from the SQLite database onto the Kakuriyo sea.
   */
  hydrateSavedWishes(records: { pos_x: number; pos_z: number }[], totalCount: number) {
    const maxSlots = MAX_LANTERNS - AMBIENT_LANTERN_COUNT;
    const slice = records.slice(0, maxSlots);
    for (let i = 0; i < slice.length; i++) {
      const rec = slice[i];
      const safe = this.sanitizeLanternCoords(rec.pos_x, rec.pos_z);
      const slotIdx = AMBIENT_LANTERN_COUNT + i;
      const slot = this.lanterns[slotIdx];
      slot.active = true;
      slot.x = safe.x;
      slot.baseX = safe.x;
      slot.z = safe.z;
      slot.birthTime = -10.0;
      slot.staggerOrder = 0.12 + (i / Math.max(1, slice.length)) * 0.55;
      slot.isUserSpawned = true;
      slot.isGoldenWish = true;
    }
    this.nextUserLanternSlot =
      AMBIENT_LANTERN_COUNT + (slice.length % maxSlots);
    this.userLanternCount = Math.max(this.userLanternCount, totalCount);
    this.emitSnapshot(true);
  }

  /**
   * Spawns a floating Tōrō candle lantern rising up from beneath the spirit sea in Kakuriyo.
   */
  spawnUserLantern(x: number, z: number, isGoldenWish = false): { x: number; z: number } {
    const { x: clampedX, z: clampedZ } = this.sanitizeLanternCoords(x, z);

    const slot = this.lanterns[this.nextUserLanternSlot];
    slot.active = true;
    slot.x = clampedX;
    slot.baseX = clampedX;
    slot.z = clampedZ;
    slot.birthTime = this.elapsedTime;
    slot.staggerOrder = 0.0;
    slot.isUserSpawned = true;
    slot.isGoldenWish = isGoldenWish;

    this.nextUserLanternSlot =
      AMBIENT_LANTERN_COUNT +
      ((this.nextUserLanternSlot - AMBIENT_LANTERN_COUNT + 1) %
        (MAX_LANTERNS - AMBIENT_LANTERN_COUNT));
    this.userLanternCount += 1;

    this.spawnRipple(clampedX, clampedZ, this.elapsedTime, isGoldenWish ? 1.35 : 0.95);

    if (isGoldenWish) {
      this.wishBurstTime = this.elapsedTime;
      this.wishBurstOrigin.set(clampedX, 0.32, clampedZ);
      this.clickShockwave = 0.65;
      this.clickShockwaveTime = this.elapsedTime;
    }

    this.emitSnapshot(true);
    return { x: clampedX, z: clampedZ };
  }

  private emitSnapshot(force = false) {
    let stage = 0;
    if (this.portalProgress > 0.005) {
      stage = Math.min(5, Math.floor(this.portalProgress * 5) + 1);
    }
    const isInsideKakuriyo = this.travelProgress > 0.82 && this.isPortalOpenTarget;
    const isTransitioning =
      (this.isPortalOpenTarget && this.travelProgress < 0.96) ||
      (!this.isPortalOpenTarget && (this.travelProgress > 0.02 || this.portalProgress > 0.04));

    if (
      force ||
      stage !== this.lastEmittedStage ||
      this.isPortalOpenTarget !== this.lastEmittedToggled ||
      isInsideKakuriyo !== this.lastEmittedInside ||
      isTransitioning !== this.lastEmittedTransition ||
      this.isHoveringGate !== this.lastEmittedHover ||
      this.season !== this.lastEmittedSeason ||
      this.userLanternCount !== this.lastEmittedLanterns
    ) {
      this.lastEmittedStage = stage;
      this.lastEmittedToggled = this.isPortalOpenTarget;
      this.lastEmittedInside = isInsideKakuriyo;
      this.lastEmittedTransition = isTransitioning;
      this.lastEmittedHover = this.isHoveringGate;
      this.lastEmittedSeason = this.season;
      this.lastEmittedLanterns = this.userLanternCount;

      const snap: UIStatusSnapshot = {
        portalStage: stage,
        isToggledDark: this.isPortalOpenTarget,
        isInsideKakuriyo,
        isTransitioning,
        hasInteracted: this.hasInteracted,
        isHoveringGate: this.isHoveringGate,
        season: this.season,
        userLanternCount: this.userLanternCount,
      };
      this.listeners.forEach((fn) => fn(snap));
    }
  }

  step(dt: number, elapsed: number) {
    const clampedDt = Math.min(dt, 0.05);
    this.elapsedTime = elapsed;

    this.smoothedPointerNDC.lerp(this.pointerNDC, 1.0 - Math.exp(-3.0 * clampedDt));

    // 1. Smoothly blend 4-season weights
    const sRate = 1.0 - Math.exp(-2.4 * clampedDt);
    this.seasonWeights.x = THREE.MathUtils.lerp(this.seasonWeights.x, this.season === 'haru' ? 1 : 0, sRate);
    this.seasonWeights.y = THREE.MathUtils.lerp(this.seasonWeights.y, this.season === 'natsu' ? 1 : 0, sRate);
    this.seasonWeights.z = THREE.MathUtils.lerp(this.seasonWeights.z, this.season === 'aki' ? 1 : 0, sRate);
    this.seasonWeights.w = THREE.MathUtils.lerp(this.seasonWeights.w, this.season === 'fuyu' ? 1 : 0, sRate);
    const weightSum =
      this.seasonWeights.x + this.seasonWeights.y + this.seasonWeights.z + this.seasonWeights.w;
    if (weightSum > 0.0001) {
      this.seasonWeights.divideScalar(weightSum);
    }

    // 2. Coordinated Portal Awakening + Camera Dolly-Through + Lantern Water Emergence/Submergence
    if (this.isPortalOpenTarget) {
      const targetPortalRate = 0.44;
      this.portalVelocity = THREE.MathUtils.lerp(
        this.portalVelocity,
        targetPortalRate,
        1.0 - Math.exp(-4.5 * clampedDt)
      );
      this.portalProgress = Math.min(1.0, this.portalProgress + this.portalVelocity * clampedDt);

      if (this.portalProgress > 0.20) {
        this.travelProgress = Math.min(1.0, this.travelProgress + 0.30 * clampedDt);
      }

      // Begin rising lanterns up from beneath the sea as camera crosses through the gate!
      if (this.travelProgress > 0.42) {
        this.lanternEmergence = Math.min(1.0, this.lanternEmergence + 0.56 * clampedDt);
      }
    } else {
      // Submerge lanterns smoothly back into the sea first as we exit!
      if (this.lanternEmergence > 0.0) {
        this.lanternEmergence = Math.max(0.0, this.lanternEmergence - 0.92 * clampedDt);
      }

      // Glide camera back through the gate
      if (this.travelProgress > 0.0) {
        this.travelProgress = Math.max(0.0, this.travelProgress - 0.34 * clampedDt);
      }

      if (this.travelProgress < 0.55) {
        const targetCloseRate = -0.36;
        this.portalVelocity = THREE.MathUtils.lerp(
          this.portalVelocity,
          targetCloseRate,
          1.0 - Math.exp(-4.8 * clampedDt)
        );
        this.portalProgress = Math.max(0.0, this.portalProgress + this.portalVelocity * clampedDt);
      }

      if (this.portalProgress <= 0.0001 && this.travelProgress <= 0.0001) {
        this.portalProgress = 0.0;
        this.portalVelocity = 0.0;
        this.travelProgress = 0.0;
        this.lanternEmergence = 0.0;
      }
    }

    // 3. Gentle ocean current drift for Tōrō water lanterns (parting naturally around Hokora island!)
    if (this.lanternEmergence > 0.005) {
      for (let i = 0; i < MAX_LANTERNS; i++) {
        const l = this.lanterns[i];
        if (!l.active) continue;
        l.z -= l.driftSpeed * clampedDt;
        const candidateX = l.baseX + Math.sin(elapsed * 0.32 + l.driftPhase) * 0.50;
        const dzIsland = l.z - HOKORA_SANCTUARY_Z;
        const distIsland = Math.hypot(candidateX, dzIsland);
        if (distIsland < 3.45) {
          const pushSide = l.baseX >= 0 ? 1 : -1;
          l.baseX += pushSide * 0.85 * clampedDt;
        }
        l.x = l.baseX + Math.sin(elapsed * 0.32 + l.driftPhase) * 0.50;
        // Loop far lanterns smoothly (KakuriyoSanctuary submerges them before -38.5 & re-emerges at -13.5!)
        if (l.z < -38.5) {
          l.z = -13.5;
          l.birthTime = elapsed;
        }
      }
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

const GLOBAL_STORE_KEY = '__TORII_EXPERIENCE_STORE_V2__';
const globalScope = globalThis as unknown as Record<string, ExperienceStore | undefined>;

export const experienceState: ExperienceStore =
  globalScope[GLOBAL_STORE_KEY] ?? (globalScope[GLOBAL_STORE_KEY] = new ExperienceStore());

const metaHot = (import.meta as unknown as { hot?: { invalidate: () => void } }).hot;
if (metaHot) {
  metaHot.invalidate();
}
