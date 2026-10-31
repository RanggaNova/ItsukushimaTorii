import * as THREE from 'three';
import type { WishLanternSlot } from '../services/wishDatabase';

export type SeasonId = 'haru' | 'natsu' | 'aki' | 'fuyu';

export interface RippleImpulse {
  x: number;
  z: number;
  birthTime: number;
  strength: number;
}

export interface LanternInstance {
  id: number;
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
  wishText: string;
  authorName?: string;
  season?: SeasonId;
  omikujiRank?: string;
  omikujiLabel?: string;
  omikujiVerse?: string;
  createdAt?: string;
}

export const MAX_RIPPLES = 10;
export const MAX_LANTERNS = 25;
export const HOKORA_SANCTUARY_Z = -20.2;

export function evalOceanWaveHeight(x: number, z: number, t: number): number {
  let h = 0.0;
  h += Math.sin(z * 0.65 + x * 0.12 + t * 1.05) * 0.040;
  h += Math.sin(z * 1.35 - x * 0.32 + t * 1.45) * 0.018;
  h += Math.cos(x * 0.85 + z * 0.45 - t * 0.90) * 0.015;
  const distFade = Math.exp(-Math.hypot(x, z) * 0.018);
  return h * distFade;
}

export interface UIStatusSnapshot {
  portalStage: number;
  isToggledDark: boolean;
  isInsideKakuriyo: boolean;
  isTransitioning: boolean;
  hasInteracted: boolean;
  isHoveringGate: boolean;
  season: SeasonId;
  userLanternCount: number;
  activeLanternCount: number;
  selectedLantern: LanternInstance | null;
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

  // Cursor / pointer tracking for O(1) water ripples & lantern raycast
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

  // Pool of Floating Water Lanterns (Tōrō Nagashi) in Kakuriyo: Exactly 25 maximum (FIFO ring buffer)
  lanterns: LanternInstance[] = [];
  oldestSlot = 0; // Index of the oldest lantern to be overwritten by the next wish
  userLanternCount = 0;

  // Click & inspection interaction
  selectedLantern: LanternInstance | null = null;
  hoveredLanternId: number | null = null;
  cameraRef: THREE.Camera | null = null;
  private hitRaycaster = new THREE.Raycaster();
  private hitNdcVec = new THREE.Vector2();
  private hitTempVec = new THREE.Vector3();
  private hitCenterVec = new THREE.Vector3();

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
  private lastEmittedActiveLanterns = -1;
  private lastEmittedSelectedId: number | null = null;

  constructor() {
    let rng = 20261031;
    const rand = () => {
      rng = (rng * 1664525 + 1013904223) % 4294967296;
      return rng / 4294967296;
    };

    // Initialize 25 lantern slots as inactive with zero dummy data (only real user wishes appear!)
    for (let i = 0; i < MAX_LANTERNS; i++) {
      this.lanterns.push({
        id: 0,
        active: false,
        x: 0,
        z: -100,
        baseX: 0,
        driftPhase: rand() * Math.PI * 2,
        driftSpeed: 0.065 + rand() * 0.065,
        birthTime: -100,
        staggerOrder: (i / MAX_LANTERNS) * 0.75 + rand() * 0.25,
        isUserSpawned: true,
        isGoldenWish: false,
        wishText: '',
        authorName: '',
        season: 'haru',
        omikujiRank: '',
        omikujiLabel: '',
        omikujiVerse: '',
        createdAt: '',
      });
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
    this.selectedLantern = null;
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

  selectLantern(l: LanternInstance | null) {
    this.selectedLantern = l;
    this.emitSnapshot(true);
  }

  setHoveredLantern(id: number | null) {
    this.hoveredLanternId = id;
  }

  /**
   * High-speed analytical raycaster testing pointer against 25 floating lanterns.
   * Tests both 3D sphere proximity to lantern center AND water plane intersection.
   */
  findLanternAtScreen(
    clientX: number,
    clientY: number,
    screenWidth: number,
    screenHeight: number
  ): LanternInstance | null {
    if (!this.cameraRef || this.travelProgress < 0.75) return null;

    const nx = (clientX / Math.max(1, screenWidth)) * 2 - 1;
    const ny = -(clientY / Math.max(1, screenHeight)) * 2 + 1;

    this.hitNdcVec.set(nx, ny);
    this.hitRaycaster.setFromCamera(this.hitNdcVec, this.cameraRef);
    const ray = this.hitRaycaster.ray;

    let bestCandidate: LanternInstance | null = null;
    let closestDistAlongRay = Infinity;
    const clickTolerance = 0.58; // Generous 58cm bounding hit sphere around lantern

    for (let i = 0; i < MAX_LANTERNS; i++) {
      const l = this.lanterns[i];
      if (!l.active) continue;

      const waveY = evalOceanWaveHeight(l.x, l.z, this.elapsedTime);
      this.hitCenterVec.set(l.x, waveY + 0.24, l.z);

      // Distance from ray line to lantern center point
      const perpDist = ray.distanceToPoint(this.hitCenterVec);

      // Also check water hit point distance if available
      const waterDist = this.hasWaterHit
        ? Math.hypot(this.waterHitPoint.x - l.x, this.waterHitPoint.z - l.z)
        : Infinity;

      if (perpDist <= clickTolerance || waterDist <= 0.62) {
        this.hitTempVec.subVectors(this.hitCenterVec, ray.origin);
        const forwardProj = ray.direction.dot(this.hitTempVec);

        // Make sure lantern is in front of camera and pick closest along ray
        if (forwardProj > 0 && forwardProj < closestDistAlongRay) {
          closestDistAlongRay = forwardProj;
          bestCandidate = l;
        }
      }
    }

    return bestCandidate;
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
  hydrateSavedWishes(records: WishLanternSlot[], totalCount: number) {
    // Reset all slots first so no old/stale lanterns remain active
    for (let i = 0; i < MAX_LANTERNS; i++) {
      this.lanterns[i].active = false;
      this.lanterns[i].wishText = '';
    }

    const slice = records.slice(0, MAX_LANTERNS);
    for (let i = 0; i < slice.length; i++) {
      const rec = slice[i];
      const safe = this.sanitizeLanternCoords(rec.pos_x, rec.pos_z);
      const slot = this.lanterns[i];
      slot.id = rec.id;
      slot.active = true;
      slot.x = safe.x;
      slot.baseX = safe.x;
      slot.z = safe.z;
      slot.birthTime = -10.0;
      slot.staggerOrder = 0.12 + (i / Math.max(1, slice.length)) * 0.55;
      slot.isUserSpawned = true;
      slot.isGoldenWish = true;
      slot.wishText = rec.wish_text;
      slot.authorName = rec.author_name || 'Anonymous';
      slot.season = rec.season || 'haru';
      slot.omikujiRank = rec.omikuji_rank || '吉';
      slot.omikujiLabel = rec.omikuji_label || 'KICHI · AUSPICIOUS TIDE';
      slot.omikujiVerse = rec.omikuji_verse || '';
      slot.createdAt = rec.created_at;
    }

    // Set ring buffer insertion slot so new wishes overwrite the oldest slot
    this.oldestSlot = slice.length % MAX_LANTERNS;
    this.userLanternCount = totalCount;
    this.emitSnapshot(true);
  }

  /**
   * Spawns a floating golden Tōrō candle lantern rising up from beneath the spirit sea in Kakuriyo.
   * Only called via "Make a Wish" (1 wish = 1 lantern).
   * Strictly enforces MAX_LANTERNS = 25: FIFO ring buffer overwrites the oldest lantern!
   */
  spawnWishLantern(
    wishText: string,
    omikujiRank = '吉',
    omikujiLabel = 'KICHI · AUSPICIOUS TIDE',
    omikujiVerse = '',
    season: SeasonId = 'haru'
  ): { x: number; z: number; slotIndex: number; lantern: LanternInstance } {
    const rawX = (Math.random() - 0.5) * 5.2;
    const rawZ = -15.4 - Math.random() * 2.0;
    const { x: clampedX, z: clampedZ } = this.sanitizeLanternCoords(rawX, rawZ);

    const slotIndex = this.oldestSlot;
    const slot = this.lanterns[slotIndex];

    slot.id = Date.now();
    slot.active = true;
    slot.x = clampedX;
    slot.baseX = clampedX;
    slot.z = clampedZ;
    slot.birthTime = this.elapsedTime;
    slot.staggerOrder = 0.0;
    slot.isUserSpawned = true;
    slot.isGoldenWish = true;
    slot.wishText = wishText;
    slot.authorName = 'Anonymous';
    slot.season = season;
    slot.omikujiRank = omikujiRank;
    slot.omikujiLabel = omikujiLabel;
    slot.omikujiVerse = omikujiVerse;
    slot.createdAt = new Date().toISOString();

    // FIFO ring buffer advances to next oldest slot (0..24)
    this.oldestSlot = (this.oldestSlot + 1) % MAX_LANTERNS;
    this.userLanternCount += 1;

    this.spawnRipple(clampedX, clampedZ, this.elapsedTime, 1.45);

    this.wishBurstTime = this.elapsedTime;
    this.wishBurstOrigin.set(clampedX, 0.35, clampedZ);
    this.clickShockwave = 0.65;
    this.clickShockwaveTime = this.elapsedTime;

    this.emitSnapshot(true);
    return { x: clampedX, z: clampedZ, slotIndex, lantern: slot };
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

    const currentSelectedId = this.selectedLantern ? this.selectedLantern.id : null;
    const activeLanterns = this.lanterns.reduce((sum, l) => sum + (l.active ? 1 : 0), 0);

    if (
      force ||
      stage !== this.lastEmittedStage ||
      this.isPortalOpenTarget !== this.lastEmittedToggled ||
      isInsideKakuriyo !== this.lastEmittedInside ||
      isTransitioning !== this.lastEmittedTransition ||
      this.isHoveringGate !== this.lastEmittedHover ||
      this.season !== this.lastEmittedSeason ||
      this.userLanternCount !== this.lastEmittedLanterns ||
      activeLanterns !== this.lastEmittedActiveLanterns ||
      currentSelectedId !== this.lastEmittedSelectedId
    ) {
      this.lastEmittedStage = stage;
      this.lastEmittedToggled = this.isPortalOpenTarget;
      this.lastEmittedInside = isInsideKakuriyo;
      this.lastEmittedTransition = isTransitioning;
      this.lastEmittedHover = this.isHoveringGate;
      this.lastEmittedSeason = this.season;
      this.lastEmittedLanterns = this.userLanternCount;
      this.lastEmittedActiveLanterns = activeLanterns;
      this.lastEmittedSelectedId = currentSelectedId;

      const snap: UIStatusSnapshot = {
        portalStage: stage,
        isToggledDark: this.isPortalOpenTarget,
        isInsideKakuriyo,
        isTransitioning,
        hasInteracted: this.hasInteracted,
        isHoveringGate: this.isHoveringGate,
        season: this.season,
        userLanternCount: this.userLanternCount,
        activeLanternCount: activeLanterns,
        selectedLantern: this.selectedLantern,
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

    // 3. Gentle ocean current drift for 25 Tōrō water lanterns (parting naturally around Hokora island!)
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
