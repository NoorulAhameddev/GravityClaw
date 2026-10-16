import { useState, useEffect, useRef, type JSX } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  Send,
  Eraser,
  Bot,
  User,
  WifiOff,
  Copy,
  CheckCheck,
  Terminal,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Wrench,
} from 'lucide-react';
import { cn, getWsUrl } from '../lib/utils';

export interface ToolExecutionState {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  status: 'running' | 'success' | 'failed';
  durationMs?: number;
  result?: string;
}

export interface ChatMessage {
  id: string;
  type: string;
  text?: string;
  role?: 'user' | 'assistant' | 'system';
  isBot?: boolean;
  timestamp?: number;
  tools?: ToolExecutionState[];
  isStreaming?: boolean;
}

export function Chat() {
  const { status, messages, sendMessage } = useWebSocket(getWsUrl());
  const [input, setInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedCountRef = useRef(0);

  useEffect(() => {
    if (messages.length <= processedCountRef.current) return;

    const newMessages = messages.slice(processedCountRef.current);
    processedCountRef.current = messages.length;

    for (const msg of newMessages) {
      const type = msg.type;

      if (type === 'typing') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 5000);
      } else if (type === 'token') {
        const token = typeof msg.token === 'string' ? msg.token : '';
        setIsTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        setChatMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            const updated: ChatMessage = {
              ...last,
              text: (last.text || '') + token,
            };
            return [...prev.slice(0, -1), updated];
          } else {
            const newMsg: ChatMessage = {
              id: `asst-${Date.now()}`,
              type: 'message',
              text: token,
              role: 'assistant',
              isBot: true,
              isStreaming: true,
              timestamp: Date.now(),
              tools: [],
            };
            return [...prev, newMsg];
          }
        });
      } else if (type === 'tool_start') {
        const toolName = String(msg.toolName ?? 'tool');
        const toolInput = (msg.input as Record<string, unknown>) ?? {};
        setIsTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        const newTool: ToolExecutionState = {
          id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          toolName,
          input: toolInput,
          status: 'running',
        };

        setChatMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            const updated: ChatMessage = {
              ...last,
              tools: [...(last.tools || []), newTool],
            };
            return [...prev.slice(0, -1), updated];
          } else {
            const newMsg: ChatMessage = {
              id: `asst-${Date.now()}`,
              type: 'message',
              text: '',
              role: 'assistant',
              isBot: true,
              isStreaming: true,
              timestamp: Date.now(),
              tools: [newTool],
            };
            return [...prev, newMsg];
          }
        });
      } else if (type === 'tool_end') {
        const toolName = String(msg.toolName ?? '');
        const success = Boolean(msg.success);
        const result = typeof msg.result === 'string' ? msg.result : undefined;
        const durationMs = typeof msg.durationMs === 'number' ? msg.durationMs : undefined;

        setChatMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || !last.tools || last.tools.length === 0) return prev;

          const updatedTools = [...last.tools];
          for (let i = updatedTools.length - 1; i >= 0; i--) {
            const t = updatedTools[i];
            if (t && t.status === 'running' && (!toolName || t.toolName === toolName)) {
              updatedTools[i] = {
                ...t,
                status: success ? 'success' : 'failed',
                durationMs,
                result,
              };
              break;
            }
          }

          const updated: ChatMessage = {
            ...last,
            tools: updatedTools,
          };
          return [...prev.slice(0, -1), updated];
        });
      } else if (type === 'message') {
        setIsTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        const fullText = typeof msg.text === 'string' ? msg.text : '';

        setChatMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            const updated: ChatMessage = {
              ...last,
              text: fullText || last.text,
              isStreaming: false,
            };
            return [...prev.slice(0, -1), updated];
          } else {
            const newMsg: ChatMessage = {
              id: `asst-${Date.now()}`,
              type: 'message',
              text: fullText,
              role: 'assistant',
              isBot: true,
              timestamp: Date.now(),
              tools: [],
              isStreaming: false,
            };
            return [...prev, newMsg];
          }
        });
      }
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chatMessages, isTyping]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || status !== 'connected') return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
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

  const copyMessage = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTool = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const renderMessageContent = (text: string | undefined) => {
    if (!text) return null;

    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```|`([^`]+)`/g;
    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
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
          <pre
            key={key++}
            className="bg-surface2 border border-border p-3 my-2 overflow-x-auto font-mono text-xs text-text"
          >
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
          <span className="font-mono text-xs font-bold text-text-bright">
            AGENT_CONSOLE // DIRECT_LINK
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-muted flex items-center gap-1.5">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                status === 'connected' ? 'bg-success animate-pulse' : 'bg-danger',
              )}
            />
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        {chatMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border-subtle">
            <Bot size={32} className="text-accent mb-3" />
            <div className="font-bold text-text-bright uppercase tracking-wider mb-1">
              GRAVITY INTERACTIVE CONSOLE
            </div>
            <p className="text-muted text-xs max-w-md mb-4">
              Send real-time instructions to the primary agent runtime. Dispatched tools, live
              streaming tokens, and reasoning traces will stream here.
            </p>
            <div className="flex flex-wrap gap-2 justify-center font-mono text-[11px]">
              {[
                'Status report on all swarms',
                'Query recent memory facts',
                'Audit active system tools',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-2.5 py-1 bg-surface2 hover:bg-surface-hover border border-border text-text hover:text-accent transition-colors"
                >
                  &gt; {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((m) => {
          const isUser = m.role === 'user' || (!m.isBot && m.text);

          return (
            <div
              key={m.id}
              className={cn(
                'border p-3 space-y-2',
                isUser ? 'border-border bg-surface2/60' : 'border-accent/30 bg-surface',
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
                      {m.isStreaming && (
                        <span className="text-[10px] text-accent animate-pulse font-semibold">
                          STREAMING...
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-muted-dark">
                  <span>{formatTime(m.timestamp)}</span>
                  {m.text && (
                    <button
                      onClick={() => copyMessage(m.text!, m.id)}
                      className="text-muted hover:text-text-bright transition-colors"
                      title="Copy payload"
                    >
                      {copiedId === m.id ? (
                        <CheckCheck size={12} className="text-success" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tool Execution Cards */}
              {m.tools && m.tools.length > 0 && (
                <div className="space-y-2 my-2">
                  {m.tools.map((tool) => {
                    const isExpanded = Boolean(expandedTools[tool.id]);

                    return (
                      <div
                        key={tool.id}
                        className="border border-border/70 bg-surface2/50 rounded-none overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleTool(tool.id)}
                          className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-surface-hover transition-colors font-mono text-[11px]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Wrench size={12} className="text-accent shrink-0" />
                            <span className="font-bold text-text-bright uppercase truncate">
                              {tool.toolName}
                            </span>
                            {tool.status === 'running' && (
                              <span className="flex items-center gap-1 text-accent text-[10px]">
                                <Loader2 size={10} className="animate-spin" />
                                <span>EXECUTING</span>
                              </span>
                            )}
                            {tool.status === 'success' && (
                              <span className="flex items-center gap-1 text-success text-[10px]">
                                <CheckCircle2 size={10} />
                                <span>OK</span>
                              </span>
                            )}
                            {tool.status === 'failed' && (
                              <span className="flex items-center gap-1 text-danger text-[10px]">
                                <XCircle size={10} />
                                <span>FAILED</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 text-muted">
                            {tool.durationMs !== undefined && (
                              <span className="text-[10px]">{tool.durationMs}ms</span>
                            )}
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="p-2.5 border-t border-border/40 bg-surface space-y-2 text-[11px] font-mono">
                            {tool.input && Object.keys(tool.input).length > 0 && (
                              <div>
                                <div className="text-[10px] text-muted-dark uppercase tracking-wider mb-1">
                                  INPUT PARAMETERS
                                </div>
                                <pre className="p-2 bg-surface2 border border-border/30 overflow-x-auto text-text">
                                  {JSON.stringify(tool.input, null, 2)}
                                </pre>
                              </div>
                            )}

                            {tool.result && (
                              <div>
                                <div className="text-[10px] text-muted-dark uppercase tracking-wider mb-1">
                                  RESULT PAYLOAD
                                </div>
                                <pre className="p-2 bg-surface2 border border-border/30 overflow-x-auto text-text max-h-48 overflow-y-auto whitespace-pre-wrap">
                                  {tool.result}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Message Content */}
              {m.text && (
                <div className="text-text leading-relaxed whitespace-pre-wrap">
                  {renderMessageContent(m.text)}
                </div>
              )}
            </div>
          );
        })}

        {isTyping && (
          <div className="border border-accent/30 bg-surface p-3 flex items-center gap-2 text-accent">
            <span className="w-2 h-2 bg-accent animate-ping" />
            <span className="font-mono text-xs uppercase tracking-wider">
              AGENT INFERENCE IN PROGRESS...
            </span>
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
