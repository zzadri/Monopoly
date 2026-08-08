import type { CSSProperties } from 'react';
import {
  Anchor, Bird, Bot, Bug, Castle, Cat, Clover, Crown, Dog, Droplets, Fish, Flame,
  Fuel, Gem, Ghost, Globe, CircleHelp, Hotel, House, Map as MapIcon, Mountain, Plane,
  Rabbit, RadioTower, Rainbow, Rocket, Skull, Snail, Snowflake, Squirrel, Tent,
  TreePalm, Turtle, Zap, ArrowRightCircle, Receipt, type LucideIcon,
} from 'lucide-react';
import type { Tile } from 'shared';

/* ---------- avatars ---------- */

const AVATAR_ICONS: Record<string, LucideIcon> = {
  cat: Cat, dog: Dog, bird: Bird, fish: Fish, rabbit: Rabbit, squirrel: Squirrel,
  turtle: Turtle, snail: Snail, ghost: Ghost, rocket: Rocket, gem: Gem, crown: Crown,
  anchor: Anchor, flame: Flame, zap: Zap, bug: Bug, bot: Bot,
};

interface AvatarIconProps {
  readonly id: string;
  readonly size?: number;
  readonly color?: string;
}

export function AvatarIcon({ id, size = 18, color }: AvatarIconProps) {
  const Icon = AVATAR_ICONS[id] ?? Ghost;
  return <Icon size={size} color={color} strokeWidth={2.2} aria-hidden />;
}

interface AvatarProps {
  readonly id: string;
  readonly color?: string;
  readonly size?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** Pastille ronde : fond teinté couleur joueur + icône. */
export function Avatar({ id, color, size = 34, className, style }: AvatarProps) {
  return (
    <span
      className={`avatar ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        borderColor: color,
        background: color ? color + '2e' : undefined,
        color: color ?? 'var(--ink)',
        ...style,
      }}
    >
      <AvatarIcon id={id} size={Math.round(size * 0.55)} />
    </span>
  );
}

/* ---------- icônes de cases ---------- */

const UTILITY_ICONS: Record<string, LucideIcon> = {
  '⚡': Zap, '🚰': Droplets, '🔥': Flame, '📡': RadioTower, '⛽': Fuel,
};

interface TileTypeIconProps {
  readonly tile: Tile;
  readonly size?: number;
}

export function TileTypeIcon({ tile, size = 20 }: TileTypeIconProps) {
  switch (tile.type) {
    case 'start': return <ArrowRightCircle size={size} className="ico-start" aria-hidden />;
    case 'airport': return <Plane size={size} aria-hidden />;
    case 'utility': {
      const Icon = UTILITY_ICONS[tile.icon ?? '⚡'] ?? Zap;
      return <Icon size={size} aria-hidden />;
    }
    case 'tax': return <Receipt size={size} aria-hidden />;
    case 'treasure': return <Gem size={size} className="ico-treasure" aria-hidden />;
    case 'surprise': return <CircleHelp size={size} className="ico-surprise" aria-hidden />;
    case 'goto-prison': return <Skull size={size} aria-hidden />;
    case 'vacation': return <TreePalm size={size} className="ico-vacation" aria-hidden />;
    case 'prison': return null; // rendu spécial (cellule)
    default: return null;
  }
}

/* ---------- icône de plateau (les données stockent un emoji) ---------- */

const BOARD_ICONS: Record<string, LucideIcon> = {
  '🌍': Globe, '🗺️': MapIcon, '🍀': Clover, '☠️': Skull, '🌋': Mountain, '🏰': Castle,
  '🚀': Rocket, '🌈': Rainbow, '🦖': Bug, '⚓': Anchor, '🎪': Tent, '🧊': Snowflake,
};

interface BoardIconProps {
  readonly icon: string;
  readonly size?: number;
}

export function BoardIcon({ icon, size = 18 }: BoardIconProps) {
  const Icon = BOARD_ICONS[icon];
  if (!Icon) return <MapIcon size={size} aria-hidden />;
  return <Icon size={size} aria-hidden />;
}

export const BOARD_ICON_CHOICES = Object.keys(BOARD_ICONS);

/* ---------- drapeaux (emoji drapeau → SVG flag-icons) ---------- */

function emojiToIso(flag: string | undefined): string | null {
  if (!flag) return null;
  if (/^[a-z]{2}$/.test(flag)) return flag; // code ISO stocké directement
  const cps = [...flag].map((c) => c.codePointAt(0)!);
  if (cps.length !== 2 || cps.some((c) => c < 0x1f1e6 || c > 0x1f1ff)) return null;
  return cps.map((c) => String.fromCodePoint(c - 0x1f1e6 + 97)).join('');
}

interface FlagIconProps {
  readonly flag?: string;
  readonly image?: string;
  readonly color?: string;
  readonly size?: number;
}

export function FlagIcon({ flag, image, color, size = 14 }: FlagIconProps) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          flex: 'none', boxShadow: '0 0 0 1.5px #00000055',
        }}
      />
    );
  }
  const iso = emojiToIso(flag);
  if (iso) {
    return (
      <span
        className={`fi fi-${iso} fis`}
        style={{ width: size, height: size, borderRadius: '50%', flex: 'none', boxShadow: '0 0 0 1.5px #00000055' }}
        aria-hidden
      />
    );
  }
  return (
    <span
      style={{ width: size * 0.8, height: size * 0.8, borderRadius: 3, background: color ?? 'var(--ink-faint)', flex: 'none' }}
      aria-hidden
    />
  );
}

/* ---------- maisons / hôtel ---------- */

/**
 * Maisons et hôtel : icônes au trait, dans le même langage visuel que le reste
 * de l'interface (jeu d'icônes lucide), teintées avec les couleurs du thème.
 */
interface HousesProps {
  readonly count: number;
  readonly size?: number;
}

export function Houses({ count, size = 12 }: HousesProps) {
  if (count <= 0) return null;
  if (count >= 5) {
    return (
      <span className="houses-row hotel-mark" title="Hôtel" aria-label="Hôtel">
        <Hotel size={size * 1.15} strokeWidth={2.4} />
      </span>
    );
  }
  return (
    <span
      className="houses-row house-mark"
      aria-label={`${count} maison${count > 1 ? 's' : ''}`}
      title={`${count} maison${count > 1 ? 's' : ''}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <House key={`${count}-${i}`} size={size} strokeWidth={2.6} />
      ))}
    </span>
  );
}
