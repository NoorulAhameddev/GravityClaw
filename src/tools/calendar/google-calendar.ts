import { google, calendar_v3 } from "googleapis";
import { readFileSync } from "fs";
import type { Tool } from "../index.js";
import { createLogger } from "../../logger.ts";
import { config } from "../../config.ts";
import { getSecret } from "../../secrets-runtime.ts";

const log = createLogger("google-calendar");

interface CalendarConfig {
    credentialsPath?: string;
    tokenPath?: string;
    apiKey?: string;
}

let calendarClient: calendar_v3.Calendar | null = null;

async function getConfig(): Promise<CalendarConfig> {
    const credentialsPath = config.GOOGLE_CREDENTIALS_PATH || await getSecret("GOOGLE_CREDENTIALS_PATH");
    const apiKey = config.GOOGLE_CALENDAR_API_KEY || await getSecret("GOOGLE_CALENDAR_API_KEY");
    const configResult: CalendarConfig = {};
    if (credentialsPath) {
        configResult.credentialsPath = credentialsPath;
        configResult.tokenPath = credentialsPath.replace("credentials.json", "token.json");
    }
    if (apiKey) {
        configResult.apiKey = apiKey;
    }
    return configResult;
}

async function getCalendarClient(): Promise<calendar_v3.Calendar> {
    if (calendarClient) return calendarClient;

    const cfg = await getConfig();

    if (!cfg.credentialsPath && !cfg.apiKey) {
        throw new Error("Google Calendar not configured. Set GOOGLE_CALENDAR_API_KEY or GOOGLE_CREDENTIALS_PATH in environment.");
    }

    if (cfg.apiKey) {
        calendarClient = google.calendar({
            version: "v3",
            auth: cfg.apiKey
        }) as calendar_v3.Calendar;
        return calendarClient;
    }

    if (cfg.credentialsPath) {
        try {
            const credentials = JSON.parse(readFileSync(cfg.credentialsPath, "utf-8"));
            
            if (credentials.type === "service_account") {
                const auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ["https://www.googleapis.com/auth/calendar"]
                });
                calendarClient = google.calendar({ version: "v3", auth: auth as any }) as calendar_v3.Calendar;
            } else if (credentials.web || credentials.installed) {
                const oauth2Client = new google.auth.OAuth2(
                    credentials.web?.client_id || credentials.installed?.client_id,
                    credentials.web?.client_secret || credentials.installed?.client_secret,
                    credentials.web?.redirect_uris?.[0] || credentials.installed?.redirect_uris?.[0]
                );

                const tokenPath = cfg.tokenPath;
                if (tokenPath) {
                    try {
                        const token = JSON.parse(readFileSync(tokenPath, "utf-8"));
                        oauth2Client.setCredentials(token);
                    } catch {
                        log.warn("No token file found, OAuth flow not authenticated");
                    }
                }

                calendarClient = google.calendar({ version: "v3", auth: oauth2Client as any }) as calendar_v3.Calendar;
            }
            
            return calendarClient!;
        } catch (err) {
            log.error("Failed to load Google credentials", err);
            throw new Error("Failed to initialize Google Calendar client");
        }
    }

    throw new Error("Invalid Google Calendar configuration");
}

function mapEvent(event: calendar_v3.Schema$Event): Record<string, unknown> {
    return {
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
        attendees: event.attendees?.map((a: calendar_v3.Schema$EventAttendee) => ({
            email: a.email,
            displayName: a.displayName,
            responseStatus: a.responseStatus
        })),
        status: event.status,
        htmlLink: event.htmlLink,
        created: event.created,
        updated: event.updated
    };
}

export const calendarListEventsTool: Tool = {
    name: "calendar_list_events",
    description: "List upcoming events from Google Calendar",
    inputSchema: {
        type: "object",
        properties: {
            calendarId: {
                type: "string",
                description: "Calendar ID (default: primary)"
            },
            timeMin: {
                type: "string",
                description: "Start time in RFC3339 format (default: now)"
            },
            timeMax: {
                type: "string",
                description: "End time in RFC3339 format (optional)"
            },
            maxResults: {
                type: "number",
                description: "Maximum number of events to return (default: 10, max: 2500)"
            },
            singleEvents: {
                type: "boolean",
                description: "Expand recurring events into single instances (default: true)"
            },
            orderBy: {
                type: "string",
                enum: ["startTime", "updated"],
                description: "Order by startTime or updated (default: startTime)"
            },
            q: {
                type: "string",
                description: "Free text search term"
            }
        },
        required: []
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const {
                calendarId = "primary",
                timeMin = new Date().toISOString(),
                timeMax,
                maxResults = 10,
                singleEvents = true,
                orderBy = "startTime",
                q
            } = input as {
                calendarId?: string;
                timeMin?: string;
                timeMax?: string;
                maxResults?: number;
                singleEvents?: boolean;
                orderBy?: "startTime" | "updated";
                q?: string;
            };

            const calendar = await getCalendarClient();
            
            const params: calendar_v3.Params$Resource$Events$List = {
                calendarId,
                timeMin,
                maxResults: Math.min(maxResults, 2500),
                singleEvents,
                orderBy,
                showDeleted: false
            };
            
            if (timeMax) params.timeMax = timeMax;
            if (q) params.q = q;

            const response = await calendar.events.list(params);

            const events = response.data.items?.map(mapEvent) || [];

            return JSON.stringify({
                success: true,
                data: {
                    events,
                    count: events.length,
                    summary: `Found ${events.length} event(s)`
                }
            });
        } catch (err) {
            log.error("Failed to list calendar events", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to list events"
            });
        }
    }
};

export const calendarCreateEventTool: Tool = {
    name: "calendar_create_event",
    description: "Create a new event in Google Calendar",
    inputSchema: {
        type: "object",
        properties: {
            calendarId: {
                type: "string",
                description: "Calendar ID (default: primary)"
            },
            summary: {
                type: "string",
                description: "Event title"
            },
            description: {
                type: "string",
                description: "Event description"
            },
            location: {
                type: "string",
                description: "Event location"
            },
            startTime: {
                type: "string",
                description: "Start time in RFC3339 format"
            },
            endTime: {
                type: "string",
                description: "End time in RFC3339 format"
            },
            timeZone: {
                type: "string",
                description: "Time zone (e.g., 'America/New_York', 'UTC')"
            },
            attendees: {
                type: "array",
                items: { type: "string" },
                description: "List of attendee email addresses"
            },
            sendNotifications: {
                type: "boolean",
                description: "Send email notifications to attendees (default: false)"
            }
        },
        required: ["summary", "startTime", "endTime"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const {
                calendarId = "primary",
                summary,
                description,
                location,
                startTime,
                endTime,
                timeZone,
                attendees,
                sendNotifications = false
            } = input as {
                calendarId?: string;
                summary?: string;
                description?: string;
                location?: string;
                startTime?: string;
                endTime?: string;
                timeZone?: string;
                attendees?: string[];
                sendNotifications?: boolean;
            };

            if (!summary || !startTime || !endTime) {
                return JSON.stringify({
                    success: false,
                    error: "summary, startTime, and endTime are required"
                });
            }

            const calendar = await getCalendarClient();

            const event: calendar_v3.Schema$Event = {
                summary,
                description: description || null,
                location: location || null,
                start: {
                    dateTime: startTime,
                    timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                end: {
                    dateTime: endTime,
                    timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                }
            };

            if (attendees && attendees.length > 0) {
                event.attendees = attendees.map(email => ({ email }));
            }

            const response = await calendar.events.insert({
                calendarId,
                requestBody: event,
                sendUpdates: sendNotifications ? "all" : "none"
            });

            const createdEvent = response.data;

            return JSON.stringify({
                success: true,
                data: {
                    id: createdEvent.id,
                    summary: createdEvent.summary,
                    htmlLink: createdEvent.htmlLink,
                    start: createdEvent.start,
                    end: createdEvent.end,
                    created: createdEvent.created
                },
                message: `Event "${summary}" created successfully`
            });
        } catch (err) {
            log.error("Failed to create calendar event", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to create event"
            });
        }
    }
};

export const calendarUpdateEventTool: Tool = {
    name: "calendar_update_event",
    description: "Update an existing event in Google Calendar",
    inputSchema: {
        type: "object",
        properties: {
            calendarId: {
                type: "string",
                description: "Calendar ID (default: primary)"
            },
            eventId: {
                type: "string",
                description: "Event ID to update"
            },
            summary: {
                type: "string",
                description: "New event title"
            },
            description: {
                type: "string",
                description: "New event description"
            },
            location: {
                type: "string",
                description: "New event location"
            },
            startTime: {
                type: "string",
                description: "New start time in RFC3339 format"
            },
            endTime: {
                type: "string",
                description: "New end time in RFC3339 format"
            },
            timeZone: {
                type: "string",
                description: "Time zone (e.g., 'America/New_York', 'UTC')"
            },
            attendees: {
                type: "array",
                items: { type: "string" },
                description: "New list of attendee email addresses"
            },
            sendNotifications: {
                type: "boolean",
                description: "Send email notifications to attendees (default: false)"
            }
        },
        required: ["eventId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const {
                calendarId = "primary",
                eventId,
                summary,
                description,
                location,
                startTime,
                endTime,
                timeZone,
                attendees,
                sendNotifications = false
            } = input as {
                calendarId?: string;
                eventId?: string;
                summary?: string;
                description?: string;
                location?: string;
                startTime?: string;
                endTime?: string;
                timeZone?: string;
                attendees?: string[];
                sendNotifications?: boolean;
            };

            if (!eventId) {
                return JSON.stringify({
                    success: false,
                    error: "eventId is required"
                });
            }

            const calendar = await getCalendarClient();

            const updates: calendar_v3.Schema$Event = {};

            if (summary !== undefined) updates.summary = summary;
            if (description !== undefined) updates.description = description;
            if (location !== undefined) updates.location = location;

            if (startTime || endTime) {
                updates.start = {
                    dateTime: startTime || null,
                    timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
                updates.end = {
                    dateTime: endTime || null,
                    timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
                };
            }

            if (attendees !== undefined) {
                updates.attendees = attendees.map(email => ({ email }));
            }

            const response = await calendar.events.patch({
                calendarId,
                eventId,
                requestBody: updates,
                sendUpdates: sendNotifications ? "all" : "none"
            });

            const updatedEvent = response.data;

            return JSON.stringify({
                success: true,
                data: {
                    id: updatedEvent.id,
                    summary: updatedEvent.summary,
                    htmlLink: updatedEvent.htmlLink,
                    start: updatedEvent.start,
                    end: updatedEvent.end,
                    updated: updatedEvent.updated
                },
                message: `Event updated successfully`
            });
        } catch (err) {
            log.error("Failed to update calendar event", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to update event"
            });
        }
    }
};

export const calendarDeleteEventTool: Tool = {
    name: "calendar_delete_event",
    description: "Delete an event from Google Calendar",
    inputSchema: {
        type: "object",
        properties: {
            calendarId: {
                type: "string",
                description: "Calendar ID (default: primary)"
            },
            eventId: {
                type: "string",
                description: "Event ID to delete"
            },
            sendNotifications: {
                type: "boolean",
                description: "Send email notifications to attendees (default: false)"
            }
        },
        required: ["eventId"]
    },
    async execute(input: Record<string, unknown>): Promise<string> {
        try {
            const {
                calendarId = "primary",
                eventId,
                sendNotifications = false
            } = input as {
                calendarId?: string;
                eventId?: string;
                sendNotifications?: boolean;
            };

            if (!eventId) {
                return JSON.stringify({
                    success: false,
                    error: "eventId is required"
                });
            }

            const calendar = await getCalendarClient();

            await calendar.events.delete({
                calendarId,
                eventId,
                sendUpdates: sendNotifications ? "all" : "none"
            });

            return JSON.stringify({
                success: true,
                data: {
                    eventId,
                    deleted: true
                },
                message: "Event deleted successfully"
            });
        } catch (err) {
            log.error("Failed to delete calendar event", err);
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Failed to delete event"
            });
        }
    }
};

export const calendarTools = [
    calendarListEventsTool,
    calendarCreateEventTool,
    calendarUpdateEventTool,
    calendarDeleteEventTool
];
