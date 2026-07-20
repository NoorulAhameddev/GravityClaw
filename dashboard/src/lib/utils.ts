import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function getBaseUrl() {
    const port = window.location.port;
    if (port === '5173' || port === '5174' || port === '5175') {
        return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return '';
}

export function getWsUrl(_apiKey?: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = (window.location.port === '5173' || window.location.port === '5174' || window.location.port === '5175') 
        ? ':3000' 
        : (window.location.port ? `:${window.location.port}` : '');
    
    return `${protocol}//${host}${port}`;
}

export function fmtUptime(seconds: number): string {
    if (!seconds && seconds !== 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
}
