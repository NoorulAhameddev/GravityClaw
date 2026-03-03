import type { Tool } from "./index.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("tool:datetime");

export const datetimeTool: Tool = {
    name: "get_datetime",
    description:
        "Returns the current date and time in ISO 8601 format, along with the local timezone offset. Use this whenever the user asks about the current time, date, day, or anything time-related.",
    inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
    },
    async execute(_input) {
        log.debug("get_datetime called");
        const now = new Date();
        return JSON.stringify({
            iso: now.toISOString(),
            local: now.toString(),
            unix: Math.floor(now.getTime() / 1000),
        });
    },
};
