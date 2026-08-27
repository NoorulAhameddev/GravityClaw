import { useEffect, useState } from 'react';
import { Wrench, AlertCircle, Search, Terminal } from 'lucide-react';
import { api } from '../lib/api';

interface Tool {
  name: string;
  description?: string;
}

interface ToolGroup {
  category: string;
  tools: Tool[];
}

function toolCat(name: string): string {
  if (/voice|tts|speak|listen|talk|wake|audio/i.test(name)) return 'VOICE_AND_AUDIO';
  if (/memory|fact|entity|graph|recall|save/i.test(name)) return 'MEMORY_AND_GRAPH';
  if (/file|shell|datetime|attachment/i.test(name)) return 'SYSTEM_AND_SHELL';
  if (/browser|screenshot|click|navigate|page/i.test(name)) return 'BROWSER_AUTOMATION';
  if (/telegram|whatsapp|send|communicate/i.test(name)) return 'COMMUNICATION_CHANNELS';
  if (/schedule|cron|task/i.test(name)) return 'JOB_SCHEDULER';
  if (/webhook/i.test(name)) return 'WEBHOOK_INGRESS';
  if (/mcp/i.test(name)) return 'MCP_EXTENSIONS';
  if (/skill/i.test(name)) return 'SKILL_MODULES';
  if (/agent|spawn|swarm|workflow|aggregate/i.test(name)) return 'SWARM_ORCHESTRATION';
  if (/dashboard|canvas/i.test(name)) return 'UI_AND_CANVAS';
  if (/heartbeat/i.test(name)) return 'HEARTBEAT_PROBES';
  if (/search/i.test(name)) return 'SEARCH_AND_RECON';
  if (/admin|permission/i.test(name)) return 'ADMIN_CONTROLS';
  return 'GENERAL_UTILITIES';
}

export default function Tools() {
  const [groups, setGroups] = useState<ToolGroup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api('/api/tools');
        const data: Tool[] = res.data || [];
        setTotalCount(data.length);
        const map: Record<string, Tool[]> = {};
        data.forEach((t) => {
          const cat = toolCat(t.name);
          (map[cat] = map[cat] || []).push(t);
        });
        setGroups(
          Object.entries(map)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, tools]) => ({ category, tools })),
        );
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load tool definitions');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const filteredGroups = groups
    .map((g) => ({
      ...g,
      tools: g.tools.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          (t.description || '').toLowerCase().includes(search.toLowerCase()),
      ),
    }))
    .filter((g) => g.tools.length > 0);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HUD Header */}
      <div className="hud-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench size={18} className="text-accent" />
          <div>
            <div className="font-mono text-sm font-bold text-text-bright uppercase">
              TOOL_REGISTRY // FUNCTION_CALLING_MANIFEST
            </div>
            <div className="text-muted text-xs">
              All registered callable functions and schemas exposed to the LLM agent runtime.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hud-tag text-accent">{totalCount} CAPABILITIES LOADED</span>
          <span className="hud-tag">STRICT_SCHEMAS</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/30 text-danger font-mono text-xs">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* Search Toolbar */}
      <div className="hud-panel p-3 bg-surface2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={13} />
          <input
            type="text"
            placeholder="Search callable tools or schema descriptions..."
            className="w-full pl-8 pr-3 py-1.5 bg-surface border border-border text-xs font-mono text-text-bright focus:outline-none focus:border-accent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tool Groups Matrix */}
      {loading ? (
        <div className="hud-panel p-8 text-center font-mono text-xs text-muted">
          SYNCHRONIZING CALLABLE SCHEMAS...
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="hud-panel p-8 text-center font-mono text-xs text-muted-dark">
          NO TOOLS MATCH QUERY
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((g) => (
            <div key={g.category} className="hud-panel">
              <div className="hud-panel-header">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-accent" />
                  <span>// {g.category}</span>
                </div>
                <span className="hud-tag">{g.tools.length} FUNCTIONS</span>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {g.tools.map((t) => (
                  <div
                    key={t.name}
                    className="p-3 border border-border bg-surface hover:border-accent/40 transition-colors flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <code className="font-mono text-xs font-bold text-accent truncate group-hover:underline">
                          {t.name}()
                        </code>
                        <Terminal size={12} className="text-muted-dark group-hover:text-accent shrink-0" />
                      </div>
                      <p className="font-sans text-xs text-muted line-clamp-2 leading-relaxed">
                        {t.description || 'No schema description provided.'}
                      </p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-border-subtle flex items-center justify-between text-[10px] font-mono text-muted-dark">
                      <span>SIGNATURE: VERIFIED</span>
                      <span className="text-accent">CALLABLE</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
