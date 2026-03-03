import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db.ts";
import {
  saveAttachment,
  searchAttachments,
  getRecentAttachmentContext,
  analyzeAndStoreImageAttachment,
} from "../memory/multimodal.ts";

const SESSION_ID = "multimodal:test";
const OTHER_SESSION = "multimodal:other";

describe("Multimodal Memory", () => {
  beforeEach(() => {
    db.prepare("DELETE FROM attachments WHERE session_id IN (?, ?)").run(SESSION_ID, OTHER_SESSION);
  });

  afterEach(() => {
    db.prepare("DELETE FROM attachments WHERE session_id IN (?, ?)").run(SESSION_ID, OTHER_SESSION);
  });

  it("saves attachment records", () => {
    const record = saveAttachment(SESSION_ID, {
      type: "document",
      url: "https://example.com/spec.pdf",
      extractedText: "Project specification",
    });

    expect(record.id).toBeGreaterThan(0);
    expect(record.sessionId).toBe(SESSION_ID);
    expect(record.type).toBe("document");
    expect(record.extractedText).toContain("Project specification");
  });

  it("searches attachments by extracted text", () => {
    saveAttachment(SESSION_ID, {
      type: "image",
      url: "https://example.com/diagram.png",
      extractedText: "Architecture diagram with API gateway",
    });
    saveAttachment(SESSION_ID, {
      type: "audio",
      extractedText: "Meeting transcript about sprint planning",
    });

    const result = searchAttachments(SESSION_ID, "gateway");

    expect(result).toHaveLength(1);
    expect(result[0]?.url).toContain("diagram.png");
  });

  it("keeps attachment search isolated per session", () => {
    saveAttachment(SESSION_ID, {
      type: "image",
      extractedText: "Session A private image notes",
    });
    saveAttachment(OTHER_SESSION, {
      type: "image",
      extractedText: "Session B private image notes",
    });

    const a = searchAttachments(SESSION_ID, "private");
    const b = searchAttachments(OTHER_SESSION, "private");

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]?.sessionId).toBe(SESSION_ID);
    expect(b[0]?.sessionId).toBe(OTHER_SESSION);
  });

  it("builds recent attachment context for prompts", () => {
    saveAttachment(SESSION_ID, {
      type: "image",
      url: "https://example.com/chart.png",
      extractedText: "Bar chart for weekly usage",
    });
    saveAttachment(SESSION_ID, {
      type: "document",
      extractedText: "Design notes with TODO list",
    });

    const context = getRecentAttachmentContext(SESSION_ID, 5, 1000);

    expect(context).toContain("weekly usage");
    expect(context).toContain("Design notes");
    expect(context).toContain("[image]");
  });

  it("analyzes image with custom analyzer and stores extracted text", async () => {
    const record = await analyzeAndStoreImageAttachment(
      SESSION_ID,
      { url: "https://example.com/ui-screenshot.png" },
      {
        analyzer: async () => "UI screenshot with login form and error banner",
      }
    );

    expect(record.type).toBe("image");
    expect(record.extractedText).toContain("login form");

    const found = searchAttachments(SESSION_ID, "error banner");
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(record.id);
  });

  it("stores fallback text when image analysis fails", async () => {
    const record = await analyzeAndStoreImageAttachment(
      SESSION_ID,
      { url: "https://example.com/failing-image.png" },
      {
        analyzer: async () => {
          throw new Error("analysis failed");
        },
      }
    );

    expect(record.extractedText).toContain("analysis unavailable");
  });
});
