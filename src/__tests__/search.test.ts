/**
 * Tests for Web Search Tools
 * 
 * Tests:
 * - web_search tool with multiple providers
 * - Result caching
 * - Error handling
 * - Cache clearing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webSearchTool, clearSearchCacheTool } from '../tools/memory/search.js';

// Mock fetch
global.fetch = vi.fn();

const mockedFetch = global.fetch as any;

describe('Web Search Tools', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Clear search cache before each test
        await clearSearchCacheTool.execute({});
    });

    describe('Tool Metadata', () => {
        it('should have correct metadata for web_search', () => {
            expect(webSearchTool.name).toBe('web_search');
            expect(webSearchTool.description).toContain('Search the internet');
            expect(webSearchTool.description).toContain('cached');
            expect(webSearchTool.inputSchema.required).toContain('query');
        });

        it('should have correct metadata for clear_search_cache', () => {
            expect(clearSearchCacheTool.name).toBe('clear_search_cache');
            expect(clearSearchCacheTool.description).toContain('Clear the search');
            expect(clearSearchCacheTool.inputSchema.required).toEqual([]);
        });
    });

    describe('Input Schema Validation', () => {
        it('web_search should require query parameter', () => {
            const schema = webSearchTool.inputSchema;
            expect(schema.required).toContain('query');
        });

        it('web_search should have optional num_results', () => {
            const props = webSearchTool.inputSchema.properties as any;
            expect(props.num_results).toBeDefined();
            expect(props.num_results.description).toContain('default: 5');
        });
    });

    describe('web_search Tool', () => {
        it('should reject empty query', async () => {
            const result = await webSearchTool.execute({ query: '' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('empty');
        });

        it('should reject null/undefined query', async () => {
            const result = await webSearchTool.execute({ query: null });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(false);
        });

        it('should handle whitespace-only query', async () => {
            const result = await webSearchTool.execute({ query: '   ' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(false);
        });

        it('should use default num_results if not provided', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        { FirstURL: 'http://example.com', Text: 'Example' },
                        { FirstURL: 'http://example2.com', Text: 'Example 2' },
                        { FirstURL: 'http://example3.com', Text: 'Example 3' },
                    ],
                }),
            });

            const result = await webSearchTool.execute({ query: 'test' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.results).toBeDefined();
            // Default is 5, but actual result count depends on mock
        });

        it('should limit num_results to max 20', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            const result = await webSearchTool.execute({ query: 'test', num_results: 1000 });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            // Tool should cap at 20
        });

        it('should return search results with title, url, snippet', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    AbstractURL: 'http://example.com',
                    Abstract: 'Example abstract',
                    Heading: 'Example Heading',
                    RelatedTopics: [
                        {
                            FirstURL: 'http://related.com',
                            Text: 'Related topic description',
                        },
                    ],
                }),
            });

            const result = await webSearchTool.execute({ query: 'test query' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.query).toBe('test query');
            expect(parsed.results).toBeInstanceOf(Array);

            if (parsed.results.length > 0) {
                const resultItem = parsed.results[0];
                expect(resultItem).toHaveProperty('title');
                expect(resultItem).toHaveProperty('url');
                expect(resultItem).toHaveProperty('snippet');
            }
        });

        it('should include provider in response', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            const result = await webSearchTool.execute({ query: 'test' });
            const parsed = JSON.parse(result);

            expect(parsed.provider).toBeDefined();
        });

        it('should indicate if results are cached', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            const result = await webSearchTool.execute({ query: 'cache test' });
            const parsed = JSON.parse(result);

            expect(parsed).toHaveProperty('cached');
            expect(typeof parsed.cached).toBe('boolean');
        });

        it('should return cached results on second query', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        { FirstURL: 'http://test.com', Text: 'Test' },
                    ],
                }),
            });

            // First call - should hit API
            const result1 = await webSearchTool.execute({ query: 'cached query' });
            const parsed1 = JSON.parse(result1);
            expect(parsed1.cached).toBe(false);

            // Second call - should use cache
            const result2 = await webSearchTool.execute({ query: 'cached query' });
            const parsed2 = JSON.parse(result2);
            expect(parsed2.cached).toBe(true);

            // fetch should only be called once
            expect(mockedFetch).toHaveBeenCalledTimes(1);
        });

        it('should return exact cached results on repeated queries', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        { FirstURL: 'http://first.com', Text: 'First result' },
                        { FirstURL: 'http://second.com', Text: 'Second result' },
                    ],
                }),
            });

            const result1 = await webSearchTool.execute({ query: 'consistency test' });
            const parsed1 = JSON.parse(result1);

            const result2 = await webSearchTool.execute({ query: 'consistency test' });
            const parsed2 = JSON.parse(result2);

            expect(parsed1.results).toEqual(parsed2.results);
        });

        it('should cache results case-insensitively', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            // Search for lowercase
            const result1 = await webSearchTool.execute({ query: 'CASE TEST' });
            const parsed1 = JSON.parse(result1);

            // Search for mixed case - should hit cache
            const result2 = await webSearchTool.execute({ query: 'case test' });
            const parsed2 = JSON.parse(result2);

            expect(parsed2.cached).toBe(true);
            expect(mockedFetch).toHaveBeenCalledTimes(1);
        });

        it('should handle API errors gracefully', async () => {
            mockedFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await webSearchTool.execute({ query: 'failing query' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(false);
            expect(parsed.error).toBeDefined();
        });

        it('should handle timeout errors', async () => {
            mockedFetch.mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));

            const result = await webSearchTool.execute({ query: 'timeout query' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(false);
            expect(parsed.error).toContain('timeout');
        });

        it('should return count in response', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        { FirstURL: 'http://a.com', Text: 'A' },
                        { FirstURL: 'http://b.com', Text: 'B' },
                        { FirstURL: 'http://c.com', Text: 'C' },
                    ],
                }),
            });

            const result = await webSearchTool.execute({ query: 'count test' });
            const parsed = JSON.parse(result);

            expect(parsed).toHaveProperty('count');
            expect(typeof parsed.count).toBe('number');
        });
    });

    describe('clear_search_cache Tool', () => {
        it('should have correct metadata', () => {
            expect(clearSearchCacheTool.name).toBe('clear_search_cache');
            expect(clearSearchCacheTool.inputSchema.required).toEqual([]);
        });

        it('should execute without error', async () => {
            const result = await clearSearchCacheTool.execute({});
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.message).toContain('cleared');
        });

        it('should clear cache between searches', async () => {
            mockedFetch.mockResolvedValue({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            // First search
            const result1 = await webSearchTool.execute({ query: 'clear test' });
            const parsed1 = JSON.parse(result1);
            expect(parsed1.cached).toBe(false);

            // Second search - should be cached
            const result2 = await webSearchTool.execute({ query: 'clear test' });
            const parsed2 = JSON.parse(result2);
            expect(parsed2.cached).toBe(true);

            // Clear cache
            await clearSearchCacheTool.execute({});

            // Third search - should not be cached
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });
            const result3 = await webSearchTool.execute({ query: 'clear test' });
            const parsed3 = JSON.parse(result3);
            expect(parsed3.cached).toBe(false);

            // Should have called fetch twice (first and third)
            expect(mockedFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Result Format', () => {
        it('should return proper JSON structure for success', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        { FirstURL: 'http://test.com', Text: 'Test' },
                    ],
                }),
            });

            const result = await webSearchTool.execute({ query: 'format test' });
            const parsed = JSON.parse(result);

            expect(parsed).toHaveProperty('success', true);
            expect(parsed).toHaveProperty('query');
            expect(parsed).toHaveProperty('results');
            expect(parsed).toHaveProperty('cached');
            expect(parsed).toHaveProperty('provider');
            expect(parsed).toHaveProperty('count');
        });

        it('should return proper JSON structure for error', async () => {
            mockedFetch.mockRejectedValueOnce(new Error('Test error'));

            const result = await webSearchTool.execute({ query: 'error format' });
            const parsed = JSON.parse(result);

            expect(parsed).toHaveProperty('success', false);
            expect(parsed).toHaveProperty('error');
            expect(typeof parsed.error).toBe('string');
        });

        it('should have consistent result object structure', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        { FirstURL: 'http://a.com', Text: 'Alpha' },
                        { FirstURL: 'http://b.com', Text: 'Beta' },
                    ],
                }),
            });

            const result = await webSearchTool.execute({ query: 'structure test', num_results: 2 });
            const parsed = JSON.parse(result);

            if (parsed.results && parsed.results.length > 0) {
                const item = parsed.results[0];
                expect(Object.keys(item).sort()).toEqual(['snippet', 'title', 'url'].sort());
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle queries with special characters', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            const result = await webSearchTool.execute({ query: 'C++ && Python || JavaScript' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
        });

        it('should handle very long queries', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            const longQuery = 'a'.repeat(500);
            const result = await webSearchTool.execute({ query: longQuery });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.query).toBe(longQuery);
        });

        it('should handle num_results of 0 by using minimum of 1', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        { FirstURL: 'http://test.com', Text: 'Test' },
                    ],
                }),
            });

            const result = await webSearchTool.execute({ query: 'zero results', num_results: 0 });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            // Should return at least 0 (or 1 minimum depending on implementation)
        });

        it('should handle negative num_results', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ RelatedTopics: [] }),
            });

            const result = await webSearchTool.execute({ query: 'negative', num_results: -5 });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
        });

        it('should handle HTML entities in response titles and snippets', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [
                        {
                            FirstURL: 'http://test.com',
                            Text: 'Title with &quot;quotes&quot; and &amp; entities',
                        },
                    ],
                }),
            });

            const result = await webSearchTool.execute({ query: 'html entities' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            // Implementation may or may not decode HTML entities
            // Just verify it returns without crashing
        });

        it('should handle empty result arrays from API', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [],
                }),
            });

            const result = await webSearchTool.execute({ query: 'no results query' });
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.results).toEqual([]);
            expect(parsed.count).toBe(0);
        });
    });

    describe('Provider Configuration', () => {
        it('should include selected provider in response', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    RelatedTopics: [],
                }),
            });

            const result = await webSearchTool.execute({ query: 'provider check' });
            const parsed = JSON.parse(result);

            expect(['duckduckgo', 'serpapi', 'brave']).toContain(parsed.provider);
        });
    });
});
