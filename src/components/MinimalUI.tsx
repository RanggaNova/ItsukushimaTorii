import { FormEvent, useEffect, useRef, useState } from 'react';
import { experienceState, SeasonId, UIStatusSnapshot } from '../state/experienceState';
import { soundEngine } from '../audio/SoundEngine';
import { fetchSavedWishes, saveWishToDatabase } from '../services/wishDatabase';

const SEASONS: { id: SeasonId; kanji: string; label: string; poetic: string }[] = [
  {
    id: 'haru',
    kanji: '春',
    label: 'HARU',
    poetic: 'Drifting sakura petals kiss the morning tide.',
  },
  {
    id: 'natsu',
    kanji: '夏',
    label: 'NATSU',
    poetic: 'Fireflies linger above the tranquil summer sea.',
  },
  {
    id: 'aki',
    kanji: '秋',
    label: 'AKI',
    poetic: 'Crimson maple leaves drift into golden twilight.',
  },
  {
    id: 'fuyu',
    kanji: '冬',
    label: 'FUYU',
    poetic: 'Silent snow rests upon the ancient copper eaves.',
  },
];

interface OmikujiBlessing {
  rankKanji: string;
  rankLabel: string;
  verse: string;
  counsel: string;
}

const OMIKUJI_BLESSINGS: OmikujiBlessing[] = [
  {
    rankKanji: '大 吉',
    rankLabel: 'DAIKICHI · GREAT BLESSING',
    verse: 'Like the morning mist parting before warm sunlight, the path ahead clears of its own accord.',
    counsel: 'Let go of haste; what belongs to your spirit is already flowing toward you.',
  },
  {
    rankKanji: '中 吉',
    rankLabel: 'CHŪKICHI · SERENE FORTUNE',
    verse: 'Though tides rise and fall against the cedar pillars, the sacred gate stands unshaken.',
    counsel: 'Quiet steadiness will carry your wish farther than restless force.',
  },
  {
    rankKanji: '吉',
    rankLabel: 'KICHI · AUSPICIOUS TIDE',
    verse: 'A single lantern set upon dark water illuminates more than it knows.',
    counsel: 'Trust small, sincere beginnings; gentle ripples reach distant shores.',
  },
  {
    rankKanji: '末 吉',
    rankLabel: 'SUEKICHI · DAWNING GRACE',
    verse: 'Beneath winter frost, spring blossoms are already dreaming in silence.',
    counsel: 'Patience in this quiet season prepares an unexpected blooming.',
  },
  {
    rankKanji: '玄 吉',
    rankLabel: 'GENKICHI · MYSTIC HARMONY',
    verse: 'Between moonlit sky and mirroring sea, two worlds breathe as one.',
    counsel: 'Release heavy thoughts to the current; clarity arrives in stillness.',
  },
];

export function MinimalUI({ ready }: { ready: boolean }) {
  const [soundOn, setSoundOn] = useState(false);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishText, setWishText] = useState('');
  const [dissolvingWish, setDissolvingWish] = useState<string | null>(null);
  const [activeBlessing, setActiveBlessing] = useState<OmikujiBlessing | null>(null);

  const warpVeilRef = useRef<HTMLDivElement>(null);
  const filamentFillRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<UIStatusSnapshot>({
    portalStage: 0,
    isToggledDark: false,
    isInsideKakuriyo: false,
    isTransitioning: false,
    hasInteracted: false,
    isHoveringGate: false,
    season: 'haru',
    userLanternCount: 0,
  });

  useEffect(() => {
    return experienceState.subscribe((snap) => {
      setStatus(snap);
    });
  }, []);

  // Silently hydrate golden lantern positions from SQLite database on startup
  useEffect(() => {
    let mounted = true;
    void fetchSavedWishes().then((res) => {
      if (!mounted) return;
      if (res.wishes.length > 0) {
        experienceState.hydrateSavedWishes(res.wishes, res.totalCount);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Direct zero-re-render DOM style sync for continuous progress & warp veil
  useEffect(() => {
    let rafId = 0;
    let prevWarp = -1;
    let prevScale = -1;

    const tick = () => {
      const w = Math.round(experienceState.warpIntensity * 0.82 * 1000) / 1000;
      if (w !== prevWarp && warpVeilRef.current) {
        prevWarp = w;
        warpVeilRef.current.style.opacity = String(w);
      }

      const s =
        Math.round(Math.max(experienceState.portalProgress, experienceState.travelProgress) * 1000) /
        1000;
      if (s !== prevScale && filamentFillRef.current) {
        prevScale = s;
        filamentFillRef.current.style.transform = `scaleX(${s})`;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const handleToggleSound = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const active = soundEngine.toggle();
    setSoundOn(active);
  };

  const handleSelectSeason = (e: React.MouseEvent<HTMLButtonElement>, id: SeasonId) => {
    e.stopPropagation();
    experienceState.setSeason(id);
    soundEngine.triggerSeasonChime(id);
  };

  const handleReturnToUtsushiyo = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setWishModalOpen(false);
    setActiveBlessing(null);
    experienceState.returnToUtsushiyo();
    soundEngine.triggerDimensionalPulse();
  };

  const handleOpenWishModal = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setActiveBlessing(null);
    setWishModalOpen(true);
  };

  const handleReleaseWish = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedWish = wishText.trim();
    const displayWish =
      trimmedWish.length > 0 ? trimmedWish : 'A silent prayer offered to the eternal sea';

    const rawSpawnX = (Math.random() - 0.5) * 5.2;
    const rawSpawnZ = -15.4 - Math.random() * 2.0;
    const spawnedCoords = experienceState.spawnUserLantern(rawSpawnX, rawSpawnZ, true);
    soundEngine.triggerLanternBell(true);

    const chosen =
      OMIKUJI_BLESSINGS[
        (experienceState.userLanternCount + displayWish.length) % OMIKUJI_BLESSINGS.length
      ];

    setWishText('');
    setDissolvingWish(displayWish);

    // Silently persist wish into backend SQLite database (data/wishes.sqlite) for developer-only access
    void saveWishToDatabase({
      wish_text: displayWish,
      season: status.season,
      omikuji_rank: chosen.rankKanji,
      omikuji_label: chosen.rankLabel,
      omikuji_verse: chosen.verse,
      pos_x: spawnedCoords.x,
      pos_z: spawnedCoords.z,
    });

    window.setTimeout(() => {
      setDissolvingWish(null);
      setActiveBlessing(chosen);
    }, 1500);
  };

  const isDarkAtmosphere =
    status.isToggledDark || status.portalStage >= 3 || status.isInsideKakuriyo;
  const showDarkVerse =
    status.isInsideKakuriyo && status.isToggledDark && !wishModalOpen;
  const activeSeasonMeta = SEASONS.find((s) => s.id === status.season) || SEASONS[0];

  let whisperLabel = 'CLICK ONCE TO ENTER THE GATE';
  if (status.isToggledDark) {
    if (status.isInsideKakuriyo) {
      whisperLabel =
        status.userLanternCount > 0
          ? `CLICK WATER TO FLOAT A LANTERN · ${status.userLanternCount} LIT`
          : 'CLICK THE WATER TO FLOAT A LANTERN';
    } else {
      whisperLabel = 'CROSSING THE SACRED THRESHOLD';
    }
  } else if (status.isTransitioning) {
    whisperLabel = 'RETURNING TO THE MORTAL SHORE';
  }

  return (
    <div
      className={`ui-layer ${isDarkAtmosphere ? 'ui-dark' : 'ui-light'} ${
        ready ? 'ui-visible' : 'ui-hidden'
      }`}
    >
      {/* Ethereal Dimensional Mist Warp Veil as Camera Flies Through the Torii Portal */}
      <div ref={warpVeilRef} className="portal-warp-veil" />

      {/* Top-Left Minimalist Gold Emblem */}
      <div className="ui-brand" aria-label="Itsukushima">
        <span className="ui-kanji">厳島</span>
        <span className="ui-divider" />
        <span className="ui-sub">
          {status.isInsideKakuriyo ? 'KAKURIYO · HOKORA SANCTUARY' : 'ITSUKUSHIMA · UTSUSHIYO'}
        </span>
      </div>

      {/* Top-Center Pure Gold 4-Season Selector */}
      <nav
        className={`season-bar ${status.isToggledDark ? 'season-bar-hidden' : ''}`}
        data-ui-interactive="true"
        aria-label="Four Seasons of Miyajima"
      >
        {SEASONS.map((s) => {
          const isActive = status.season === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`season-pill ${isActive ? 'is-active' : ''}`}
              onClick={(e) => handleSelectSeason(e, s.id)}
            >
              <span className="season-kanji">{s.kanji}</span>
              <span className="season-label">{s.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Top-Right Minimal Sound Toggle */}
      <button
        type="button"
        className={`ui-sound-btn ${soundOn ? 'is-active' : ''}`}
        data-ui-interactive="true"
        onClick={handleToggleSound}
        aria-label={soundOn ? 'Mute ambient sound' : 'Enable ambient sound'}
        title={soundOn ? 'Sound On' : 'Sound Off'}
      >
        <span className="sound-bars">
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>

      {/* Dark-Mode Mystical Inscription inside Kakuriyo */}
      <div
        className={`dark-realm-verse ${showDarkVerse ? 'is-revealed' : ''}`}
        aria-hidden={!showDarkVerse}
      >
        <span className="dark-realm-kanji">幽 世 の 祠</span>
        <h1 className="dark-realm-title">
          Beyond the veil of mist, the ancient Hokora guards every silent prayer.
        </h1>
      </div>

      {/* Sacred Wish & Omikuji Modal Overlay (Single clean wish input, no name prompt, no public archive) */}
      {wishModalOpen && (
        <div
          className="oracle-backdrop"
          data-ui-interactive="true"
          onClick={() => {
            if (!dissolvingWish) {
              setWishModalOpen(false);
              setActiveBlessing(null);
            }
          }}
        >
          <div className="oracle-card" onClick={(e) => e.stopPropagation()}>
            {dissolvingWish ? (
              <div className="oracle-dissolve-stage">
                <span className="oracle-eyebrow">奉 納 · OFFERING ASCENDING TO HOKORA</span>
                <p className="oracle-dissolving-text">“{dissolvingWish}”</p>
              </div>
            ) : activeBlessing ? (
              <div className="oracle-blessing-stage">
                <span className="oracle-eyebrow">御 神 籤 · SACRED OMIKUJI</span>
                <div className="oracle-rank-kanji">{activeBlessing.rankKanji}</div>
                <div className="oracle-rank-sub">{activeBlessing.rankLabel}</div>
                <p className="oracle-verse">“{activeBlessing.verse}”</p>
                <p className="oracle-counsel">{activeBlessing.counsel}</p>
                <div className="oracle-form-actions">
                  <button
                    type="button"
                    className="oracle-submit-btn"
                    onClick={() => {
                      setWishModalOpen(false);
                      setActiveBlessing(null);
                    }}
                  >
                    RETURN TO SANCTUARY
                  </button>
                </div>
              </div>
            ) : (
              <form className="oracle-form" onSubmit={(e) => void handleReleaseWish(e)}>
                <span className="oracle-eyebrow">末 社 奉 納 · HOKORA SHRINE OFFERING</span>
                <h2 className="oracle-heading">Offer a Wish at the Hokora</h2>
                <p className="oracle-desc">
                  Panjatkan permohonan Anda. Lentera emas akan menghanyutkannya ke laut abadi dan kuil akan membalasnya dengan ramalan Omikuji.
                </p>
                <input
                  type="text"
                  maxLength={140}
                  value={wishText}
                  onChange={(e) => setWishText(e.target.value)}
                  placeholder="Tuliskan permohonan atau biarkan kosong untuk doa hening..."
                  className="oracle-input"
                  autoFocus
                />
                <div className="oracle-form-actions">
                  <button
                    type="button"
                    className="oracle-cancel-btn"
                    onClick={() => setWishModalOpen(false)}
                  >
                    CANCEL
                  </button>
                  <button type="submit" className="oracle-submit-btn">
                    RELEASE WISH
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Bottom Pure Floating Caption & Ritual Actions */}
      <div className="ui-bottom">
        {status.isInsideKakuriyo && (
          <div className="kakuriyo-actions" data-ui-interactive="true">
            <button type="button" className="ritual-action-btn is-gold" onClick={handleOpenWishModal}>
              <span>✦</span> MAKE A WISH · OMIKUJI
            </button>
            <button type="button" className="ritual-action-btn" onClick={handleReturnToUtsushiyo}>
              <span>⟲</span> RETURN THROUGH GATE
            </button>
          </div>
        )}

        <div className="ui-caption-group">
          <div className="portal-indicator-wrap">
            <div className="portal-filament-track">
              <div ref={filamentFillRef} className="portal-filament-fill" />
            </div>
            <span className="portal-whisper">{whisperLabel}</span>
          </div>

          <div className="ui-poetic-stack">
            <p className="ui-poetic-line is-shown">
              {isDarkAtmosphere
                ? 'Where floating lanterns carry silent prayers to the ancient Hokora.'
                : activeSeasonMeta.poetic}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
