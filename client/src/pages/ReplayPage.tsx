import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Dices, Pause, Play, ShieldCheck, ShieldAlert, ShieldX, SkipBack, SkipForward,
} from 'lucide-react';
import {
  INTEGRITY_LABELS, type GameEvent, type GameStateView, type ReplayData,
} from 'shared';
import { Shell } from '../components/Shell';
import { Board } from '../components/Board';
import { Avatar } from '../components/icons';
import { api } from '../api';
import { useToast } from '../context';

const SPEEDS = [0.5, 1, 2, 5, 10] as const;

/** Reconstitue une vue de plateau à partir d'un instantané du journal. */
function viewFromEvent(replay: ReplayData, event: GameEvent): GameStateView {
  const snap = event.snap;
  const ownership: GameStateView['ownership'] = {};
  for (const [tile, ownerIdx, houses, mortgaged] of snap.own) {
    const owner = replay.players[ownerIdx];
    if (owner) ownership[tile] = { owner: owner.id, houses, mortgaged: mortgaged === 1 };
  }
  return {
    roomId: 'replay',
    boardId: replay.board.id,
    settings: undefined as never, // non utilisé par le rendu du plateau
    players: replay.players.map((p, i) => ({
      id: p.id, name: p.name, avatar: p.avatar, color: p.color,
      cash: snap.cash[i] ?? 0, position: snap.pos[i] ?? 0,
      inPrison: false, prisonTurns: 0, jailCards: 0, bankrupt: false,
      connected: true, isBot: p.isBot, onVacation: false, rentImmunity: false,
    })),
    ownership,
    currentPlayer: replay.players[snap.cur]?.id ?? '',
    phase: 'roll',
    lastDice: null,
    doublesCount: 0,
    vacationPot: 0,
    pendingTile: null,
    auction: null,
    trades: [],
    turnNumber: event.turn,
    started: true,
    ended: false,
    winner: null,
  };
}

function IntegrityBadge({ status, score }: Readonly<{ status: string; score: number }>) {
  let Icon = ShieldX;
  if (status === 'verified') Icon = ShieldCheck;
  else if (status === 'partial') Icon = ShieldAlert;
  return (
    <span className={`chip integrity-${status}`} title={`Score d'intégrité : ${score}/100`}>
      <Icon size={13} /> {INTEGRITY_LABELS[status as keyof typeof INTEGRITY_LABELS] ?? status}
    </span>
  );
}

export function ReplayPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<ReplayData>(`/api/profile/replay/${id}`)
      .then(setReplay)
      .catch((e) => {
        toast(e instanceof Error ? e.message : 'Replay indisponible.');
        navigate('/profil');
      });
  }, [id]);

  const events = replay?.events ?? [];
  const current = events[index];

  // avance automatique : le délai réel entre deux actions, divisé par la vitesse
  useEffect(() => {
    if (!playing || events.length === 0) return;
    if (index >= events.length - 1) { setPlaying(false); return; }
    const realGap = Math.max(0, (events[index + 1]?.t ?? 0) - (events[index]?.t ?? 0));
    const delay = Math.min(2500, Math.max(220, realGap)) / speed;
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, events.length - 1)), delay);
    return () => clearTimeout(timer);
  }, [playing, index, speed, events]);

  // la ligne active reste visible dans la timeline
  useEffect(() => {
    timelineRef.current?.querySelector('.tl-event.active')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [index]);

  /** Événements groupés par tour, pour la timeline. */
  const turns = useMemo(() => {
    const map = new Map<number, { event: GameEvent; i: number }[]>();
    events.forEach((event, i) => {
      const list = map.get(event.turn) ?? [];
      list.push({ event, i });
      map.set(event.turn, list);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [events]);

  const jumpToTurn = useCallback((turn: number) => {
    const first = events.findIndex((e) => e.turn === turn);
    if (first >= 0) { setIndex(first); setPlaying(false); }
  }, [events]);

  if (!replay) {
    return <Shell wide><div className="center" style={{ height: 300 }}>
      <div className="loading-dice"><Dices size={54} color="var(--brand)" /></div>
    </div></Shell>;
  }

  const view = current ? viewFromEvent(replay, current) : null;
  const progress = events.length > 1 ? (index / (events.length - 1)) * 100 : 0;

  return (
    <Shell wide>
      <div className="replay-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/profil')}>← Profil</button>
        <div className="grow">
          <h1 style={{ fontSize: 22 }}>Replay — {replay.boardName}</h1>
          <p className="faint" style={{ fontSize: 13 }}>
            {new Date(replay.endedAt).toLocaleString('fr-FR')} · {replay.turns} tours ·
            vainqueur : <strong>{replay.winnerName}</strong>
          </p>
        </div>
        {replay.integrity && (
          <IntegrityBadge status={replay.integrity.status} score={replay.integrity.score} />
        )}
      </div>

      <div className="replay-grid">
        <div className="replay-board">
          {view && <Board board={replay.board} game={view}>
            <div className="board-center-content">
              <div className="replay-current">
                {current?.parts.map((p, i) => {
                  switch (p.t) {
                    case 'player': return <span key={p.id} style={{ color: p.color, fontWeight: 800 }}>{p.name} </span>;
                    case 'tile': return <strong key={`${p.t}-${p.name}`} className="log-tile">{p.name} </strong>;
                    case 'cash': return <span key={`${p.t}-${p.amount}`} className="cash">${p.amount} </span>;
                    default: return <span key={`${p.t}-${p.text}`}>{p.text} </span>;
                  }
                })}
              </div>
              <div className="replay-turn-badge">Tour {current?.turn ?? 0}</div>
            </div>
          </Board>}

          <div className="replay-controls panel">
            <div className="replay-scrub">
              <input
                type="range"
                min={0}
                max={Math.max(0, events.length - 1)}
                value={index}
                onChange={(e) => { setIndex(Number(e.target.value)); setPlaying(false); }}
                style={{ background: `linear-gradient(90deg, var(--brand) ${progress}%, var(--bg-3) ${progress}%)` }}
              />
              <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {index + 1} / {events.length}
              </span>
            </div>

            <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
              <button type="button" className="btn btn-ghost btn-sm" title="Début" onClick={() => { setIndex(0); setPlaying(false); }}>
                <SkipBack size={15} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" title="Action précédente"
                onClick={() => { setIndex((i) => Math.max(0, i - 1)); setPlaying(false); }}>
                <ChevronLeft size={15} />
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setPlaying((p) => !p)}>
                {playing ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Lecture</>}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" title="Action suivante"
                onClick={() => { setIndex((i) => Math.min(events.length - 1, i + 1)); setPlaying(false); }}>
                <ChevronRight size={15} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" title="Fin"
                onClick={() => { setIndex(events.length - 1); setPlaying(false); }}>
                <SkipForward size={15} />
              </button>

              <div className="segments" style={{ marginLeft: 8 }}>
                {SPEEDS.map((s) => (
                  <button type="button" key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>×{s}</button>
                ))}
              </div>
            </div>

            {view && (
              <div className="replay-players">
                {view.players.map((p) => (
                  <span key={p.id} className="player-pill" style={{ borderColor: p.color }}>
                    <Avatar id={p.avatar} color={p.color} size={20} />
                    <strong style={{ fontSize: 12 }}>{p.name}</strong>
                    <span className="cash" style={{ fontSize: 12 }}>${p.cash}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="panel replay-timeline" ref={timelineRef}>
          <h3 style={{ padding: '12px 14px 8px' }}>Déroulé de la partie</h3>
          {turns.map(([turn, list]) => (
            <div key={turn} className="tl-turn">
              <button type="button" className="tl-turn-head" onClick={() => jumpToTurn(turn)}>Tour {turn}</button>
              {list.map(({ event, i }) => (
                <button
                  key={event.seq}
                  className={`tl-event${i === index ? ' active' : ''}${i < index ? ' past' : ''}`}
                  type="button"
                  onClick={() => { setIndex(i); setPlaying(false); }}
                >
                  <span className={`tl-kind kind-${event.kind}`} />
                  <span className="tl-text">
                    {event.parts.map((p, k) => {
                      switch (p.t) {
                        case 'player': return <span key={p.id} style={{ color: p.color, fontWeight: 700 }}>{p.name} </span>;
                        case 'tile': return <strong key={`${p.t}-${p.name}`} className="log-tile">{p.name} </strong>;
                        case 'cash': return <span key={`${p.t}-${p.amount}`} className="cash">${p.amount} </span>;
                        default: return <span key={`${p.t}-${p.text}`}>{p.text} </span>;
                      }
                    })}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </aside>
      </div>
    </Shell>
  );
}
