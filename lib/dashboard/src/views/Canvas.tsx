import { useEffect, useState, useRef } from 'react';
import { Box, AlertCircle, Play, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface CanvasWidget {
    id: string;
    html?: string;
    js?: string;
    timestamp: string;
}

export default function Canvas() {
    const [widgets, setWidgets] = useState<CanvasWidget[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedWidget, setSelectedWidget] = useState<CanvasWidget | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const fetchWidgets = async () => {
            try {
                setLoading(true);
                const stored = localStorage.getItem('canvas_widgets');
                if (stored) {
                    setWidgets(JSON.parse(stored));
                }
                setError(null);
            } catch {
                setError('Failed to load canvas widgets');
            } finally {
                setLoading(false);
            }
        };
        fetchWidgets();
    }, []);

    const renderWidget = (widget: CanvasWidget) => {
        setSelectedWidget(widget);
        if (iframeRef.current && widget.html) {
            const doc = iframeRef.current.contentDocument;
            if (doc) {
                doc.open();
                doc.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { 
                                margin: 0; 
                                padding: 16px; 
                                font-family: system-ui, sans-serif; 
                                background: #1e293b;
                                color: #f1f5f9;
                            }
                        </style>
                    </head>
                    <body>${widget.html}</body>
                    </html>
                `);
                doc.close();
                if (widget.js) {
                    try {
                        doc.body.innerHTML += `<script>${widget.js}</script>`;
                    } catch {
                        console.error('JS execution error');
                    }
                }
            }
        }
    };

    const addDemoWidget = () => {
        const demoWidget: CanvasWidget = {
            id: `widget-${Date.now()}`,
            html: `<div style="padding: 20px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px; text-align: center;">
                <h2 style="margin: 0 0 10px 0;">Hello from Gravity!</h2>
                <p style="margin: 0; opacity: 0.9;">This is a demo canvas widget pushed from the agent.</p>
                <button id="demo-btn" style="margin-top: 15px; padding: 8px 16px; background: white; border: none; border-radius: 6px; cursor: pointer;">Click Me</button>
            </div>`,
            js: `document.getElementById('demo-btn').addEventListener('click', function() { this.textContent = 'Clicked!'; this.style.background = '#10b981'; this.style.color = 'white'; });`,
            timestamp: new Date().toISOString()
        };
        const updated = [...widgets, demoWidget];
        setWidgets(updated);
        localStorage.setItem('canvas_widgets', JSON.stringify(updated));
        renderWidget(demoWidget);
    };

    const deleteWidget = (id: string) => {
        if (!confirm('Delete this widget?')) return;
        const updated = widgets.filter(w => w.id !== id);
        setWidgets(updated);
        localStorage.setItem('canvas_widgets', JSON.stringify(updated));
        if (selectedWidget?.id === id) {
            setSelectedWidget(null);
            if (iframeRef.current) {
                iframeRef.current.contentDocument?.write('');
            }
        }
    };

    return (
        <div className="p-8 space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Box size={20} className="text-accent" />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold">Canvas</h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-500/20 text-green-400 rounded-full">Live</span>
                    </div>
                    <p className="text-sm text-muted">Interactive HTML/JS widgets pushed from the agent in real-time. View and interact with dynamic content.</p>
                </div>
                <button
                    onClick={addDemoWidget}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
                >
                    <Play size={14} /> Add Demo
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            <div className="flex gap-4 flex-1 min-h-0" style={{ height: 'calc(100vh - 220px)' }}>
                {/* Widget List */}
                <div className="w-72 flex-shrink-0 bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-border bg-surface2/50">
                        <div className="flex items-center gap-2">
                            <Box size={13} className="text-muted" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Widgets</span>
                            <span className="ml-auto text-xs font-mono text-accent">{widgets.length}</span>
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-8 text-muted">
                                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : widgets.length === 0 ? (
                            <div className="py-8 text-center text-muted text-sm">
                                <Box size={24} className="mx-auto mb-2 opacity-30" />
                                No widgets yet
                            </div>
                        ) : (
                            widgets.map(w => (
                                <div key={w.id} className={cn(
                                    'p-3 border-b border-border hover:bg-surface2/50 transition-colors group',
                                    selectedWidget?.id === w.id && 'bg-accent/10 border-l-2 border-l-accent'
                                )}>
                                    <div className="flex items-center justify-between gap-2">
                                        <button
                                            onClick={() => renderWidget(w)}
                                            className="text-xs font-mono text-accent truncate flex-1 text-left hover:underline"
                                        >
                                            {w.id}
                                        </button>
                                        <button
                                            onClick={() => deleteWidget(w.id)}
                                            className="p-1 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <div className="text-[10px] text-muted mt-1">
                                        {new Date(w.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Canvas Preview */}
                <div className="flex-1 bg-surface border border-border rounded-xl overflow-hidden flex flex-col min-w-0">
                    <div className="px-4 py-3 border-b border-border bg-surface2/50 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Preview</span>
                        {selectedWidget && (
                            <span className="text-[10px] text-accent">{selectedWidget.id}</span>
                        )}
                    </div>
                    <div className="flex-1 bg-[#0f172a]">
                        {selectedWidget ? (
                            <iframe
                                ref={iframeRef}
                                className="w-full h-full border-0"
                                sandbox="allow-scripts"
                                title="Canvas Widget"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted">
                                <Box size={48} className="opacity-20 mb-4" />
                                <p>Select a widget to preview</p>
                                <p className="text-xs mt-2">Or click "Add Demo" to create a sample widget</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
