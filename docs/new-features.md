# Gravity Claw - New Features Quick Start Guide

This guide helps you quickly enable the new features added in version 0.2.0.

---

## 🚀 Quick Enable New Channels

### Discord
```bash
# 1. Create Discord Bot at https://discord.com/developers/applications
# 2. Get Bot Token and add to .env:
DISCORD_BOT_TOKEN=your_bot_token_here

# 3. Optional: Set specific guild for slash commands
DISCORD_GUILD_ID=your_server_id

# 4. Invite bot to server with appropriate permissions
```

### Slack
```bash
# 1. Create Slack App at https://api.slack.com/apps
# 2. Get Bot Token and Signing Secret, add to .env:
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your_signing_secret

# 3. Enable events: app_mention, message.channels
# 4. Add slash commands: /chat, /reset, /status
```

### Signal
```bash
# 1. Install signal-cli: https://github.com/AsamK/signal-cli
# 2. Register your bot number:
#    signal-cli -u +1234567890 register

# 3. Add to .env:
SIGNAL_PHONE_NUMBER=+1234567890

# 4. Optional: Restrict to specific groups
SIGNAL_GROUP_IDS=group1,group2
```

### Email
```bash
# Add to .env:
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your_email@gmail.com
EMAIL_SMTP_PASS=your_app_password
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_PORT=993
EMAIL_FROM_ADDRESS=your_email@gmail.com
EMAIL_ALLOWED_SENDERS=friend1@example.com,friend2@example.com
```

---

## 📅 Productivity Integrations

### Google Calendar
```bash
# Option 1: Simple API Key (read-only for public calendars)
GOOGLE_CALENDAR_API_KEY=your_api_key

# Option 2: OAuth2/Service Account (read-write)
GOOGLE_CREDENTIALS_PATH=./credentials.json
# Download from Google Cloud Console
```

### Notion
```bash
# 1. Create integration at https://www.notion.so/my-integrations
# 2. Get Internal Integration Token
NOTION_API_KEY=secret_your_token_here

# 3. Optional: Default database for queries
NOTION_DATABASE_ID=your_database_id

# 4. Share pages/databases with your integration in Notion
```

---

## 🗄️ Database

### PostgreSQL (instead of SQLite)
```bash
# Simply set the DATABASE_URL - other code adapts automatically
DATABASE_URL=postgresql://user:password@localhost:5432/gravyclaw

# If not set, defaults to SQLite (backward compatible)
```

---

## 🤖 New LLM Providers

### Cohere
```bash
COHERE_API_KEY=your_cohere_key
# Then set: LLM_PROVIDER=cohere
```

### Mistral
```bash
MISTRAL_API_KEY=your_mistral_key
# Then set: LLM_PROVIDER=mistral
```

---

## 🛡️ Approval Middlehip (Human-in-the-Loop)

```bash
# Enable approval for dangerous tools
APPROVAL_ENABLED=true
APPROVAL_TIMEOUT_MINUTES=5
APPROVAL_REQUIRED_TOOLS=run_shell,file_delete,http_request,execute_code

# API Endpoints:
# POST /api/approvals - Create approval request
# POST /api/approvals/:id/approve
# POST /api/approvals/:id/deny
# GET /api/approvals - List pending
```

---

## 🔧 MCP Server Bundles

Use pre-configured MCP servers from `src/mcp/servers/`:

```json
// mcp-servers.json - reference bundled configs
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token" }
    }
  }
}
```

---

## 📝 New Tools Available

| Tool | Description |
|------|-------------|
| `execute_code` | Run JS/Python/Bash in sandbox |
| `calendar_list_events` | List Google Calendar events |
| `calendar_create_event` | Create calendar event |
| `calendar_update_event` | Update calendar event |
| `calendar_delete_event` | Delete calendar event |
| `notion_create_page` | Create Notion page |
| `notion_read_page` | Read Notion page |
| `notion_append_block` | Add blocks to page |
| `notion_query_database` | Query Notion database |

---

## ✅ Verify Installation

```bash
# Typecheck
npm run typecheck

# Test new features
npm run cli -- tools | grep -E "execute_code|calendar|notion|discord|slack"
```

---

For more details, see [docs/](./docs/) and [CHANGELOG.md](./CHANGELOG.md).