/**
 * Web Search Tool
 * 
 * Supports multiple search providers with caching:
 * - DuckDuckGo: Free, no API key required
 * - SerpAPI: Requires API key ($50/month for 5k queries)
 * - Brave Search: Requires API key (free tier: 2k queries/month)
 */

import type { Tool } from './index.js';
import { createLogger } from '../logger.js';
import {
    SEARCH_PROVIDER,
    SERPAPI_API_KEY,
    BRAVE_SEARCH_KEY,
    SEARCH_CACHE_TTL_MINUTES,
    AIR_GAPPED,
} from '../config.js';
import { checkAirGapTool } from '../airgap/enforcement.ts';

const logger = createLogger('search-tools');

/**
 * Type definitions for search results
 */
export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

/**
 * Cache implementation with TTL
 */
class SearchCache {
    private cache = new Map<string, { results: SearchResult[]; expiry: number }>();

    set(query: string, results: SearchResult[], ttlMinutes: number): void {
        const expiry = Date.now() + ttlMinutes * 60 * 1000;
        this.cache.set(query.toLowerCase(), { results, expiry });
        logger.debug(`Cached search results for: ${query} (expires in ${ttlMinutes}m)`);
    }

    get(query: string): SearchResult[] | null {
        const cached = this.cache.get(query.toLowerCase());
        if (!cached) return null;

        if (Date.now() > cached.expiry) {
            this.cache.delete(query.toLowerCase());
            return null;
        }

        return cached.results;
    }

    clear(): void {
        this.cache.clear();
    }
}

const searchCache = new SearchCache();

/**
 * DuckDuckGo Search (Free, HTML scraping)
 * Note: DuckDuckGo doesn't have an official public API for search
 * We use the instant answer API which has more limited results
 */
async function searchDuckDuckGo(query: string, numResults: number): Promise<SearchResult[]> {
    try {
        const url = new URL('https://api.duckduckgo.com/');
        url.searchParams.set('q', query);
        url.searchParams.set('format', 'json');
        url.searchParams.set('no_redirect', '1');
        url.searchParams.set('no_html', '1');
        url.searchParams.set('t', 'gravity-claw');

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as any;
        const results: SearchResult[] = [];

        // Parse AbstractURL results
        if (data.AbstractURL) {
            results.push({
                title: data.Abstract || data.Heading || query,
                url: data.AbstractURL,
                snippet: data.Abstract || 'Official result',
            });
        }

        // Parse RelatedTopics (if available)
        if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
            for (const topic of data.RelatedTopics.slice(0, Math.max(4, numResults - 1))) {
                if (topic.FirstURL && topic.Text) {
                    results.push({
                        title: topic.Text.split(' - ')[0] || topic.FirstURL,
                        url: topic.FirstURL,
                        snippet: topic.Text,
                    });
                }
            }
        }

        logger.info(`DuckDuckGo search: "${query}" → ${results.length} results`);
        return results.slice(0, numResults);

    } catch (error) {
        const err = error as Error;
        logger.error(`DuckDuckGo search failed: ${err.message}`);
        throw new Error(`DuckDuckGo search error: ${err.message}`);
    }
}

/**
 * SerpAPI Search (requires paid API key)
 * https://serpapi.com - $50/month for 5k searches
 */
async function searchSerpAPI(query: string, numResults: number): Promise<SearchResult[]> {
    if (!SERPAPI_API_KEY) {
        throw new Error('SerpAPI selected but SERPAPI_API_KEY not set. Get from https://serpapi.com');
    }

    try {
        const url = new URL('https://serpapi.com/search');
        url.searchParams.set('api_key', SERPAPI_API_KEY);
        url.searchParams.set('q', query);
        url.searchParams.set('engine', 'google');
        url.searchParams.set('num', Math.min(numResults, 100).toString());

        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as any;
        const results: SearchResult[] = [];

        // Parse organic results
        if (data.organic_results && Array.isArray(data.organic_results)) {
            for (const result of data.organic_results.slice(0, numResults)) {
                results.push({
                    title: result.title || query,
                    url: result.link || '',
                    snippet: result.snippet || 'No description',
                });
            }
        }

        logger.info(`SerpAPI search: "${query}" → ${results.length} results`);
        return results;

    } catch (error) {
        const err = error as Error;
        logger.error(`SerpAPI search failed: ${err.message}`);
        throw new Error(`SerpAPI search error: ${err.message}`);
    }
}

/**
 * Brave Search (free tier: 2k queries/month)
 * https://api.search.brave.com - requires API key
 */
async function searchBrave(query: string, numResults: number): Promise<SearchResult[]> {
    if (!BRAVE_SEARCH_KEY) {
        throw new Error('Brave Search selected but BRAVE_SEARCH_KEY not set. Get from https://api.search.brave.com');
    }

    try {
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', Math.min(numResults, 100).toString());

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': BRAVE_SEARCH_KEY,
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as any;
        const results: SearchResult[] = [];

        // Parse web results
        if (data.web && Array.isArray(data.web.results)) {
            for (const result of data.web.results.slice(0, numResults)) {
                results.push({
                    title: result.title || query,
                    url: result.url || '',
                    snippet: result.description || 'No description',
                });
            }
        }

        logger.info(`Brave search: "${query}" → ${results.length} results`);
        return results;

    } catch (error) {
        const err = error as Error;
        logger.error(`Brave search failed: ${err.message}`);
        throw new Error(`Brave search error: ${err.message}`);
    }
}

/**
 * Route search through appropriate provider
 */
async function performSearch(query: string, numResults: number): Promise<SearchResult[]> {
    switch (SEARCH_PROVIDER) {
        case 'duckduckgo':
            return searchDuckDuckGo(query, numResults);
        case 'serpapi':
            return searchSerpAPI(query, numResults);
        case 'brave':
            return searchBrave(query, numResults);
        default:
            throw new Error(`Unknown search provider: ${SEARCH_PROVIDER}`);
    }
}

/**
 * Web Search Tool
 */
export const webSearchTool: Tool = {
    name: 'web_search',
    description: `Search the internet for information.

Returns a list of search results with title, URL, and snippet.

The search results are cached for ${SEARCH_CACHE_TTL_MINUTES} minutes to avoid duplicate queries.

Search provider: ${SEARCH_PROVIDER}${
        SEARCH_PROVIDER === 'duckduckgo'
            ? ' (free, instant answers and related topics)'
            : SEARCH_PROVIDER === 'serpapi'
            ? ' (requires API key, comprehensive results)'
            : ' (requires API key, free tier: 2k queries/month)'
    }

Example: web_search({ query: "quantum computing 2024", num_results: 5 })`,

    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Search query (e.g., "latest AI research", "weather New York")',
            },
            num_results: {
                type: 'number',
                description: 'Number of results to return (default: 5, max: 20)',
            },
        },
        required: ['query'],
    },

    async execute(args: Record<string, unknown>): Promise<string> {
        try {
            // Check air-gap mode
            if (AIR_GAPPED) {
                checkAirGapTool('web_search');
            }

            const query = args.query as string;
            const numResults = Math.min(Math.max((args.num_results as number) || 5, 1), 20);

            if (!query || query.trim().length === 0) {
                return JSON.stringify({
                    success: false,
                    error: 'Query cannot be empty',
                });
            }

            // Check cache first
            const cached = searchCache.get(query);
            if (cached) {
                logger.info(`Returning cached results for: "${query}" (${cached.length} results)`);
                return JSON.stringify({
                    success: true,
                    query,
                    results: cached.slice(0, numResults),
                    cached: true,
                    provider: SEARCH_PROVIDER,
                });
            }

            // Perform search
            logger.info(`Searching for: "${query}" (provider: ${SEARCH_PROVIDER})`);
            const results = await performSearch(query, numResults);

            // Cache results
            searchCache.set(query, results, SEARCH_CACHE_TTL_MINUTES);

            return JSON.stringify({
                success: true,
                query,
                results: results.slice(0, numResults),
                cached: false,
                provider: SEARCH_PROVIDER,
                count: results.length,
            });

        } catch (error) {
            const err = error as Error;
            logger.error(`web_search failed: ${err.message}`);
            return JSON.stringify({
                success: false,
                error: err.message,
            });
        }
    },
};

/**
 * Cache Control Tool (admin only)
 */
export const clearSearchCacheTool: Tool = {
    name: 'clear_search_cache',
    description: 'Clear the search results cache. Useful if you want fresh results without waiting for TTL.',

    inputSchema: {
        type: 'object',
        properties: {},
        required: [],
    },

    async execute(): Promise<string> {
        try {
            searchCache.clear();
            logger.info('Search cache cleared');

            return JSON.stringify({
                success: true,
                message: 'Search cache cleared',
            });

        } catch (error) {
            const err = error as Error;
            logger.error(`clear_search_cache failed: ${err.message}`);
            return JSON.stringify({
                success: false,
                error: err.message,
            });
        }
    },
};

/**
 * Export all search tools
 */
export const searchTools: Tool[] = [webSearchTool, clearSearchCacheTool];
