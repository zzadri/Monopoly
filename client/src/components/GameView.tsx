import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDef, ChatMessage, GameStateView, LogEntry, RoomView } from 'shared';
import {
  Crown, Dices, Handshake, Lock, LogOut, MessageCircle, Skull, Ticket, TreePalm, Trophy, Users, Wallet, WifiOff,
} from 'lucide-react';
import { useAuth, useToast } from '../context';
import { emitAck } from '../socket';
import { Board } from './Board';
import { Dice } from './Dice';
import { Chat } from './Chat';
import { GameLog } from './GameLog';
import { TileModal } from './TileModal';
import { TradeModal } from './TradeModal';
import { EndScreen } from './EndScreen';
import { Avatar, BoardIcon, FlagIcon, Houses, TileTypeIcon } from './icons';
import { playSound } from '../lib/sound';
import { SettingsButton } from './Settings';
import type { CardPopup, EndSummary } from '../pages/RoomPage';

/**
 * Anime les pions case par case, avec une file d'attente par joueur : quand le
 * serveur envoie plusieurs positions successives (atterrir sur « Allez en
 * prison » puis rejoindre la prison), le pion parcourt chaque trajet à la
 * suite au lieu de se téléporter.
 */
function useAnimatedPositions(game: GameStateView, boardSize: number, onStep: () => void): Record<string, number> {
  const [anim, setAnim] = useState<Record<string, number>>({});
  const shown = useRef<Record<string, number>>({});
  const queues = useRef<Record<string, number[]>>({});
  const running = useRef<Record<string, boolean>>({});
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const stepRef = useRef(onStep);
  stepRef.current = onStep;

  const posKey = game.players.map((p) => `${p.id}:${p.position}`).join(',');

  useEffect(() => {
    const drain = (id: string) => {
      const queue = queues.current[id];
      if (!queue || queue.length === 0) { running.current[id] = false; return; }
      running.current[id] = true;
      const target = queue[0];
      const from = shown.current[id] ?? target;
      if (from === target) { queue.shift(); drain(id); return; }

      // sens horaire par défaut ; on recule si c'est nettement plus court
      const forward = (target - from + boardSize) % boardSize;
      const backward = boardSize - forward;
      const dir = backward < forward && backward <= 3 ? -1 : 1;
      const steps = dir === 1 ? forward : backward;
      // les longs trajets accélèrent pour rester sous ~1,6 s
      const stepMs = Math.max(45, Math.min(150, Math.round(1600 / steps)));

      let cur = from;
      const tick = () => {
        cur = ((cur + dir) % boardSize + boardSize) % boardSize;
        shown.current[id] = cur;
        setAnim((a) => ({ ...a, [id]: cur }));
        stepRef.current();
        if (cur === target) {
          queue.shift();
          const t = setTimeout(() => drain(id), 220); // pause entre deux trajets
          timers.current.add(t);
        } else {
          const t = setTimeout(tick, stepMs);
          timers.current.add(t);
        }
      };
      const t = setTimeout(tick, stepMs);
      timers.current.add(t);
    };

    for (const p of game.players) {
      if (shown.current[p.id] === undefined) {
        // première apparition : pas d'animation
        shown.current[p.id] = p.position;
        setAnim((a) => ({ ...a, [p.id]: p.position }));
        queues.current[p.id] = [];
        continue;
      }
      const queue = (queues.current[p.id] ??= []);
      const last = queue.length > 0 ? queue[queue.length - 1] : shown.current[p.id];
      if (last !== p.position) queue.push(p.position);
      if (!running.current[p.id]) drain(p.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, boardSize]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return anim;
}

export function GameView({ room, game, board, logs, chat, rolling, card, endSummary, onSendChat, onLeave }: {
  room: RoomView;
  game: GameStateView;
  board: BoardDef;
  logs: LogEntry[];
  chat: ChatMessage[];
  rolling: { playerId: string; values: number[] } | null;
  card: CardPopup | null;
  endSummary: EndSummary | null;
  onSendChat: (text: string) => void;
  onLeave: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const me = game.players.find((p) => p.id === user?.id);
  const current = game.players.find((p) => p.id === game.currentPlayer);
  const myTurn = game.currentPlayer === user?.id;
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [bidInput, setBidInput] = useState(0);
  const [now, setNow] = useState(Date.now());

  const animPositions = useAnimatedPositions(game, board.tiles.length, useCallback(() => playSound('move'), []));

  // ---- bruitages : on réagit aux changements d'état de la partie ----
  const prevCash = useRef<number | undefined>(me?.cash);
  useEffect(() => {
    if (me?.cash === undefined) return;
    const before = prevCash.current;
    prevCash.current = me.cash;
    if (before === undefined || before === me.cash) return;
    playSound(me.cash > before ? 'cash-in' : 'cash-out');
  }, [me?.cash]);

  const prevTurn = useRef<string>('');
  useEffect(() => {
    if (game.currentPlayer === prevTurn.current) return;
    prevTurn.current = game.currentPlayer;
    if (game.currentPlayer === user?.id && game.started && !game.ended) playSound('yourTurn');
  }, [game.currentPlayer, game.started, game.ended, user?.id]);

  const prevPrison = useRef(false);
  useEffect(() => {
    if (!me) return;
    if (me.inPrison && !prevPrison.current) playSound('prison');
    prevPrison.current = me.inPrison;
  }, [me?.inPrison, me]);

  useEffect(() => { if (rolling) playSound('dice'); }, [rolling]);
  useEffect(() => { if (card) playSound('card'); }, [card]);
  useEffect(() => {
    if (!endSummary) return;
    playSound(endSummary.players.some((p) => p.won && p.name === user?.username) ? 'win' : 'lose');
  }, [endSummary, user?.username]);

  const isMobile = useMediaQuery('(max-width: 1100px)');
  useEffect(() => {
    if (isMobile) { setLeftOpen(false); setRightOpen(false); }
  }, [isMobile]);

  useEffect(() => {
    if (!game.auction) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [game.auction]);

  const act = (event: string, payload?: unknown) => {
    void emitAck(event, payload).then((r) => r.error && toast(r.error));
  };

  const myProps = useMemo(() => {
    if (!user) return [];
    return Object.entries(game.ownership)
      .filter(([, o]) => o.owner === user.id)
      .map(([idx]) => Number(idx))
      .sort((a, b) => a - b);
  }, [game.ownership, user]);

  const pendingTrades = game.trades.filter((t) => t.to === user?.id);
  const auctionTile = game.auction ? board.tiles[game.auction.tile] : null;
  const auctionRemaining = game.auction ? Math.max(0, Math.ceil((game.auction.endsAt - now) / 1000)) : 0;
  const pendingTileDef = game.pendingTile !== null ? board.tiles[game.pendingTile] : null;
  const myCard = card && card.playerId === user?.id ? card : null;

  const diceValues = rolling?.values ?? game.lastDice?.values ?? Array.from({ length: game.settings.dice.count }, () => game.settings.dice.sides);

  return (
    <div className="game-page">
      <header className="game-topbar">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={onLeave} title="Quitter la partie"><LogOut size={15} /></button>
          <span className="chip"><BoardIcon icon={board.icon} size={13} /> {board.name}</span>
        </div>

        {me && (
          <div className="my-cash" title="Votre argent">
            <Wallet size={17} />
            <span className="cash" style={{ fontSize: 17 }}>${me.cash}</span>
          </div>
        )}

        <div className="row" style={{ gap: 6 }}>
          <SettingsButton />
          <button className={`btn btn-ghost btn-sm${leftOpen ? ' active-toggle' : ''}`} onClick={() => setLeftOpen(!leftOpen)} title="Discussion">
            <MessageCircle size={15} />
          </button>
          <button className={`btn btn-ghost btn-sm${rightOpen ? ' active-toggle' : ''}`} onClick={() => setRightOpen(!rightOpen)} title="Joueurs et propriétés">
            <Users size={15} />
          </button>
        </div>
      </header>

      {!rightOpen && (
        <div className="players-strip">
          {game.players.map((p) => (
            <span key={p.id} className={`player-pill${p.id === game.currentPlayer ? ' current' : ''}${p.bankrupt ? ' bankrupt' : ''}`} style={{ borderColor: p.color }}>
              <Avatar id={p.avatar} color={p.color} size={20} />
              <span className="cash" style={{ fontSize: 13 }}>{p.bankrupt ? '—' : `$${p.cash}`}</span>
            </span>
          ))}
        </div>
      )}

      <div className={`game-layout${leftOpen ? ' left-open' : ''}${rightOpen ? ' right-open' : ''}`}>
        {/* -------- gauche : chat -------- */}
        <aside className={`game-side left${leftOpen ? ' open' : ''}`}>
          <div className="panel grow" style={{ display: 'flex', minHeight: 0 }}>
            <Chat messages={chat} onSend={onSendChat} />
          </div>
        </aside>

        {/* -------- plateau -------- */}
        <section className="game-board-wrap">
          <Board board={board} game={game} positions={animPositions} meId={user?.id} onTileClick={setSelectedTile}>
            <div className="board-center-content">
              {endSummary ? (
                <div className="center-note row" style={{ gap: 8, justifyContent: 'center' }}>
                  <Trophy size={22} color="var(--gold)" /> Partie terminée
                </div>
              ) : game.auction && auctionTile ? (
                <div className="auction-box">
                  <h3>Enchère</h3>
                  <p><strong>{auctionTile.name}</strong></p>
                  <p className="auction-timer">{auctionRemaining}s</p>
                  <p className="muted">
                    {game.auction.highestBidder
                      ? <>Meilleure offre : <span className="cash">${game.auction.highestBid}</span> par {game.players.find((p) => p.id === game.auction!.highestBidder)?.name}</>
                      : 'Aucune offre pour le moment'}
                  </p>
                  {me && !me.bankrupt && (
                    <div className="row wrap" style={{ justifyContent: 'center' }}>
                      {[10, 50, 100].map((inc) => (
                        <button
                          key={inc}
                          className="btn btn-primary btn-sm"
                          disabled={game.auction!.highestBid + inc > me.cash}
                          onClick={() => act('game:bid', { amount: game.auction!.highestBid + inc })}
                        >
                          +${inc}
                        </button>
                      ))}
                      <input
                        type="number"
                        style={{ width: 90 }}
                        min={game.auction.highestBid + 1}
                        value={bidInput || ''}
                        placeholder="$"
                        onChange={(e) => setBidInput(Number(e.target.value))}
                      />
                      <button className="btn btn-gold btn-sm" onClick={() => act('game:bid', { amount: bidInput })}>Miser</button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Dice values={diceValues} sides={game.settings.dice.sides} animating={!!rolling} />
                  <div className="turn-banner">
                    {current && (
                      <span className="row" style={{ gap: 7, justifyContent: 'center' }}>
                        <Avatar id={current.avatar} color={current.color} size={24} />
                        <strong style={{ color: current.color }}>{current.name}</strong>
                        {myTurn ? ' — à vous de jouer !' : ' joue…'}
                      </span>
                    )}
                  </div>

                  {myTurn && !endSummary && (
                    <div className="action-bar">
                      {game.phase === 'roll' && me?.inPrison && (
                        <>
                          <span className="chip"><Lock size={12} /> En prison ({me.prisonTurns}/3)</span>
                          <button className="btn btn-ghost btn-sm" disabled={me.cash < 50} onClick={() => act('game:payBail')}>Payer $50</button>
                          {me.jailCards > 0 && (
                            <button className="btn btn-ghost btn-sm" onClick={() => act('game:useJailCard')}>
                              <Ticket size={13} /> Utiliser une carte
                            </button>
                          )}
                        </>
                      )}
                      {game.phase === 'roll' && (
                        <button className="btn btn-primary btn-lg roll-btn" onClick={() => act('game:roll')}>
                          <Dices size={19} /> Lancer les dés
                        </button>
                      )}
                      {game.phase === 'buy' && pendingTileDef && 'price' in pendingTileDef && (
                        <div className="col" style={{ alignItems: 'center', gap: 8 }}>
                          <p>Acheter <strong>{pendingTileDef.name}</strong> pour <span className="cash">${pendingTileDef.price}</span> ?</p>
                          <div className="row">
                            <button className="btn btn-gold" disabled={(me?.cash ?? 0) < pendingTileDef.price} onClick={() => act('game:buy')}>Acheter</button>
                            <button className="btn btn-ghost" onClick={() => act('game:skipBuy')}>
                              {game.settings.rules.auction ? 'Passer (enchère)' : 'Passer'}
                            </button>
                          </div>
                        </div>
                      )}
                      {game.phase === 'debt' && (
                        <div className="col" style={{ alignItems: 'center', gap: 8 }}>
                          <p className="error-text">Solde négatif : <span className="cash">${me?.cash}</span></p>
                          <p className="muted" style={{ fontSize: 13 }}>Vendez des maisons ou hypothéquez via vos propriétés, ou déclarez faillite.</p>
                          <div className="row">
                            <button className="btn btn-ghost btn-sm" disabled={(me?.cash ?? 0) < 0} onClick={() => act('game:endTurn')}>Continuer</button>
                            <button className="btn btn-danger btn-sm" onClick={() => confirm('Déclarer faillite ? Cette action est définitive.') && act('game:bankrupt')}>
                              <Skull size={13} /> Faillite
                            </button>
                          </div>
                        </div>
                      )}
                      {game.phase === 'end' && (
                        <button className="btn btn-primary" onClick={() => act('game:endTurn')}>
                          {game.lastDice?.isDouble ? 'Rejouer (double !)' : 'Terminer le tour'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="center-log">
                <GameLog logs={logs} compact />
              </div>

              {game.settings.rules.vacationCash && (
                <div className="vacation-pot" title="Cagnotte de vacances">
                  <TreePalm size={14} /> <span className="cash">${game.vacationPot}</span>
                </div>
              )}
            </div>
          </Board>

          {myCard && (
            <div className={`card-popup ${myCard.deck}`}>
              <div className="card-popup-head">{myCard.deck === 'treasure' ? '💎 Trésor' : '❓ Surprise'}</div>
              <p>{myCard.text}</p>
            </div>
          )}
        </section>

        {/* -------- droite : joueurs + propriétés -------- */}
        <aside className={`game-side right${rightOpen ? ' open' : ''}`}>
          <div className="panel panel-pad">
            <h3 style={{ marginBottom: 10 }}>Joueurs</h3>
            <div className="col" style={{ gap: 6 }}>
              {game.players.map((p) => (
                <div key={p.id} className={`player-row${p.id === game.currentPlayer ? ' current' : ''}${p.bankrupt ? ' bankrupt' : ''}`} style={{ borderColor: p.color + '66' }}>
                  <Avatar id={p.avatar} color={p.color} size={32} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 5 }}>
                      <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</strong>
                      {room.hostId === p.id && <Crown size={13} color="var(--gold)" aria-label="Hôte" />}
                      {p.inPrison && <Lock size={13} aria-label="En prison" />}
                      {p.onVacation && <TreePalm size={13} aria-label="En vacances" />}
                      {!p.connected && !p.isBot && <WifiOff size={13} color="var(--red)" aria-label="Déconnecté" />}
                    </div>
                    {p.jailCards > 0 && (
                      <span className="faint row" style={{ fontSize: 11, gap: 3 }}><Ticket size={11} /> ×{p.jailCards}</span>
                    )}
                  </div>
                  <span className="cash">{p.bankrupt ? <Skull size={15} /> : `$${p.cash}`}</span>
                </div>
              ))}
            </div>
            {me && !me.bankrupt && !endSummary && (
              <div className="row" style={{ marginTop: 12, gap: 8 }}>
                <button className="btn btn-ghost btn-sm grow" onClick={() => setTradeOpen(true)}>
                  <Handshake size={14} /> Échanger
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  title="Déclarer faillite"
                  onClick={() => confirm('Déclarer faillite et quitter la partie ?') && act('game:bankrupt')}
                ><Skull size={14} /></button>
              </div>
            )}
          </div>

          {pendingTrades.length > 0 && (
            <div className="panel panel-pad trade-alerts">
              <h3 style={{ marginBottom: 8 }}>Propositions d'échange</h3>
              {pendingTrades.map((t) => {
                const from = game.players.find((p) => p.id === t.from);
                return (
                  <div key={t.id} className="trade-offer">
                    <p style={{ fontSize: 13 }}>
                      <strong style={{ color: from?.color }}>{from?.name}</strong> propose :{' '}
                      {t.offerCash > 0 && <span className="cash">${t.offerCash}</span>}{' '}
                      {t.offerProps.map((i) => board.tiles[i]?.name).join(', ')}
                      {' '}contre{' '}
                      {t.requestCash > 0 && <span className="cash">${t.requestCash}</span>}{' '}
                      {t.requestProps.map((i) => board.tiles[i]?.name).join(', ')}
                    </p>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => act('game:tradeRespond', { tradeId: t.id, accept: true })}>Accepter</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => act('game:tradeRespond', { tradeId: t.id, accept: false })}>Refuser</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="panel panel-pad grow" style={{ overflowY: 'auto', minHeight: 0 }}>
            <h3 style={{ marginBottom: 10 }}>Mes propriétés ({myProps.length})</h3>
            {myProps.length === 0 && <p className="faint">Aucune propriété pour l'instant.</p>}
            <div className="col" style={{ gap: 4 }}>
              {myProps.map((idx) => {
                const t = board.tiles[idx];
                const o = game.ownership[idx];
                const group = t.type === 'property' ? board.groups.find((g) => g.id === t.group) : null;
                return (
                  <button key={idx} className="prop-row" onClick={() => setSelectedTile(idx)}>
                    {/* propriété : drapeau/image du groupe ; aéroport et compagnie : leur propre icône */}
                    {t.type === 'property'
                      ? <FlagIcon flag={group?.flag} image={group?.image} color={group?.color} size={13} />
                      : <span className="prop-row-icon"><TileTypeIcon tile={t} size={14} /></span>}
                    <span className="grow" style={{ textAlign: 'left' }}>{t.name}</span>
                    {o.mortgaged && <Lock size={12} aria-label="Hypothéquée" />}
                    <Houses count={o.houses} size={12} />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {selectedTile !== null && (
        <TileModal
          board={board}
          game={game}
          tileIndex={selectedTile}
          onClose={() => setSelectedTile(null)}
          onAction={act}
        />
      )}
      {tradeOpen && me && (
        <TradeModal board={board} game={game} me={me} onClose={() => setTradeOpen(false)} onAction={act} />
      )}
      {endSummary && <EndScreen summary={endSummary} isHost={room.hostId === user?.id} onLeave={onLeave} />}
    </div>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
