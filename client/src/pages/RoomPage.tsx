import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Dices } from 'lucide-react';
import type {
  BoardDef, ChatMessage, GameStateView, IntegrityReport, LogEntry, RoomView,
} from 'shared';
import { getSocket, emitAck } from '../socket';
import { useAuth, useToast } from '../context';
import { WaitingRoom } from '../components/WaitingRoom';
import { GameView } from '../components/GameView';

export interface CardPopup {
  playerId: string;
  deck: 'treasure' | 'surprise';
  text: string;
}

export interface EndSummary {
  winnerName: string;
  durationS: number;
  turns: number;
  doubles: number;
  mostVisited: string | null;
  prisonKing: string | null;
  netWorthHistory: Record<string, number[]>;
  players: { name: string; avatar: string; won: boolean }[];
  chatMessages: number;
  /** statut de vérification anti-triche de la partie */
  integrity: IntegrityReport | null;
}

export function RoomPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<GameStateView | null>(null);
  const [board, setBoard] = useState<BoardDef | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [rolling, setRolling] = useState<{ playerId: string; values: number[] } | null>(null);
  const [card, setCard] = useState<CardPopup | null>(null);
  const [endSummary, setEndSummary] = useState<EndSummary | null>(null);
  const joined = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    let alive = true;

    const onRoomState = (v: RoomView) => { if (alive) setRoom(v); };
    const onGameState = (v: GameStateView) => {
      if (!alive) return;
      if (v.board) setBoard(v.board);
      setGame(v);
    };
    const onStarted = (v: GameStateView) => {
      if (!alive) return;
      setEndSummary(null);
      setLogs([]);
      if (v.board) setBoard(v.board);
      setGame(v);
    };
    const onLog = (entry: LogEntry) => { if (alive) setLogs((l) => [...l.slice(-250), entry]); };
    const onLogs = (entries: LogEntry[]) => { if (alive) setLogs(entries); };
    const onChat = (msg: ChatMessage) => { if (alive) setChat((c) => [...c.slice(-200), msg]); };
    const onChatHistory = (msgs: ChatMessage[]) => { if (alive) setChat(msgs); };
    const onDice = (d: { playerId: string; values: number[] }) => {
      if (!alive) return;
      setRolling(d);
      setTimeout(() => { if (alive) setRolling(null); }, 1400);
    };
    const onCard = (c: CardPopup) => {
      if (!alive) return;
      setCard(c);
      setTimeout(() => { if (alive) setCard(null); }, 4500);
    };
    const onEnded = (p: { summary: EndSummary }) => { if (alive) setEndSummary(p.summary); };
    const onKicked = (p: { userId: string }) => {
      if (alive && p.userId === user?.id) {
        toast('Vous avez été exclu du salon.');
        navigate('/');
      }
    };

    socket.on('room:state', onRoomState);
    socket.on('game:state', onGameState);
    socket.on('game:started', onStarted);
    socket.on('game:log', onLog);
    socket.on('game:logs', onLogs);
    socket.on('chat:message', onChat);
    socket.on('chat:history', onChatHistory);
    socket.on('game:dice', onDice);
    socket.on('game:card', onCard);
    socket.on('game:ended', onEnded);
    socket.on('room:kicked', onKicked);

    const join = () => {
      void emitAck('room:join', { roomId: id }).then((res) => {
        if (res.error && alive) {
          toast(res.error);
          navigate('/');
        }
      });
    };
    join();
    joined.current = true;
    socket.on('connect', join); // rejoin après coupure réseau

    return () => {
      alive = false;
      socket.off('room:state', onRoomState);
      socket.off('game:state', onGameState);
      socket.off('game:started', onStarted);
      socket.off('game:log', onLog);
      socket.off('game:logs', onLogs);
      socket.off('chat:message', onChat);
      socket.off('chat:history', onChatHistory);
      socket.off('game:dice', onDice);
      socket.off('game:card', onCard);
      socket.off('game:ended', onEnded);
      socket.off('room:kicked', onKicked);
      socket.off('connect', join);
    };
  }, [id, user?.id, toast, navigate]);

  const leave = useCallback(() => {
    getSocket().emit('room:leave');
    navigate('/');
  }, [navigate]);

  const sendChat = useCallback((text: string) => {
    void emitAck('chat:send', { text }).then((r) => r.error && toast(r.error));
  }, [toast]);

  if (!room) {
    return <div className="center" style={{ height: '100%' }}><div className="loading-dice"><Dices size={54} color="var(--brand)" /></div></div>;
  }

  if (room.started && game && board) {
    return (
      <GameView
        room={room}
        game={game}
        board={board}
        logs={logs}
        chat={chat}
        rolling={rolling}
        card={card}
        endSummary={endSummary}
        onSendChat={sendChat}
        onLeave={leave}
      />
    );
  }

  return <WaitingRoom room={room} chat={chat} onSendChat={sendChat} onLeave={leave} />;
}
