import { useEffect, useState } from 'react';
import { Clock, Crown, Percent, Star, Trophy } from 'lucide-react';
import type { LeaderboardEntry, LeaderboardSort } from 'shared';
import { Shell } from '../components/Shell';
import { Avatar } from '../components/icons';
import { api } from '../api';
import { useAuth } from '../context';

const SORTS: { value: LeaderboardSort; label: string; Icon: typeof Trophy; hint: string }[] = [
  { value: 'global', label: 'Global', Icon: Crown, hint: 'Victoires, régularité et expérience combinées' },
  { value: 'wins', label: 'Victoires', Icon: Trophy, hint: 'Nombre total de parties gagnées' },
  { value: 'ratio', label: 'Meilleur ratio', Icon: Percent, hint: 'Taux de victoire (5 parties minimum)' },
  { value: 'level', label: 'Niveau', Icon: Star, hint: "Expérience accumulée" },
  { value: 'playtime', label: 'Temps de jeu', Icon: Clock, hint: 'Temps passé en partie' },
];

function formatPlayTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')}` : `${m} min`;
}

export function LeaderboardPage() {
  const [sort, setSort] = useState<LeaderboardSort>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    api.get<LeaderboardEntry[]>(`/api/profile/leaderboard?sort=${sort}`)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [sort]);

  const active = SORTS.find((s) => s.value === sort)!;

  const value = (e: LeaderboardEntry) => {
    switch (sort) {
      case 'wins': return `${e.wins} victoire${e.wins > 1 ? 's' : ''}`;
      case 'ratio': return `${Math.round(e.ratio * 100)} %`;
      case 'level': return `Niveau ${e.level}`;
      case 'playtime': return formatPlayTime(e.playTimeS);
      default: return `${e.wins}V · ${Math.round(e.ratio * 100)} %`;
    }
  };

  if (loading) {
    return <Shell><div className="panel panel-pad center empty-state"><p className="muted">Chargement…</p></div></Shell>;
  }

  if (entries.length === 0) {
    return (
      <Shell>
        <div className="home-head">
          <div>
            <h1>Classement</h1>
            <p className="muted">{active.hint}. Les parties contre des bots n'y figurent pas.</p>
          </div>
        </div>
        <div className="leaderboard-filters">
          {SORTS.map(({ value: v, label, Icon }) => (
            <button type="button" key={v} className={sort === v ? 'on' : ''} onClick={() => setSort(v)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="panel panel-pad center empty-state">
          <Trophy size={40} color="var(--gold)" />
          <p className="muted">Aucune partie classée pour l'instant. Jouez entre humains pour apparaître ici !</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="home-head">
        <div>
          <h1>Classement</h1>
          <p className="muted">{active.hint}. Les parties contre des bots n'y figurent pas.</p>
        </div>
      </div>

      <div className="leaderboard-filters">
        {SORTS.map(({ value: v, label, Icon }) => (
          <button type="button" key={v} className={sort === v ? 'on' : ''} onClick={() => setSort(v)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="panel leaderboard">
        {entries.map((e) => (
          <div key={e.id} className={`leader-row${e.id === user?.id ? ' me' : ''}`}>
            <span className={`leader-rank rank-${e.rank <= 3 ? e.rank : 'n'}`}>{e.rank}</span>
            <Avatar id={e.avatar} size={34} />
            <div className="grow" style={{ minWidth: 0 }}>
              <strong>{e.username}</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                Niveau {e.level} · {e.games} partie{e.games > 1 ? 's' : ''} · {formatPlayTime(e.playTimeS)}
              </div>
            </div>
            <span className="leader-value">{value(e)}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
