import { Dices, Lock, MapPin, MessageCircle, Play, RefreshCw, ShieldCheck, Timer, Trophy } from 'lucide-react';
import { INTEGRITY_LABELS } from 'shared';
import { emitAck } from '../socket';
import { useToast } from '../context';
import { NetWorthChart } from './NetWorthChart';
import { AvatarIcon } from './icons';
import type { EndSummary } from '../pages/RoomPage';

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec} secondes`;
  return `${m} minute${m > 1 ? 's' : ''} et ${sec} seconde${sec > 1 ? 's' : ''}`;
}

interface EndScreenProps {
  readonly summary: EndSummary;
  readonly isHost: boolean;
  readonly onLeave: () => void;
}

export function EndScreen({ summary, isHost, onLeave }: EndScreenProps) {
  const toast = useToast();
  const winner = summary.players.find((p) => p.won);

  return (
    <div className="modal-backdrop">
      <button
        type="button"
        className="modal-backdrop-hitarea"
        aria-label="Fermer l'écran de fin"
        onClick={onLeave}
      />
      <div className="modal end-screen">
        <div className="winner-banner">
          <span className="winner-trophy"><Trophy size={44} color="var(--gold)" /></span>
          <div>
            <div className="faint" style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Vainqueur</div>
            <h2 className="row" style={{ margin: 0, gap: 8 }}>
              {winner && <AvatarIcon id={winner.avatar} size={26} />} {summary.winnerName}
            </h2>
          </div>
        </div>

        <div className="end-stats">
          <div className="end-stat"><span><Timer size={20} /></span><div><div className="faint">Durée</div><strong>{formatDuration(summary.durationS)}</strong></div></div>
          <div className="end-stat"><span><Play size={20} /></span><div><div className="faint">Tours</div><strong>{summary.turns}</strong></div></div>
          <div className="end-stat"><span><Dices size={20} /></span><div><div className="faint">Doubles</div><strong>{summary.doubles}</strong></div></div>
          <div className="end-stat"><span><MessageCircle size={20} /></span><div><div className="faint">Messages</div><strong>{summary.chatMessages}</strong></div></div>
          {summary.mostVisited && (
            <div className="end-stat"><span><MapPin size={20} /></span><div><div className="faint">Case la plus visitée</div><strong>{summary.mostVisited}</strong></div></div>
          )}
          {summary.prisonKing && (
            <div className="end-stat"><span><Lock size={20} /></span><div><div className="faint">Roi de la prison</div><strong>{summary.prisonKing}</strong></div></div>
          )}
        </div>

        {summary.integrity && (
          <div className={`integrity-banner integrity-${summary.integrity.status}`}>
            <ShieldCheck size={17} />
            <div className="grow">
              <strong>{INTEGRITY_LABELS[summary.integrity.status]}</strong>
              <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                {summary.integrity.status === 'verified'
                  ? 'Partie cohérente : elle compte pour l’XP et le classement.'
                  : 'Anomalies détectées : cette partie n’alimente pas le classement.'}
                {' '}Dés vérifiables — {summary.integrity.draws} tirages,
                empreinte {summary.integrity.seedHash.slice(0, 12)}…
              </span>
            </div>
          </div>
        )}

        <h3 style={{ margin: '18px 0 8px' }}>Valeur nette au fil de la partie</h3>
        <NetWorthChart history={summary.netWorthHistory} />

        <div className="row" style={{ marginTop: 20 }}>
          {isHost && (
            <button
              className="btn btn-gold grow"
              type="button"
              onClick={() => void emitAck('room:reset').then((r) => r.error && toast(r.error))}
            >
              <RefreshCw size={15} /> Rejouer
            </button>
          )}
          <button className="btn btn-ghost grow" type="button" onClick={onLeave}>Retour à l'accueil</button>
        </div>
      </div>
    </div>
  );
}
