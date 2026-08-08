import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import type { ChatMessage } from 'shared';
import { Avatar } from './icons';

interface ChatProps {
  readonly messages: ChatMessage[];
  readonly onSend: (text: string) => void;
}

export function Chat({ messages, onSend }: ChatProps) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <div className="chat">
      <div className="chat-title row" style={{ gap: 7 }}><MessageCircle size={15} /> Discussion</div>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="faint" style={{ textAlign: 'center', marginTop: 20 }}>Aucun message pour l'instant.</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg">
            <Avatar id={m.from.avatar} color={m.from.color} size={24} />
            <div className="grow">
              <span style={{ color: m.from.color, fontWeight: 800, fontSize: 13 }}>{m.from.name}</span>
              <span className="chat-text"> {m.text}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          placeholder="Dites quelque chose…"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn btn-primary btn-sm" type="button" onClick={submit} aria-label="Envoyer"><Send size={14} /></button>
      </div>
    </div>
  );
}
