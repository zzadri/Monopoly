import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Shell } from '../components/Shell';
import { BoardIcon } from '../components/icons';
import { api } from '../api';
import { useAuth, useToast } from '../context';

export interface MapMeta {
  id: string;
  name: string;
  icon: string;
  description: string;
  cols: number;
  rows: number;
  tileCount: number;
  ownerName: string;
  isPublic: boolean;
  mine: boolean;
}

export function MapsPage() {
  const [maps, setMaps] = useState<MapMeta[]>([]);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const load = () => api.get<MapMeta[]>('/api/maps').then(setMaps).catch(() => {});
  useEffect(() => { void load(); }, []);

  async function remove(id: string, name: string) {
    if (!confirm(`Supprimer le plateau « ${name} » ? Cette action est définitive.`)) return;
    try {
      await api.delete(`/api/maps/${id}`);
      toast('Plateau supprimé.', true);
      void load();
    } catch {
      toast('Suppression impossible.');
    }
  }

  return (
    <Shell>
      <div className="home-head">
        <div>
          <h1>Plateaux</h1>
          <p className="muted">Créez vos propres plateaux : dimensions, cases, prix et cartes sur mesure.</p>
        </div>
        {!user?.guest && <Link to="/editeur" className="btn btn-gold btn-lg"><Plus size={17} /> Nouveau plateau</Link>}
      </div>

      <div className="room-grid" style={{ marginTop: 18 }}>
        {maps.map((m) => (
          <div key={m.id} className="panel room-card map-card">
            <span className="room-card-icon"><BoardIcon icon={m.icon} size={30} /></span>
            <div className="grow">
              <strong>{m.name}</strong>
              <div className="muted" style={{ fontSize: 13 }}>{m.description || `${m.tileCount} cases`}</div>
              <div className="faint row" style={{ fontSize: 12, gap: 4 }}>
                {m.cols}×{m.rows} · {m.tileCount} cases · par {m.ownerName}
                {!m.isPublic && <><Lock size={11} /> privé</>}
              </div>
            </div>
            <div className="col" style={{ gap: 6 }}>
              {m.mine && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/editeur/${m.id}`)}><Pencil size={13} /> Modifier</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(m.id, m.name)}><Trash2 size={13} /> Supprimer</button>
                </>
              )}
              {!m.mine && m.id !== 'classic' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/editeur/${m.id}`)}><Eye size={13} /> Voir</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
