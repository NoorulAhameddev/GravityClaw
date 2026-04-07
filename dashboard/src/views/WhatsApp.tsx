import { useState, useEffect, useCallback } from 'react';
import { Phone, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface WhatsAppStatus {
    success: boolean;
    data?: {
        qr: string | null;
        qrDataUrl: string | null;
        status: 'connected' | 'connecting' | 'disconnected';
    };
    error?: string;
}

export default function WhatsApp() {
    const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [reconnecting, setReconnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await api('/api/whatsapp/qr') as WhatsAppStatus;
            if (data.success && data.data) {
                setStatus(data.data.status);
                setQrCodeDataUrl(data.data.qrDataUrl);
                setError(null);
            } else {
                setError(data.error || 'Failed to fetch status');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to connect');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleReconnect = async () => {
        setReconnecting(true);
        setError(null);
        try {
            await api('/api/whatsapp/reconnect');
            await fetchStatus();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to reconnect');
        } finally {
            setReconnecting(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const statusIcon = {
        connected: <CheckCircle size={20} className="text-green-400" />,
        connecting: <Loader2 size={20} className="text-yellow-400 animate-spin" />,
        disconnected: <XCircle size={20} className="text-red-400" />
    };

    const statusText = {
        connected: 'Connected',
        connecting: 'Connecting...',
        disconnected: 'Disconnected'
    };

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <Phone size={20} className="text-green-400" />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold">WhatsApp Connection</h1>
                        </div>
                        <button
                            onClick={handleReconnect}
                            disabled={reconnecting}
                            className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={reconnecting ? 'animate-spin' : ''} />
                            {reconnecting ? 'Reconnecting...' : 'Reconnect'}
                        </button>
                    </div>
                    <p className="text-sm text-muted">Scan the QR code below to connect WhatsApp. Connection status updates automatically.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-xl bg-surface border border-border">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Connection Status</h2>
                    {loading ? (
                        <div className="flex items-center gap-2 text-muted">
                            <Loader2 size={18} className="animate-spin" />
                            Loading...
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            {statusIcon[status]}
                            <span className={cn(
                                "text-lg font-semibold",
                                status === 'connected' ? 'text-green-400' :
                                status === 'connecting' ? 'text-yellow-400' : 'text-red-400'
                            )}>
                                {statusText[status]}
                            </span>
                        </div>
                    )}
                    {error && (
                        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                <div className="p-6 rounded-xl bg-surface border border-border">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted mb-4">QR Code</h2>
                    {loading ? (
                        <div className="flex items-center justify-center h-48 text-muted">
                            <Loader2 size={24} className="animate-spin" />
                        </div>
                    ) : qrCodeDataUrl ? (
                        <div className="flex flex-col items-center">
                            <div className="p-4 bg-white rounded-lg">
                                <img src={qrCodeDataUrl} alt="WhatsApp QR Code" className="w-48 h-48" />
                            </div>
                            <p className="mt-4 text-sm text-muted text-center">
                                Scan this QR code with your WhatsApp app to connect
                            </p>
                        </div>
                    ) : status === 'connected' ? (
                        <div className="flex flex-col items-center justify-center h-48 text-green-400">
                            <CheckCircle size={48} className="mb-2" />
                            <p className="text-sm">WhatsApp is connected</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-muted">
                            <Phone size={48} className="mb-2 opacity-30" />
                            <p className="text-sm">No QR code available</p>
                            <p className="text-xs mt-1">Click Reconnect to generate a new one</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
