import * as THREE from 'three';
import {
  ExhibitionChapterId,
  SCROLL_STAGES,
  ToriiPartId,
} from '../data/toriiPartsData';

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
  staggerOrder: number;
  isUserSpawned: boolean;
  isGoldenWish: boolean;
}

export const MAX_RIPPLES = 10;
export const MAX_LANTERNS = 42;
export const HOKORA_SANCTUARY_Z = -20.2;

export function evalOceanWaveHeight(x: number, z: number, t: number): number {
  let h = 0.0;
  h += Math.sin(z * 0.65 + x * 0.12 + t * 1.05) * 0.04;
  h += Math.sin(z * 1.35 - x * 0.32 + t * 1.45) * 0.018;
  h += Math.cos(x * 0.85 + z * 0.45 - t * 0.9) * 0.015;
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
  activeStageIndex: number;
  activeChapter: ExhibitionChapterId;
}

const ALL_PARTS: ToriiPartId[] = ['hashira', 'ryobu', 'nuki', 'hengaku', 'kasagi'];

class ExperienceStore {
  // Active season in Utsushiyo (Outer Mortal World)
  season: SeasonId = 'haru';
  seasonWeights = new THREE.Vector4(1, 0, 0, 0);

  // Continuous Scrollytelling State (0.0 = Stage 0 Hero Opening .. 1.0 = Stage 8 Hokora Sanctuary)
  scrollTarget = 0.0;
  scrollProgress = 0.0;
  activeStageIndex = 0;
  activeChapter: ExhibitionChapterId = 'hero';

  // Per-part visibility (Starts at 1.0 for all 5 parts so the Hero Opening shows the complete Torii)
  partVisibility: Record<ToriiPartId, number> = {
    hashira: 1.0,
    ryobu: 1.0,
    nuki: 1.0,
    hengaku: 1.0,
    kasagi: 1.0,
  };

  // Linear progress (0.0 .. 1.0) mapped through C2 Quintic S-curve for unhurried, silky-smooth fade-out/in
  partVisProgress: Record<ToriiPartId, number> = {
    hashira: 1.0,
    ryobu: 1.0,
    nuki: 1.0,
    hengaku: 1.0,
    kasagi: 1.0,
  };

  // Per-part sub-assembly separation (Starts at 0.0 so the Hero Opening is 100% assembled)
  partExplode: Record<ToriiPartId, number> = {
    hashira: 0.0,
    ryobu: 0.0,
    nuki: 0.0,
    hengaku: 0.0,
    kasagi: 0.0,
  };

  explodeProgress = 0.0;
  private hasTriggeredAssemblyRipple = false;
  private hasTriggeredDisassemblyRipple = false;

  // Gentle interactive look-around offset when dragging in Utsushiyo
  orbitAzimuth = 0.0;
  orbitElevation = 0.0;
  targetOrbitAzimuth = 0.0;
  targetOrbitElevation = 0.0;

  isPortalOpenTarget = false;
  isHoveringGate = false;
  isTouchDevice = false;

  // portalProgress: 0.0 (calm season) -> 1.0 (supernatural dark portal open)
  portalProgress = 0.0;
  portalVelocity = 0.0;

  // travelProgress: 0.0 (front of gate) -> 1.0 (inside Kakuriyo in front of Hokora)
  travelProgress = 0.0;
  warpIntensity = 0.0;

  // lanternEmergence: 0.0 (submerged under water) -> 1.0 (floating on sea surface)
  lanternEmergence = 0.0;

  gateHoverBlend = 0.0;

  clickShockwave = 0.0;
  clickShockwaveTime = -100.0;

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

  // 42 Decorative Ambient Floating Water Lanterns (Tōrō Nagashi) around the Hokora Sanctuary
  lanterns: LanternInstance[] = [];
  hoveredLanternId: number | null = null;
  draggedLantern: LanternInstance | null = null;
  cameraRef: THREE.Camera | null = null;
  private hitRaycaster = new THREE.Raycaster();
  private hitNdcVec = new THREE.Vector2();
  private hitTempVec = new THREE.Vector3();
  private hitCenterVec = new THREE.Vector3();
  private hitPlaneIntersectVec = new THREE.Vector3();
  private seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  elapsedTime = 0;
  hasInteracted = false;

  private listeners = new Set<(snap: UIStatusSnapshot) => void>();
  private lastEmittedStage = -1;
  private lastEmittedToggled = false;
  private lastEmittedInside = false;
  private lastEmittedTransition = false;
  private lastEmittedHover = false;
  private lastEmittedSeason: SeasonId = 'haru';
  private lastEmittedStageIndex = -1;

  constructor() {
    let rng = 20261102;
    const rand = () => {
      rng = (rng * 1664525 + 1013904223) % 4294967296;
      return rng / 4294967296;
    };

    // Populate 42 active decorative lanterns gracefully spread across the Kakuriyo lagoon
    for (let i = 0; i < MAX_LANTERNS; i++) {
      // First 14 lanterns are placed closer to the central view corridor so mobile & desktop see plenty immediately
      const isForegroundCluster = i < 14;
      const spreadX = isForegroundCluster
        ? (rand() - 0.5) * 6.8
        : (rand() - 0.5) * 24.0;
      const spreadZ = isForegroundCluster
        ? -12.8 - rand() * 8.5
        : -12.5 - rand() * 24.5;

      const safe = this.sanitizeLanternCoords(spreadX, spreadZ);

      this.lanterns.push({
        id: i + 1,
        active: true,
        x: safe.x,
        z: safe.z,
        baseX: safe.x,
        driftPhase: rand() * Math.PI * 2,
        driftSpeed: 0.055 + rand() * 0.065,
        birthTime: -20.0,
        staggerOrder: (i / MAX_LANTERNS) * 0.72 + rand() * 0.22,
        isUserSpawned: false,
        isGoldenWish: i % 3 === 0, // Mix of warm golden and classic amber lanterns for rich visual depth
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

  addScrollDelta(delta: number) {
    this.hasInteracted = true;
    this.scrollTarget = THREE.MathUtils.clamp(this.scrollTarget + delta, 0.0, 1.0);
    this.targetOrbitAzimuth *= 0.85;
    this.targetOrbitElevation *= 0.85;
  }

  scrollToStage(stageIndex: number) {
    const clampedIdx = THREE.MathUtils.clamp(stageIndex, 0, SCROLL_STAGES.length - 1);
    const stage = SCROLL_STAGES[clampedIdx];
    this.hasInteracted = true;
    this.targetOrbitAzimuth = 0;
    this.targetOrbitElevation = 0;
    if (clampedIdx === SCROLL_STAGES.length - 1) {
      this.scrollTarget = 0.985;
    } else if (clampedIdx === 0) {
      this.scrollTarget = 0.0;
    } else {
      this.scrollTarget = stage.range[0] + (stage.range[1] - stage.range[0]) * 0.35;
    }
  }

  enterKakuriyo() {
    this.scrollToStage(SCROLL_STAGES.length - 1);
  }

  returnToUtsushiyo() {
    this.scrollToStage(7);
  }

  triggerMessageCelebration() {
    this.wishBurstTime = this.elapsedTime;
    this.wishBurstOrigin.set(0, 0.45, HOKORA_SANCTUARY_Z + 1.2);
    this.clickShockwave = 0.65;
    this.clickShockwaveTime = this.elapsedTime;
    this.spawnRipple(0, HOKORA_SANCTUARY_Z + 2.0, this.elapsedTime, 1.35);
  }

  addOrbitDelta(dAzimuth: number, dElevation: number) {
    this.targetOrbitAzimuth = THREE.MathUtils.clamp(
      this.targetOrbitAzimuth + dAzimuth,
      -0.85,
      0.85
    );
    this.targetOrbitElevation = THREE.MathUtils.clamp(
      this.targetOrbitElevation + dElevation,
      -0.25,
      0.32
    );
  }

  setHoveredLantern(id: number | null) {
    this.hoveredLanternId = id;
  }

  startDraggingLantern(lantern: LanternInstance) {
    this.draggedLantern = lantern;
    document.body.style.cursor = 'grabbing';
  }

  dragCurrentLantern(waterX: number, waterZ: number) {
    if (!this.draggedLantern) return;
    const safe = this.sanitizeLanternCoords(waterX, waterZ);
    this.draggedLantern.x = safe.x;
    this.draggedLantern.baseX = safe.x;
    this.draggedLantern.z = safe.z;

    const now = this.elapsedTime;
    if (now - this.lastRippleSpawnTime > 0.08) {
      this.spawnRipple(safe.x, safe.z, now, 0.42);
    }
  }

  stopDraggingLantern() {
    if (this.draggedLantern) {
      this.draggedLantern.baseX = this.draggedLantern.x;
      this.draggedLantern = null;
    }
    document.body.style.cursor = 'default';
  }

  findLanternAtScreen(
    clientX: number,
    clientY: number,
    screenWidth: number,
    screenHeight: number
  ): LanternInstance | null {
    if (!this.cameraRef || this.travelProgress < 0.72) return null;

    const nx = (clientX / Math.max(1, screenWidth)) * 2 - 1;
    const ny = -(clientY / Math.max(1, screenHeight)) * 2 + 1;

    this.hitNdcVec.set(nx, ny);
    this.hitRaycaster.setFromCamera(this.hitNdcVec, this.cameraRef);
    const ray = this.hitRaycaster.ray;

    let bestCandidate: LanternInstance | null = null;
    let closestDistAlongRay = Infinity;

    const isMobile = screenWidth / Math.max(1, screenHeight) < 1.15;
    const clickTolerance = isMobile ? 0.95 : 0.65;
    const waterDistTolerance = isMobile ? 1.05 : 0.7;

    for (let i = 0; i < MAX_LANTERNS; i++) {
      const l = this.lanterns[i];
      if (!l.active) continue;

      const waveY = evalOceanWaveHeight(l.x, l.z, this.elapsedTime);
      this.hitCenterVec.set(l.x, waveY + 0.24, l.z);

      const perpDist = ray.distanceToPoint(this.hitCenterVec);
      const waterDist = this.hasWaterHit
        ? Math.hypot(this.waterHitPoint.x - l.x, this.waterHitPoint.z - l.z)
        : Infinity;

      if (perpDist <= clickTolerance || waterDist <= waterDistTolerance) {
        this.hitTempVec.subVectors(this.hitCenterVec, ray.origin);
        const forwardProj = ray.direction.dot(this.hitTempVec);

        if (forwardProj > 0 && forwardProj < closestDistAlongRay) {
          closestDistAlongRay = forwardProj;
          bestCandidate = l;
        }
      }
    }

    return bestCandidate;
  }

  getWaterPlanePointAtScreen(
    clientX: number,
    clientY: number,
    screenWidth: number,
    screenHeight: number
  ): { x: number; z: number } | null {
    if (!this.cameraRef) return null;
    const nx = (clientX / Math.max(1, screenWidth)) * 2 - 1;
    const ny = -(clientY / Math.max(1, screenHeight)) * 2 + 1;
    this.hitNdcVec.set(nx, ny);
    this.hitRaycaster.setFromCamera(this.hitNdcVec, this.cameraRef);
    const hit = this.hitRaycaster.ray.intersectPlane(this.seaPlane, this.hitPlaneIntersectVec);
    if (hit) {
      return { x: hit.x, z: hit.z };
    }
    return null;
  }

  sanitizeLanternCoords(x: number, z: number): { x: number; z: number } {
    let cx = THREE.MathUtils.clamp(x, -14.0, 14.0);
    let cz = THREE.MathUtils.clamp(z, -36.5, -11.5);

    const inGraniteX = Math.abs(cx) < 1.25;
    const inGraniteZ = cz < -18.8 && cz > -21.5;
    if (inGraniteX && inGraniteZ) {
      if (cz > -20.15) {
        cz = -18.75;
      } else {
        cx = cx >= 0 ? 1.3 : -1.3;
      }
    }

    return {
      x: THREE.MathUtils.clamp(cx, -14.0, 14.0),
      z: THREE.MathUtils.clamp(cz, -36.5, -11.5),
    };
  }

  private emitSnapshot(force = false) {
    let stage = 0;
    if (this.portalProgress > 0.005) {
      stage = Math.min(5, Math.floor(this.portalProgress * 5) + 1);
    }
    const isInsideKakuriyo =
      this.travelProgress > 0.78 && this.activeStageIndex === SCROLL_STAGES.length - 1;
    const isTransitioning =
      this.travelProgress > 0.04 && this.travelProgress < 0.88;

    if (
      force ||
      stage !== this.lastEmittedStage ||
      this.isPortalOpenTarget !== this.lastEmittedToggled ||
      isInsideKakuriyo !== this.lastEmittedInside ||
      isTransitioning !== this.lastEmittedTransition ||
      this.isHoveringGate !== this.lastEmittedHover ||
      this.season !== this.lastEmittedSeason ||
      this.activeStageIndex !== this.lastEmittedStageIndex
    ) {
      this.lastEmittedStage = stage;
      this.lastEmittedToggled = this.isPortalOpenTarget;
      this.lastEmittedInside = isInsideKakuriyo;
      this.lastEmittedTransition = isTransitioning;
      this.lastEmittedHover = this.isHoveringGate;
      this.lastEmittedSeason = this.season;
      this.lastEmittedStageIndex = this.activeStageIndex;

      const snap: UIStatusSnapshot = {
        portalStage: stage,
        isToggledDark: this.isPortalOpenTarget,
        isInsideKakuriyo,
        isTransitioning,
        hasInteracted: this.hasInteracted,
        isHoveringGate: this.isHoveringGate,
        season: this.season,
        activeStageIndex: this.activeStageIndex,
        activeChapter: this.activeChapter,
      };
      this.listeners.forEach((fn) => fn(snap));
    }
  }

  step(dt: number, elapsed: number) {
    const clampedDt = Math.min(dt, 0.05);
    this.elapsedTime = elapsed;

    this.smoothedPointerNDC.lerp(this.pointerNDC, 1.0 - Math.exp(-3.0 * clampedDt));

    // 1. Cushioned, unhurried damping for continuous scroll progress (0.0 .. 1.0)
    this.scrollProgress = THREE.MathUtils.damp(
      this.scrollProgress,
      this.scrollTarget,
      2.6,
      clampedDt
    );
    const s = this.scrollProgress;

    // Determine active stage index (0..8)
    let foundIdx = SCROLL_STAGES.length - 1;
    for (let i = 0; i < SCROLL_STAGES.length; i++) {
      if (s <= SCROLL_STAGES[i].range[1] || i === SCROLL_STAGES.length - 1) {
        foundIdx = i;
        break;
      }
    }
    this.activeStageIndex = foundIdx;
    const currentStage = SCROLL_STAGES[foundIdx];
    this.activeChapter = currentStage.id;

    // 2. Hero -> Disassemble -> Isolated Part Inspection -> Grand Reassembly Choreography
    const isHeroOrDisassemble = s < 0.22;
    const isAssemblyOrBeyond = s >= 0.76;

    // In Stage 0..1 (s: 0.00 -> 0.22): Gate starts 100% assembled (0.0) and smoothly disassembles (0.78)
    const initialDisassembleAmount = THREE.MathUtils.smoothstep(s, 0.06, 0.20) * 0.78;

    if (s >= 0.09 && !this.hasTriggeredDisassemblyRipple) {
      this.hasTriggeredDisassemblyRipple = true;
      this.spawnRipple(0.0, 1.2, elapsed, 0.95);
    } else if (s < 0.04) {
      this.hasTriggeredDisassemblyRipple = false;
    }

    // In Stage 7 (s: 0.76 -> 0.85): All parts reunite from separated (0.78) to 100% locked (0.0)
    const reassemblyExplodeAmount = (1.0 - THREE.MathUtils.smoothstep(s, 0.76, 0.84)) * 0.78;

    if (s >= 0.83 && !this.hasTriggeredAssemblyRipple) {
      this.hasTriggeredAssemblyRipple = true;
      this.spawnRipple(0.0, 0.0, elapsed, 1.35);
      this.clickShockwave = 0.62;
      this.clickShockwaveTime = elapsed;
    } else if (s < 0.74) {
      this.hasTriggeredAssemblyRipple = false;
    }

    for (let i = 0; i < ALL_PARTS.length; i++) {
      const partId = ALL_PARTS[i];
      let targetVis = 1.0;

      if (isHeroOrDisassemble || isAssemblyOrBeyond) {
        targetVis = 1.0;
      } else {
        targetVis = currentStage.isolatedPart === partId ? 1.0 : 0.0;
      }

      // Unhurried ~1.18s fade-out and ~1.05s fade-in mapped through a C2 Quintic Smootherstep curve
      const curProg = this.partVisProgress[partId];
      const fadeSpeed = targetVis < curProg ? 0.85 : 0.95;
      const maxDelta = fadeSpeed * clampedDt;
      const nextProg =
        Math.abs(targetVis - curProg) <= maxDelta
          ? targetVis
          : curProg + Math.sign(targetVis - curProg) * maxDelta;
      this.partVisProgress[partId] = nextProg;

      // Quintic S-curve: zero derivative at both 1.0 and 0.0 so fade starts & finishes like silk
      this.partVisibility[partId] =
        nextProg * nextProg * nextProg * (nextProg * (nextProg * 6.0 - 15.0) + 10.0);

      // Update partExplode without EVER snapping inward while a part is fading out!
      if (isHeroOrDisassemble) {
        this.partExplode[partId] = THREE.MathUtils.damp(
          this.partExplode[partId],
          initialDisassembleAmount,
          3.6,
          clampedDt
        );
      } else if (isAssemblyOrBeyond) {
        this.partExplode[partId] = THREE.MathUtils.damp(
          this.partExplode[partId],
          reassemblyExplodeAmount,
          3.6,
          clampedDt
        );
      } else if (currentStage.isolatedPart === partId) {
        const stageSpan = Math.max(0.001, currentStage.range[1] - currentStage.range[0]);
        const localU = THREE.MathUtils.clamp((s - currentStage.range[0]) / stageSpan, 0, 1);
        const startExp = partId === 'hashira' ? 0.78 : 0.38;
        const targetExp = THREE.MathUtils.lerp(startExp, 0.02, localU);
        this.partExplode[partId] = THREE.MathUtils.damp(
          this.partExplode[partId],
          targetExp,
          3.4,
          clampedDt
        );
      } else {
        // Part is fading out or hidden: gently float outward while visible; pre-stage at 0.38 once invisible
        if (nextProg > 0.005) {
          this.partExplode[partId] = Math.min(1.02, this.partExplode[partId] + 0.12 * clampedDt);
        } else {
          this.partExplode[partId] = 0.38;
        }
      }
    }

    this.explodeProgress = isHeroOrDisassemble
      ? initialDisassembleAmount
      : isAssemblyOrBeyond
      ? reassemblyExplodeAmount
      : 0.35;

    // 3. Smoothly damp look-around orbit angles
    const orbitRate = 1.0 - Math.exp(-5.5 * clampedDt);
    this.orbitAzimuth = THREE.MathUtils.lerp(this.orbitAzimuth, this.targetOrbitAzimuth, orbitRate);
    this.orbitElevation = THREE.MathUtils.lerp(
      this.orbitElevation,
      this.targetOrbitElevation,
      orbitRate
    );

    // 4. Smoothly blend 4-season weights
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

    // 5. Stage 8 Voyage Through the Torii Gate into the Hokora Sanctuary (s: 0.88 -> 1.00)
    this.isPortalOpenTarget = s >= 0.88;
    const targetPortal = THREE.MathUtils.smoothstep(s, 0.85, 0.96);
    const targetTravel = THREE.MathUtils.smoothstep(s, 0.88, 0.995);

    const prevPortal = this.portalProgress;
    this.portalProgress = THREE.MathUtils.damp(this.portalProgress, targetPortal, 3.8, clampedDt);
    this.portalVelocity = (this.portalProgress - prevPortal) / Math.max(0.001, clampedDt);
    this.travelProgress = THREE.MathUtils.damp(this.travelProgress, targetTravel, 3.8, clampedDt);

    const targetLanterns = this.travelProgress > 0.42 ? 1.0 : 0.0;
    this.lanternEmergence = THREE.MathUtils.damp(
      this.lanternEmergence,
      targetLanterns,
      3.8,
      clampedDt
    );

    // 6. Gentle ocean current drift for 42 decorative Tōrō water lanterns
    if (this.lanternEmergence > 0.005) {
      for (let i = 0; i < MAX_LANTERNS; i++) {
        const l = this.lanterns[i];
        if (!l.active) continue;
        if (l === this.draggedLantern) continue;
        l.z -= l.driftSpeed * clampedDt;
        const candidateX = l.baseX + Math.sin(elapsed * 0.32 + l.driftPhase) * 0.5;
        const dzIsland = l.z - HOKORA_SANCTUARY_Z;
        if (Math.abs(dzIsland) < 1.25 && Math.abs(candidateX) < 1.15) {
          const pushSide = l.baseX >= 0 ? 1 : -1;
          l.baseX += pushSide * 0.85 * clampedDt;
        }
        l.x = l.baseX + Math.sin(elapsed * 0.32 + l.driftPhase) * 0.5;
        if (l.z < -38.5) {
          l.z = -12.8;
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

const GLOBAL_STORE_KEY = '__TORII_EXPERIENCE_STORE_V6__';
const globalScope = globalThis as unknown as Record<string, ExperienceStore | undefined>;

export const experienceState: ExperienceStore =
  globalScope[GLOBAL_STORE_KEY] ?? (globalScope[GLOBAL_STORE_KEY] = new ExperienceStore());

const metaHot = (import.meta as unknown as { hot?: { invalidate: () => void } }).hot;
if (metaHot) {
  metaHot.invalidate();
}
