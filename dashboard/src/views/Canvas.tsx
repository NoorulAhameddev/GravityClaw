import { useEffect, useState, useRef } from 'react';
import { Box, AlertCircle, Play, Trash2, Code2, MonitorPlay } from 'lucide-react';
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
        setError('Failed to load canvas widgets from storage');
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
  };

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
    const updated = [...widgets, demoWidget];
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

        <button
          onClick={addDemoWidget}
          className="px-3 py-1.5 bg-surface2 hover:bg-surface-hover border border-border text-text-bright hover:text-accent font-mono text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <Play size={12} className="text-accent" />
          <span>INJECT SAMPLE ARTIFACT</span>
        </button>
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
                <div className="text-[10px]">Click inject to load sample payload</div>
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

          <div className="flex-1 bg-bg relative">
            {selectedWidget ? (
              <iframe
                ref={iframeRef}
                className="w-full h-full border-0"
                sandbox="allow-scripts"
                title="Canvas Viewport"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted font-mono text-xs gap-2">
                <Box size={32} className="text-muted-dark" />
                <div className="text-text-bright uppercase font-semibold">VIEWPORT IDLE</div>
                <div className="text-muted-dark">Select or inject an artifact to inspect sandbox output</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
