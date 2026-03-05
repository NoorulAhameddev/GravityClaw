# Proactive Features

**Enable your agent to take initiative with heartbeat check-ins, daily recommendations, and evening recaps**

---

## Overview

GravityClaw includes three proactive features that allow your agent to initiate contact rather than just responding to requests:

1. **Heartbeat Check-ins** - Periodic status checks and updates
2. **Daily Recommendations** - Morning suggestions based on usage patterns
3. **Evening Recap** - End-of-day summaries

These features transform your agent from reactive to proactive, keeping you informed and suggesting actions without explicit prompts.

---

## Heartbeat System

### Concept

Heartbeat enables scheduled check-ins where the agent proactively sends messages to users. Use cases:

- **Status updates**: "Your backup completed successfully"
- **Reminders**: "You have 3 unread notifications"
- **Monitoring**: "System health check: All services running"
- **Engagement**: "Haven't heard from you today—anything I can help with?"

### Configuration

#### Enable Heartbeat

Via tool API:

```json
{
  "interval_minutes": 60
}
```

Or programmatically:

```typescript
import { setHeartbeatPrompt } from "./heartbeat/index.ts";

const result = setHeartbeatPrompt({
  sessionId: "user-session-id",
  schedule: "every hour",
  prompt: "Check if there are any pending tasks and notify the user if needed",
  createdBy: "user-123"
});

console.log(result); // { success: true, heartbeatId: 1, taskId: 42, intervalMinutes: 60 }
```

#### Supported Schedules

Natural language:
- `"every 30 minutes"` - Every 30 minutes
- `"every hour"` - Hourly
- `"every day at 9am"` - Daily at 9 AM
- `"every Monday"` - Weekly on Monday
- `"every weekday at 8am"` - Weekday mornings

Cron expressions:
- `"*/30 * * * *"` - Every 30 minutes
- `"0 9 * * *"` - Daily at 9 AM
- `"0 9 * * 1-5"` - Weekdays at 9 AM

### Heartbeat Prompts

The `prompt` field defines what the agent should check/report. Examples:

**Task reminders**:
```
"Check scheduled_tasks table for tasks due today. If any exist, remind the user with details."
```

**System monitoring**:
```
"Check system metrics, disk space, and memory usage. Alert if any thresholds exceeded (disk >80%, memory >90%)."
```

**Engagement**:
```
"If the user hasn't sent a message in the last 24 hours, send a friendly check-in asking if they need any help."
```

**Custom logic**:
```
"Query the database for unread notifications. If count > 5, summarize them for the user."
```

### Intelligent Filtering

Not every heartbeat should send a message. The system filters heartbeat responses based on noteworthiness:

```typescript
export function isHeartbeatResponseNoteworthy(response: string): boolean {
  const lower = response.toLowerCase().trim();
  
  // Filter out non-actionable responses
  const nonNoteworthyPatterns = [
    "everything is fine",
    "all systems operational",
    "no updates",
    "nothing to report",
    "no new notifications",
    "no tasks",
  ];
  
  return !nonNoteworthyPatterns.some(pattern => lower.includes(pattern));
}
```

**Only noteworthy responses are sent to the user.**

### Heartbeat Status

Check heartbeat configuration:

```typescript
import { getHeartbeatStatus } from "./heartbeat/index.ts";

const status = getHeartbeatStatus("session-id");
console.log(status);
// {
//   enabled: true,
//   intervalMinutes: 60,
//   taskCount: 1,
//   activeTaskCount: 1,
//   lastRun: "2026-03-05T10:00:00.000Z",
//   nextRun: "2026-03-05T11:00:00.000Z"
// }
```

### Disable Heartbeat

```typescript
heartbeat_disable()
```

Or update session settings:

```typescript
import { updateSessionSetting } from "./session.ts";

updateSessionSetting(sessionId, "heartbeatEnabled", false);
```

### Database Schema

```sql
CREATE TABLE heartbeat_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  scheduled_task_id INTEGER,
  enabled INTEGER DEFAULT 1,
  last_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scheduled_task_id) REFERENCES scheduled_tasks(id)
);
```

---

## Daily Recommendations

### Concept

The recommendations system analyzes your usage patterns and proactively suggests relevant actions each morning. It's like having a personal assistant who learns your habits and offers timely suggestions.

### How It Works

1. **Pattern Analysis**: Analyzes last 30 days of activity
   - Most-used tools
   - Common commands
   - Frequent queries
   - Time-of-day patterns

2. **LLM Generation**: Uses patterns to generate personalized suggestions

3. **Daily Delivery**: Sends recommendations once per day (morning)

4. **Learning**: Adapts suggestions based on your feedback and continued usage

### Enable Recommendations

Recommendations are **enabled by default**. To disable:

```typescript
import { setRecommendationsEnabled } from "./recommendations/index.ts";

setRecommendationsEnabled("session-id", false);
```

### Configuration

```bash
# .env file
RECOMMENDATION_HOUR_LOCAL=8    # Send at 8 AM local time
RECOMMENDATION_TIMEZONE=America/New_York
```

### Example Recommendation

Based on your patterns, the agent might send:

```
☀️ Good morning! Here are your recommendations for today:

1. **Backup Reminder**: You typically create backups on Wednesdays. 
   Run `create_backup` to maintain your schedule.

2. **Weekly Report**: You often export usage stats on Fridays. 
   Consider running `export_usage_stats` today.

3. **Tool Suggestion**: You've been using `web_search` frequently for research. 
   Try the new `semantic_search` tool for finding past conversations.

Have a productive day! 🚀
```

### Pattern Analysis

The system tracks:

```typescript
interface RecommendationsProfile {
  topCommands: Array<{ command: string; count: number }>;
  topTools: Array<{ tool: string; count: number }>;
  commonQueries: Array<{ query: string; count: number }>;
}
```

Example profile:

```json
{
  "topCommands": [
    { "command": "/status", "count": 42 },
    { "command": "/help", "count": 15 }
  ],
  "topTools": [
    { "tool": "web_search", "count": 28 },
    { "tool": "create_backup", "count": 12 },
    { "tool": "export_memory", "count": 8 }
  ],
  "commonQueries": [
    { "query": "what's the weather today", "count": 30 },
    { "query": "summarize my tasks", "count": 18 }
  ]
}
```

### Smart Delivery

- **Once per day**: Won't spam multiple times
- **Only if noteworthy**: Empty or generic recommendations are filtered
- **Learns over time**: Suggestions improve as patterns emerge

### Check Recommendation Status

```typescript
import { getRecommendationsStatus } from "./recommendations/index.ts";

const status = getRecommendationsStatus("session-id");
console.log(status);
// {
//   enabled: true,
//   lastSentDate: "2026-03-05"
// }
```

### Database Schema

```sql
CREATE TABLE recommendation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  date_key TEXT NOT NULL,  -- YYYY-MM-DD
  suggestions_json TEXT NOT NULL,  -- Array of suggestion strings
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Evening Recap

### Concept

End-of-day summary of your activities, accomplishments, and outstanding items. Think of it as your agent's daily debrief.

### Configuration

```bash
# .env file
RECAP_HOUR_LOCAL=18           # Send at 6 PM local time
RECAP_TIMEZONE=America/New_York
RECAP_ENABLED=true
```

### Recap Content

The evening recap includes:

1. **Activity Summary**: Messages sent, tools used, tasks completed
2. **Key Accomplishments**: Notable actions taken during the day
3. **Outstanding Items**: Pending tasks, unread notifications
4. **Usage Stats**: Tool execution counts, session time
5. **Suggestions**: Prep for tomorrow

### Example Recap

```
🌙 Evening Recap for March 5, 2026

**Today's Activity**
- 42 messages sent
- 18 tool calls
- 3 backups created
- 2 scheduled tasks completed

**Key Accomplishments**
✅ Exported chat history (12 KB)
✅ Created encrypted backup of database
✅ Scheduled weekly report generation

**Outstanding Items**
⚠️ 5 pending tasks in queue
⚠️ Backup retention cleanup due tomorrow

**Most Used Tools**
1. web_search (12 times)
2. create_backup (3 times)
3. export_memory (2 times)

**Tomorrow's Prep**
Consider reviewing pending tasks and scheduling backups for next week.

Sleep well! 💤
```

### Prompt Template

The recap is generated using a comprehensive prompt:

```typescript
export const EVENING_RECAP_PROMPT = `You are generating an evening recap for the user based on today's activity.

Session: ${sessionId}
Date: ${dateString}

Activity Summary:
- Messages sent: ${messageCount}
- Tools used: ${toolsUsed.join(", ")}
- Tasks completed: ${tasksCompleted}

Generate a concise, friendly evening recap highlighting:
1. Key accomplishments
2. Important metrics
3. Outstanding items needing attention
4. Suggestions for tomorrow

Keep it brief (3-5 sentences) and actionable.`;
```

### Building Custom Recaps

You can customize the recap logic:

```typescript
import { buildEveningRecap } from "./recap/index.ts";

const recap = await buildEveningRecap({
  sessionId: "user-session",
  includeMetrics: true,
  includeTaskStatus: true,
  includeSuggestions: true,
  customPrompt: "Focus on development tasks and code commits"
});

console.log(recap);
```

### Disable Evening Recap

```bash
# .env file
RECAP_ENABLED=false
```

Or via session settings:

```typescript
import { updateSessionSetting } from "./session.ts";

updateSessionSetting(sessionId, "recapEnabled", false);
```

---

## Combining Proactive Features

Use all three features together for maximum productivity:

### Morning Routine

**7:00 AM** - Daily recommendations
```
☀️ Good morning! Here's what I suggest today:
1. Review pending tasks from yesterday
2. Schedule this week's backup
3. Check webhook trigger history
```

### Throughout the Day

**Every 2 hours** - Heartbeat check-in (if noteworthy)
```
⏰ Status Update:
- 3 scheduled tasks completed
- Backup finished successfully (2.4 GB)
- System health: All systems operational
```

### Evening

**6:00 PM** - Evening recap
```
🌙 Evening Recap:
You completed 15 tasks today, used 8 different tools, and created 2 backups.
Outstanding: 2 pending tasks for tomorrow.
Great job! 🎉
```

### Configuration Example

```bash
# Proactive features configuration
RECOMMENDATION_HOUR_LOCAL=7
RECOMMENDATION_TIMEZONE=America/New_York
RECOMMENDATION_ENABLED=true

RECAP_HOUR_LOCAL=18
RECAP_TIMEZONE=America/New_York
RECAP_ENABLED=true

# Heartbeat configured per-session via tool
# heartbeat_enable({ interval_minutes: 120 })
```

---

## Best Practices

### Heartbeat

1. **Choose appropriate intervals**: Too frequent = spam, too rare = not useful
2. **Write actionable prompts**: Specific checks, clear criteria
3. **Use filtering**: Let the system filter non-noteworthy responses
4. **Test prompts**: Verify heartbeat logic before enabling
5. **Monitor execution**: Check logs to ensure it's working as expected

### Recommendations

1. **Give it time**: Needs ~1 week of usage for good patterns
2. **Enable for active sessions**: Most useful for daily users
3. **Review suggestions**: Provide feedback to improve recommendations
4. **Adjust timing**: Set delivery time for your morning routine
5. **Disable when inactive**: Turn off during vacations/breaks

### Recap

1. **End-of-workday timing**: Schedule for when you wrap up
2. **Customize content**: Focus on what matters for your workflow
3. **Use for reflection**: Review accomplishments and plan tomorrow
4. **Combine with planning**: Use recap to inform morning recommendations

---

## Troubleshooting

### Heartbeat Not Triggering

**Problem**: Heartbeat doesn't send messages

**Solutions**:
1. Check heartbeat is enabled: `getHeartbeatStatus()`
2. Verify scheduled task exists: `list_scheduled_tasks()`
3. Check filtering: Response might be non-noteworthy
4. Review logs: `LOG_LEVEL=debug npm start`
5. Test prompt manually: Run the heartbeat prompt yourself

### Recommendations Not Received

**Problem**: Daily recommendations not arriving

**Solutions**:
1. Verify enabled: `getRecommendationsStatus()`
2. Check sufficient usage data (>7 days recommended)
3. Verify delivery time configuration
4. Check if already sent today (once per day limit)
5. Review logs for generation errors

### Recap Not Generated

**Problem**: Evening recap missing

**Solutions**:
1. Check `RECAP_ENABLED=true` in .env
2. Verify `RECAP_HOUR_LOCAL` is set correctly
3. Check timezone configuration
4. Ensure activity logged during the day
5. Review scheduler: `list_scheduled_tasks()`

### Generic/Empty Messages

**Problem**: Proactive messages are too vague

**Solutions**:
1. **Heartbeat**: Improve prompt specificity
2. **Recommendations**: More diverse usage creates better suggestions
3. **Recap**: Ensure activity is being tracked properly
4. Update prompts to be more specific and actionable

---

## Advanced Configuration

### Per-Session Settings

Override defaults for specific sessions:

```typescript
import { updateSessionSettings } from "./session.ts";

updateSessionSettings(sessionId, {
  heartbeatEnabled: true,
  heartbeatInterval: 120,
  recommendationsEnabled: true,
  recapEnabled: true,
  recapCustomPrompt: "Focus on code-related activities"
});
```

### Custom Schedulers

Implement your own proactive feature:

```typescript
import { scheduleTask } from "./scheduler/index.ts";

scheduleTask({
  name: "weekly-report",
  schedule: "every Friday at 5pm",
  sessionId: "user-session",
  prompt: "Generate and export weekly usage report, send summary to user"
});
```

### Integration with External Systems

Send proactive messages to external systems:

```typescript
// In heartbeat prompt:
"Check pending issues in external issue tracker. If any critical issues, 
notify user and optionally send webhook to Slack."
```

---

## Privacy & Control

### User Control

Users have full control over proactive features:
- Enable/disable individually
- Adjust timing and frequency
- Customize content and prompts
- View history of sent messages

### Data Privacy

- Patterns stay local (not sent to external services)
- Recommendations based only on your data
- No cross-user analysis
- Full transparency in what's tracked

### Opt-Out

Disable all proactive features:

```bash
# .env
RECOMMENDATION_ENABLED=false
RECAP_ENABLED=false

# Heartbeat: Disable per-session
heartbeat_disable()
```

---

## Future Enhancements

Planned features:
- **Smart timing**: Learn optimal delivery times
- **Multi-channel**: Send to Telegram, email, SMS, etc.
- **Adaptive frequency**: Adjust based on user engagement
- **Context awareness**: Factor in calendar, time of day, activity level
- **Goal tracking**: Track and remind about long-term goals
- **Habit formation**: Encourage positive habits with nudges

---

## See Also

- [Scheduler Documentation](TOOLS_REFERENCE.md#scheduler-tools) - Task scheduling system
- [Tools Reference](TOOLS_REFERENCE.md) - Heartbeat and admin tools
- [Session Management](API.md#session-management) - Session settings API
- [Configuration](../README.md#configuration) - Environment variables
