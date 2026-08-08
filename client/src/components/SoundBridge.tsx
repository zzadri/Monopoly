import { useEffect } from 'react';
import { usePrefs } from '../lib/prefs';
import { configureSound, primeAudio } from '../lib/sound';

/** Applique les préférences audio et débloque le contexte au premier geste. */
export function SoundBridge() {
  const { sound, volume } = usePrefs();

  useEffect(() => {
    configureSound(sound, volume);
  }, [sound, volume]);

  useEffect(() => {
    const unlock = () => primeAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  return null;
}
