import { useState } from 'react';
import { Monitor, Moon, Settings, Sun, Volume2, VolumeX } from 'lucide-react';
import { usePrefs, type ThemeChoice } from '../lib/prefs';
import { playSound, primeAudio } from '../lib/sound';

const THEMES: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'dark', label: 'Sombre', Icon: Moon },
  { value: 'light', label: 'Clair', Icon: Sun },
  { value: 'system', label: 'Système', Icon: Monitor },
];

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const prefs = usePrefs();

  return (
    <div className="settings-wrap">
      <button
        className={`btn btn-ghost btn-sm${open ? ' active-toggle' : ''}`}
        type="button"
        title="Réglages"
        onClick={() => { primeAudio(); setOpen((v) => !v); }}
      >
        <Settings size={15} />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="popover-backdrop"
            aria-label="Fermer les réglages"
            onClick={() => setOpen(false)}
          />
          <div className="settings-popover">
            <h4>Apparence</h4>
            <div className="settings-themes">
              {THEMES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={prefs.theme === value ? 'on' : ''}
                  onClick={() => prefs.set({ theme: value })}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            <h4 style={{ marginTop: 16 }}>Son</h4>
            <label className="toggle-row" style={{ padding: '6px 0' }}>
              <span className="row" style={{ gap: 8 }}>
                {prefs.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                <strong style={{ fontSize: 13 }}>Bruitages</strong>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={prefs.sound}
                onChange={(e) => {
                  prefs.set({ sound: e.target.checked });
                  if (e.target.checked) { primeAudio(); setTimeout(() => playSound('click'), 30); }
                }}
              />
            </label>
            <label className="settings-volume">
              <span className="faint">Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(prefs.volume * 100)}
                disabled={!prefs.sound}
                onChange={(e) => prefs.set({ volume: Number(e.target.value) / 100 })}
                onMouseUp={() => prefs.sound && playSound('click')}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
