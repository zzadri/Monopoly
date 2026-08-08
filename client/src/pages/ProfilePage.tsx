import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Dices, Lock, MapPin, Pencil, PlayCircle, Skull, Trophy } from 'lucide-react';
import { AVATARS, type GameHistoryEntry, type UserProfile } from 'shared';
import { Shell } from '../components/Shell';
import { NetWorthChart } from '../components/NetWorthChart';
import { Avatar, AvatarIcon } from '../components/icons';
import { api } from '../api';
import { useAuth, useToast } from '../context';

function formatPlayTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`;
}

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const logoutToRegister = () => logout(); // retour à l'écran d'accueil (onglet « Créer un compte »)
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [histTab, setHistTab] = useState<'ranked' | 'bots'>('ranked');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);

  useEffect(() => {
    if (user?.guest) return;
    api.get<UserProfile>('/api/profile/me').then(setProfile).catch(() => {});
    api.get<GameHistoryEntry[]>('/api/profile/history').then(setHistory).catch(() => {});
  }, [user?.guest]);

  if (user?.guest) {
    return (
      <Shell>
        <div className="panel panel-pad center empty-state" style={{ maxWidth: 520, margin: '40px auto' }}>
          <Trophy size={44} color="var(--gold)" />
          <h2>Vous jouez en invité</h2>
          <p className="muted" style={{ textAlign: 'center' }}>
            Vous pouvez rejoindre et jouer à toutes les parties. Créez un compte gratuit pour
            garder vos victoires, votre historique et créer vos propres plateaux.
          </p>
          <button className="btn btn-gold btn-lg" onClick={() => void logoutToRegister()}>
            Créer mon compte
          </button>
        </div>
      </Shell>
    );
  }

  async function changeAvatar(avatar: string) {
    try {
      await api.put('/api/auth/avatar', { avatar });
      if (user) setUser({ ...user, avatar });
      setProfile((p) => (p ? { ...p, avatar } : p));
      setPickingAvatar(false);
      toast('Avatar mis à jour !', true);
    } catch {
      toast("Impossible de changer d'avatar.");
    }
  }

  const ratio = profile && profile.games > 0 ? Math.round((profile.wins / profile.games) * 100) : 0;
  const ranked = useMemo(() => history.filter((h) => !h.vsBots), [history]);
  const botHistory = useMemo(() => history.filter((h) => h.vsBots), [history]);
  const shownHistory = histTab === 'bots' ? botHistory : ranked;

  return (
    <Shell>
      {profile && (
        <>
          <div className="profile-head panel panel-pad">
            <div className="profile-identity">
              <button className="avatar profile-avatar" onClick={() => setPickingAvatar(!pickingAvatar)} title="Changer d'avatar">
                <AvatarIcon id={profile.avatar} size={44} />
                <span className="avatar-edit"><Pencil size={12} /></span>
              </button>
              <div className="profile-name">
                <h1>{profile.username}</h1>
                {/* createdAt est déjà une chaîne ISO en UTC : ne pas y ajouter de « Z » */}
                <p className="muted">Membre depuis le {new Date(profile.createdAt).toLocaleDateString('fr-FR')}</p>
                <div className="level-bar" title={`${profile.xp} XP · prochain niveau à ${profile.xpForNextLevel} XP`}>
                  <span className="level-chip">Niveau {profile.level}</span>
                  <span className="level-track">
                    <span className="level-fill" style={{ width: `${Math.round(profile.levelProgress * 100)}%` }} />
                  </span>
                  <span className="level-xp">{profile.xp} / {profile.xpForNextLevel} XP</span>
                </div>
              </div>
            </div>

            <div className="profile-stats">
              <div className="stat-box"><strong>{profile.games}</strong><span>Parties</span></div>
              <div className="stat-box win"><strong>{profile.wins}</strong><span>Victoires</span></div>
              <div className="stat-box loss"><strong>{profile.losses}</strong><span>Défaites</span></div>
              <div className="stat-box"><strong>{ratio}%</strong><span>Ratio</span></div>
              <div className="stat-box"><strong>{profile.winStreak}</strong><span>Série</span></div>
              <div className="stat-box"><strong>{profile.bestStreak}</strong><span>Record</span></div>
              <div className="stat-box"><strong>{formatPlayTime(profile.playTimeS)}</strong><span>Temps de jeu</span></div>
            </div>
          </div>

          {pickingAvatar && (
            <div className="panel panel-pad" style={{ marginTop: 12 }}>
              <div className="row wrap">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    className="avatar"
                    style={{ width: 44, height: 44, cursor: 'pointer', borderColor: a === profile.avatar ? 'var(--gold)' : undefined }}
                    onClick={() => void changeAvatar(a)}
                    title={a}
                  >
                    <AvatarIcon id={a} size={24} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="row spread wrap" style={{ margin: '26px 0 12px', gap: 10 }}>
            <h2>Historique des parties</h2>
            {/* les parties avec bots sont isolées : elles ne comptent ni au ratio ni au classement */}
            <div className="segments">
              <button className={histTab === 'ranked' ? 'on' : ''} onClick={() => setHistTab('ranked')}>
                Parties classées ({ranked.length})
              </button>
              <button className={histTab === 'bots' ? 'on' : ''} onClick={() => setHistTab('bots')}>
                <Bot size={13} /> Avec bots ({botHistory.length})
              </button>
            </div>
          </div>
          {histTab === 'bots' && (
            <p className="faint" style={{ fontSize: 13, marginBottom: 10 }}>
              Ces parties restent visibles pour vous seul et n'influencent ni vos victoires, ni votre ratio, ni votre XP.
            </p>
          )}
          {shownHistory.length === 0 && (
            <div className="panel panel-pad center empty-state">
              <Dices size={40} color="var(--brand)" />
              <p className="muted">
                {histTab === 'bots' ? 'Aucune partie contre des bots.' : 'Aucune partie classée pour l\'instant. Lancez-vous !'}
              </p>
            </div>
          )}
          <div className="col">
            {shownHistory.map((h) => (
              <div key={h.id} className="panel history-card">
                <button className="history-row" onClick={() => setExpanded(expanded === h.id ? null : h.id)}>
                  <span className={`chip ${h.won ? 'won' : 'lost'}`}>
                    {h.won ? <><Trophy size={12} /> Victoire</> : <><Skull size={12} /> Défaite</>}
                  </span>
                  <span className="grow" style={{ textAlign: 'left' }}>
                    <strong>{h.boardName}</strong>
                    <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                      {new Date(h.endedAt).toLocaleString('fr-FR')} · {h.turns} tours · {Math.floor(h.durationS / 60)} min
                      {h.xpGained > 0 && <> · <span style={{ color: 'var(--brand)' }}>+{h.xpGained} XP</span></>}
                    </span>
                  </span>
                  <span className="history-players">
                    {h.players.map((p, i) => (
                      <span key={i} title={p.name} style={{ opacity: p.won ? 1 : 0.45 }}>
                        <AvatarIcon id={p.avatar} size={16} />
                      </span>
                    ))}
                  </span>
                  <span className="faint">{expanded === h.id ? '▲' : '▼'}</span>
                </button>
                {expanded === h.id && (
                  <div className="history-detail">
                    <div className="end-stats" style={{ marginBottom: 12 }}>
                      <div className="end-stat"><span><Trophy size={20} color="var(--gold)" /></span><div><div className="faint">Vainqueur</div><strong>{h.winnerName}</strong></div></div>
                      <div className="end-stat"><span><Dices size={20} /></span><div><div className="faint">Doubles</div><strong>{h.doubles}</strong></div></div>
                      {h.mostVisited && <div className="end-stat"><span><MapPin size={20} /></span><div><div className="faint">Case populaire</div><strong>{h.mostVisited}</strong></div></div>}
                      {h.prisonKing && <div className="end-stat"><span><Lock size={20} /></span><div><div className="faint">Roi de la prison</div><strong>{h.prisonKing}</strong></div></div>}
                    </div>
                    <NetWorthChart history={h.netWorthHistory} height={180} />
                    {/* le bouton n'apparaît que si un journal d'actions a bien été enregistré */}
                    {h.hasReplay ? (
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}
                        onClick={() => navigate(`/replay/${h.id}`)}>
                        <PlayCircle size={15} /> Revoir la partie
                      </button>
                    ) : (
                      <p className="faint" style={{ marginTop: 12, fontSize: 12.5 }}>
                        Aucun replay pour cette partie : elle est antérieure à l'enregistrement du déroulé.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
