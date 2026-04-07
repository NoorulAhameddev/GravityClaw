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
    const [delay, setDelay] = useState(1000);
    const connectRef = useRef<() => void>(() => {});

    const connect = useCallback(() => {
        if (ws.current) ws.current.close();

        setStatus('connecting');
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
            setStatus('connected');
            setDelay(1000);
        };

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as WSMessage;
                setMessages((prev) => [...prev, msg]);
            } catch (e) {
                console.error('WS parse error:', e);
            }
        };

        socket.onclose = () => {
            setStatus('disconnected');
            const currentDelay = delay;
            reconnectTimer.current = setTimeout(() => {
                setDelay((prev) => Math.min(prev * 1.5, 10000));
                connectRef.current();
            }, currentDelay);
        };

        socket.onerror = () => {
            setStatus('error');
        };
    }, [url, delay]);

    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        connect();
        return () => {
            if (ws.current) ws.current.close();
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        };
    }, [connect]);

    const sendMessage = useCallback((msg: WSMessage) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(msg));
        }
    }, []);

    return { status, messages, sendMessage };
}
