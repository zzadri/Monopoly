import { useMemo, useState } from 'react';
import type { BoardDef, GameStateView, PlayerView } from 'shared';
import { AvatarIcon, FlagIcon } from './icons';

function toggleSelection(list: number[], idx: number) {
  return list.includes(idx) ? list.filter((i) => i !== idx) : [...list, idx];
}

interface TradeModalProps {
  readonly board: BoardDef;
  readonly game: GameStateView;
  readonly me: PlayerView;
  readonly onClose: () => void;
  readonly onAction: (event: string, payload?: unknown) => void;
}

export function TradeModal({ board, game, me, onClose, onAction }: TradeModalProps) {
  const others = game.players.filter((p) => p.id !== me.id && !p.bankrupt);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [offerCash, setOfferCash] = useState(0);
  const [requestCash, setRequestCash] = useState(0);
  const [offerProps, setOfferProps] = useState<number[]>([]);
  const [requestProps, setRequestProps] = useState<number[]>([]);

  const propsOf = (playerId: string) =>
    Object.entries(game.ownership)
      .filter(([, o]) => o.owner === playerId && o.houses === 0)
      .map(([idx]) => Number(idx))
      .sort((a, b) => a - b);

  const myProps = useMemo(() => propsOf(me.id), [game.ownership, me.id]);
  const theirProps = useMemo(() => (to ? propsOf(to) : []), [game.ownership, to]);
  const target = game.players.find((p) => p.id === to);
  const offerCashId = 'trade-offer-cash';
  const requestCashId = 'trade-request-cash';

  function propButton(idx: number, selected: boolean, onClick: () => void) {
    const t = board.tiles[idx];
    const group = t.type === 'property' ? board.groups.find((g) => g.id === t.group) : null;
    return (
      <button key={`${t.type}-${t.name}-${idx}`} type="button" className={`trade-prop${selected ? ' on' : ''}`} onClick={onClick}>
        <FlagIcon flag={group?.flag} image={group?.image} color={group?.color} size={12} />
        {t.name}
      </button>
    );
  }

  if (others.length === 0) {
    return (
      <div className="modal-backdrop">
        <button type="button" className="modal-backdrop-hitarea" aria-label="Fermer l'échange" onClick={onClose} />
        <div className="modal">
          <h2>🤝 Échange</h2>
          <p className="muted">Aucun joueur disponible pour un échange.</p>
          <button className="btn btn-ghost" type="button" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <button type="button" className="modal-backdrop-hitarea" aria-label="Fermer l'échange" onClick={onClose} />
      <div className="modal" style={{ width: 'min(680px, 100%)' }}>
        <h2>🤝 Proposer un échange</h2>

        <div className="field" style={{ marginBottom: 14 }}>
          <div className="field-label">Avec</div>
          <div className="segments">
            {others.map((p) => (
              <button key={p.id} type="button" className={to === p.id ? 'on' : ''} onClick={() => { setTo(p.id); setRequestProps([]); }}>
                <AvatarIcon id={p.avatar} size={13} /> {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="trade-columns">
          <div className="trade-col">
            <h4>Vous donnez</h4>
            <div className="field">
              <label htmlFor={offerCashId}>Argent (max ${me.cash})</label>
              <input id={offerCashId} type="number" min={0} max={me.cash} value={offerCash || ''} placeholder="0"
                onChange={(e) => setOfferCash(Math.max(0, Math.min(me.cash, Number(e.target.value) || 0)))} />
            </div>
            <div className="trade-props">
              {myProps.length === 0 && <p className="faint" style={{ fontSize: 12 }}>Aucune propriété échangeable (les constructions doivent être vendues).</p>}
              {myProps.map((idx) => propButton(idx, offerProps.includes(idx), () => setOfferProps((current) => toggleSelection(current, idx))))}
            </div>
          </div>
          <div className="trade-col">
            <h4>Vous recevez</h4>
            <div className="field">
              <label htmlFor={requestCashId}>Argent (max ${target?.cash ?? 0})</label>
              <input id={requestCashId} type="number" min={0} value={requestCash || ''} placeholder="0"
                onChange={(e) => setRequestCash(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="trade-props">
              {theirProps.length === 0 && <p className="faint" style={{ fontSize: 12 }}>Aucune propriété échangeable.</p>}
              {theirProps.map((idx) => propButton(idx, requestProps.includes(idx), () => setRequestProps((current) => toggleSelection(current, idx))))}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 18 }}>
          <button
            className="btn btn-primary grow"
            type="button"
            onClick={() => {
              onAction('game:trade', { to, offerCash, requestCash, offerProps, requestProps });
              onClose();
            }}
          >
            Envoyer la proposition
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
