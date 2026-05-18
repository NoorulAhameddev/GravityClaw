/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface HealthData {
    status?: string;
    uptime?: number;
    server?: {
        wsClients?: number;
        port?: number;
    };
}

interface StatsData {
    sessions?: number;
    activeTasks?: number;
    memorySessions?: number;
    swarms?: number;
    workflows?: number;
    webhooks?: number;
}

interface UsagePeriod {
    requests: number;
    tokens: number;
    cost: number | null;
}

interface UsageData {
    byPeriod?: {
        today?: UsagePeriod;
        week?: UsagePeriod;
        allTime?: UsagePeriod;
    };
    avgLatency?: number;
}

interface GlobalState {
    health: HealthData | null;
    stats: { data: StatsData } | null;
    usage: UsageData | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

const StateContext = createContext<GlobalState | undefined>(undefined);

export function StateProvider({ children }: { children: React.ReactNode }) {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [stats, setStats] = useState<{ data: StatsData } | null>(null);
    const [usage, setUsage] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const [h, s, u] = await Promise.all([
                api('/api/health'),
                api('/api/stats'),
                api('/api/usage')
            ]);
            setHealth(h as HealthData);
            setStats(s as { data: StatsData });
            setUsage(u as UsageData);
        } catch (e) {
            console.error('Failed to refresh state:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const timer = setInterval(refresh, 30000);
        return () => clearInterval(timer);
    }, [refresh]);

    return (
        <StateContext.Provider value={{ health, stats, usage, loading, refresh }}>
            {children}
        </StateContext.Provider>
    );
}

export function useGlobalState() {
    const context = useContext(StateContext);
    if (context === undefined) {
        throw new Error('useGlobalState must be used within a StateProvider');
    }
    return context;
}

export type { GlobalState, HealthData, StatsData, UsageData, UsagePeriod };
