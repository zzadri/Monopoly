import { useState, type FormEvent } from 'react';
import { Dices, Gem, Map as MapIcon, Trophy, Users, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth, type SessionUser } from '../context';

type Mode = 'guest' | 'login' | 'register';

const FEATURES = [
  { Icon: Users, title: 'Jusqu’à 8 joueurs', text: 'En local ou entre amis sur le même réseau, avec des bots pour compléter.' },
  { Icon: MapIcon, title: 'Plateaux sur mesure', text: 'Créez vos cartes : cases, prix, loyers, pays et cartes personnalisées.' },
  { Icon: Gem, title: 'Règles au choix', text: 'Enchères, hypothèques, cagnotte de vacances, dés spéciaux…' },
  { Icon: Trophy, title: 'Statistiques', text: 'Victoires, historique et courbes de fortune pour chaque partie.' },
];

function authTitle(mode: Mode) {
  if (mode === 'guest') return 'Rejoindre une partie';
  if (mode === 'login') return 'Content de vous revoir';
  return 'Bienvenue !';
}

function authMessage(mode: Mode) {
  if (mode === 'guest') return 'Un pseudo suffit pour jouer tout de suite.';
  if (mode === 'login') return 'Connectez-vous pour retrouver vos stats et vos plateaux.';
  return 'Créez un compte gratuit pour garder votre progression.';
}

function submitLabel(mode: Mode, busy: boolean) {
  if (busy) return 'Un instant…';
  if (mode === 'guest') return 'Jouer maintenant';
  if (mode === 'login') return 'Se connecter';
  return 'Créer mon compte';
}

export function AuthPage({ redirectTo }: Readonly<{ redirectTo?: string }>) {
  const [mode, setMode] = useState<Mode>('guest');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = mode === 'guest'
        ? await api.post<SessionUser>('/api/auth/guest', { username })
        : await api.post<SessionUser>(`/api/auth/${mode}`, { username, password });
      setUser(user);
      navigate(redirectTo && redirectTo !== '/' ? redirectTo : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur réseau.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-brand">
        <div className="auth-logo">
          <Dices size={40} className="auth-logo-dice" />
          <h1>Monopolie</h1>
        </div>
        <p className="auth-tagline">
          Le jeu de plateau à jouer entre amis, sur votre réseau. Sans installation, sans pub.
        </p>
        <ul className="auth-features">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title}>
              <span className="auth-feature-icon"><Icon size={17} /></span>
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-head">
          <h2>{authTitle(mode)}</h2>
          <p className="muted">
            {authMessage(mode)}
          </p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'guest'} className={mode === 'guest' ? 'on' : ''} onClick={() => setMode('guest')}>
            <Zap size={14} /> Partie rapide
          </button>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Connexion
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            Inscription
          </button>
        </div>

        <div className="col" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="username">Pseudo</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={20}
              required
              placeholder={mode === 'guest' ? 'Ex. : Alex' : undefined}
            />
          </div>

          {mode !== 'guest' && (
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={6}
                required
              />
            </div>
          )}

          {error && <p className="error-text">{error}</p>}

          <button type="button" className="btn btn-primary btn-lg" disabled={busy}>
            {submitLabel(mode, busy)}
          </button>

          {mode === 'guest' && (
            <p className="auth-note">
              En invité, vous jouez à toutes les parties (publiques et privées).
              Les statistiques et la création de plateaux demandent un compte —{' '}
              <button type="button" className="link-btn" onClick={() => setMode('register')}>en créer un</button>.
            </p>
          )}
          {mode === 'login' && (
            <p className="auth-note">
              Pas de compte ?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('guest')}>Jouer en invité</button>
              {' '}ou{' '}
              <button type="button" className="link-btn" onClick={() => setMode('register')}>s'inscrire</button>.
            </p>
          )}
          {mode === 'register' && (
            <p className="auth-note">
              Déjà inscrit ?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('login')}>Se connecter</button>.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
