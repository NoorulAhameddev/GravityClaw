import { createLogger } from "../logger.ts";
import { vectorSemanticSearch, keywordBM25Search } from "../memory/vector.ts";
import { performance } from "perf_hooks";

const log = createLogger("bench:retrieval");

interface BenchResult {
  method: string;
  query: string;
  duration: number;
  results: number;
}

async function runBenchmark(
  method: string,
  fn: () => Promise<any>,
  query: string,
): Promise<BenchResult> {
  const start = performance.now();
  const results = await fn();
  const duration = performance.now() - start;
  return { method, query, duration, results: results?.length ?? 0 };
}

export async function benchmarkRetrieval(sessionId: string, queries: string[]): Promise<BenchResult[]> {
  const results: BenchResult[] = [];

  for (const query of queries) {
    results.push(await runBenchmark("chromadb", () => vectorSemanticSearch(sessionId, query, 5), query));
    results.push(await runBenchmark("bm25", () => keywordBM25Search(sessionId, query, 5), query));
  }

  for (const r of results) {
    log.info(`${r.method.padEnd(10)} | ${r.duration.toFixed(1)}ms | ${r.results} results | "${r.query.substring(0, 40)}"`);
  }

  return results;
}
