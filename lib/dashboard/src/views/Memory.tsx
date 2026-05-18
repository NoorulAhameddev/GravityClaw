import { useEffect, useState } from 'react';
import { Database, MessageSquare, ChevronRight, AlertCircle, Brain } from 'lucide-react';
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
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getContent(content: ParsedMsg['content']): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.filter(c => c.type === 'text').map(c => c.text).join('\n');
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
                setError(e instanceof Error ? e.message : 'Failed to load memory');
            } finally { setLoadingSessions(false); }
        };
        fetchSessions();
    }, [selected]);

    const selectSession = async (sid: string) => {
        setSelected(sid);
        setLoadingMsgs(true);
        try {
            const res = await api(`/api/memory?session=${encodeURIComponent(sid)}&limit=150`);
            setMessages((res.data || []).reverse());
        } catch { setMessages([]); }
        finally { setLoadingMsgs(false); }
    };

    return (
        <div className="p-8 space-y-4 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Brain size={20} className="text-accent" />
                </div>
                <div>
                    <h1 className="text-xl font-bold">Memory Vault</h1>
                    <p className="text-xs text-muted">Conversation history and session memory storage</p>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="flex gap-4 flex-1 min-h-0" style={{ height: 'calc(100vh - 220px)' }}>
                {/* Session List */}
                <div className="w-64 flex-shrink-0 bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-border bg-surface2/50">
                        <div className="flex items-center gap-2">
                            <Database size={13} className="text-muted" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Sessions</span>
                            <span className="ml-auto text-xs font-mono text-accent">{sessions.length}</span>
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {loadingSessions ? (
                            <div className="flex items-center justify-center py-8 text-muted">
                                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="py-8 text-center text-muted text-sm">No sessions yet</div>
                        ) : sessions.map(s => (
                            <button key={s.session_id} onClick={() => selectSession(s.session_id)}
                                className={cn(
                                    'w-full text-left px-4 py-3 border-b border-border hover:bg-surface2/50 transition-colors',
                                    selected === s.session_id && 'bg-accent/10 border-l-2 border-l-accent'
                                )}>
                                <div className="flex items-center justify-between gap-1">
                                    <code className="text-[11px] font-mono text-accent truncate flex-1">{s.session_id}</code>
                                    <ChevronRight size={12} className="text-muted flex-shrink-0" />
                                </div>
                                <div className="text-[10px] text-muted mt-0.5 flex items-center gap-2">
                                    <MessageSquare size={10} /> {s.message_count} msgs · {fmtDate(s.last_active)}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Message Panel */}
                <div className="flex-1 bg-surface border border-border rounded-xl overflow-hidden flex flex-col min-w-0">
                    <div className="px-4 py-3 border-b border-border bg-surface2/50">
                        <code className="text-[11px] font-mono text-muted">{selected || 'Select a session'}</code>
                    </div>
                    <div className="overflow-y-auto flex-1 p-4 space-y-3">
                        {!selected ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted">
                                <Brain size={32} className="opacity-30 mb-2" />
                                Select a session to view messages
                            </div>
                        ) : loadingMsgs ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted">
                                <MessageSquare size={28} className="opacity-30 mb-2" />
                                No messages
                            </div>
                        ) : messages.map((row, i) => {
                            let msg: ParsedMsg | null = null;
                            try { msg = JSON.parse(row.message_json); } catch { return null; }
                            if (!msg) return null;
                            const role = msg.role || 'unknown';
                            const raw = getContent(msg.content);
                            const preview = raw.substring(0, 600);
                            return (
                                <div key={i} className={cn(
                                    'p-4 rounded-xl border text-sm leading-relaxed',
                                    role === 'user' ? 'bg-accent/5 border-accent/20 ml-8' :
                                        role === 'assistant' ? 'bg-surface2 border-border mr-8' :
                                            'bg-yellow-500/5 border-yellow-500/20 text-xs'
                                )}>
                                    <div className={cn(
                                        'text-[10px] font-bold uppercase tracking-wider mb-1.5',
                                        role === 'user' ? 'text-accent' : role === 'assistant' ? 'text-green-400' : 'text-yellow-400'
                                    )}>{role}</div>
                                    <div className="text-text whitespace-pre-wrap break-words">{preview}{raw.length > 600 ? '…' : ''}</div>
                                    <div className="text-[10px] text-muted mt-2">{fmtDate(row.timestamp)}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
