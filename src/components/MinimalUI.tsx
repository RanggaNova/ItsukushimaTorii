import { useEffect, useState } from 'react';
import { experienceState, UIStatusSnapshot } from '../state/experienceState';
import { soundEngine } from '../audio/SoundEngine';

export function MinimalUI({ ready }: { ready: boolean }) {
  const [soundOn, setSoundOn] = useState(false);
  const [status, setStatus] = useState<UIStatusSnapshot>({
    portalStage: 0,
    progress: 0,
    isToggledDark: false,
    isFullyOpen: false,
    hasInteracted: false,
    isHoveringGate: false,
  });

  useEffect(() => {
    return experienceState.subscribe((snap) => {
      setStatus(snap);
    });
  }, []);

  const handleToggleSound = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const active = soundEngine.toggle();
    setSoundOn(active);
  };

  const isDarkAtmosphere = status.progress > 0.42;
  const showDarkVerse = status.progress > 0.38;

  const whisperLabel = status.isToggledDark
    ? status.isFullyOpen
      ? 'CLICK ONCE TO SEAL THE GATE'
      : 'THE VEIL IS PARTING'
    : status.progress > 0.04
    ? 'RETURNING TO THE MIST'
    : 'CLICK ONCE TO AWAKEN THE GATE';

  return (
    <div
      className={`ui-layer ${isDarkAtmosphere ? 'ui-dark' : 'ui-light'} ${
        ready ? 'ui-visible' : 'ui-hidden'
      }`}
    >
      {/* Top-Left Minimalist Emblem */}
      <div className="ui-brand" aria-label="Itsukushima">
        <span className="ui-kanji">厳島</span>
        <span className="ui-divider" />
        <span className="ui-sub">
          {isDarkAtmosphere ? 'KAKURIYO SANCTUARY' : 'SHINTO THRESHOLD'}
        </span>
      </div>

      {/* Top-Right Minimal Sound Toggle */}
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

      {/* Dark-Mode Mystical Inscription (Materializes ethereally in the night sky above the Torii) */}
      <div
        className={`dark-realm-verse ${showDarkVerse ? 'is-revealed' : ''}`}
        aria-hidden={!showDarkVerse}
      >
        <span className="dark-realm-kanji">幽 世 の 狭 間</span>
        <h1 className="dark-realm-title">
          Beyond the veil of mist, the unseen realm awakens.
        </h1>
      </div>

      {/* Bottom Minimalist Caption & Delicate Portal Indicator */}
      <div className="ui-bottom">
        <div className="portal-indicator-wrap">
          <div className="portal-filament-track">
            <div
              className="portal-filament-fill"
              style={{ transform: `scaleX(${status.progress.toFixed(3)})` }}
            />
          </div>
          <span className="portal-whisper">{whisperLabel}</span>
        </div>

        <div className="ui-poetic-stack">
          <p className={`ui-poetic-line ${!isDarkAtmosphere ? 'is-shown' : 'is-faded'}`}>
            Somewhere beyond the sea.
          </p>
          <p className={`ui-poetic-line ${isDarkAtmosphere ? 'is-shown' : 'is-faded'}`}>
            Where silent tides drift between two worlds.
          </p>
        </div>
      </div>
    </div>
  );
}
