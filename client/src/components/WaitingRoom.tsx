import { useEffect, useState } from 'react';
import { Bot, Check, Copy, Crown, Rocket, WifiOff, X } from 'lucide-react';
import type { ChatMessage, GameSettings, RoomView } from 'shared';
import { useAuth, useToast } from '../context';
import { emitAck } from '../socket';
import { api } from '../api';
import { Chat } from './Chat';
import { Avatar, BoardIcon } from './icons';

interface MapMeta {
  id: string;
  name: string;
  icon: string;
  description: string;
  tileCount: number;
  ownerName: string;
}

const CASH_OPTIONS = [500, 1000, 1500, 2000, 3000] as const;

const RULES: { key: keyof GameSettings['rules']; label: string; hint: string }[] = [
  { key: 'doubleRentFullSet', label: 'Loyer x2 sur groupe complet', hint: 'Le loyer de base est doublé si le joueur possède le groupe entier.' },
  { key: 'vacationCash', label: 'Cagnotte de vacances', hint: 'Les taxes alimentent une cagnotte remportée en atterrissant sur Vacances.' },
  { key: 'auction', label: 'Enchères', hint: 'Une propriété refusée est vendue aux enchères au plus offrant.' },
  { key: 'noRentInPrison', label: 'Pas de loyer en prison', hint: 'Les propriétaires emprisonnés ne perçoivent pas de loyers.' },
  { key: 'mortgage', label: 'Hypothèques', hint: 'Hypothéquez vos propriétés pour récupérer 50 % de leur prix.' },
  { key: 'evenBuild', label: 'Construction équilibrée', hint: 'Les maisons doivent être construites et vendues uniformément.' },
  { key: 'randomizeOrder', label: 'Ordre aléatoire', hint: "L'ordre des joueurs est tiré au sort au début de la partie." },
];

export function WaitingRoom({ room, chat, onSendChat, onLeave }: {
  readonly room: RoomView;
  readonly chat: ChatMessage[];
  readonly onSendChat: (text: string) => void;
  readonly onLeave: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const isHost = user?.id === room.hostId;
  const [maps, setMaps] = useState<MapMeta[]>([]);
  const [copied, setCopied] = useState(false);
  const s = room.settings;

  useEffect(() => {
    api.get<MapMeta[]>('/api/maps').then(setMaps).catch(() => {});
  }, []);

  function update(patch: Partial<GameSettings>) {
    void emitAck('room:settings', { ...s, ...patch }).then((r) => r.error && toast(r.error));
  }
  function updateRule(key: keyof GameSettings['rules'], value: boolean) {
    update({ rules: { ...s.rules, [key]: value } });
  }

  async function start() {
    const r = await emitAck('room:start');
    if (r.error) toast(r.error);
  }

  const url = `${location.origin}/salon/${room.id}`;

  return (
    <div className="waiting-page">
      <header className="waiting-head">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onLeave}>← Quitter</button>
        <h1>Salon <span style={{ color: 'var(--gold)' }}>{room.id}</span></h1>
        <span className="chip"><BoardIcon icon={room.boardIcon} size={13} /> {room.boardName}</span>
      </header>

      <div className="waiting-grid">
        <section className="col" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <h3 style={{ marginBottom: 10 }}>Inviter des amis</h3>
            <div className="row">
              <input readOnly value={url} onFocus={(e) => e.target.select()} />
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <><Check size={14} /> Copié</> : <><Copy size={14} /> Copier</>}
              </button>
            </div>
          </div>

          <div className="panel panel-pad">
            <div className="row spread" style={{ marginBottom: 12 }}>
              <h3>Joueurs ({room.members.length}/{s.maxPlayers})</h3>
              {isHost && s.allowBots && room.members.length < s.maxPlayers && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void emitAck('room:addBot').then((r) => r.error && toast(r.error))}>
                  <Bot size={14} /> Ajouter un bot
                </button>
              )}
            </div>
            <div className="col" style={{ gap: 8 }}>
              {room.members.map((m) => (
                <div key={m.id} className="member-row" style={{ borderColor: m.color + '55' }}>
                  <Avatar id={m.avatar} color={m.color} size={36} />
                  <strong className="grow">{m.name}</strong>
                  {m.isHost && <span className="chip" style={{ color: 'var(--gold)' }}><Crown size={12} /> Hôte</span>}
                  {m.isBot && <span className="chip"><Bot size={12} /> Bot</span>}
                  {!m.connected && <span className="chip"><WifiOff size={12} /> Déconnecté</span>}
                  {isHost && m.id !== user?.id && (
                    <button
                      className="btn btn-ghost btn-sm"
                      type="button"
                      title="Exclure"
                      onClick={() => void emitAck('room:kick', { userId: m.id }).then((r) => r.error && toast(r.error))}
                    ><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
            {isHost && (
              <button className="btn btn-gold btn-lg" type="button" style={{ width: '100%', marginTop: 16 }} onClick={() => void start()}>
                <Rocket size={17} /> Lancer la partie
              </button>
            )}
            {!isHost && <p className="muted" style={{ marginTop: 14, textAlign: 'center' }}>En attente du lancement par l'hôte…</p>}
          </div>

          <div className="panel" style={{ minHeight: 260, display: 'flex' }}>
            <Chat messages={chat} onSend={onSendChat} />
          </div>
        </section>

        <section className="panel panel-pad settings-panel">
          <h3 style={{ marginBottom: 4 }}>Paramètres de la partie</h3>
          {!isHost && <p className="faint" style={{ fontSize: 13, marginBottom: 10 }}>Seul l'hôte peut modifier les paramètres.</p>}

          <div className="setting-block">
            <div className="field">
              <div className="field-label">Plateau</div>
              <div className="board-picker">
                {maps.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!isHost}
                    className={`board-choice${s.boardId === m.id ? ' on' : ''}`}
                    onClick={() => update({ boardId: m.id })}
                    title={m.description}
                  >
                    <BoardIcon icon={m.icon} size={22} />
                    <span className="grow" style={{ textAlign: 'left' }}>
                      <strong>{m.name}</strong>
                      <span className="faint" style={{ display: 'block', fontSize: 11 }}>
                        {m.tileCount} cases · {m.ownerName}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="setting-block">
            <div className="field">
              <div className="field-label">Nombre maximum de joueurs</div>
              <div className="segments">
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button key={n} type="button" disabled={!isHost} className={s.maxPlayers === n ? 'on' : ''} onClick={() => update({ maxPlayers: n })}>{n}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="setting-block">
            <div className="field">
              <div className="field-label">Argent de départ</div>
              <div className="segments">
                {CASH_OPTIONS.map((c) => (
                  <button key={c} type="button" disabled={!isHost} className={s.startingCash === c ? 'on' : ''} onClick={() => update({ startingCash: c })}>${c}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="setting-block">
            <div className="row wrap" style={{ gap: 18 }}>
              <div className="field grow">
                <div className="field-label">Nombre de dés</div>
                <div className="segments">
                  {([1, 2, 3] as const).map((n) => (
                    <button key={n} type="button" disabled={!isHost} className={s.dice.count === n ? 'on' : ''} onClick={() => update({ dice: { ...s.dice, count: n } })}>{n} 🎲</button>
                  ))}
                </div>
              </div>
              <div className="field grow">
                <div className="field-label">Faces par dé</div>
                <div className="segments">
                  {([6, 10, 20] as const).map((n) => (
                    <button key={n} type="button" disabled={!isHost} className={s.dice.sides === n ? 'on' : ''} onClick={() => update({ dice: { ...s.dice, sides: n } })}>D{n}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="setting-block">
            <div className="toggle-row">
              <span id="waiting-room-private-label">
                <strong>Salon privé</strong>
                <span className="hint">Accessible uniquement via le lien du salon.</span>
              </span>
              <input id="waiting-room-private" aria-labelledby="waiting-room-private-label" type="checkbox" className="switch" disabled={!isHost} checked={s.isPrivate} onChange={(e) => update({ isPrivate: e.target.checked })} />
            </div>
            <div className="toggle-row">
              <span id="waiting-room-bots-label">
                <strong>Autoriser les bots</strong>
                <span className="hint">Des bots peuvent compléter la partie.</span>
              </span>
              <input id="waiting-room-bots" aria-labelledby="waiting-room-bots-label" type="checkbox" className="switch" disabled={!isHost} checked={s.allowBots} onChange={(e) => update({ allowBots: e.target.checked })} />
            </div>
          </div>

          <div className="setting-block">
            <div className="field-label" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-dim)' }}>Règles du jeu</div>
            {RULES.map((r) => (
              <div key={r.key} className="toggle-row">
                <span id={`rule-${r.key}-label`}>
                  <strong>{r.label}</strong>
                  <span className="hint">{r.hint}</span>
                </span>
                <input
                  id={`rule-${r.key}`}
                  aria-labelledby={`rule-${r.key}-label`}
                  type="checkbox"
                  className="switch"
                  disabled={!isHost}
                  checked={s.rules[r.key]}
                  onChange={(e) => updateRule(r.key, e.target.checked)}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
