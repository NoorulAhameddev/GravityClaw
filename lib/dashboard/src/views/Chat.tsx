import { useState, useEffect, useRef, type JSX } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { Send, Eraser, Bot, User, WifiOff, Copy, CheckCheck } from 'lucide-react';
import { cn, getWsUrl } from '../lib/utils';

interface ChatMessage {
    type: string;
    text?: string;
    role?: string;
    isBot?: boolean;
    timestamp?: number;
}

export function Chat() {
    const [apiKey] = useState(() => localStorage.getItem('apiKey') || '');
    const { status, messages, sendMessage } = useWebSocket(getWsUrl(apiKey));
    const [input, setInput] = useState('');
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const last = messages[messages.length - 1];
        if (!last) return;

        if (last.type === 'message') {
            setIsTyping(false);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            setChatMessages((prev) => [...prev, { ...last as ChatMessage, timestamp: Date.now() }]);
        } else if (last.type === 'typing') {
            setIsTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 5000);
        }
    }, [messages]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
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
            timestamp: Date.now()
        };
        setChatMessages((prev) => [...prev, userMsg]);
        sendMessage({ type: 'message', text: input.trim() });
        setInput('');
        inputRef.current?.focus();
    };

    const clearChat = () => {
        if (confirm('Clear all messages?')) {
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
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderMessageContent = (text: string | undefined, _index: number) => {
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
                    <code key={key++} className="bg-surface2 px-1.5 py-0.5 rounded text-accent font-mono text-[13px]">
                        {match[3]}
                    </code>
                );
            } else {
                parts.push(
                    <pre key={key++} className="bg-surface2 rounded-lg p-3 my-2 overflow-x-auto">
                        <code className="text-[13px] font-mono text-text">{match[2]}</code>
                    </pre>
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
        <div className="flex flex-col h-full bg-bg relative">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center">
                        <Bot size={20} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-text">Gravity Claw</h2>
                        <div className="flex items-center gap-1.5">
                            {status === 'connected' ? (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                                    <span className="text-xs text-muted">Online</span>
                                </>
                            ) : (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-danger" />
                                    <span className="text-xs text-muted">Disconnected</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={clearChat}
                        className="p-2.5 bg-surface hover:bg-surface2 border border-border rounded-xl text-muted hover:text-danger transition-all duration-200 hover:scale-105"
                        title="Clear Chat"
                    >
                        <Eraser size={18} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scroll-smooth"
            >
                {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/20 to-purple-600/20 flex items-center justify-center mb-6">
                            <Bot size={40} className="text-accent opacity-50" />
                        </div>
                        <h3 className="text-xl font-semibold text-text mb-2">Start a conversation</h3>
                        <p className="text-muted max-w-md">
                            Send a message to begin chatting with Gravity Claw. I can help you with tasks, analysis, and more.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-6 justify-center">
                            {['Help me with coding', 'Search my memory', 'Schedule a task'].map((suggestion) => (
                                <button
                                    key={suggestion}
                                    onClick={() => setInput(suggestion)}
                                    className="px-4 py-2 bg-surface hover:bg-surface2 border border-border rounded-full text-sm text-muted hover:text-text transition-all duration-200 hover:scale-105"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {chatMessages.map((m, i) => {
                    const isUser = m.role === 'user' || (!m.isBot && m.text);

                    return (
                        <div 
                            key={i} 
                            className={cn(
                                "flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300",
                                isUser ? "flex-row-reverse" : ""
                            )}
                        >
                            <div className={cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
                                isUser 
                                    ? "bg-surface border-2 border-border text-muted" 
                                    : "bg-gradient-to-br from-accent to-purple-600 text-white shadow-accent/20"
                            )}>
                                {isUser ? <User size={18} /> : <Bot size={18} />}
                            </div>
                            <div className={cn(
                                "max-w-[75%] md:max-w-[65%] px-4 py-3 rounded-2xl relative group",
                                isUser
                                    ? "bg-gradient-to-br from-accent to-purple-600 text-white rounded-tr-none shadow-lg shadow-accent/20"
                                    : "bg-surface border border-border text-text rounded-tl-none shadow-lg"
                            )}>
                                <div className="pr-8">
                                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                                        {renderMessageContent(m.text, i)}
                                    </p>
                                </div>
                                
                                {/* Copy button */}
                                {m.text && (
                                    <button
                                        onClick={() => copyMessage(m.text!, i)}
                                        className={cn(
                                            "absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200",
                                            isUser ? "bg-white/10 hover:bg-white/20 text-white" : "bg-surface2 hover:bg-border text-muted"
                                        )}
                                        title="Copy message"
                                    >
                                        {copiedId === i ? <CheckCheck size={14} /> : <Copy size={14} />}
                                    </button>
                                )}
                                
                                <div className={cn(
                                    "text-[10px] mt-2 opacity-60 flex items-center gap-1",
                                    isUser ? "justify-end" : "justify-start"
                                )}>
                                    {formatTime(m.timestamp)}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {isTyping && (
                    <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-accent/20">
                            <Bot size={18} />
                        </div>
                        <div className="bg-surface border border-border px-5 py-4 rounded-2xl rounded-tl-none flex items-center gap-1.5 shadow-lg">
                            <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-2 h-2 bg-accent rounded-full animate-bounce" />
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 md:p-6 pt-2">
                <form onSubmit={handleSend} className="relative">
                    <div className="relative bg-surface border border-border rounded-2xl transition-all duration-200 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 shadow-lg">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="Type a message... (Shift+Enter for new line)"
                            className="w-full bg-transparent px-4 py-3.5 pr-14 text-[14px] focus:outline-none resize-none min-h-[52px] max-h-[200px] placeholder:text-muted/50"
                            rows={1}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || status !== 'connected'}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-accent text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-hover transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-accent/30"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                    <p className="text-[10px] text-muted/50 mt-2 text-center">
                        {status === 'connected' 
                            ? 'Press Enter to send, Shift+Enter for new line'
                            : 'Reconnecting to server...'}
                    </p>
                </form>
            </div>

            {/* Connection Status Toast */}
            {status !== 'connected' && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-danger/90 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg animate-in slide-in-from-bottom">
                    <WifiOff size={16} />
                    Connection lost. Reconnecting...
                </div>
            )}
        </div>
    );
}
