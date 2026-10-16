import { useEffect, useState, useRef, useCallback } from 'react';
import { Box, AlertCircle, Play, Trash2, Code2, MonitorPlay, Wifi, WifiOff } from 'lucide-react';
import { cn, getWsUrl } from '../lib/utils';

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
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const renderWidget = useCallback((widget: CanvasWidget) => {
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
                padding: 20px; 
                font-family: 'JetBrains Mono', monospace; 
                background: #09090b;
                color: #d4d4d8;
              }
              * { box-sizing: border-box; }
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
            console.error('Canvas JS sandbox execution error');
          }
        }
      }
    }
  }, []);

  // Connect to live Canvas WebSocket (/canvas)
  useEffect(() => {
    let unmounted = false;

    const connectCanvasWs = () => {
      const baseWs = getWsUrl();
      if (!baseWs || baseWs === 'ws://' || baseWs === 'wss://') {
        setWsStatus('disconnected');
        return;
      }

      setWsStatus('connecting');
      const wsUrl = `${baseWs}/canvas?session=default`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!unmounted) setWsStatus('connected');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'canvas_push') {
            const newWidget: CanvasWidget = {
              id: `widget-${Date.now().toString().slice(-4)}`,
              html: data.html,
              js: data.js,
              timestamp: data.timestamp || new Date().toISOString(),
            };

            setWidgets((prev) => {
              const updated = [newWidget, ...prev];
              localStorage.setItem('canvas_widgets', JSON.stringify(updated));
              return updated;
            });
            renderWidget(newWidget);
          }
        } catch (e) {
          console.error('Failed to parse Canvas WS message:', e);
        }
      };

      socket.onerror = () => {
        if (!unmounted) setWsStatus('disconnected');
      };

      socket.onclose = () => {
        if (!unmounted) {
          setWsStatus('disconnected');
          reconnectTimeoutRef.current = setTimeout(connectCanvasWs, 3000);
        }
      };
    };

    connectCanvasWs();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [renderWidget]);

  // Load cached widgets on mount
  useEffect(() => {
    try {
      setLoading(true);
      const stored = localStorage.getItem('canvas_widgets');
      if (stored) {
        const parsed = JSON.parse(stored) as CanvasWidget[];
        setWidgets(parsed);
        if (parsed.length > 0 && parsed[0]) {
          renderWidget(parsed[0]);
        }
      }
      setError(null);
    } catch {
      setError('Failed to load canvas widgets from storage');
    } finally {
      setLoading(false);
    }
  }, [renderWidget]);

  const addDemoWidget = () => {
    const demoWidget: CanvasWidget = {
      id: `widget-telemetry-${Date.now().toString().slice(-4)}`,
      html: `<div style="border: 1px solid #27272a; background: #121215; padding: 18px; font-family: monospace;">
        <div style="font-size: 11px; color: #f97316; font-weight: bold; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">[SWARM_NODE_TELEMETRY]</div>
        <div style="font-size: 20px; color: #fafafa; font-weight: bold; margin-bottom: 12px;">ACTIVE PIPELINE EXECUTION</div>
        <div style="font-size: 12px; color: #71717a; line-height: 1.5; margin-bottom: 16px;">Agent worker #04 successfully synchronized 12 memory clusters to local SQLite storage.</div>
        <button id="demo-btn" style="padding: 6px 14px; background: #f97316; color: #ffffff; border: none; font-family: monospace; font-size: 11px; font-weight: bold; cursor: pointer;">TRIGGER HEALTH PING</button>
      </div>`,
      js: `document.getElementById('demo-btn').addEventListener('click', function() { this.textContent = '[PING_ACKNOWLEDGED]'; this.style.background = '#10b981'; });`,
      timestamp: new Date().toISOString(),
    };
    const updated = [demoWidget, ...widgets];
    setWidgets(updated);
    localStorage.setItem('canvas_widgets', JSON.stringify(updated));
    renderWidget(demoWidget);
  };

  const deleteWidget = (id: string) => {
    if (!confirm(`Delete widget ${id}?`)) return;
    const updated = widgets.filter((w) => w.id !== id);
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
    <div className="space-y-4 max-w-7xl">
      {/* Tactical Canvas Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MonitorPlay size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              AGENT_CANVAS // SANDBOX_VIEWPORT
            </div>
            <div className="text-muted text-xs">
              Direct rendering surface for agent-generated UI fragments, dynamic tables, and HTML artifacts.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-muted flex items-center gap-1.5">
            {wsStatus === 'connected' ? (
              <>
                <Wifi size={12} className="text-success" />
                <span className="text-success">[CANVAS_SOCKET: LIVE]</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-danger" />
                <span className="text-danger">[CANVAS_SOCKET: DISCONNECTED]</span>
              </>
            )}
          </span>

          <button
            onClick={addDemoWidget}
            className="px-3 py-1.5 bg-surface2 hover:bg-surface-hover border border-border text-text-bright hover:text-accent font-mono text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <Play size={12} className="text-accent" />
            <span>INJECT SAMPLE ARTIFACT</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 text-danger font-mono text-xs">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Workspace Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[calc(100vh-14rem)]">
        {/* Artifact Sidebar */}
        <div className="hud-panel flex flex-col md:col-span-1">
          <div className="hud-panel-header">
            <div className="flex items-center gap-1.5">
              <Code2 size={13} className="text-accent" />
              <span>ARTIFACTS ({widgets.length})</span>
            </div>
            <span className="font-mono text-[10px] text-muted">LOCAL_CACHE</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border font-mono text-xs">
            {loading ? (
              <div className="p-4 text-center text-muted">SCANNING ARTIFACTS...</div>
            ) : widgets.length === 0 ? (
              <div className="p-6 text-center text-muted-dark space-y-2">
                <Box size={24} className="mx-auto opacity-30" />
                <div>NO ACTIVE ARTIFACTS</div>
                <div className="text-[10px]">Pushed agent widgets will stream here live</div>
              </div>
            ) : (
              widgets.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'p-3 hover:bg-surface-hover cursor-pointer transition-colors group flex items-start justify-between gap-2',
                    selectedWidget?.id === w.id && 'bg-surface-hover border-l-2 border-l-accent',
                  )}
                  onClick={() => renderWidget(w)}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-text-bright truncate group-hover:text-accent">
                      {w.id}
                    </div>
                    <div className="text-[10px] text-muted-dark mt-0.5">
                      {new Date(w.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWidget(w.id);
                    }}
                    className="text-muted-dark hover:text-danger p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete Artifact"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Viewport Frame */}
        <div className="hud-panel flex flex-col md:col-span-3">
          <div className="hud-panel-header">
            <span className="font-mono text-xs text-text-bright">
              SANDBOX_ENVIRONMENT // {selectedWidget ? selectedWidget.id : 'IDLE'}
            </span>
            <span className="hud-tag">ISOLATED IFRAME</span>
          </div>

          <div className="flex-1 bg-surface relative p-2">
            <iframe
              ref={iframeRef}
              title="Canvas Sandbox"
              sandbox="allow-scripts allow-forms"
              className="w-full h-full border border-border/40 bg-zinc-950"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
