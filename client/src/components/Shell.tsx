import { NavLink } from 'react-router-dom';
import { Dices, LogOut } from 'lucide-react';
import { useAuth } from '../context';
import { Avatar } from './icons';
import { SettingsButton } from './Settings';
import type { ReactNode } from 'react';

interface ShellProps {
  readonly children: ReactNode;
  readonly wide?: boolean;
}

export function Shell({ children, wide }: ShellProps) {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <header className="shell-header">
        <NavLink to="/" className="logo">
          <Dices size={26} className="logo-dice" />
          <span className="logo-text">Monopolie</span>
        </NavLink>
        <nav className="shell-nav">
          <NavLink to="/" end>Salons</NavLink>
          <NavLink to="/plateaux">Plateaux</NavLink>
          <NavLink to="/classement">Classement</NavLink>
        </nav>
        <div className="row">
          <SettingsButton />
          {/* l'avatar + le pseudo servent de bouton d'accès au profil */}
          <NavLink to="/profil" className="shell-user" title={user?.guest ? 'Mode invité' : 'Mon profil'}>
            <Avatar id={user?.avatar ?? 'ghost'} size={30} />
            <span className="shell-username">{user?.username}</span>
            {user?.guest && <span className="chip" style={{ fontSize: 10 }}>Invité</span>}
          </NavLink>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void logout()} title="Se déconnecter">
            <LogOut size={14} />
          </button>
        </div>
      </header>
      <main className={`shell-main${wide ? ' wide' : ''}`}>{children}</main>
    </div>
  );
}
