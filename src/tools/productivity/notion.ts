import { Client } from "@notionhq/client";
import type { Tool } from "../index.js";
import { createLogger } from "../../logger.ts";
import { NOTION_API_KEY, NOTION_DATABASE_ID } from "../../config.js";
import { getSecret, hasSecret } from "../../secrets-runtime.ts";

const log = createLogger("notion");

let notionClient: Client | null = null;

async function getNotionClient(): Promise<Client> {
    const apiKey = NOTION_API_KEY || await getSecret("NOTION_API_KEY");
    
    if (!apiKey) {
        throw new Error("Notion API key not configured. Set NOTION_API_KEY in environment or add to secrets store.");
    }
    
    if (!notionClient) {
        notionClient = new Client({ auth: apiKey });
    }
    
    return notionClient;
}

function parseBlockContent(block: Record<string, unknown>): string {
    const blockType = block.type as string;
    const blockData = block[blockType] as Record<string, unknown>;
    
    switch (blockType) {
        case "paragraph":
            return (blockData.rich_text as Array<{ plain_text?: string }>)?.map((t) => t.plain_text || "").join("") || "";
        case "heading_1":
        case "heading_2":
        case "heading_3":
            return `## ${(blockData.rich_text as Array<{ plain_text?: string }>)?.map((t) => t.plain_text || "").join("") || ""}`;
        case "bulleted_list_item":
        case "numbered_list_item":
            return `• ${(blockData.rich_text as Array<{ plain_text?: string }>)?.map((t) => t.plain_text || "").join("") || ""}`;
        case "to_do": {
            const checked = blockData.checked as boolean;
            return `[${checked ? "x" : " "}] ${(blockData.rich_text as Array<{ plain_text?: string }>)?.map((t) => t.plain_text || "").join("") || ""}`;
        }
        case "toggle":
            return `<details>${(blockData.rich_text as Array<{ plain_text?: string }>)?.map((t) => t.plain_text || "").join("") || ""}</details>`;
        case "code": {
            const lang = (blockData.language as string) || "";
            const code = (blockData.rich_text as Array<{ plain_text?: string }>)?.map((t) => t.plain_text || "").join("") || "";
            return `\`\`\`${lang}\n${code}\n\`\`\``;
        }
        case "quote":
            return `> ${(blockData.rich_text as Array<{ plain_text?: string }>)?.map((t) => t.plain_text || "").join("") || ""}`;
        case "divider":
            return "---";
        case "image": {
            const imageType = blockData.type as string;
            const imageUrl = (blockData[imageType] as Record<string, unknown>)?.url as string || "";
            return `![image](${imageUrl})`;
        }
        default:
            return `[${blockType}]`;
    }
}

export const notionCreatePageTool: Tool = {
    name: "notion_create_page",
    description: "Create a new page in a Notion workspace",
    inputSchema: {
        type: "object",
        properties: {
            parentPageId: {
                type: "string",
                description: "Parent page ID (optional, uses workspace if not provided)"
            },
            title: {
                type: "string",
                description: "Page title"
            },
            content: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "code", "quote", "divider"],
                            description: "Block type"
                        },
                        content: {
                            type: "string",
                            description: "Text content for the block"
                        },
                        language: {
                            type: "string",
                            description: "Language for code blocks (e.g., 'javascript', 'python')"
                        },
                        checked: {
                            type: "boolean",
                            description: "For to_do blocks: whether the item is checked"
                        }
                    },
                    required: ["type", "content"]
                },
                description: "Content blocks to add to the page (optional)"
            }
        },
        required: ["title"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const notion = await getNotionClient();
            
            const {
                parentPageId,
                title,
                content
            } = input as {
                parentPageId?: string;
                title?: string;
                content?: Array<{ type: string; content: string; language?: string; checked?: boolean }>;
            };

            if (!title) {
                return JSON.stringify({
                    success: false,
                    error: "title is required"
                });
            }

            const pageProperties: Record<string, unknown> = {
                title: {
                    title: [{ text: { content: title } }]
                }
            };

            const children = content?.map((block) => {
                const baseBlock: Record<string, unknown> = { type: block.type };
                
                switch (block.type) {
                    case "paragraph":
                        baseBlock.paragraph = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "heading_1":
                        baseBlock.heading_1 = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "heading_2":
                        baseBlock.heading_2 = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "heading_3":
                        baseBlock.heading_3 = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "bulleted_list_item":
                        baseBlock.bulleted_list_item = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "numbered_list_item":
                        baseBlock.numbered_list_item = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "to_do":
                        baseBlock.to_do = { 
                            rich_text: [{ text: { content: block.content } }],
                            checked: block.checked || false
                        };
                        break;
                    case "toggle":
                        baseBlock.toggle = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "code":
                        baseBlock.code = { 
                            rich_text: [{ text: { content: block.content } }],
                            language: block.language || "plain text"
                        };
                        break;
                    case "quote":
                        baseBlock.quote = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "divider":
                        baseBlock.divider = {};
                        break;
                    default:
                        baseBlock.paragraph = { rich_text: [{ text: { content: block.content } }] };
                }
                
                return baseBlock;
            });

            const createParams: Record<string, unknown> = {
                parent: parentPageId ? { page_id: parentPageId } : { workspace: true },
                properties: pageProperties
            };

            if (children && children.length > 0) {
                createParams.children = children;
            }

            const response = await notion.pages.create(createParams as never) as { id: string; url?: string };

            return JSON.stringify({
                success: true,
                data: {
                    id: response.id,
                    title,
                    url: response.url
                },
                message: `Page "${title}" created successfully`
            });
        } catch (err) {
            log.error("Failed to create Notion page", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to create page"
            });
        }
    }
};

export const notionReadPageTool: Tool = {
    name: "notion_read_page",
    description: "Read content from a Notion page",
    inputSchema: {
        type: "object",
        properties: {
            pageId: {
                type: "string",
                description: "Page ID to read"
            },
            maxDepth: {
                type: "number",
                description: "Maximum depth to traverse for child blocks (default: 3)"
            }
        },
        required: ["pageId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const notion = await getNotionClient();
            
            const {
                pageId,
                maxDepth = 3
            } = input as {
                pageId?: string;
                maxDepth?: number;
            };

            if (!pageId) {
                return JSON.stringify({
                    success: false,
                    error: "pageId is required"
                });
            }

            const page = await notion.pages.retrieve({ page_id: pageId }) as { properties?: Record<string, unknown>; url?: string };
            
            const pageTitle = (page.properties?.title as { title?: Array<{ plain_text?: string }> })?.title?.[0]?.plain_text 
                || (page.properties?.Name as { title?: Array<{ plain_text?: string }> })?.title?.[0]?.plain_text
                || "Untitled";

            async function getBlocks(blockId: string, depth: number): Promise<Array<Record<string, unknown>>> {
                if (depth <= 0) return [];
                
                const blocks: Array<Record<string, unknown>> = [];
                let cursor: string | undefined;
                
                do {
                    const queryParams: Record<string, unknown> = {
                        block_id: blockId,
                        page_size: 100
                    };
                    if (cursor) {
                        queryParams.start_cursor = cursor;
                    }
                    
                    const response = await notion.blocks.children.list(queryParams as never);
                    
                    for (const block of response.results) {
                        const blockData = block as Record<string, unknown>;
                        blocks.push(blockData);
                        
                        if (blockData.has_children && depth > 1) {
                            const children = await getBlocks(blockData.id as string, depth - 1);
                            blocks.push(...children);
                        }
                    }
                    
                    cursor = response.has_more ? response.next_cursor || undefined : undefined;
                } while (cursor);
                
                return blocks;
            }

            const blocks = await getBlocks(pageId, maxDepth);
            
            const parsedContent = blocks.map(block => parseBlockContent(block)).filter(Boolean).join("\n");

            return JSON.stringify({
                success: true,
                data: {
                    id: pageId,
                    title: pageTitle,
                    content: parsedContent,
                    blocks: blocks.length,
                    url: page.url
                }
            });
        } catch (err) {
            log.error("Failed to read Notion page", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to read page"
            });
        }
    }
};

export const notionAppendBlockTool: Tool = {
    name: "notion_append_block",
    description: "Add content blocks to an existing Notion page",
    inputSchema: {
        type: "object",
        properties: {
            pageId: {
                type: "string",
                description: "Page ID to append blocks to"
            },
            blocks: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type: {
                            type: "string",
                            enum: ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "toggle", "code", "quote", "divider"],
                            description: "Block type"
                        },
                        content: {
                            type: "string",
                            description: "Text content for the block"
                        },
                        language: {
                            type: "string",
                            description: "Language for code blocks"
                        },
                        checked: {
                            type: "boolean",
                            description: "For to_do blocks: whether the item is checked"
                        }
                    },
                    required: ["type", "content"]
                },
                description: "Blocks to append"
            }
        },
        required: ["pageId", "blocks"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const notion = await getNotionClient();
            
            const {
                pageId,
                blocks
            } = input as {
                pageId?: string;
                blocks?: Array<{ type: string; content: string; language?: string; checked?: boolean }>;
            };

            if (!pageId) {
                return JSON.stringify({
                    success: false,
                    error: "pageId is required"
                });
            }

            if (!blocks || blocks.length === 0) {
                return JSON.stringify({
                    success: false,
                    error: "blocks are required"
                });
            }

            const children = blocks.map((block): Record<string, unknown> => {
                const baseBlock: Record<string, unknown> = { type: block.type };
                
                switch (block.type) {
                    case "paragraph":
                        baseBlock.paragraph = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "heading_1":
                        baseBlock.heading_1 = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "heading_2":
                        baseBlock.heading_2 = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "heading_3":
                        baseBlock.heading_3 = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "bulleted_list_item":
                        baseBlock.bulleted_list_item = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "numbered_list_item":
                        baseBlock.numbered_list_item = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "to_do":
                        baseBlock.to_do = { 
                            rich_text: [{ text: { content: block.content } }],
                            checked: block.checked || false
                        };
                        break;
                    case "toggle":
                        baseBlock.toggle = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "code":
                        baseBlock.code = { 
                            rich_text: [{ text: { content: block.content } }],
                            language: block.language || "plain text"
                        };
                        break;
                    case "quote":
                        baseBlock.quote = { rich_text: [{ text: { content: block.content } }] };
                        break;
                    case "divider":
                        baseBlock.divider = {};
                        break;
                    default:
                        baseBlock.paragraph = { rich_text: [{ text: { content: block.content } }] };
                }
                
                return baseBlock;
            });

            await notion.blocks.children.append({
                block_id: pageId,
                children: children as never[]
            });

            return JSON.stringify({
                success: true,
                data: {
                    pageId,
                    addedBlocks: blocks.length
                },
                message: `Added ${blocks.length} block(s) successfully`
            });
        } catch (err) {
            log.error("Failed to append blocks to Notion page", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to append blocks"
            });
        }
    }
};

export const notionQueryDatabaseTool: Tool = {
    name: "notion_query_database",
    description: "Query a Notion database with filters",
    inputSchema: {
        type: "object",
        properties: {
            databaseId: {
                type: "string",
                description: "Database ID to query (uses NOTION_DATABASE_ID from config if not provided)"
            },
            filter: {
                type: "object",
                description: "Filter object for the query (optional)"
            },
            sorts: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        property: { type: "string" },
                        direction: { type: "string", enum: ["ascending", "descending"] }
                    }
                },
                description: "Sort options (optional)"
            },
            maxResults: {
                type: "number",
                description: "Maximum number of results (default: 100)"
            }
        },
        required: []
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const notion = await getNotionClient();
            
            const {
                databaseId,
                filter,
                sorts,
                maxResults = 100
            } = input as {
                databaseId?: string;
                filter?: Record<string, unknown>;
                sorts?: Array<{ property: string; direction: string }>;
                maxResults?: number;
            };

            const dbId = databaseId || NOTION_DATABASE_ID;
            
            if (!dbId) {
                return JSON.stringify({
                    success: false,
                    error: "databaseId is required (set NOTION_DATABASE_ID in config or provide databaseId)"
                });
            }

            const queryParams: Record<string, unknown> = {
                database_id: dbId,
                page_size: Math.min(maxResults, 100)
            };

            if (filter) {
                queryParams.filter = filter;
            }
            if (sorts) {
                queryParams.sorts = sorts;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = await (notion.databases as any).query(queryParams);

            const results = response.results.map((page: Record<string, unknown>) => {
                const pageData = page as { id: string; properties?: Record<string, unknown> };
                const title = Object.values(pageData.properties || {}).find(
                    (prop: unknown) => (prop as { type?: string })?.type === "title"
                ) as { title?: Array<{ plain_text?: string }> } | undefined;
                
                const titleText = title?.title?.[0]?.plain_text || "Untitled";
                
                return {
                    id: pageData.id,
                    title: titleText,
                    url: (page as { url?: string }).url
                };
            });

            return JSON.stringify({
                success: true,
                data: {
                    databaseId: dbId,
                    results,
                    count: results.length
                }
            });
        } catch (err) {
            log.error("Failed to query Notion database", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to query database"
            });
        }
    }
};

export const notionTools = [
    notionCreatePageTool,
    notionReadPageTool,
    notionAppendBlockTool,
    notionQueryDatabaseTool
];
