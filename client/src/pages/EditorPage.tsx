import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  perimeterSize, PREDEFINED_SURPRISE, PREDEFINED_TREASURE,
  type BoardDef, type Card, type CardAction, type DeckMode, type GroupDef, type Tile,
} from 'shared';
import {
  CircleHelp, Dices, Droplets, Flame, Fuel, Gem, Home, Map as MapIcon, Minus, Palette,
  Plane, Plus, RadioTower, Save, Scale, Trash2, Wand2, Zap,
} from 'lucide-react';
import { boardUnit, deckStats, generateBalancedDeck, rebalanceDeck } from '../lib/deck';
import { applyToGroup, autoAssignGroups, autoPriceBoard, houseCostFromPrice, rentsFromPrice } from '../lib/boardgen';
import { Shell } from '../components/Shell';
import { Board } from '../components/Board';
import { BoardIcon, BOARD_ICON_CHOICES, FlagIcon, Houses, TileTypeIcon } from '../components/icons';
import { api, ApiError } from '../api';
import { useAuth, useToast } from '../context';

const TILE_TYPES: { value: Tile['type']; label: string }[] = [
  { value: 'property', label: 'Propriété' },
  { value: 'airport', label: 'Aéroport' },
  { value: 'utility', label: 'Compagnie (eau, électricité…)' },
  { value: 'tax', label: 'Taxe' },
  { value: 'treasure', label: 'Carte Trésor' },
  { value: 'surprise', label: 'Carte Surprise' },
  { value: 'prison', label: 'Prison (simple visite)' },
  { value: 'goto-prison', label: 'Allez en prison' },
  { value: 'vacation', label: 'Vacances' },
  { value: 'start', label: 'Départ' },
];

const UTILITY_CHOICES = [
  { value: '⚡', Icon: Zap },
  { value: '🚰', Icon: Droplets },
  { value: '🔥', Icon: Flame },
  { value: '📡', Icon: RadioTower },
  { value: '⛽', Icon: Fuel },
];

function randomHexColor() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `#${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Pays sélectionnables pour les groupes (code ISO flag-icons + nom FR). */
const COUNTRIES: [string, string][] = [
  ['fr', 'France'], ['de', 'Allemagne'], ['it', 'Italie'], ['es', 'Espagne'], ['pt', 'Portugal'],
  ['gb', 'Royaume-Uni'], ['ie', 'Irlande'], ['be', 'Belgique'], ['nl', 'Pays-Bas'], ['ch', 'Suisse'],
  ['at', 'Autriche'], ['lu', 'Luxembourg'], ['gr', 'Grèce'], ['se', 'Suède'], ['no', 'Norvège'],
  ['dk', 'Danemark'], ['fi', 'Finlande'], ['is', 'Islande'], ['pl', 'Pologne'], ['cz', 'Tchéquie'],
  ['sk', 'Slovaquie'], ['hu', 'Hongrie'], ['ro', 'Roumanie'], ['bg', 'Bulgarie'], ['hr', 'Croatie'],
  ['ua', 'Ukraine'], ['tr', 'Turquie'], ['ru', 'Russie'], ['us', 'États-Unis'], ['ca', 'Canada'],
  ['mx', 'Mexique'], ['br', 'Brésil'], ['ar', 'Argentine'], ['cl', 'Chili'], ['co', 'Colombie'],
  ['pe', 'Pérou'], ['jp', 'Japon'], ['cn', 'Chine'], ['kr', 'Corée du Sud'], ['in', 'Inde'],
  ['th', 'Thaïlande'], ['vn', 'Viêt Nam'], ['id', 'Indonésie'], ['my', 'Malaisie'], ['sg', 'Singapour'],
  ['ph', 'Philippines'], ['au', 'Australie'], ['nz', 'Nouvelle-Zélande'], ['za', 'Afrique du Sud'],
  ['eg', 'Égypte'], ['ma', 'Maroc'], ['tn', 'Tunisie'], ['dz', 'Algérie'], ['sn', 'Sénégal'],
  ['ci', "Côte d'Ivoire"], ['ng', 'Nigéria'], ['ke', 'Kenya'], ['il', 'Israël'], ['sa', 'Arabie saoudite'],
  ['ae', 'Émirats arabes unis'], ['qa', 'Qatar'],
];

function defaultTile(type: Tile['type'], groups: GroupDef[], name?: string): Tile {
  const n = (fallback: string) => name?.trim() || fallback;
  switch (type) {
    case 'property':
      return { type, name: n('Nouvelle ville'), group: groups[0]?.id ?? 'g1', price: 100, rents: [6, 30, 90, 270, 400, 550], houseCost: 50 };
    case 'airport':
      return { type, name: n('Aéroport'), price: 200, rents: [25, 50, 100, 200] };
    case 'utility':
      return { type, name: n('Compagnie'), price: 150, multipliers: [4, 10], icon: '⚡' };
    case 'tax':
      return { type, name: n('Taxe'), amount: 75 };
    case 'start': return { type, name: 'Départ' };
    case 'treasure': return { type, name: 'Trésor' };
    case 'surprise': return { type, name: 'Surprise' };
    case 'prison': return { type, name: 'Prison' };
    case 'goto-prison': return { type, name: 'Allez en prison' };
    case 'vacation': return { type, name: 'Vacances' };
  }
}

function effectiveCards(mode: DeckMode, predefined: Card[], cards: Card[]) {
  if (mode === 'predefined') return predefined;
  if (mode === 'mix') return [...predefined, ...cards];
  return cards;
}

function balanceLabel(expected: number) {
  if (Math.abs(expected) <= 10) return 'Équilibré';
  return expected > 0 ? 'Favorable aux joueurs' : 'Punitif';
}

function balanceTone(expected: number) {
  if (Math.abs(expected) <= 10) return 'ok';
  return expected > 0 ? 'up' : 'down';
}

function buildingSummary(action: { perHouse: number; perHotel: number }, verb: 'reçoit' | 'paye') {
  return `Il ${verb} $${action.perHouse} par maison et $${action.perHotel} par hôtel.`;
}

function newBoard(): BoardDef & { isPublic?: boolean } {
  const groups: GroupDef[] = [
    { id: 'g1', name: 'France', color: '#60a5fa', flag: 'fr' },
    { id: 'g2', name: 'Italie', color: '#34d399', flag: 'it' },
  ];
  const size = perimeterSize(9, 9);
  const tiles: Tile[] = [{ type: 'start', name: 'Départ' }];
  for (let i = 1; i < size; i++) {
    tiles.push(i % 7 === 3 ? { type: 'treasure', name: 'Trésor' } : defaultTile('property', groups));
  }
  return {
    id: '', name: 'Mon plateau', description: '', icon: '🗺️',
    cols: 9, rows: 9, groups, tiles,
    treasureMode: 'predefined', surpriseMode: 'predefined',
    customTreasure: [], customSurprise: [],
  };
}

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const isGuest = !!user?.guest;
  const [board, setBoard] = useState<(BoardDef & { isPublic?: boolean }) | null>(id ? null : { ...newBoard(), isPublic: true });
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<'plateau' | 'groupes' | 'cartes'>('plateau');
  const [saving, setSaving] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([60, 400]);
  const readOnly = id === 'classic' || isGuest;

  useEffect(() => {
    if (!id) return;
    api.get<BoardDef>(`/api/maps/${id}`)
      .then((b) => setBoard({ ...b, isPublic: true }))
      .catch(() => { toast('Plateau introuvable.'); navigate('/plateaux'); });
  }, [id]);

  const patch = (p: Partial<BoardDef & { isPublic: boolean }>) => setBoard((b) => (b ? { ...b, ...p } : b));

  /** Remplace une case ; garantit une case Départ unique (déplaçable). */
  const patchTile = (idx: number, tile: Tile) =>
    setBoard((b) => {
      if (!b) return b;
      const tiles = [...b.tiles];
      if (tile.type === 'start') {
        const oldStart = tiles.findIndex((t) => t.type === 'start');
        if (oldStart >= 0 && oldStart !== idx) {
          tiles[oldStart] = defaultTile('property', b.groups);
          toast('La case Départ a été déplacée : l’ancienne devient une propriété.', true);
        }
      } else if (b.tiles[idx].type === 'start' && !tiles.some((t, i) => i !== idx && t.type === 'start')) {
        toast('Il faut une case Départ : changez d’abord une autre case en Départ.');
        return b;
      }
      tiles[idx] = tile;
      return { ...b, tiles };
    });

  function resize(cols: number, rows: number) {
    setBoard((b) => {
      if (!b) return b;
      const size = perimeterSize(cols, rows);
      const tiles = b.tiles.slice(0, size);
      while (tiles.length < size) tiles.push(defaultTile('property', b.groups));
      if (!tiles.some((t) => t.type === 'start')) tiles[0] = { type: 'start', name: 'Départ' };
      return { ...b, cols, rows, tiles };
    });
    setSelected(null);
  }

  async function save() {
    if (!board) return;
    setSaving(true);
    try {
      const { id: boardId, ...payload } = board;
      if (boardId) {
        await api.put(`/api/maps/${boardId}`, payload);
        toast('Plateau enregistré !', true);
      } else {
        const res = await api.post<{ id: string }>('/api/maps', payload);
        toast('Plateau créé !', true);
        navigate(`/editeur/${res.id}`, { replace: true });
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  const sizeInfo = useMemo(() => board ? perimeterSize(board.cols, board.rows) : 0, [board?.cols, board?.rows]);

  if (!board) return <Shell><div className="center" style={{ height: 300 }}><div className="loading-dice"><Dices size={54} color="var(--brand)" /></div></div></Shell>;

  if (isGuest && !id) {
    return (
      <Shell>
        <div className="panel panel-pad center empty-state" style={{ maxWidth: 520, margin: '40px auto' }}>
          <Save size={40} color="var(--gold)" />
          <h2>Réservé aux comptes</h2>
          <p className="muted" style={{ textAlign: 'center' }}>
            La création de plateaux nécessite un compte (gratuit) pour pouvoir les enregistrer.
            Vous pouvez continuer à jouer en invité sur tous les plateaux existants.
          </p>
        </div>
      </Shell>
    );
  }

  const tile = selected !== null ? board.tiles[selected] : null;

  return (
    <Shell wide>
      <div className="editor-head panel">
        <div className="editor-identity">
          <div className="icon-picker-wrap">
            <button
              type="button"
              className="icon-picker-btn"
              disabled={readOnly}
              title="Choisir une icône"
              onClick={() => setIconOpen((v) => !v)}
            >
              <BoardIcon icon={board.icon} size={24} />
            </button>
            {iconOpen && !readOnly && (
              <>
                <button
                  type="button"
                  className="popover-backdrop"
                  aria-label="Fermer le sélecteur d'icône"
                  onClick={() => setIconOpen(false)}
                />
                <div className="icon-popover">
                  {BOARD_ICON_CHOICES.map((ic) => (
                    <button type="button"
                      key={ic}
                      className={board.icon === ic ? 'on' : ''}
                      onClick={() => { patch({ icon: ic }); setIconOpen(false); }}
                    >
                      <BoardIcon icon={ic} size={19} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="editor-fields">
            <input
              className="editor-name-input"
              value={board.name}
              disabled={readOnly}
              maxLength={40}
              placeholder="Nom du plateau"
              onChange={(e) => patch({ name: e.target.value })}
            />
            <input
              className="editor-desc-input"
              value={board.description ?? ''}
              disabled={readOnly}
              maxLength={200}
              placeholder="Description (optionnelle)"
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
        </div>

        {!readOnly && (
          <div className="editor-actions">
            <label htmlFor="board-public" className="row" style={{ gap: 8, fontSize: 13, fontWeight: 700 }} title="Visible par tous les joueurs">
              <input id="board-public" type="checkbox" className="switch" checked={board.isPublic ?? true} onChange={(e) => patch({ isPublic: e.target.checked })} />
              Public
            </label>
            <button type="button" className="btn btn-gold" disabled={saving} onClick={() => void save()}>
              <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
        {readOnly && <span className="chip">Lecture seule</span>}
      </div>

      <div className="editor-tabs">
        <button type="button" className={tab === 'plateau' ? 'on' : ''} onClick={() => setTab('plateau')}>
          <MapIcon size={15} /> Plateau
        </button>
        <button type="button" className={tab === 'groupes' ? 'on' : ''} onClick={() => setTab('groupes')}>
          <Palette size={15} /> Groupes
        </button>
        <button type="button" className={tab === 'cartes' ? 'on' : ''} onClick={() => setTab('cartes')}>
          <Gem size={15} /> Cartes
        </button>
      </div>

      {tab === 'plateau' && (
        <div className="editor-grid">
          <div className="editor-main">
            <div className="editor-toolbar panel">
              <label className="dim-control">
                <span>Colonnes <b>{board.cols}</b></span>
                <input type="range" min={5} max={16} value={board.cols} disabled={readOnly} onChange={(e) => resize(Number(e.target.value), board.rows)} />
              </label>
              <label className="dim-control">
                <span>Lignes <b>{board.rows}</b></span>
                <input type="range" min={5} max={16} value={board.rows} disabled={readOnly} onChange={(e) => resize(board.cols, Number(e.target.value))} />
              </label>
              <span className="chip">{sizeInfo} cases</span>
            </div>

            {!readOnly && (
              <div className="editor-toolbar panel autofill-bar">
                <span className="row" style={{ gap: 7, fontSize: 13, fontWeight: 700 }}>
                  <Wand2 size={15} /> Remplissage automatique
                </span>
                <label className="dim-control">
                  <span>De <b>${priceRange[0]}</b></span>
                  <input type="range" min={20} max={300} step={10} value={priceRange[0]}
                    onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])} />
                </label>
                <label className="dim-control">
                  <span>à <b>${priceRange[1]}</b></span>
                  <input type="range" min={150} max={900} step={10} value={priceRange[1]}
                    onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])} />
                </label>
                <button type="button"
                  className="btn btn-primary btn-sm"
                  title="Attribue prix, loyers et coût de construction à toutes les propriétés"
                  onClick={() => {
                    patch({ tiles: autoPriceBoard(board.tiles, { min: priceRange[0], max: priceRange[1] }) });
                    toast('Prix et loyers générés sur tout le plateau.', true);
                  }}
                >
                  Prix et loyers
                </button>
                <button type="button"
                  className="btn btn-ghost btn-sm"
                  title="Répartit les propriétés entre vos groupes de couleurs"
                  onClick={() => {
                    patch({ tiles: autoAssignGroups(board.tiles, board.groups.map((g) => g.id)) });
                    toast('Propriétés réparties entre les groupes.', true);
                  }}
                >
                  Répartir les groupes
                </button>
              </div>
            )}
            <div className="editor-board">
              <Board board={board} game={null} editable selectedTile={selected} onTileClick={setSelected}>
                <div className="center-note" style={{ fontSize: 15 }}>
                  <span className="row" style={{ gap: 6, justifyContent: 'center' }}>
                    <BoardIcon icon={board.icon} size={18} /> {board.name}
                  </span>
                  <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                    Cliquez sur n'importe quelle case pour l'éditer
                  </span>
                </div>
              </Board>
            </div>
          </div>

          <aside className={`panel panel-pad editor-side${selected !== null ? ' has-selection' : ''}`}>
            {tile === null || selected === null ? (
              <div className="editor-side-empty">
                <Home size={30} className="faint" />
                <p className="muted">
                  Cliquez sur une case du plateau pour la modifier — type, nom, prix, loyers :
                  tout est personnalisable. Seule une case Départ est obligatoire, et vous
                  pouvez la placer où vous voulez.
                </p>
              </div>
            ) : (
              <TileEditor
                key={selected}
                tile={tile}
                index={selected}
                groups={board.groups}
                readOnly={readOnly}
                onChange={(t) => patchTile(selected, t)}
                onApplyGroup={(groupId, price) => {
                  patch({ tiles: applyToGroup(board.tiles, groupId, price) });
                  toast('Prix et loyers appliqués au groupe.', true);
                }}
              />
            )}
          </aside>
        </div>
      )}

      {tab === 'groupes' && (
        <GroupsEditor groups={board.groups} readOnly={readOnly} onChange={(groups) => patch({ groups })} />
      )}

      {tab === 'cartes' && (
        <div className="cards-grid">
          <DeckEditor
            deck="treasure"
            mode={board.treasureMode}
            cards={board.customTreasure}
            tiles={board.tiles}
            readOnly={readOnly}
            onMode={(m) => patch({ treasureMode: m })}
            onCards={(c) => patch({ customTreasure: c })}
          />
          <DeckEditor
            deck="surprise"
            mode={board.surpriseMode}
            cards={board.customSurprise}
            tiles={board.tiles}
            readOnly={readOnly}
            onMode={(m) => patch({ surpriseMode: m })}
            onCards={(c) => patch({ customSurprise: c })}
          />
        </div>
      )}
    </Shell>
  );
}

/* ---------- édition d'une case ---------- */

function TileEditor({ tile, index, groups, readOnly, onChange, onApplyGroup }: Readonly<{
  tile: Tile;
  index: number;
  groups: GroupDef[];
  readOnly: boolean;
  onChange: (t: Tile) => void;
  onApplyGroup?: (groupId: string, price: number) => void;
}>) {
  const canRename = !['start', 'treasure', 'surprise', 'prison', 'goto-prison', 'vacation'].includes(tile.type);
  const typeId = `tile-type-${index}`;
  const nameId = `tile-name-${index}`;
  const groupLabel = `Groupe de couleur`; 
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10 }}>
        <span className="tile-editor-icon">
          {tile.type === 'property' ? <Home size={22} /> : <TileTypeIcon tile={tile} size={22} />}
        </span>
        <div>
          <h3>{tile.name || `Case n°${index}`}</h3>
          <span className="faint" style={{ fontSize: 12 }}>Case n°{index}</span>
        </div>
      </div>

      <div className="field">
        <label htmlFor={typeId}>Type de case</label>
        <select id={typeId} value={tile.type} disabled={readOnly} onChange={(e) => onChange(defaultTile(e.target.value as Tile['type'], groups, tile.name))}>
          {TILE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {tile.type === 'start' && (
          <p className="faint" style={{ fontSize: 12 }}>
            Pour déplacer le Départ, sélectionnez une autre case et donnez-lui le type « Départ ».
          </p>
        )}
      </div>

      {canRename && (
        <div className="field">
          <label htmlFor={nameId}>Nom</label>
          <input id={nameId} value={tile.name} disabled={readOnly} maxLength={40} onChange={(e) => onChange({ ...tile, name: e.target.value })} />
        </div>
      )}

      {tile.type === 'property' && (
        <>
          <div className="field">
            <div className="field-label">{groupLabel}</div>
            <div className="group-picker">
              {groups.map((g) => (
                <button type="button"
                  key={g.id}
                  disabled={readOnly}
                  className={`group-choice${tile.group === g.id ? ' on' : ''}`}
                  onClick={() => onChange({ ...tile, group: g.id })}
                >
                  <span className="prop-dot" style={{ background: g.color }} />
                  <FlagIcon flag={g.flag} image={g.image} color={g.color} size={13} />
                  {g.name}
                </button>
              ))}
            </div>
            <p className="faint" style={{ fontSize: 12 }}>Gérez les pays/couleurs dans l'onglet « Groupes de couleurs ».</p>
          </div>
          <NumberField label="Prix d'achat ($)" value={tile.price} readOnly={readOnly} onChange={(v) => onChange({ ...tile, price: v })} />
          <NumberField label="Prix par maison ($)" value={tile.houseCost} readOnly={readOnly} onChange={(v) => onChange({ ...tile, houseCost: v })} />

          {!readOnly && (
            <div className="row wrap" style={{ gap: 6 }}>
              <button type="button"
                className="btn btn-primary btn-sm"
                title="Calcule les six loyers à partir du prix d'achat"
                onClick={() => onChange({
                  ...tile,
                  rents: rentsFromPrice(tile.price),
                  houseCost: houseCostFromPrice(tile.price),
                })}
              >
                <Wand2 size={13} /> Loyers depuis le prix
              </button>
              {onApplyGroup && (
                <button type="button"
                  className="btn btn-ghost btn-sm"
                  title="Applique ce prix et ces loyers à tout le groupe"
                  onClick={() => onApplyGroup(tile.group, tile.price)}
                >
                  Appliquer au groupe
                </button>
              )}
            </div>
          )}

          <div className="field">
            <div className="field-label">Loyers</div>
            <div className="rent-editor">
              {([
                ['Terrain nu', 0],
                ['1 maison', 1],
                ['2 maisons', 2],
                ['3 maisons', 3],
                ['4 maisons', 4],
                ['Hôtel', 5],
              ] as const).map(([label, i]) => (
                <label key={label} className="rent-line">
                  <span className="rent-label">
                    {i > 0 ? <Houses count={i} size={13} /> : null} {label}
                  </span>
                  <div className="rent-input">
                    <span className="faint">$</span>
                    <input
                      type="number"
                      min={0}
                      value={tile.rents[i]}
                      disabled={readOnly}
                      onChange={(e) => {
                        const rents = [...tile.rents] as typeof tile.rents;
                        rents[i] = Math.max(0, Number(e.target.value) || 0);
                        onChange({ ...tile, rents });
                      }}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {tile.type === 'airport' && (
        <>
          <NumberField label="Prix d'achat ($)" value={tile.price} readOnly={readOnly} onChange={(v) => onChange({ ...tile, price: v })} />
          <div className="field">
            <div className="field-label">Loyers selon le nombre d'aéroports possédés</div>
            <div className="rent-editor">
              {tile.rents.map((r, i) => (
                <label key={`${i + 1}-${r}`} className="rent-line">
                  <span className="rent-label">
                    <Plane size={13} /> {i + 1} aéroport{i > 0 ? 's' : ''}
                  </span>
                  <div className="row" style={{ gap: 4 }}>
                    <div className="rent-input">
                      <span className="faint">$</span>
                      <input type="number" min={0} value={r} disabled={readOnly}
                        onChange={(e) => {
                          const rents = [...tile.rents];
                          rents[i] = Math.max(0, Number(e.target.value) || 0);
                          onChange({ ...tile, rents });
                        }} />
                    </div>
                    {!readOnly && tile.rents.length > 1 && i === tile.rents.length - 1 && (
                      <button type="button" className="btn btn-ghost btn-sm" title="Retirer ce palier"
                        onClick={() => onChange({ ...tile, rents: tile.rents.slice(0, -1) })}>
                        <Minus size={13} />
                      </button>
                    )}
                  </div>
                </label>
              ))}
            </div>
            {!readOnly && tile.rents.length < 8 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => onChange({ ...tile, rents: [...tile.rents, (tile.rents.at(-1) ?? 25) * 2] })}>
                <Plus size={13} /> Palier suivant
              </button>
            )}
          </div>
        </>
      )}

      {tile.type === 'utility' && (
        <>
          <NumberField label="Prix d'achat ($)" value={tile.price} readOnly={readOnly} onChange={(v) => onChange({ ...tile, price: v })} />
          <div className="field">
            <div className="field-label">Loyer = multiplicateur × jet de dés</div>
            <div className="rent-editor">
              {tile.multipliers.map((m, i) => (
                <label key={`${i + 1}-${m}`} className="rent-line">
                  <span className="rent-label">
                    <Zap size={13} /> {i + 1} compagnie{i > 0 ? 's' : ''}
                  </span>
                  <div className="row" style={{ gap: 4 }}>
                    <div className="rent-input">
                      <span className="faint">×</span>
                      <input type="number" min={1} value={m} disabled={readOnly}
                        onChange={(e) => {
                          const multipliers = [...tile.multipliers];
                          multipliers[i] = Math.max(1, Number(e.target.value) || 1);
                          onChange({ ...tile, multipliers });
                        }} />
                    </div>
                    {!readOnly && tile.multipliers.length > 1 && i === tile.multipliers.length - 1 && (
                      <button type="button" className="btn btn-ghost btn-sm" title="Retirer ce palier"
                        onClick={() => onChange({ ...tile, multipliers: tile.multipliers.slice(0, -1) })}>
                        <Minus size={13} />
                      </button>
                    )}
                  </div>
                </label>
              ))}
            </div>
            {!readOnly && tile.multipliers.length < 5 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => onChange({ ...tile, multipliers: [...tile.multipliers, (tile.multipliers.at(-1) ?? 4) + 6] })}>
                <Plus size={13} /> Palier suivant (jusqu'à 5 compagnies)
              </button>
            )}
          </div>
          <div className="field">
            <div className="field-label">Icône</div>
            <div className="segments">
              {UTILITY_CHOICES.map(({ value, Icon }) => (
                <button type="button" key={value} disabled={readOnly} className={tile.icon === value ? 'on' : ''} onClick={() => onChange({ ...tile, icon: value })}>
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {tile.type === 'tax' && (
        <>
          <NumberField label={tile.percent ? 'Pourcentage du cash (%)' : 'Montant fixe ($)'} value={tile.amount} readOnly={readOnly} onChange={(v) => onChange({ ...tile, amount: v })} />
          <div className="toggle-row">
            <span id={`tile-percent-${index}`}>
              <strong>En pourcentage</strong>
              <span className="hint">Le joueur paye un % de son argent au lieu d'un montant fixe.</span>
            </span>
            <input aria-labelledby={`tile-percent-${index}`} type="checkbox" className="switch" disabled={readOnly} checked={!!tile.percent} onChange={(e) => onChange({ ...tile, percent: e.target.checked })} />
          </div>
        </>
      )}
    </div>
  );
}

function NumberField({ label, value, readOnly, onChange }: Readonly<{ label: string; value: number; readOnly: boolean; onChange: (v: number) => void }>) {
  const id = useMemo(() => `number-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [label]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min={0} value={value} disabled={readOnly} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
    </div>
  );
}

/* ---------- édition des groupes ---------- */

/**
 * Redimensionne l'image en vignette carrée 48 px via canvas (le ré-encodage
 * détruit toute charge utile cachée dans le fichier d'origine), puis l'envoie
 * à l'API d'upload sécurisée qui re-vérifie la signature binaire côté serveur.
 */
function fileToThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const S = 48;
      const canvas = document.createElement('canvas');
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext('2d')!;
      // recadrage carré centré
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Conversion impossible.'));
        if (blob.size > 110000) return reject(new Error('Image trop lourde après compression.'));
        resolve(blob);
      }, 'image/webp', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Fichier image illisible.')); };
    img.src = url;
  });
}

async function uploadThumbnail(blob: Blob): Promise<string> {
  const res = await fetch('/api/uploads', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Envoi impossible.');
  return (data as { url: string }).url;
}

function GroupsEditor({ groups, readOnly, onChange }: Readonly<{
  groups: GroupDef[];
  readOnly: boolean;
  onChange: (g: GroupDef[]) => void;
}>) {
  const [pickingFor, setPickingFor] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const filtered = COUNTRIES.filter(([, name]) => name.toLowerCase().includes(search.toLowerCase()));

  async function importImage(i: number, file: File | undefined) {
    if (!file) return;
    try {
      const blob = await fileToThumbnail(file);
      const image = await uploadThumbnail(blob);
      const next = [...groups];
      next[i] = { ...next[i], image, flag: undefined };
      onChange(next);
      toast('Image importée !', true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import impossible.');
    }
  }

  return (
    <div className="panel panel-pad" style={{ maxWidth: 720 }}>
      <p className="muted" style={{ marginBottom: 14 }}>
        Les groupes définissent les ensembles de propriétés : une couleur, un nom et, si vous voulez, le drapeau d'un pays.
      </p>
      <div className="col">
        {groups.map((g, i) => (
          <div key={g.id} className="group-row-wrap">
            <div className="row wrap group-row">
              <input
                type="color"
                value={g.color}
                disabled={readOnly}
                title="Couleur du groupe"
                style={{ width: 44, height: 38, padding: 3, cursor: 'pointer' }}
                onChange={(e) => {
                  const next = [...groups];
                  next[i] = { ...g, color: e.target.value };
                  onChange(next);
                }}
              />
              <input
                value={g.name}
                disabled={readOnly}
                maxLength={30}
                style={{ maxWidth: 200 }}
                onChange={(e) => {
                  const next = [...groups];
                  next[i] = { ...g, name: e.target.value };
                  onChange(next);
                }}
              />
              <button type="button"
                className="btn btn-ghost btn-sm"
                disabled={readOnly}
                onClick={() => { setPickingFor(pickingFor === i ? null : i); setSearch(''); }}
              >
                <FlagIcon flag={g.flag} image={g.image} color={g.color} size={15} />
                {g.flag || g.image ? 'Changer' : 'Drapeau / image'}
              </button>
              {!readOnly && (
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }} htmlFor={`group-image-${g.id}`}>
                  Importer une image
                  <input
                    id={`group-image-${g.id}`}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { void importImage(i, e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
              )}
              {(g.flag || g.image) && !readOnly && (
                <button type="button" className="btn btn-ghost btn-sm" title="Revenir au carré de couleur" onClick={() => {
                  const next = [...groups];
                  next[i] = { ...g, flag: undefined, image: undefined };
                  onChange(next);
                }}>Aucun</button>
              )}
              {!readOnly && groups.length > 1 && (
                <button type="button" className="btn btn-ghost btn-sm" title="Supprimer le groupe" onClick={() => onChange(groups.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {pickingFor === i && !readOnly && (
              <div className="flag-picker">
                <input
                  placeholder="Rechercher un pays…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <div className="flag-grid">
                  {filtered.map(([iso, name]) => (
                    <button type="button"
                      key={iso}
                      className={`flag-choice${g.flag === iso ? ' on' : ''}`}
                      title={name}
                      onClick={() => {
                        const next = [...groups];
                        next[i] = { ...g, flag: iso, image: undefined, name: g.name.startsWith('Groupe') ? name : g.name };
                        onChange(next);
                        setPickingFor(null);
                      }}
                    >
                      <FlagIcon flag={iso} size={20} />
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {!readOnly && groups.length < 16 && (
        <button type="button"
          className="btn btn-ghost"
          style={{ marginTop: 12 }}
          onClick={() => onChange([...groups, {
            id: `g${Date.now()}`,
            name: `Groupe ${groups.length + 1}`,
            color: randomHexColor(),
          }])}
        >
          <Plus size={15} /> Ajouter un groupe
        </button>
      )}
    </div>
  );
}

/* ---------- édition des decks de cartes ---------- */

const ACTION_TYPES: { value: CardAction['kind']; label: string }[] = [
  { value: 'gain', label: 'Recevoir de l’argent de la banque' },
  { value: 'pay', label: 'Payer la banque' },
  { value: 'gain-each', label: 'Recevoir de chaque joueur' },
  { value: 'pay-each', label: 'Payer chaque joueur' },
  { value: 'steal-cash', label: 'Voler de l’argent à un joueur au hasard' },
  { value: 'pay-percent', label: 'Payer un % de son argent' },
  { value: 'goto', label: 'Aller à une case précise' },
  { value: 'goto-start', label: 'Aller à la case Départ' },
  { value: 'goto-nearest', label: 'Aller à la case la plus proche…' },
  { value: 'move', label: 'Avancer / reculer de N cases' },
  { value: 'goto-prison', label: 'Aller en prison' },
  { value: 'jail-card', label: 'Gagner une carte « Sortie de prison »' },
  { value: 'repairs', label: 'Payer des réparations (par maison/hôtel)' },
  { value: 'gain-per-building', label: 'Recevoir par maison/hôtel possédé' },
  { value: 'skip-turn', label: 'Passer son prochain tour' },
  { value: 'extra-turn', label: 'Rejouer immédiatement' },
  { value: 'steal-property', label: 'Voler une propriété à un joueur au hasard' },
  { value: 'swap-position', label: 'Échanger sa place avec un joueur au hasard' },
  { value: 'teleport-random', label: 'Téléportation sur une case aléatoire' },
  { value: 'goto-vacation', label: 'Partir en vacances' },
  { value: 'gain-per-property', label: 'Recevoir par propriété possédée' },
  { value: 'pay-per-property', label: 'Payer par propriété possédée' },
  { value: 'free-house', label: 'Construction offerte (groupe complet)' },
  { value: 'demolish', label: 'Démolition d’une construction au hasard' },
  { value: 'rent-immunity', label: 'Prochain loyer offert' },
  { value: 'steal-jail-card', label: 'Voler une carte « Sortie de prison »' },
];

function defaultAction(kind: CardAction['kind']): CardAction {
  switch (kind) {
    case 'gain': return { kind, amount: 100 };
    case 'pay': return { kind, amount: 50 };
    case 'gain-each': return { kind, amount: 10 };
    case 'pay-each': return { kind, amount: 25 };
    case 'goto': return { kind, tile: 0 };
    case 'goto-start': return { kind };
    case 'move': return { kind, steps: 3 };
    case 'goto-prison': return { kind };
    case 'jail-card': return { kind };
    case 'repairs': return { kind, perHouse: 25, perHotel: 100 };
    case 'steal-cash': return { kind, amount: 50 };
    case 'pay-percent': return { kind, percent: 10 };
    case 'gain-per-building': return { kind, perHouse: 25, perHotel: 100 };
    case 'goto-nearest': return { kind, target: 'airport' };
    case 'skip-turn': return { kind };
    case 'extra-turn': return { kind };
    case 'steal-property': return { kind };
    case 'swap-position': return { kind };
    case 'teleport-random': return { kind };
    case 'goto-vacation': return { kind };
    case 'gain-per-property': return { kind, amount: 25 };
    case 'pay-per-property': return { kind, amount: 25 };
    case 'free-house': return { kind };
    case 'demolish': return { kind };
    case 'rent-immunity': return { kind };
    case 'steal-jail-card': return { kind };
  }
}

/** Résumé lisible de l'effet d'une carte. */
function actionSummary(a: CardAction, tiles: Tile[]): string {
  const destination = a.kind === 'goto' ? tiles[a.tile]?.name ?? `case ${a.tile}` : '';
  switch (a.kind) {
    case 'gain': return `Le joueur reçoit $${a.amount}.`;
    case 'pay': return `Le joueur paye $${a.amount} à la banque.`;
    case 'gain-each': return `Chaque joueur lui donne $${a.amount}.`;
    case 'pay-each': return `Il paye $${a.amount} à chaque joueur.`;
    case 'goto': return `Il avance jusqu'à « ${destination} » (salaire si Départ franchi).`;
    case 'goto-start': return 'Il avance jusqu’à la case Départ et touche le salaire.';
    case 'move': {
      const direction = a.steps >= 0 ? 'avance' : 'recule';
      const steps = Math.abs(a.steps);
      const suffix = steps > 1 ? 's' : '';
      return `Il ${direction} de ${steps} case${suffix}.`;
    }
    case 'goto-prison': return 'Direction la prison, sans passer par le Départ.';
    case 'jail-card': return 'Il garde une carte « Sortie de prison ».';
    case 'repairs': return buildingSummary(a, 'paye');
    case 'steal-cash': return `Il vole jusqu'à $${a.amount} à un joueur tiré au sort.`;
    case 'pay-percent': return `Il paye ${a.percent} % de son argent liquide.`;
    case 'gain-per-building': return buildingSummary(a, 'reçoit');
    case 'goto-nearest': return `Il avance jusqu'à ${a.target === 'airport' ? "l'aéroport" : 'la compagnie'} le plus proche.`;
    case 'skip-turn': return 'Il passera son prochain tour.';
    case 'extra-turn': return 'Il rejoue immédiatement.';
    case 'steal-property': return 'Il vole une propriété (sans construction) à un joueur tiré au sort.';
    case 'swap-position': return 'Il échange sa case avec un joueur tiré au sort.';
    case 'teleport-random': return 'Il atterrit sur une case tirée au hasard.';
    case 'goto-vacation': return 'Il file directement en vacances.';
    case 'gain-per-property': return `Il reçoit $${a.amount} par propriété possédée.`;
    case 'pay-per-property': return `Il paye $${a.amount} par propriété possédée.`;
    case 'free-house': return 'Une construction lui est offerte sur un groupe complet.';
    case 'demolish': return 'Il perd une construction tirée au hasard.';
    case 'rent-immunity': return 'Son prochain loyer est offert.';
    case 'steal-jail-card': return 'Il subtilise une carte « Sortie de prison » à un joueur.';
  }
}

function DeckEditor({ deck, mode, cards, tiles, readOnly, onMode, onCards }: Readonly<{
  deck: 'treasure' | 'surprise';
  mode: DeckMode;
  cards: Card[];
  tiles: Tile[];
  readOnly: boolean;
  onMode: (m: DeckMode) => void;
  onCards: (c: Card[]) => void;
}>) {
  const title = deck === 'treasure' ? 'Cartes Trésor' : 'Cartes Surprise';
  const DeckIcon = deck === 'treasure' ? Gem : CircleHelp;
  const toast = useToast();
  const [fillCount, setFillCount] = useState(12);
  const [aggressive, setAggressive] = useState(false);

  // probabilité de tirage : poids de la carte / poids total du deck effectif
  const predefCount = deck === 'treasure' ? PREDEFINED_TREASURE.length : PREDEFINED_SURPRISE.length;
  const customWeight = cards.reduce((s, c) => s + (c.weight ?? 1), 0);
  const totalWeight = (mode === 'mix' ? predefCount : 0) + customWeight;
  const drawPercent = (c: Card) => (totalWeight > 0 ? Math.round(((c.weight ?? 1) / totalWeight) * 100) : 0);

  // équilibre du deck effectivement joué (prédéfinies incluses en mode mélange)
  const unit = boardUnit(tiles);
  const predefined = deck === 'treasure' ? PREDEFINED_TREASURE : PREDEFINED_SURPRISE;
  const playedCards = effectiveCards(mode, predefined, cards);
  const stats = deckStats(playedCards, unit);
  const swing = Math.max(stats.gains, -stats.losses) || 1;
  const verdict = balanceLabel(stats.expected);
  const verdictClass = balanceTone(stats.expected);

  function fill() {
    if (cards.length > 0 && !confirm(`Remplacer les ${cards.length} carte(s) existantes par un deck équilibré de ${fillCount} cartes ?`)) return;
    onCards(generateBalancedDeck({ deck, count: fillCount, tiles, aggressive }));
    toast('Deck équilibré généré !', true);
  }

  return (
    <div className="panel panel-pad">
      <h3 className="row" style={{ marginBottom: 10, gap: 8 }}>
        <DeckIcon size={18} className={deck === 'treasure' ? 'ico-treasure' : 'ico-surprise'} /> {title}
      </h3>
      <div className="field" style={{ marginBottom: 14 }}>
        <div className="field-label">Cartes utilisées en jeu</div>
        <div className="segments">
          <button type="button" disabled={readOnly} className={mode === 'predefined' ? 'on' : ''} onClick={() => onMode('predefined')}>Prédéfinies</button>
          <button type="button" disabled={readOnly} className={mode === 'custom' ? 'on' : ''} onClick={() => onMode('custom')}>Mes cartes</button>
          <button type="button" disabled={readOnly} className={mode === 'mix' ? 'on' : ''} onClick={() => onMode('mix')}>Prédéfinies + les miennes</button>
        </div>
      </div>

      <div className="balance-box">
        <div className="row spread wrap" style={{ gap: 8 }}>
          <strong style={{ fontSize: 13 }}>
            <Scale size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Équilibre du deck
          </strong>
          <span className={`chip balance-verdict ${verdictClass}`}>
            {verdict} · {stats.expected > 0 ? '+' : ''}{stats.expected} $ / tirage
          </span>
        </div>
        <div className="balance-bar" title={`Gains cumulés ${stats.gains} $ · pertes ${stats.losses} $`}>
          <span className="balance-neg" style={{ flex: -stats.losses / swing || 0.01 }} />
          <span className="balance-pos" style={{ flex: stats.gains / swing || 0.01 }} />
        </div>
        <div className="balance-legend">
          <span>{stats.counts.bonus} gains</span>
          <span>{stats.counts.malus} pertes</span>
          <span>{stats.counts.move} déplacements</span>
          <span>{stats.counts.special} spéciales</span>
        </div>
      </div>

      {mode !== 'predefined' && (
        <>
          <div className="fill-box">
            <div className="row wrap" style={{ gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Remplissage équilibré</span>
              <div className="segments" style={{ marginLeft: 'auto' }}>
                {[8, 12, 16, 20].map((n) => (
                  <button type="button" key={n} disabled={readOnly} className={fillCount === n ? 'on' : ''} onClick={() => setFillCount(n)}>{n}</button>
                ))}
              </div>
            </div>
            <div className="toggle-row" style={{ padding: '4px 0' }}>
              <span id="deck-aggressive-label">
                <strong style={{ fontSize: 13 }}>Cartes agressives</strong>
                <span className="hint">Inclure les vols d'argent et de propriété (compensés par des malus).</span>
              </span>
              <input aria-labelledby="deck-aggressive-label" id="deck-aggressive" type="checkbox" className="switch" disabled={readOnly} checked={aggressive} onChange={(e) => setAggressive(e.target.checked)} />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={readOnly} onClick={fill}>
                <Wand2 size={14} /> Générer {fillCount} cartes équilibrées
              </button>
              <button type="button"
                className="btn btn-ghost btn-sm"
                disabled={readOnly || cards.length === 0}
                title="Ajuste les montants pour ramener l'espérance à zéro"
                onClick={() => { onCards(rebalanceDeck(cards, unit)); toast('Montants rééquilibrés.', true); }}
              >
                <Scale size={14} /> Rééquilibrer les montants
              </button>
            </div>
          </div>

          <div className="col" style={{ gap: 14 }}>
            {cards.map((c, i) => (
              <div key={c.id} className={`card-editor ${deck}`}>
                <div className="card-editor-preview">
                  <div className="card-popup-head row" style={{ gap: 6, justifyContent: 'center' }}>
                    <DeckIcon size={15} /> {deck === 'treasure' ? 'Trésor' : 'Surprise'} n°{i + 1}
                  </div>
                  <p className="card-preview-text">{c.text.trim() || 'Écrivez le texte de la carte ci-dessous…'}</p>
                  <p className="card-preview-effect">{actionSummary(c.action, tiles)}</p>
                  <span className="card-preview-odds" title="Probabilité de tirage dans ce deck">
                    ~{drawPercent(c)} % de chance
                  </span>
                </div>

                <div className="col" style={{ gap: 8 }}>
                  <div className="field">
                    <label htmlFor={`card-text-${deck}-${i}`}>Texte lu par les joueurs</label>
                    <textarea
                      id={`card-text-${deck}-${i}`}
                      rows={2}
                      value={c.text}
                      disabled={readOnly}
                      maxLength={200}
                      placeholder="Ex. : Votre fusée décolle ! Recevez $150."
                      onChange={(e) => {
                        const next = [...cards];
                        next[i] = { ...c, text: e.target.value };
                        onCards(next);
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`card-effect-${deck}-${i}`}>Effet</label>
                    <select
                      id={`card-effect-${deck}-${i}`}
                      value={c.action.kind}
                      disabled={readOnly}
                      onChange={(e) => {
                        const next = [...cards];
                        next[i] = { ...c, action: defaultAction(e.target.value as CardAction['kind']) };
                        onCards(next);
                      }}
                    >
                      {ACTION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                  <ActionParams
                    action={c.action}
                    tiles={tiles}
                    readOnly={readOnly}
                    onChange={(action) => {
                      const next = [...cards];
                      next[i] = { ...c, action };
                      onCards(next);
                    }}
                  />
                  <div className="field">
                    <label>Probabilité de tirage (poids ×{c.weight ?? 1})</label>
                    <div className="row" style={{ gap: 10 }}>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={c.weight ?? 1}
                        disabled={readOnly}
                        style={{ width: 180 }}
                        onChange={(e) => {
                          const next = [...cards];
                          next[i] = { ...c, weight: Number(e.target.value) };
                          onCards(next);
                        }}
                      />
                      <span className="faint" style={{ fontSize: 12 }}>
                        Une carte ×10 sort 10 fois plus souvent qu'une carte ×1.
                      </span>
                    </div>
                  </div>
                  {!readOnly && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => onCards(cards.filter((_, j) => j !== i))}>
                      <Trash2 size={13} /> Supprimer la carte
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!readOnly && cards.length < 40 && (
            <button type="button"
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              onClick={() => onCards([...cards, { id: `c${Date.now()}`, text: '', action: defaultAction('gain') }])}
            >
              <Plus size={15} /> Ajouter une carte
            </button>
          )}
          {cards.length === 0 && <p className="faint" style={{ marginTop: 10, fontSize: 13 }}>Aucune carte personnalisée pour l'instant.</p>}
        </>
      )}
    </div>
  );
}

function ActionParams({ action, tiles, readOnly, onChange }: Readonly<{
  action: CardAction;
  tiles: Tile[];
  readOnly: boolean;
  onChange: (a: CardAction) => void;
}>) {
  const num = (id: string, label: string, value: number, set: (v: number) => void, min = 0, suffix = '$') => (
    <div className="field" key={id}>
      <label htmlFor={id}>{label}</label>
      <div className="rent-input">
        <span className="faint">{suffix}</span>
        <input id={id} type="number" value={value} disabled={readOnly} min={min}
          onChange={(e) => set(Number(e.target.value) || 0)} />
      </div>
    </div>
  );

  switch (action.kind) {
    case 'gain': return num('action-gain', 'Montant reçu', action.amount, (v) => onChange({ ...action, amount: Math.max(1, v) }), 1);
    case 'pay': return num('action-pay', 'Montant payé', action.amount, (v) => onChange({ ...action, amount: Math.max(1, v) }), 1);
    case 'gain-each': return num('action-gain-each', 'Montant reçu de chaque joueur', action.amount, (v) => onChange({ ...action, amount: Math.max(1, v) }), 1);
    case 'pay-each': return num('action-pay-each', 'Montant payé à chaque joueur', action.amount, (v) => onChange({ ...action, amount: Math.max(1, v) }), 1);
    case 'steal-cash': return num('action-steal-cash', 'Montant volé (max)', action.amount, (v) => onChange({ ...action, amount: Math.max(1, v) }), 1);
    case 'gain-per-property': return num('action-gain-per-property', 'Montant par propriété', action.amount, (v) => onChange({ ...action, amount: Math.max(1, v) }), 1);
    case 'pay-per-property': return num('action-pay-per-property', 'Montant par propriété', action.amount, (v) => onChange({ ...action, amount: Math.max(1, v) }), 1);
    case 'pay-percent': return num('action-pay-percent', 'Pourcentage payé', action.percent, (v) => onChange({ ...action, percent: Math.min(100, Math.max(1, v)) }), 1, '%');
    case 'goto':
      return (
        <div className="field">
          <label htmlFor="action-goto">Case de destination</label>
          <select
            id="action-goto"
            value={action.tile}
            disabled={readOnly}
            onChange={(e) => onChange({ ...action, tile: Number(e.target.value) })}
          >
            {tiles.map((t, i) => (
              <option key={`${t.type}-${t.name}-${i}`} value={i}>n°{i} — {t.name}</option>
            ))}
          </select>
        </div>
      );
    case 'goto-nearest':
      return (
        <div className="field">
          <div className="field-label">Type de case visée</div>
          <div className="segments">
            <button type="button" disabled={readOnly} className={action.target === 'airport' ? 'on' : ''} onClick={() => onChange({ ...action, target: 'airport' })}>Aéroport</button>
            <button type="button" disabled={readOnly} className={action.target === 'utility' ? 'on' : ''} onClick={() => onChange({ ...action, target: 'utility' })}>Compagnie</button>
          </div>
        </div>
      );
    case 'move':
      return num('action-move', 'Nombre de cases (négatif = reculer)', action.steps, (v) => onChange({ ...action, steps: Math.max(-30, Math.min(30, v)) }), -30, '↔');
    case 'repairs':
      return (
        <div className="row wrap">
          {num('action-repairs-house', 'Par maison', action.perHouse, (v) => onChange({ ...action, perHouse: Math.max(0, v) }))}
          {num('action-repairs-hotel', 'Par hôtel', action.perHotel, (v) => onChange({ ...action, perHotel: Math.max(0, v) }))}
        </div>
      );
    case 'gain-per-building':
      return (
        <div className="row wrap">
          {num('action-buildings-house', 'Par maison', action.perHouse, (v) => onChange({ ...action, perHouse: Math.max(0, v) }))}
          {num('action-buildings-hotel', 'Par hôtel', action.perHotel, (v) => onChange({ ...action, perHotel: Math.max(0, v) }))}
        </div>
      );
    default:
      return null;
  }
}
