import { Home, Lock, LockOpen } from 'lucide-react';
import type { BoardDef, GameStateView } from 'shared';
import { useAuth } from '../context';
import { Avatar, FlagIcon, Houses, TileTypeIcon } from './icons';

interface TileModalProps {
  readonly board: BoardDef;
  readonly game: GameStateView;
  readonly tileIndex: number;
  readonly onClose: () => void;
  readonly onAction: (event: string, payload?: unknown) => void;
}

export function TileModal({ board, game, tileIndex, onClose, onAction }: TileModalProps) {
  const { user } = useAuth();
  const tile = board.tiles[tileIndex];
  const o = game.ownership[tileIndex];
  const owner = o ? game.players.find((p) => p.id === o.owner) : null;
  const mine = o?.owner === user?.id;
  const group = tile.type === 'property' ? board.groups.find((g) => g.id === tile.group) : null;
  const rules = game.settings.rules;

  return (
    <div className="modal-backdrop">
      <button type="button" className="modal-backdrop-hitarea" aria-label="Fermer le panneau de case" onClick={onClose} />
      <div className="modal tile-modal">
        {group && (
          <div className="tile-modal-band row" style={{ background: group.color, gap: 8 }}>
            <FlagIcon flag={group.flag} image={group.image} color="#ffffff88" /> {group.name}
          </div>
        )}
        <h2 className="row" style={{ marginTop: group ? 10 : 0, gap: 8 }}>
          <TileTypeIcon tile={tile} size={22} />
          {tile.name}
        </h2>

        {owner && (
          <p className="muted row" style={{ marginBottom: 10, gap: 6 }}>
            Propriété de <Avatar id={owner.avatar} color={owner.color} size={20} />
            <strong style={{ color: owner.color }}>{owner.name}</strong>
            {o?.mortgaged && <span className="row" style={{ gap: 4 }}><Lock size={13} /> hypothéquée</span>}
          </p>
        )}

        {tile.type === 'property' && (
          <table className="rent-table">
            <tbody>
              <tr className={o?.houses === 0 ? 'active' : ''}><td>Loyer de base</td><td className="cash">${tile.rents[0]}</td></tr>
              {rules.doubleRentFullSet && (
                <tr><td>Avec groupe complet</td><td className="cash">${tile.rents[0] * 2}</td></tr>
              )}
              {[1, 2, 3, 4].map((n) => (
                <tr key={`house-${n}`} className={o?.houses === n ? 'active' : ''}>
                  <td><Houses count={n} size={14} /></td><td className="cash">${tile.rents[n]}</td>
                </tr>
              ))}
              <tr className={o?.houses === 5 ? 'active' : ''}><td className="row" style={{ gap: 6 }}><Houses count={5} size={12} /> Hôtel</td><td className="cash">${tile.rents[5]}</td></tr>
              <tr><td className="faint">Prix par maison</td><td className="cash">${tile.houseCost}</td></tr>
            </tbody>
          </table>
        )}

        {tile.type === 'airport' && (
          <table className="rent-table">
            <tbody>
              {tile.rents.map((r, i) => (
                <tr key={`airport-${r}`}><td>{i + 1} aéroport{i > 0 ? 's' : ''}</td><td className="cash">${r}</td></tr>
              ))}
            </tbody>
          </table>
        )}

        {tile.type === 'utility' && (
          <table className="rent-table">
            <tbody>
              {tile.multipliers.map((m, i) => (
                <tr key={`utility-${m}`}><td>{i + 1} compagnie{i > 0 ? 's' : ''}</td><td className="cash">{m}× le jet de dés</td></tr>
              ))}
            </tbody>
          </table>
        )}

        {'price' in tile && (
          <p style={{ marginTop: 10 }}>Prix d'achat : <span className="cash">${tile.price}</span>
            {rules.mortgage && <span className="faint"> · hypothèque : ${Math.floor(tile.price / 2)}</span>}
          </p>
        )}

        {mine && (
          <div className="row wrap" style={{ marginTop: 16 }}>
            {tile.type === 'property' && !o?.mortgaged && (o?.houses ?? 0) < 5 && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAction('game:build', { tile: tileIndex })}>
                <Home size={14} /> Construire (${tile.houseCost})
              </button>
            )}
            {tile.type === 'property' && (o?.houses ?? 0) > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction('game:sellHouse', { tile: tileIndex })}>
                Vendre une maison (+${Math.floor(tile.houseCost / 2)})
              </button>
            )}
            {rules.mortgage && !o?.mortgaged && (tile.type !== 'property' || (o?.houses ?? 0) === 0) && 'price' in tile && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAction('game:mortgage', { tile: tileIndex })}>
                <Lock size={13} /> Hypothéquer (+${Math.floor(tile.price / 2)})
              </button>
            )}
            {rules.mortgage && o?.mortgaged && 'price' in tile && (
              <button type="button" className="btn btn-gold btn-sm" onClick={() => onAction('game:unmortgage', { tile: tileIndex })}>
                <LockOpen size={13} /> Lever l'hypothèque (−${Math.ceil(tile.price * 0.55)})
              </button>
            )}
          </div>
        )}

        <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
