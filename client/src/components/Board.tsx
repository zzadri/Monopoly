import type { ReactNode } from 'react';
import type { BoardDef, GameStateView, Tile } from 'shared';
import { AvatarIcon, FlagIcon, Houses, TileTypeIcon } from './icons';

interface BoardProps {
  readonly board: BoardDef;
  readonly game: GameStateView | null;
  /** positions affichées (animation) — repli sur game.players[].position */
  readonly positions?: Record<string, number>;
  readonly onTileClick?: (index: number) => void;
  /** mode éditeur : toutes les cases sont cliquables */
  readonly editable?: boolean;
  readonly selectedTile?: number | null;
  /** identifiant du joueur local : son pion est distingué */
  readonly meId?: string;
  readonly children?: ReactNode;
}

export function tilePosition(i: number, cols: number, rows: number): { row: number; col: number; side: 'top' | 'right' | 'bottom' | 'left' | 'corner' } {
  const topEnd = cols - 1;
  const rightEnd = cols + rows - 2;
  const bottomEnd = 2 * cols + rows - 3;
  if (i === 0 || i === topEnd || i === rightEnd || i === bottomEnd) {
    if (i === 0) return { row: 0, col: 0, side: 'corner' };
    if (i === topEnd) return { row: 0, col: cols - 1, side: 'corner' };
    if (i === rightEnd) return { row: rows - 1, col: cols - 1, side: 'corner' };
    return { row: rows - 1, col: 0, side: 'corner' };
  }
  if (i < topEnd) return { row: 0, col: i, side: 'top' };
  if (i < rightEnd) return { row: i - topEnd, col: cols - 1, side: 'right' };
  if (i < bottomEnd) return { row: rows - 1, col: bottomEnd - i, side: 'bottom' };
  return { row: 2 * cols + 2 * rows - 4 - i, col: 0, side: 'left' };
}

function groupOf(board: BoardDef, tile: Tile) {
  return tile.type === 'property' ? board.groups.find((g) => g.id === tile.group) : undefined;
}

export function Board({ board, game, positions, onTileClick, editable, selectedTile, meId, children }: BoardProps) {
  const { cols, rows } = board;
  const posOf = (pid: string, fallback: number) => positions?.[pid] ?? fallback;

  return (
    <div
      className="board"
      style={{
        gridTemplateColumns: `1.6fr repeat(${cols - 2}, 1fr) 1.6fr`,
        gridTemplateRows: `1.6fr repeat(${rows - 2}, 1fr) 1.6fr`,
        aspectRatio: `${cols + 1.2} / ${rows + 1.2}`,
      }}
    >
      <div className="board-center" style={{ gridArea: `2 / 2 / ${rows} / ${cols}` }}>
        {children}
      </div>

      {board.tiles.map((tile, i) => {
        const pos = tilePosition(i, cols, rows);
        const group = groupOf(board, tile);
        const ownership = game?.ownership[i];
        const owner = ownership ? game?.players.find((p) => p.id === ownership.owner) : undefined;
        const playersHere = game?.players.filter((p) => !p.bankrupt && posOf(p.id, p.position) === i) ?? [];
        const price = 'price' in tile ? tile.price : undefined;
        const clickable = editable || price !== undefined;
        const isPrison = tile.type === 'prison';
        const jailed = isPrison ? playersHere.filter((p) => p.inPrison) : [];
        const visitors = isPrison ? playersHere.filter((p) => !p.inPrison) : playersHere;

        return (
          <button
            key={`${tile.type}-${tile.name}-${pos.row}-${pos.col}`}
            type="button"
            className={`tile side-${pos.side} type-${tile.type}${onTileClick && clickable ? ' clickable' : ''}${selectedTile === i ? ' selected' : ''}`}
            style={{
              gridArea: `${pos.row + 1} / ${pos.col + 1}`,
              boxShadow: owner ? `inset 0 0 0 2px ${owner.color}` : undefined,
            }}
            aria-label={tile.name}
            onClick={() => clickable && onTileClick?.(i)}
          >
            {group && <div className="tile-band" style={{ background: group.color }} />}

            {owner && (
              <div className="tile-owner" style={{ background: owner.color }} title={`${owner.name}${ownership!.mortgaged ? ' (hypothéquée)' : ''}`}>
                <AvatarIcon id={owner.avatar} size={11} color="#fff" />
                {ownership!.mortgaged
                  ? <span className="mortgage-mark">✕</span>
                  : <Houses count={ownership!.houses} size={6} />}
              </div>
            )}

            {isPrison ? (
              <div className="tile-inner prison-inner">
                <div className="prison-cell">
                  <span className="prison-cell-label">Prison</span>
                  <div className="prison-cell-tokens">
                    {jailed.map((p) => (
                      <span
                        key={p.id}
                        className={`token${p.id === meId ? ' mine' : ''}`}
                        style={{ background: p.color, color: p.color }}
                        title={p.id === meId ? `${p.name} (vous)` : p.name}
                      >
                        <AvatarIcon id={p.avatar} size={12} color="#fff" />
                      </span>
                    ))}
                  </div>
                </div>
                <span className="prison-visit-label">Simple visite</span>
              </div>
            ) : (
              <div className="tile-inner">
                <span className="tile-icon"><TileTypeIcon tile={tile} size={pos.side === 'corner' ? 24 : 18} /></span>
                <span className="tile-name">{tile.name}</span>
                {group && (
                  <span className="tile-flag">
                    <FlagIcon flag={group.flag} image={group.image} color={group.color} size={22} />
                  </span>
                )}
                {price !== undefined && !ownership && <span className="tile-price">${price}</span>}
                {tile.type === 'tax' && <span className="tile-price">{tile.percent ? `${tile.amount}%` : `$${tile.amount}`}</span>}
              </div>
            )}

            {visitors.length > 0 && (
              <div className="tile-tokens">
                {visitors.map((p) => (
                  <span
                    key={`${p.id}-${pos.row}-${pos.col}`}
                    className={`token${game?.currentPlayer === p.id ? ' current' : ''}${p.id === meId ? ' mine' : ''}`}
                    style={{ background: p.color, color: p.color }}
                    title={p.id === meId ? `${p.name} (vous)` : p.name}
                  >
                    <AvatarIcon id={p.avatar} size={13} color="#fff" />
                  </span>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
