import { useEffect, useState } from 'react';

/** Pips d'un dé à 6 faces (positions en pourcentage). */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 25], [70, 25], [30, 50], [70, 50], [30, 75], [70, 75]],
};

interface DieFaceProps {
  readonly value: number;
  readonly sides: number;
}

function DieFace({ value, sides }: DieFaceProps) {
  if (sides === 6 && PIPS[value]) {
    return (
      <div className="die-face">
        {PIPS[value].map(([x, y]) => (
          <span key={`${x}-${y}`} className="pip" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
      </div>
    );
  }
  return <div className="die-face die-number">{value}</div>;
}

interface DiceProps {
  readonly values: number[];
  readonly sides: number;
  readonly animating: boolean;
}

function randomDieValue(sides: number) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return 1 + (bytes[0] % sides);
}

export function Dice({ values, sides, animating }: DiceProps) {
  const [shown, setShown] = useState(values);
  const dieClass = sides !== 6 ? ` die-d${sides}` : '';

  useEffect(() => {
    if (!animating) { setShown(values); return; }
    // fait défiler des valeurs aléatoires pendant l'animation
    const interval = setInterval(() => {
      setShown(values.map(() => randomDieValue(sides)));
    }, 90);
    const stop = setTimeout(() => {
      clearInterval(interval);
      setShown(values);
    }, 900);
    return () => { clearInterval(interval); clearTimeout(stop); };
  }, [values, sides, animating]);

  return (
    <div className={`dice-row${animating ? ' rolling' : ''}`}>
      {shown.map((v, i) => (
        <div
          key={`${sides}-${v}-${i}`}
          className={`die${dieClass}`}
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <DieFace value={v} sides={sides} />
        </div>
      ))}
    </div>
  );
}
