import { useState, useEffect, useCallback, useRef } from 'react';

type WSState = 'connecting' | 'connected' | 'disconnected' | 'error';

interface WSMessage {
    type?: string;
    text?: string;
    role?: string;
    isBot?: boolean;
    [key: string]: unknown;
}

export function useWebSocket(url: string) {
    const [status, setStatus] = useState<WSState>('disconnected');
    const [messages, setMessages] = useState<WSMessage[]>([]);
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectDelay = useRef(1000);
    const connectRef = useRef<() => void>(() => {});
    const isConnecting = useRef(false);

    const connect = useCallback(() => {
        if (!url || url === 'ws://' || url === 'wss://') {
            setStatus('disconnected');
            return;
        }
        if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING || isConnecting.current) {
            return;
        }
        isConnecting.current = true;
        
        if (ws.current) ws.current.close();
        ws.current = null;

        setStatus('connecting');
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
            isConnecting.current = false;
            setStatus('connected');
            reconnectDelay.current = 1000;
        };

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as WSMessage;
                setMessages((prev) => [...prev, msg]);
            } catch (e) {
                console.error('WS parse error:', e);
            }
        };

        socket.onerror = () => {
            isConnecting.current = false;
            setStatus('error');
        };

        socket.onclose = () => {
            isConnecting.current = false;
            if (!reconnectTimer.current) {
                setStatus('disconnected');
                const delayMs = reconnectDelay.current;
                reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, 10000);
                reconnectTimer.current = setTimeout(() => {
                    reconnectTimer.current = null;
                    connectRef.current();
                }, delayMs);
            }
        };
    }, [url]);

    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
        connect();
        return () => {
            if (ws.current) ws.current.close();
            ws.current = null;
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        };
    }, [connect]);

    const sendMessage = useCallback((msg: WSMessage) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(msg));
        }
    }, []);

    return { status, messages, sendMessage };
}