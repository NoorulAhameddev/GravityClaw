import { useState, useEffect, useRef, type JSX } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { Send, Eraser, Bot, User, WifiOff, Copy, CheckCheck, Terminal } from 'lucide-react';
import { cn, getWsUrl } from '../lib/utils';

interface ChatMessage {
  type: string;
  text?: string;
  role?: string;
  isBot?: boolean;
  timestamp?: number;
}

export function Chat() {
  const { status, messages, sendMessage } = useWebSocket(getWsUrl());
  const [input, setInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;

    if (last.type === 'message') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setChatMessages((prev) => [...prev, { ...(last as ChatMessage), timestamp: Date.now() }]);
    } else if (last.type === 'typing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 5000);
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || status !== 'connected') return;

    const userMsg: ChatMessage = {
      type: 'message',
      text: input.trim(),
      role: 'user',
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    sendMessage({ type: 'message', text: input.trim() });
    setInput('');
    inputRef.current?.focus();
  };

  const clearChat = () => {
    if (confirm('Clear terminal conversation log?')) {
      setChatMessages([]);
    }
  };

  const copyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(index);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const renderMessageContent = (text: string | undefined) => {
    if (!text) return null;

    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```|`([^`]+)`/g;
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
      }

      if (match[3]) {
        parts.push(
          <code
            key={key++}
            className="bg-surface2 px-1.5 py-0.5 border border-border text-accent font-mono text-xs"
          >
            {match[3]}
          </code>,
        );
      } else {
        parts.push(
          <pre key={key++} className="bg-surface2 border border-border p-3 my-2 overflow-x-auto font-mono text-xs text-text">
            <code>{match[2]}</code>
          </pre>,
        );
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] hud-panel">
      {/* Terminal Module Header */}
      <div className="hud-panel-header">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-accent" />
          <span className="font-mono text-xs font-bold text-text-bright">AGENT_CONSOLE // DIRECT_LINK</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-muted">
            {status === 'connected' ? '[STREAM: LIVE]' : '[STREAM: OFFLINE]'}
          </span>
          <button
            onClick={clearChat}
            className="p-1 text-muted hover:text-danger transition-colors"
            title="Clear Stream"
          >
            <Eraser size={14} />
          </button>
        </div>
      </div>

      {/* Message Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs"
      >
        {chatMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border-subtle">
            <Bot size={32} className="text-accent mb-3" />
            <div className="font-bold text-text-bright uppercase tracking-wider mb-1">
              GRAVITY INTERACTIVE CONSOLE
            </div>
            <p className="text-muted text-xs max-w-md mb-4">
              Send real-time instructions to the primary agent runtime. Dispatched tools and reasoning traces will stream here.
            </p>
            <div className="flex flex-wrap gap-2 justify-center font-mono text-[11px]">
              {['Status report on all swarms', 'Query recent memory facts', 'Audit webhook endpoints'].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-2.5 py-1 bg-surface2 hover:bg-surface-hover border border-border text-text hover:text-accent transition-colors"
                  >
                    &gt; {suggestion}
                  </button>
                ),
              )}
            </div>
          </div>
        )}

        {chatMessages.map((m, i) => {
          const isUser = m.role === 'user' || (!m.isBot && m.text);

          return (
            <div
              key={i}
              className={cn(
                'border p-3 space-y-2',
                isUser
                  ? 'border-border bg-surface2/60'
                  : 'border-accent/30 bg-surface',
              )}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between border-b border-border/50 pb-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  {isUser ? (
                    <>
                      <User size={13} className="text-amber" />
                      <span className="font-bold text-amber uppercase">[OPERATOR]</span>
                    </>
                  ) : (
                    <>
                      <Bot size={13} className="text-accent" />
                      <span className="font-bold text-accent uppercase">[GRAVITY_AGENT]</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-muted-dark">
                  <span>{formatTime(m.timestamp)}</span>
                  {m.text && (
                    <button
                      onClick={() => copyMessage(m.text!, i)}
                      className="text-muted hover:text-text-bright transition-colors"
                      title="Copy payload"
                    >
                      {copiedId === i ? <CheckCheck size={12} className="text-success" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Message Content */}
              <div className="text-text leading-relaxed whitespace-pre-wrap">
                {renderMessageContent(m.text)}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="border border-accent/30 bg-surface p-3 flex items-center gap-2 text-accent">
            <span className="w-2 h-2 bg-accent animate-ping" />
            <span className="font-mono text-xs uppercase tracking-wider">AGENT INFERENCE IN PROGRESS...</span>
          </div>
        )}
      </div>

      {/* Command Input Area */}
      <div className="p-3 border-t border-border bg-surface2">
        <form onSubmit={handleSend} className="flex gap-2">
          <div className="flex-1 flex items-center bg-surface border border-border px-3 focus-within:border-accent">
            <span className="text-accent font-mono mr-2">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter instruction or query..."
              disabled={status !== 'connected'}
              className="w-full bg-transparent py-2.5 text-xs font-mono text-text-bright focus:outline-none placeholder:text-muted-dark"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || status !== 'connected'}
            className="px-4 py-2 bg-accent text-white font-mono text-xs font-semibold uppercase tracking-wider hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 shrink-0"
          >
            <span>SEND</span>
            <Send size={13} />
          </button>
        </form>

        {status !== 'connected' && (
          <div className="mt-2 text-danger font-mono text-[10px] flex items-center gap-1.5">
            <WifiOff size={12} />
            <span>SOCKET DISCONNECTED // RE-ESTABLISHING UPLINK...</span>
          </div>
        )}
      </div>
    </div>
  );
}
