/**
 * Bruitages synthétisés via l'API Web Audio.
 *
 * Aucun fichier audio n'est chargé : tout est généré à la volée, ce qui évite
 * des dépendances binaires et reste compatible avec la CSP stricte du serveur.
 */

export type SoundName =
  | 'dice' | 'move' | 'buy' | 'cash-in' | 'cash-out'
  | 'card' | 'prison' | 'yourTurn' | 'win' | 'lose' | 'click';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = lastVolume;
    master.connect(ctx.destination);
  }
  // les navigateurs suspendent le contexte tant qu'il n'y a pas d'interaction
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function configureSound(on: boolean, volume: number) {
  enabled = on;
  if (master) master.gain.value = volume;
  lastVolume = volume;
}

/** volume mémorisé, appliqué à la création différée du contexte audio */
let lastVolume = 0.6;

/** Réveille le contexte audio au premier geste de l'utilisateur. */
export function primeAudio() {
  audio();
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** fréquence finale pour un glissando */
  slideTo?: number;
  delay?: number;
}

function tone({ freq, duration, type = 'sine', gain = 0.25, slideTo, delay = 0 }: ToneOptions) {
  const ac = audio();
  if (!ac || !master) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration);
  // enveloppe douce : attaque courte, extinction exponentielle
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(env).connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Bruit blanc filtré — pour le roulement des dés. */
function noise(duration: number, gain = 0.15, delay = 0) {
  const ac = audio();
  if (!ac || !master) return;
  const frames = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // décroissance pour imiter des dés qui s'immobilisent
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    data[i] = ((bytes[0] / 0xffffffff) * 2 - 1) * (1 - i / frames) ** 2;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1600;
  const env = ac.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(master);
  src.start(ac.currentTime + delay);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  switch (name) {
    case 'dice':
      noise(0.5, 0.18);
      tone({ freq: 180, duration: 0.09, type: 'square', gain: 0.08, delay: 0.42 });
      break;
    case 'move':
      tone({ freq: 620, duration: 0.05, type: 'triangle', gain: 0.09 });
      break;
    case 'buy':
      tone({ freq: 523, duration: 0.1, type: 'triangle', gain: 0.2 });
      tone({ freq: 784, duration: 0.16, type: 'triangle', gain: 0.2, delay: 0.09 });
      break;
    case 'cash-in':
      tone({ freq: 880, duration: 0.09, type: 'sine', gain: 0.18 });
      tone({ freq: 1320, duration: 0.14, type: 'sine', gain: 0.14, delay: 0.07 });
      break;
    case 'cash-out':
      tone({ freq: 420, duration: 0.16, type: 'sawtooth', gain: 0.12, slideTo: 180 });
      break;
    case 'card':
      noise(0.18, 0.1);
      tone({ freq: 700, duration: 0.12, type: 'triangle', gain: 0.14, delay: 0.06 });
      break;
    case 'prison':
      tone({ freq: 300, duration: 0.22, type: 'square', gain: 0.13, slideTo: 90 });
      tone({ freq: 140, duration: 0.3, type: 'sawtooth', gain: 0.1, delay: 0.16 });
      break;
    case 'yourTurn':
      tone({ freq: 660, duration: 0.11, type: 'sine', gain: 0.16 });
      tone({ freq: 990, duration: 0.18, type: 'sine', gain: 0.14, delay: 0.1 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) =>
        tone({ freq: f, duration: 0.28, type: 'triangle', gain: 0.2, delay: i * 0.12 }));
      break;
    case 'lose':
      [400, 330, 260].forEach((f, i) =>
        tone({ freq: f, duration: 0.26, type: 'sawtooth', gain: 0.12, delay: i * 0.14 }));
      break;
    case 'click':
      tone({ freq: 520, duration: 0.04, type: 'square', gain: 0.06 });
      break;
  }
}
