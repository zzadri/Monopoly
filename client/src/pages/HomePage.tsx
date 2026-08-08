import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoonStar, Plus, Users } from 'lucide-react';
import type { RoomSummary } from 'shared';
import { Shell } from '../components/Shell';
import { BoardIcon } from '../components/icons';
import { getSocket, emitAck } from '../socket';
import { useToast } from '../context';

export function HomePage() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const socket = getSocket();
    socket.emit('lobby:subscribe');
    socket.on('lobby:rooms', setRooms);
    return () => {
      socket.emit('lobby:unsubscribe');
      socket.off('lobby:rooms', setRooms);
    };
  }, []);

  async function createRoom() {
    const res = await emitAck<{ roomId?: string; error?: string }>('room:create');
    if (res.roomId) navigate(`/salon/${res.roomId}`);
    else toast(res.error ?? 'Impossible de créer le salon.');
  }

  async function joinByCode() {
    const code = joinCode.trim().toLowerCase().split('/').at(-1) ?? '';
    if (!code) return;
    const res = await emitAck('room:join', { roomId: code });
    if (res.error) toast(res.error);
    else navigate(`/salon/${code}`);
  }

  return (
    <Shell>
      <div className="home-head">
        <div>
          <h1>Salons publics</h1>
          <p className="muted">Créez un salon ou rejoignez vos amis pour lancer une partie.</p>
        </div>
        <button type="button" className="btn btn-gold btn-lg" onClick={() => void createRoom()}>
          <Plus size={17} /> Créer un salon
        </button>
      </div>

      <div className="row wrap" style={{ margin: '14px 0 22px' }}>
        <input
          style={{ maxWidth: 300 }}
          placeholder="Code ou lien d'un salon privé…"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void joinByCode()}
        />
        <button type="button" className="btn btn-ghost" onClick={() => void joinByCode()}>Rejoindre</button>
      </div>

      {rooms.length === 0 ? (
        <div className="panel panel-pad center empty-state">
          <MoonStar size={44} color="var(--gold)" />
          <p className="muted">Aucun salon public pour l'instant. Soyez le premier !</p>
        </div>
      ) : (
        <div className="room-grid">
          {rooms.map((r) => (
            <button
              type="button"
              key={r.id}
              className="panel room-card"
              onClick={async () => {
                const res = await emitAck('room:join', { roomId: r.id });
                if (res.error) toast(res.error);
                else navigate(`/salon/${r.id}`);
              }}
            >
              <span className="room-card-icon"><BoardIcon icon={r.boardIcon} size={30} /></span>
              <div className="grow">
                <strong>{r.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{r.boardName}</div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
                <span className="chip"><Users size={12} /> {r.players}/{r.maxPlayers}</span>
                {r.started && <span className="chip" style={{ color: 'var(--gold)' }}>En cours</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}
