import { useEffect, useRef } from 'react';
import type { LogEntry } from 'shared';
import { AvatarIcon } from './icons';

function partKey(entryId: number, part: LogEntry['parts'][number]) {
  if (part.t === 'player') return `${entryId}-${part.t}-${part.id}`;
  if (part.t === 'tile') return `${entryId}-${part.t}-${part.index}`;
  if (part.t === 'cash') return `${entryId}-${part.t}-${part.amount}`;
  return `${entryId}-${part.t}-${part.text}`;
}

interface GameLogProps {
  readonly logs: LogEntry[];
  readonly compact?: boolean;
}

export function GameLog({ logs, compact }: GameLogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  return (
    <div className={`game-log${compact ? ' compact' : ''}`} ref={ref}>
      {logs.map((entry) => (
        <div key={entry.id} className="log-entry">
          {entry.parts.map((p) => {
            const key = partKey(entry.id, p);
            switch (p.t) {
              case 'player':
                return (
                  <span key={key} className="log-player" style={{ color: p.color }}>
                    <span className="log-avatar"><AvatarIcon id={p.avatar} size={11} /></span>{p.name}
                  </span>
                );
              case 'tile':
                return <strong key={key} className="log-tile">{p.name}</strong>;
              case 'cash':
                return <span key={key} className="cash">${p.amount}</span>;
              default:
                return <span key={key}>{p.text}</span>;
            }
          })}
        </div>
      ))}
    </div>
  );
}
