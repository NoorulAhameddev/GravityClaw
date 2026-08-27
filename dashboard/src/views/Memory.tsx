import { useEffect, useState } from 'react';
import { Database, MessageSquare, ChevronRight, AlertCircle, HardDrive } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface MemorySession {
  session_id: string;
  message_count: number;
  last_active: string;
}

interface MemoryMessage {
  message_json: string;
  timestamp: string;
}

interface ParsedMsg {
  role: 'user' | 'assistant' | 'system' | string;
  content: string | { type: string; text: string }[];
}

function fmtDate(date: string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getContent(content: ParsedMsg['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  return JSON.stringify(content);
}

export default function Memory() {
  const [sessions, setSessions] = useState<MemorySession[]>([]);
  const [messages, setMessages] = useState<MemoryMessage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoadingSessions(true);
        const res = await api('/api/memory');
        const data: MemorySession[] = res.data || [];
        setSessions(data);
        if (data.length > 0 && !selected) {
          selectSession(data[0].session_id);
        }
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load memory index');
      } finally {
        setLoadingSessions(false);
      }
    };
    fetchSessions();
  }, [selected]);

  const selectSession = async (sid: string) => {
    setSelected(sid);
    setLoadingMsgs(true);
    try {
      const res = await api(`/api/memory?session=${encodeURIComponent(sid)}&limit=150`);
      setMessages((res.data || []).reverse());
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              MEMORY_BANK // SQLITE + VECTOR_STORE
            </div>
            <div className="text-muted text-xs">
              Persistent long-term memory, session state archives, and conversational vector embeddings.
            </div>
          </div>
        </div>

        <div className="font-mono text-xs text-muted flex items-center gap-2">
          <span className="text-muted-dark">INDEXED_SESSIONS:</span>
          <span className="text-accent font-bold">{sessions.length}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 text-danger font-mono text-xs">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Split Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[calc(100vh-14rem)]">
        {/* Left: Session Explorer */}
        <div className="hud-panel flex flex-col md:col-span-1">
          <div className="hud-panel-header">
            <div className="flex items-center gap-1.5">
              <Database size={13} className="text-accent" />
              <span>SESSION REGISTRY</span>
            </div>
            <span className="font-mono text-[10px] text-muted">{sessions.length} NODES</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border font-mono text-xs">
            {loadingSessions ? (
              <div className="p-4 text-center text-muted">SCANNING SESSIONS...</div>
            ) : sessions.length === 0 ? (
              <div className="p-6 text-center text-muted-dark space-y-2">
                <Database size={24} className="mx-auto opacity-30" />
                <div>NO ACTIVE SESSIONS</div>
              </div>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => selectSession(s.session_id)}
                  className={cn(
                    'w-full text-left p-3 hover:bg-surface-hover transition-colors flex items-center justify-between gap-2 group',
                    selected === s.session_id && 'bg-surface-hover border-l-2 border-l-accent',
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-text-bright truncate group-hover:text-accent">
                      {s.session_id}
                    </div>
                    <div className="text-[10px] text-muted-dark mt-0.5 flex items-center gap-2">
                      <MessageSquare size={10} />
                      <span>{s.message_count} msgs</span>
                      <span>·</span>
                      <span>{fmtDate(s.last_active)}</span>
                    </div>
                  </div>
                  <ChevronRight size={13} className="text-muted-dark group-hover:text-accent shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Message Stream / Memory Inspector */}
        <div className="hud-panel flex flex-col md:col-span-3">
          <div className="hud-panel-header">
            <span className="font-mono text-xs text-text-bright truncate">
              INSPECTOR // {selected || 'NO_SELECTION'}
            </span>
            <span className="hud-tag">{messages.length} TURNS</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-muted gap-2">
                <HardDrive size={32} className="text-muted-dark" />
                <div className="text-text-bright uppercase font-semibold">NO SESSION SELECTED</div>
                <div className="text-muted-dark">Select a session from registry to inspect messages</div>
              </div>
            ) : loadingMsgs ? (
              <div className="h-full flex items-center justify-center text-muted">
                FETCHING MEMORY PAYLOADS...
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-dark">
                NO MESSAGES IN SELECTED SESSION
              </div>
            ) : (
              messages.map((row, i) => {
                let msg: ParsedMsg | null = null;
                try {
                  msg = JSON.parse(row.message_json);
                } catch {
                  return null;
                }
                if (!msg) return null;
                const role = msg.role || 'unknown';
                const raw = getContent(msg.content);

                return (
                  <div
                    key={i}
                    className={cn(
                      'border p-3 space-y-1.5',
                      role === 'user'
                        ? 'border-border bg-surface2/60'
                        : role === 'assistant'
                          ? 'border-accent/30 bg-surface'
                          : 'border-amber/30 bg-surface2/30',
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-border/40 pb-1 text-[10px]">
                      <span
                        className={cn(
                          'font-bold uppercase tracking-wider',
                          role === 'user'
                            ? 'text-amber'
                            : role === 'assistant'
                              ? 'text-accent'
                              : 'text-info',
                        )}
                      >
                        [{role.toUpperCase()}]
                      </span>
                      <span className="text-muted-dark">{fmtDate(row.timestamp)}</span>
                    </div>

                    <div className="text-text leading-relaxed whitespace-pre-wrap wrap-break-word">
                      {raw}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
