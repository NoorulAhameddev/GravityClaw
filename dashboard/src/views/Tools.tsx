import { useEffect, useState } from 'react';
import { Wrench, AlertCircle, Search } from 'lucide-react';
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
    if (/voice|tts|speak|listen|talk|wake|audio/i.test(name)) return '🎤 Voice & Audio';
    if (/memory|fact|entity|graph|recall|save/i.test(name)) return '🧠 Memory & Knowledge';
    if (/file|shell|datetime|attachment/i.test(name)) return '⚙️ System';
    if (/browser|screenshot|click|navigate|page/i.test(name)) return '🌐 Browser Automation';
    if (/telegram|whatsapp|send|communicate/i.test(name)) return '💬 Communication';
    if (/schedule|cron|task/i.test(name)) return '⏰ Scheduler';
    if (/webhook/i.test(name)) return '🔗 Webhooks';
    if (/mcp/i.test(name)) return '🔌 MCP';
    if (/skill/i.test(name)) return '💡 Skills';
    if (/agent|spawn|swarm|workflow|aggregate/i.test(name)) return '🐝 Agent Orchestration';
    if (/dashboard|canvas/i.test(name)) return '🎨 UI & Canvas';
    if (/heartbeat/i.test(name)) return '💓 Heartbeat';
    if (/search/i.test(name)) return '🔍 Search';
    if (/admin|permission/i.test(name)) return '🔐 Admin';
    return '🔹 General';
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
                data.forEach(t => {
                    const cat = toolCat(t.name);
                    (map[cat] = map[cat] || []).push(t);
                });
                setGroups(
                    Object.entries(map)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([category, tools]) => ({ category, tools }))
                );
                setError(null);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Failed to load tools');
            } finally { setLoading(false); }
        };
        fetch();
    }, []);

    const filteredGroups = groups.map(g => ({
        ...g,
        tools: g.tools.filter(t =>
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            (t.description || '').toLowerCase().includes(search.toLowerCase())
        )
    })).filter(g => g.tools.length > 0);

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-5 p-6 rounded-2xl bg-surface border border-border">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Wrench size={20} className="text-accent" />
                </div>
                <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold">Tools Registry</h1>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-500/20 text-green-400 rounded-full">
                            {totalCount} loaded
                        </span>
                    </div>
                    <p className="text-sm text-muted">All tools available to the agent, grouped by category. Tools are registered at startup and can be enabled/disabled per group.</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                <input type="text" placeholder="Search tools…"
                    className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
                    value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Tool Groups */}
            {loading && groups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-muted">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Loading tools…
                </div>
            ) : error ? (
                <div className="flex flex-col items-center gap-2 py-16 text-red-400"><AlertCircle size={24} />{error}</div>
            ) : filteredGroups.length === 0 ? (
                <div className="py-16 text-center text-muted">No tools matching "{search}"</div>
            ) : filteredGroups.map(g => (
                <div key={g.category} className="space-y-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{g.category}</h2>
                        <span className="px-1.5 py-0.5 bg-surface2 rounded text-xs font-mono text-accent">{g.tools.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {g.tools.map(t => (
                            <div key={t.name}
                                className="p-4 rounded-xl bg-surface border border-border hover:border-accent/40 hover:-translate-y-0.5 transition-all group cursor-default"
                                title={t.description || ''}>
                                <div className="font-mono text-sm font-semibold text-accent group-hover:text-accent/80 mb-1.5 truncate">{t.name}</div>
                                <div className="text-[11px] text-muted leading-relaxed line-clamp-2">{t.description || 'No description'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
