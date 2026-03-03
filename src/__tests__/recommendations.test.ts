import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db.ts";
import {
  analyzeSessionPatterns,
  getRecommendationsStatus,
  markRecommendationSent,
  runDailyRecommendationSweep,
  setRecommendationsEnabled,
  shouldSendRecommendationToday,
} from "../recommendations/index.ts";

describe("Smart Recommendations Feature", () => {
  const sessionId = "test:recommendations";

  beforeEach(() => {
    db.prepare("DELETE FROM recommendation_events WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM memory WHERE session_id = ?").run(sessionId);
  });

  it("tracks recommendations enabled state", () => {
    setRecommendationsEnabled(sessionId, false);
    let status = getRecommendationsStatus(sessionId);
    expect(status.enabled).toBe(false);

    setRecommendationsEnabled(sessionId, true);
    status = getRecommendationsStatus(sessionId);
    expect(status.enabled).toBe(true);
  });

  it("enforces max one recommendation per day", () => {
    expect(shouldSendRecommendationToday(sessionId)).toBe(true);

    markRecommendationSent(sessionId, ["Suggestion A"]);

    expect(shouldSendRecommendationToday(sessionId)).toBe(false);
  });

  it("analyzes command and tool patterns", () => {
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
      sessionId,
      JSON.stringify({ role: "user", content: "/status" })
    );
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
      sessionId,
      JSON.stringify({ role: "user", content: "/status" })
    );
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
      sessionId,
      JSON.stringify({
        role: "assistant",
        content: "Used tools",
        tool_calls: [{ function: { name: "search_web" } }],
      })
    );

    const profile = analyzeSessionPatterns(sessionId);
    expect(profile.topCommands[0]?.command).toBe("/status");
    expect(profile.topTools[0]?.tool).toBe("search_web");
  });

  it("sends at most one recommendation per day for the session", async () => {
    db.prepare("INSERT INTO memory (session_id, message_json) VALUES (?, ?)").run(
      sessionId,
      JSON.stringify({ role: "user", content: "/status" })
    );

    const send = vi.fn(async (_sessionId: string, _text: string) => Promise.resolve());

    await runDailyRecommendationSweep(send);
    await runDailyRecommendationSweep(send);

    const count = db.prepare(
      "SELECT COUNT(*) as c FROM recommendation_events WHERE session_id = ?"
    ).get(sessionId) as { c: number };

    expect(count.c).toBe(1);
    expect(send.mock.calls.some((call) => call[0] === sessionId)).toBe(true);
  });
});
