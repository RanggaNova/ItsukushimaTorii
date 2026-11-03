import { useEffect, useRef, useState } from 'react';
import { experienceState, SeasonId, UIStatusSnapshot } from '../state/experienceState';
import { LangId, SCROLL_STAGES } from '../data/toriiPartsData';
import { soundEngine } from '../audio/SoundEngine';

const SEASONS: { id: SeasonId; kanji: string; label: string }[] = [
  { id: 'haru', kanji: '春', label: 'HARU' },
  { id: 'natsu', kanji: '夏', label: 'NATSU' },
  { id: 'aki', kanji: '秋', label: 'AKI' },
  { id: 'fuyu', kanji: '冬', label: 'FUYU' },
];

export function MinimalUI({ ready }: { ready: boolean }) {
  const [lang, setLang] = useState<LangId>('id');
  const [soundOn, setSoundOn] = useState(false);

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
    activeStageIndex: 0,
    activeChapter: 'hero',
  });

  useEffect(() => {
    return experienceState.subscribe((snap) => {
      setStatus(snap);
    });
  }, []);

  // Direct 60fps zero-re-render DOM sync for warp veil & scroll progress bar
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

      const s = Math.round(experienceState.scrollProgress * 1000) / 1000;
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

  const handleToggleLang = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setLang((prev) => (prev === 'id' ? 'en' : 'id'));
    soundEngine.triggerPartFocusSound();
  };

  const handleSelectSeason = (e: React.MouseEvent<HTMLButtonElement>, id: SeasonId) => {
    e.stopPropagation();
    experienceState.setSeason(id);
    soundEngine.triggerSeasonChime(id);
  };

  const handleDotClick = (e: React.MouseEvent<HTMLButtonElement>, idx: number) => {
    e.stopPropagation();
    if (idx === 1) {
      soundEngine.triggerTimberTransform(true);
    } else if (idx === 7) {
      soundEngine.triggerTimberTransform(false);
    } else if (idx === 8) {
      soundEngine.triggerDimensionalPulse();
    } else {
      soundEngine.triggerPartFocusSound();
    }
    experienceState.scrollToStage(idx);
  };

  const handleStartExplore = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    soundEngine.triggerTimberTransform(true);
    experienceState.scrollToStage(1);
  };

  const handleWhatsAppClick = () => {
    experienceState.triggerMessageCelebration();
    soundEngine.triggerLanternBell(true);
  };

  const handleReturnToAssembly = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    experienceState.returnToUtsushiyo();
    soundEngine.triggerDimensionalPulse();
  };

  const isDarkAtmosphere =
    status.isToggledDark || status.portalStage >= 3 || status.isInsideKakuriyo;
  const activeStage = SCROLL_STAGES[status.activeStageIndex] || SCROLL_STAGES[0];
  const isAtHero = status.activeStageIndex === 0;
  const isAtSanctuary =
    status.activeStageIndex === SCROLL_STAGES.length - 1 && status.isInsideKakuriyo;

  let whisperLabel =
    lang === 'id' ? 'GULIR KE BAWAH UNTUK MEMBEDAH ANATOMI' : 'SCROLL DOWN TO EXPLORE ANATOMY';

  if (status.activeStageIndex >= 1 && status.activeStageIndex <= 6) {
    whisperLabel =
      lang === 'id' ? 'GULIR PERLAHAN UNTUK MELANJUTKAN' : 'SCROLL GENTLY TO CONTINUE';
  } else if (status.activeStageIndex === 7) {
    whisperLabel =
      lang === 'id'
        ? 'GULIR LAGI UNTUK MENEMBUS GERBANG MENUJU HOKORA'
        : 'SCROLL FURTHER TO ENTER THE HOKORA SANCTUARY';
  } else if (status.activeStageIndex === 8) {
    whisperLabel =
      lang === 'id'
        ? 'GESER LENTERA DI ATAS AIR · KLIK TOMBOL UNTUK HUBUNGI WHATSAPP'
        : 'DRAG LANTERNS ON THE WATER · CLICK BUTTON TO CHAT ON WHATSAPP';
  }

  const waPrefill = encodeURIComponent(
    lang === 'id'
      ? 'Halo! Saya berkunjung dari website Itsukushima Torii dan ingin terhubung / berkolaborasi.'
      : 'Hello! I am reaching out from the Itsukushima Torii website to connect / collaborate.'
  );
  const waUrl = `https://wa.me/62881026711738?text=${waPrefill}`;

  return (
    <div
      className={`ui-layer ${isDarkAtmosphere ? 'ui-dark' : 'ui-light'} ${
        ready ? 'ui-visible' : 'ui-hidden'
      }`}
    >
      {/* Ethereal Dimensional Mist Warp Veil as Camera Flies Through the Torii Portal */}
      <div ref={warpVeilRef} className="portal-warp-veil" />

      {/* Top-Left Minimalist Gold Emblem */}
      <div
        className="ui-brand"
        data-ui-interactive="true"
        onClick={(e) => handleDotClick(e as unknown as React.MouseEvent<HTMLButtonElement>, 0)}
        role="button"
        tabIndex={0}
        aria-label="Itsukushima"
      >
        <span className="ui-kanji">厳島</span>
        <span className="ui-divider" />
        <span className="ui-sub">ITSUKUSHIMA</span>
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

      {/* Top-Right Minimal Controls: Language + Sound */}
      <div className="ui-top-right" data-ui-interactive="true">
        <button
          type="button"
          className="ui-lang-btn"
          onClick={handleToggleLang}
          title={lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
        >
          <span className={lang === 'id' ? 'is-active-lang' : ''}>ID</span>
          <span className="lang-sep">/</span>
          <span className={lang === 'en' ? 'is-active-lang' : ''}>EN</span>
        </button>

        <button
          type="button"
          className={`ui-sound-btn ${soundOn ? 'is-active' : ''}`}
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
      </div>

      {/* Right-Edge Minimal Vertical Scroll Dots */}
      <nav className="scroll-rail" data-ui-interactive="true" aria-label="Scroll Chapters">
        {SCROLL_STAGES.map((st, idx) => {
          const isActive = status.activeStageIndex === idx;
          return (
            <button
              key={st.id}
              type="button"
              className={`rail-dot ${isActive ? 'is-active' : ''}`}
              onClick={(e) => handleDotClick(e, idx)}
              title={`${st.stepCode} · ${st.title[lang]}`}
              aria-label={st.title[lang]}
            >
              <span className="rail-dot-pip" />
            </button>
          );
        })}
      </nav>

      {/* Bottom Pure Floating Editorial Typography */}
      <div className="ui-bottom">
        {isAtSanctuary && (
          <div className="kakuriyo-actions" data-ui-interactive="true">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ritual-action-btn is-gold"
              onClick={handleWhatsAppClick}
              title="Hubungi via WhatsApp (0881026711738)"
            >
              <span>✦</span>{' '}
              {lang === 'id' ? 'GET IN TOUCH · WHATSAPP' : 'GET IN TOUCH · WHATSAPP'}
            </a>
            <button type="button" className="ritual-action-btn" onClick={handleReturnToAssembly}>
              <span>↑</span> {lang === 'id' ? 'KEMBALI KE GERBANG' : 'RETURN TO GATE'}
            </button>
          </div>
        )}

        <div key={activeStage.id} className={`editorial-stage ${isAtHero ? 'is-hero' : ''}`}>
          <span className="editorial-eyebrow">{activeStage.eyebrow[lang]}</span>
          <h1 className="editorial-title">{activeStage.title[lang]}</h1>
          <p className="editorial-caption">{activeStage.caption[lang]}</p>

          {isAtHero && (
            <button
              type="button"
              className="hero-explore-btn"
              data-ui-interactive="true"
              onClick={handleStartExplore}
            >
              <span>✦</span>
              <span>
                {lang === 'id'
                  ? 'JELAJAHI RAHASIA ARSITEKTUR'
                  : 'EXPLORE THE ARCHITECTURE'}
              </span>
              <span className="hero-arrow">↓</span>
            </button>
          )}
        </div>

        <div className="portal-indicator-wrap">
          <div className="portal-filament-track">
            <div ref={filamentFillRef} className="portal-filament-fill" />
          </div>
          <span className="portal-whisper">{whisperLabel}</span>
        </div>
      </div>
    </div>
  );
}
